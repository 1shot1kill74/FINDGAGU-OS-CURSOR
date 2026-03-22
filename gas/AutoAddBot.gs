/**
 * AutoAddBot.gs — 새 구글챗 스페이스에 앱(봇) 자동 추가
 *
 * 동작 방식:
 *   5분마다 타이머 트리거 → 새 스페이스 감지 → 봇 자동 설치 → n8n Webhook 즉시 알림
 *
 * 감지 방식 (병렬 실행 후 합산):
 *   ① Admin Reports API 감사 로그 (create_space 이벤트) — 실패해도 계속 진행
 *   ② Chat API — space.createTime >= lastCheckTime 필터로 최근 스페이스만 반환
 *      (전체 목록 비교 불필요 → processed 목록 100개 유지로 충분)
 *   두 결과를 Set으로 합산 후 중복 제거하여 최종 신규 스페이스 목록 반환
 *
 * ────────────── 초기 설정 순서 ──────────────
 *   Step 1. GAS 에디터 → 확장 프로그램 → Apps Script API 추가
 *           - Google Chat API (v1)
 *           - Admin Reports API (v1)
 *   Step 2. appsscript.json의 oauthScopes 확인 (gas/appsscript.json 참조)
 *   Step 3. 이미 봇이 들어가 있는 스페이스 이름을 KNOWN_SPACE_WITH_BOT에 입력
 *           → getBotMemberName() 실행 → 로그에서 봇 이름 확인
 *   Step 4. BOT_MEMBER_NAME에 확인한 값 붙여넣기 (예: "users/123456789")
 *   Step 5. 스크립트 속성에 MAKE_SYNC_WEBHOOK_URL 추가 → testWebhookConnection() 실행으로 검증
 *   Step 6. setupAutoAddTrigger() 실행 → 트리거 등록 완료
 *
 * 필요 권한: Workspace 관리자 계정으로 실행
 */

// ═══════════════════════ 설정 ═══════════════════════

const AUTO_BOT_CONFIG = {

  /**
   * 봇 멤버 리소스 이름 — "users/{numeric_id}" 형식
   * Project ID(chat-calendar-477718)가 아님!
   *
   * 찾는 방법:
   *   1. KNOWN_SPACE_WITH_BOT에 봇이 이미 있는 스페이스 이름 입력
   *   2. getBotMemberName() 수동 실행 → 로그에서 확인
   *   3. 이 값에 붙여넣기
   */
  BOT_MEMBER_NAME: 'users/103383004320420414987',

  /**
   * 봇이 이미 설치된 스페이스 이름 (getBotMemberName 탐색용)
   * 스페이스 URL에서 확인: chat.google.com/room/XXXXXX → "spaces/XXXXXX"
   */
  KNOWN_SPACE_WITH_BOT: 'spaces/REPLACE_ME',

  /**
   * 자동 추가 대상 스페이스 유형
   * SPACE: 일반 스페이스 / GROUP_CHAT: 그룹챗 / DIRECT_MESSAGE: 1:1 DM
   * DM은 보통 제외 (봇 추가 API 미지원)
   */
  TARGET_SPACE_TYPES: ['SPACE', 'GROUP_CHAT'],

  // Script Properties 키 (변경 불필요)
  PROP_LAST_CHECK: 'autoBot_lastCheckTime',
  PROP_PROCESSED:  'autoBot_processedSpaces',
  PROP_BOT_NAME:   'autoBot_resolvedBotName',
};

// ═══════════════════════ 메인 진입점 ═══════════════════════

/**
 * 자동 추가 메인 함수 — 5분 타이머 트리거에 연결
 * 새 스페이스 감지 → 봇 자동 설치 → n8n Webhook 즉시 알림
 *
 * 실시간성 보장 원리:
 *   ① 5분마다 타이머 트리거로 실행되어 최대 5분 지연으로 새 스페이스를 감지.
 *   ② 봇 추가 성공 직후 n8n Webhook(MAKE_SYNC_WEBHOOK_URL)으로 spaceName을 전송.
 *   ③ Make는 Webhook 수신 즉시 시나리오를 실행하여 구글 시트에 신규 스페이스 행을 추가.
 *   ④ 결과적으로 새 스페이스 생성 후 최대 5분+수초 이내에 시트와 DB가 동기화됨.
 *      (메이크 폴링 주기 15분 대비 3배 이상 빠른 실시간성)
 */
function autoAddBotToNewSpaces() {
  const botName = resolveBotMemberName_();
  if (!botName) {
    console.error(
      '❌ BOT_MEMBER_NAME 미설정.\n' +
      '   1. KNOWN_SPACE_WITH_BOT에 스페이스 이름 입력\n' +
      '   2. getBotMemberName() 실행\n' +
      '   3. 로그 확인 후 BOT_MEMBER_NAME에 붙여넣기'
    );
    return;
  }

  const { newSpaces, processed, props, activeSpaces } = detectNewSpaces_();

  // 활동 있는 스페이스 update_date 갱신 (새 스페이스 유무와 무관하게 항상 실행)
  if (activeSpaces.length) {
    patchUpdateDates_(activeSpaces);
    parseAndPatchContactInfo_(activeSpaces);
  }

  if (!newSpaces.length) {
    console.log('⏭ 새 스페이스 없음 — ' + new Date().toLocaleString('ko-KR'));
    return;
  }

  console.log('🔍 새 스페이스 ' + newSpaces.length + '개 감지: ' + newSpaces.join(', '));
  for (const spaceName of newSpaces) {
    const botAdded = tryAddBotToSpace_(spaceName, botName);
    if (botAdded) {
      // 봇 추가 성공 → processed에 저장 후 Webhook 알림
      processed.add(spaceName);
      notifyWebhook_(spaceName);
    } else {
      // 실패한 스페이스는 processed에 저장하지 않아 다음 사이클에 재시도됨
      console.warn('  ⚠ Webhook 미발송 (봇 추가 실패): ' + spaceName);
    }
  }

  // 봇 추가 성공한 스페이스만 processed에 반영 (최근 100개 유지)
  const trimmed = Array.from(processed).slice(-100);
  props.setProperty(AUTO_BOT_CONFIG.PROP_PROCESSED, JSON.stringify(trimmed));
}

// ═══════════════════════ 스페이스 감지 ═══════════════════════

/**
 * 새 스페이스 감지 (두 방식 병렬 실행 후 합산)
 *
 * ① Admin Reports API 감사 로그 (create_space 이벤트)
 *    — 이벤트 기반이므로 정확하나 최대 1~2분 지연이 있을 수 있음.
 *    — 실패해도 ② 결과만으로 계속 진행.
 * ② Chat API 전체 목록 비교
 *    — 감사 로그 지연 보완 목적으로 항상 실행 (기존 "폴백"에서 "항상 병렬"로 변경).
 *    — 두 결과를 Set으로 합산하여 중복 제거 후 반환.
 */
function detectNewSpaces_() {
  const props    = PropertiesService.getScriptProperties();
  const now      = new Date();
  const lastStr  = props.getProperty(AUTO_BOT_CONFIG.PROP_LAST_CHECK);

  // 첫 실행: 10분 전부터 / 이후: 마지막 체크 시점부터
  // lastStr이 빈값이거나 파싱 불가한 경우 10분 전으로 폴백
  const parsedLast = lastStr ? new Date(lastStr) : null;
  const startTime = (parsedLast && !isNaN(parsedLast))
    ? parsedLast
    : new Date(now.getTime() - 10 * 60 * 1000);

  // 다음 체크를 위해 현재 시간 저장
  props.setProperty(AUTO_BOT_CONFIG.PROP_LAST_CHECK, now.toISOString());

  const processedStr = props.getProperty(AUTO_BOT_CONFIG.PROP_PROCESSED) || '[]';
  const processed    = new Set(JSON.parse(processedStr));

  let newSpacesFromAudit = [];
  let newSpacesFromChat  = [];
  let activeSpaces       = [];

  // ── 1순위: Admin Reports API (감사 로그) ──
  try {
    newSpacesFromAudit = detectViaAuditLog_(startTime, now, processed);
    console.log('📋 감사 로그 방식: ' + newSpacesFromAudit.length + '개 신규');
  } catch (e) {
    console.warn('⚠ Admin Reports API 실패: ' + e.message);
  }

  // ── 2순위: Chat API (createTime 기반 필터링) ──
  // space.createTime >= startTime 인 스페이스만 반환하므로
  // processed 목록은 동일 주기 내 중복 제거 용도로만 사용됨.
  // → 처리 목록을 과거 전체 이력이 아닌 최근 100개만 유지해도 안전.
  try {
    const chatResult  = detectViaChatApi_(processed, startTime);
    newSpacesFromChat = chatResult.newSpaces;
    activeSpaces      = chatResult.activeSpaces;
    console.log('📋 Chat API 방식: 신규 ' + newSpacesFromChat.length + '개, 활동 ' + activeSpaces.length + '개');
  } catch (e2) {
    console.error('❌ Chat API 조회 실패: ' + e2.message);
  }

  // 두 방식의 결과를 합치고 중복 제거
  const combined = new Set([...newSpacesFromAudit, ...newSpacesFromChat]);
  const newSpaces = Array.from(combined);

  // processed 갱신은 호출부(autoAddBotToNewSpaces)에서 봇 추가 성공 후 수행.
  // 여기서 저장하면 실패한 스페이스도 processed에 들어가 재시도가 안 됨.
  return { newSpaces, processed, props, activeSpaces };
}

/**
 * Admin Reports API 감사 로그로 새 스페이스 감지
 * 이벤트명: create_space (Google Chat 감사 로그)
 */
function detectViaAuditLog_(startTime, endTime, processed) {
  const newSpaces = [];

  const result = AdminReports.Activities.list('all', 'chat', {
    startTime:  startTime.toISOString(),
    endTime:    endTime.toISOString(),
    maxResults: 500,
  });

  if (!result.items || !result.items.length) return newSpaces;

  for (const item of result.items) {
    for (const event of (item.events || [])) {
      // Chat 감사 로그의 스페이스 생성 이벤트
      if (event.name !== 'create_space') continue;

      const spaceName = extractSpaceNameFromEvent_(event);
      if (spaceName && !processed.has(spaceName)) {
        newSpaces.push(spaceName);
        console.log('  신규 스페이스 감지 (감사 로그): ' + spaceName);
      }
    }
  }

  return newSpaces;
}

/**
 * Chat API에서 startTime 이후 생성된 새 스페이스 감지
 *
 * space.createTime(RFC 3339)을 startTime과 비교하여 최근 생성된 스페이스만 반환.
 * → 전체 이력을 processed에 쌓을 필요 없이 최근 100개 유지로도 안전하게 중복 방지 가능.
 *
 * Admin 권한 여부를 루프 진입 전 1회만 확인한 뒤 플래그로 기억하여,
 * 이후 모든 페이지에서 동일한 방식을 재사용한다.
 *
 * @param {Set<string>} processed  - 이미 처리된 스페이스 이름 Set (중복 방지용)
 * @param {Date}        startTime  - 이 시각 이후 생성된 스페이스만 반환
 */
function detectViaChatApi_(processed, startTime) {
  const newSpaces      = [];
  const activeSpaces   = [];
  const startTimeStr   = startTime.toISOString();
  let   pageToken      = null;

  // Admin 권한 여부를 루프 전 1회만 판별.
  let useAdmin = true;
  try {
    Chat.Spaces.list({ pageSize: 1, useAdminAccess: true });
  } catch (_) {
    useAdmin = false;
    console.log('  ℹ Chat API: Admin 권한 없음 → 본인 소속 스페이스만 조회합니다.');
  }

  do {
    const opts = { pageSize: 100 };
    if (pageToken)  opts.pageToken      = pageToken;
    if (useAdmin)   opts.useAdminAccess = true;

    const resp = Chat.Spaces.list(opts);

    for (const space of (resp.spaces || [])) {
      if (!AUTO_BOT_CONFIG.TARGET_SPACE_TYPES.includes(space.spaceType)) continue;

      // lastActiveTime이 마지막 체크 이후이면 update_date 갱신 대상
      // (신규/기존 구분 없이 활동 감지 — spaces.list() 1회 호출로 처리)
      if (space.lastActiveTime && space.lastActiveTime >= startTimeStr) {
        activeSpaces.push({ name: space.name, lastActiveTime: space.lastActiveTime });
      }

      // 신규 스페이스 감지: createTime이 startTime 이전이면 스킵
      if (space.createTime && space.createTime < startTimeStr) continue;
      if (!processed.has(space.name)) {
        newSpaces.push(space.name);
        console.log('  신규 스페이스 감지 (Chat API): ' + space.name);
      }
    }

    pageToken = resp.nextPageToken || null;
  } while (pageToken);

  return { newSpaces, activeSpaces };
}

/**
 * 감사 로그 이벤트 파라미터에서 spaces/{id} 형식 추출
 */
function extractSpaceNameFromEvent_(event) {
  for (const p of (event.parameters || [])) {
    // 공식 파라미터 이름 (버전에 따라 다를 수 있음)
    if (p.name === 'space_id')            return 'spaces/' + p.value;
    if (p.name === 'space_name' && String(p.value).startsWith('spaces/')) return p.value;
    if (p.name === 'space_resource_name') return p.value;
  }
  return null;
}

// ═══════════════════════ 봇 추가 ═══════════════════════

/**
 * 스페이스에 봇 추가 (에러 유형별 분기 처리)
 *
 * 반환값:
 *   true  — 봇이 정상적으로 스페이스에 존재하는 상태 (신규 추가 성공 또는 이미 멤버)
 *           → 이 값을 기반으로 호출부에서 n8n Webhook 알림 발송 여부를 결정함.
 *   false — 권한 부족(403), 스페이스 삭제(404), 기타 오류 등 실패 상태
 *           → Webhook 알림 불필요 (시트에 반영할 스페이스 정보가 유효하지 않음).
 *
 * @param {string} spaceName      - 대상 스페이스 리소스 이름 (예: 'spaces/XXXXXX')
 * @param {string} botMemberName  - 봇 멤버 이름 (예: 'users/123456789')
 *                                  ※ isBotAlreadyMember_ 비교에만 사용됨.
 *                                    Members.create 호출 시에는 Google Chat API 제약상
 *                                    반드시 'users/app' 고정값을 사용해야 하므로 create에는 미전달.
 * @returns {boolean} 봇 존재 여부 (true: 성공/이미멤버, false: 실패)
 */
function tryAddBotToSpace_(spaceName, botMemberName) {
  try {
    // 이미 멤버인지 사전 확인 (불필요한 API 호출 방지)
    if (isBotAlreadyMember_(spaceName, botMemberName)) {
      console.log('  ↩ 이미 멤버: ' + spaceName);
      // 봇은 이미 스페이스에 있으므로 성공으로 간주 → true 반환
      return true;
    }

    // [중요] 구글 챗 API의 제약상, 앱이 자기 자신을 추가할 때는 
    // 실제 users/{id} 대신 반드시 "users/app" 이라는 고정 형식을 사용해야 합니다.
    Chat.Spaces.Members.create(
      {
        member: {
          name: 'users/app',
          type: 'BOT',
        },
      },
      spaceName
    );

    console.log('  ✅ 봇 추가 성공: ' + spaceName);
    // 정상 추가 완료 → true 반환 (호출부에서 n8n Webhook 발송 트리거)
    return true;

  } catch (e) {
    const msg = e.message || '';

    if (msg.includes('409') || msg.toLowerCase().includes('already exists')) {
      // 이미 멤버 — 정상 (중복 방지 체크와 실제 API 호출 사이 타이밍 미스)
      console.log('  ↩ 이미 멤버 (409): ' + spaceName);
      // 봇이 스페이스에 존재하므로 성공으로 간주 → true 반환
      return true;

    } else if (msg.includes('403') || msg.toLowerCase().includes('permission')) {
      // 권한 없음 — 외부 스페이스 또는 봇 추가 비허용 정책 → 실패
      console.warn('  ⛔ 권한 없음 (403): ' + spaceName + ' — ' + msg);
      return false;

    } else if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
      // 스페이스가 이미 삭제됨 → 실패
      console.warn('  🗑 스페이스 없음 (404): ' + spaceName);
      return false;

    } else {
      console.error('  ❌ 봇 추가 실패: ' + spaceName + ' — ' + msg);
      return false;
    }
  }
}

/**
 * 봇이 이미 해당 스페이스의 멤버인지 확인
 */
function isBotAlreadyMember_(spaceName, botMemberName) {
  try {
    const resp = Chat.Spaces.Members.list(spaceName, {
      filter: 'member.type = "BOT"',
    });
    return (resp.memberships || []).some(function(m) {
      // Chat API 응답의 member.name은 항상 "users/{numeric_id}" 형식으로 반환됨.
      // "users/app"은 Members.create 호출 시 사용하는 별칭이며 응답에는 절대 등장하지 않음.
      // → botMemberName(실제 ID)과만 비교해야 정확한 멤버십 체크가 가능.
      return m.member && m.member.name === botMemberName;
    });
  } catch (_) {
    // 조회 실패 시 false 반환 → 추가 시도
    return false;
  }
}

// ═══════════════════════ update_date 갱신 ═══════════════════════

/**
 * lastActiveTime 기반으로 Supabase update_date 갱신
 *
 * detectViaChatApi_에서 수집된 활동 스페이스만 처리.
 * spaces.list() 1회 호출 결과를 재사용하므로 추가 API 호출 없음.
 *
 * 필요 Script Properties:
 *   SUPABASE_URL         — https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY — service_role 또는 anon key
 *
 * @param {{ name: string, lastActiveTime: string }[]} activeSpaces
 */
function patchUpdateDates_(activeSpaces) {
  const props       = PropertiesService.getScriptProperties();
  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const supabaseKey = props.getProperty('SUPABASE_SERVICE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠ SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 미설정 → update_date 갱신 스킵');
    return;
  }

  const baseUrl = supabaseUrl.replace(/\/$/, '') + '/rest/v1/consultations';

  for (const space of activeSpaces) {
    // "2025-01-15T09:30:00Z" → "2025-01-15"
    const date = String(space.lastActiveTime).split('T')[0];
    const url  = baseUrl + '?channel_chat_id=eq.' + encodeURIComponent(space.name);

    try {
      const resp = UrlFetchApp.fetch(url, {
        method:  'patch',
        headers: {
          'apikey':        supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        payload:            JSON.stringify({ update_date: date }),
        muteHttpExceptions: true,
      });
      const code = resp.getResponseCode();
      if (code >= 200 && code < 300) {
        console.log('  📅 update_date: ' + space.name + ' → ' + date);
      } else {
        console.warn('  ⚠ update_date 갱신 실패 (' + code + '): ' + space.name);
      }
    } catch (e) {
      console.error('  ❌ update_date 갱신 예외: ' + space.name + ' — ' + e.message);
    }
  }
}

// ═══════════════════════ 연락처(전화번호·지역) 파싱 ═══════════════════════

/**
 * 활동 스페이스의 메시지에서 전화번호·지역 추출 후 Supabase 갱신
 *
 * - customer_phone, region 둘 다 이미 있는 스페이스는 메시지 조회 없이 스킵
 * - 파싱 성공한 필드만 PATCH (실패한 필드는 건드리지 않음)
 * - 메시지는 최대 3페이지(300건)까지만 읽음 (오래된 방 과다 호출 방지)
 *
 * @param {{ name: string, lastActiveTime: string }[]} activeSpaces
 */
function parseAndPatchContactInfo_(activeSpaces) {
  const props       = PropertiesService.getScriptProperties();
  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const supabaseKey = props.getProperty('SUPABASE_SERVICE_KEY');
  if (!supabaseUrl || !supabaseKey) return;

  const baseUrl = supabaseUrl.replace(/\/$/, '') + '/rest/v1/consultations';

  for (const space of activeSpaces) {
    // Step 1: 현재 phone/region 상태 확인
    const checkUrl = baseUrl
      + '?channel_chat_id=eq.' + encodeURIComponent(space.name)
      + '&select=customer_phone,region';
    let current;
    try {
      const r = UrlFetchApp.fetch(checkUrl, {
        method:  'get',
        headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
        muteHttpExceptions: true,
      });
      const rows = JSON.parse(r.getContentText());
      if (!rows.length) continue;
      current = rows[0];
    } catch (e) {
      console.warn('  ⚠ 연락처 상태 조회 실패: ' + space.name + ' — ' + e.message);
      continue;
    }

    // 둘 다 있으면 스킵 (메시지 API 호출 불필요)
    if (current.customer_phone && current.region) continue;

    // Step 2: 메시지 파싱
    const { phone, region } = parseContactFromMessages_(space.name);

    // Step 3: 채울 값만 모아서 PATCH
    const patch = {};
    if (!current.customer_phone && phone)  patch.customer_phone = phone;
    if (!current.region         && region) patch.region         = region;
    if (!Object.keys(patch).length)        continue;

    try {
      const patchUrl = baseUrl + '?channel_chat_id=eq.' + encodeURIComponent(space.name);
      const resp = UrlFetchApp.fetch(patchUrl, {
        method:  'patch',
        headers: {
          'apikey':        supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        payload:            JSON.stringify(patch),
        muteHttpExceptions: true,
      });
      const code = resp.getResponseCode();
      if (code >= 200 && code < 300) {
        console.log('  📱 연락처 갱신: ' + space.name + ' → ' + JSON.stringify(patch));
      } else {
        console.warn('  ⚠ 연락처 갱신 실패 (' + code + '): ' + space.name);
      }
    } catch (e) {
      console.error('  ❌ 연락처 갱신 예외: ' + space.name + ' — ' + e.message);
    }
  }
}

/**
 * 스페이스 메시지에서 전화번호·지역 추출
 * 최대 3페이지(pageSize 100 × 3 = 300건)까지 읽고 찾으면 즉시 중단
 *
 * @param {string} spaceName
 * @returns {{ phone: string|null, region: string|null }}
 */
function parseContactFromMessages_(spaceName) {
  let phone = null, region = null;
  let pageToken = null;
  let pageCount = 0;

  do {
    const opts = { pageSize: 100 };
    if (pageToken) opts.pageToken = pageToken;

    let resp;
    try {
      resp = Chat.Spaces.Messages.list(spaceName, opts);
    } catch (e) {
      console.warn('  ⚠ 메시지 조회 실패: ' + spaceName + ' — ' + e.message);
      break;
    }

    for (const msg of (resp.messages || [])) {
      const text = msg.text || '';
      if (!phone)  phone  = extractPhone_(text);
      if (!region) region = extractRegion_(text);
      if (phone && region) break;
    }

    pageToken = resp.nextPageToken || null;
    pageCount++;
  } while (pageToken && pageCount < 3 && !(phone && region));

  return { phone, region };
}

/**
 * 텍스트에서 한국 전화번호 추출
 * 결과 형식: "010-1234-5678"
 *
 * @param {string} text
 * @returns {string|null}
 */
function extractPhone_(text) {
  const m = text.match(/(0\d{1,2})[-.\s]?(\d{3,4})[-.\s]?(\d{4})/);
  if (!m) return null;
  return m[1] + '-' + m[2] + '-' + m[3];
}

/**
 * 텍스트에서 지역 추출 — 시/도 + 시/군/구 앞 이름까지
 * 예) "경기도 평택시 ~" → "경기도 평택"
 *     "서울특별시 강남구 ~" → "서울 강남"
 *     "인천광역시 연수구 ~" → "인천 연수"
 *
 * @param {string} text
 * @returns {string|null}
 */
function extractRegion_(text) {
  const m = text.match(
    /([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도))\s+([가-힣]+?)(?=시\b|군\b|구\b)/
  );
  if (!m) return null;

  // "특별시/광역시/특별자치시" → 이름만 (서울, 부산 등)
  // "도/특별자치도" → 그대로 유지 (경기도, 강원도 등)
  const sido = m[1]
    .replace(/특별자치도$/, '도')      // 제주특별자치도 → 제주도
    .replace(/특별자치시$/, '')        // 세종특별자치시 → 세종
    .replace(/특별시$|광역시$/, '');   // 서울특별시 → 서울, 부산광역시 → 부산

  return sido.trim() + ' ' + m[2].trim();
}

// ═══════════════════════ Webhook 실시간 알림 ═══════════════════════

/**
 * Webhook으로 새 스페이스 정보를 즉시 전송.
 *
 * 호출 시점: tryAddBotToSpace_가 true를 반환한 직후 (봇 추가 성공 또는 이미 멤버 확인).
 *
 * 설정 방법:
 *   1. 스크립트 속성 'MAKE_SYNC_WEBHOOK_URL'에 수신 n8n Webhook URL 저장.
 *      (GAS 에디터 → 프로젝트 설정 → 스크립트 속성 → 키: MAKE_SYNC_WEBHOOK_URL)
 *   2. testWebhookConnection() 수동 실행으로 연결 검증.
 *
 * 전송 데이터 (JSON):
 *   { "spaceName": "spaces/XXXXXX", "timestamp": "2025-01-01T00:00:00.000Z" }
 *
 * @param {string} spaceName - 신규 스페이스 리소스 이름 (예: 'spaces/XXXXXX')
 */
function notifyWebhook_(spaceName) {
  // 스크립트 속성에서 n8n Webhook URL 읽기
  const webhookUrl = PropertiesService.getScriptProperties()
    .getProperty('MAKE_SYNC_WEBHOOK_URL');

  if (!webhookUrl) {
    // Webhook URL이 미설정이면 경고만 출력하고 종료 (봇 추가 플로우에 영향 없음)
    console.warn(
      '  ⚠ MAKE_SYNC_WEBHOOK_URL 미설정 → Webhook 미발송.\n' +
      '    스크립트 속성에 MAKE_SYNC_WEBHOOK_URL을 추가하세요.'
    );
    return;
  }

  // n8n Webhook으로 전송할 페이로드
  // spaceName: n8n 워크플로우에서 상담카드 생성/갱신에 사용
  // displayName: 스페이스 표시 이름 (프로젝트명으로 사용)
  // timestamp: n8n 워크플로우 디버깅 및 중복 처리 방지용
  let displayName = '';
  try {
    const spaceInfo = Chat.Spaces.get(spaceName);
    displayName = spaceInfo.displayName || '';
  } catch (e) {
    console.warn('  ⚠ displayName 조회 실패: ' + e.message);
  }

  const payload = JSON.stringify({
    spaceName:   spaceName,
    displayName: displayName,
    timestamp:   new Date().toISOString()
  });

  try {
    const response = UrlFetchApp.fetch(webhookUrl, {
      method:             'post',
      contentType:        'application/json',
      payload:            payload,
      muteHttpExceptions: true  // 오류 응답도 예외 없이 반환받아 로그로 처리
    });

    const code = response.getResponseCode();

    if (code >= 200 && code < 300) {
      // n8n Webhook 수신 성공 → 워크플로우가 즉시 실행되어 DB를 갱신함
      console.log('  📡 n8n Webhook 발송 성공: ' + spaceName + ' (HTTP ' + code + ')');
    } else {
      // n8n 서버 오류 또는 URL 오류 → 봇은 추가됐으나 DB 동기화는 수동 확인 필요
      console.error(
        '  ❌ n8n Webhook 발송 실패: ' + spaceName +
        ' — HTTP ' + code + ' / ' + response.getContentText()
      );
    }
  } catch (e) {
    // 네트워크 오류 등 예외 발생 → 전체 플로우에 영향 없이 오류만 기록
    console.error('  ❌ n8n Webhook 예외: ' + spaceName + ' — ' + (e.message || e));
  }
}

// ═══════════════════════ 봇 ID 탐색 유틸 ═══════════════════════

/**
 * ★ Step 3 필수 실행 함수 ★
 *
 * 봇이 이미 설치된 스페이스에서 봇의 users/{id} 이름을 자동 탐색.
 * 실행 방법:
 *   1. KNOWN_SPACE_WITH_BOT에 스페이스 이름 입력 (예: 'spaces/ABC123')
 *   2. 이 함수를 GAS 에디터에서 수동 실행
 *   3. 로그 패널에서 "BOT_MEMBER_NAME" 값 확인
 *   4. AUTO_BOT_CONFIG.BOT_MEMBER_NAME에 붙여넣기
 */
function getBotMemberName() {
  const spaceName = AUTO_BOT_CONFIG.KNOWN_SPACE_WITH_BOT;

  if (spaceName.includes('REPLACE_ME')) {
    console.error(
      '❌ AUTO_BOT_CONFIG.KNOWN_SPACE_WITH_BOT 미설정\n' +
      '   봇이 이미 설치된 스페이스 URL을 열어서\n' +
      '   chat.google.com/room/XXXX 에서 "spaces/XXXX" 부분을 복사하세요.'
    );
    return;
  }

  let resp;
  try {
    resp = Chat.Spaces.Members.list(spaceName, { filter: 'member.type = "BOT"' });
  } catch (e) {
    console.error('멤버 목록 조회 실패: ' + e.message);
    return;
  }

  const bots = (resp.memberships || []).filter(function(m) {
    return m.member && m.member.type === 'BOT';
  });

  if (!bots.length) {
    console.error('❌ 해당 스페이스에 봇이 없습니다. 봇이 설치된 다른 스페이스를 지정하세요.');
    return;
  }

  console.log('━━━━ 스페이스 내 봇 목록 ━━━━');
  for (const b of bots) {
    console.log('이름(users/id): ' + b.member.name + '  displayName: ' + (b.member.displayName || ''));
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('▶ 위 "이름(users/id)" 값을 AUTO_BOT_CONFIG.BOT_MEMBER_NAME에 붙여넣으세요.');

  // 봇이 1개뿐이면 Script Properties에 자동 저장
  if (bots.length === 1) {
    const botName = bots[0].member.name;
    PropertiesService.getScriptProperties()
      .setProperty(AUTO_BOT_CONFIG.PROP_BOT_NAME, botName);
    console.log('✅ Script Properties 자동 저장 완료: ' + botName);
    console.log('   (AUTO_BOT_CONFIG.BOT_MEMBER_NAME 업데이트 권장)');
  }
}

/**
 * CONFIG 또는 Script Properties에서 봇 멤버 이름 반환
 */
function resolveBotMemberName_() {
  if (!AUTO_BOT_CONFIG.BOT_MEMBER_NAME.includes('REPLACE_ME')) {
    return AUTO_BOT_CONFIG.BOT_MEMBER_NAME;
  }
  return PropertiesService.getScriptProperties()
    .getProperty(AUTO_BOT_CONFIG.PROP_BOT_NAME) || null;
}

// ═══════════════════════ 디버그: 감사 로그 이벤트 탐색 ═══════════════════════

/**
 * 최근 Chat 감사 로그 이벤트명 목록 출력 (이벤트명 확인용)
 * 실제 운영 전 1회 실행하여 create_space 이벤트명 검증
 */
function listRecentChatAuditEvents() {
  const now      = new Date();
  const oneHrAgo = new Date(now.getTime() - 60 * 60 * 1000);

  let result;
  try {
    result = AdminReports.Activities.list('all', 'chat', {
      startTime:  oneHrAgo.toISOString(),
      endTime:    now.toISOString(),
      maxResults: 100,
    });
  } catch (e) {
    console.error('Admin Reports API 조회 실패: ' + e.message);
    console.error('→ 관리자 계정으로 실행하고 Admin SDK 권한을 확인하세요.');
    return;
  }

  if (!result.items || !result.items.length) {
    console.log('최근 1시간 내 Chat 감사 이벤트 없음');
    return;
  }

  const eventNames = new Set();
  for (const item of result.items) {
    for (const event of (item.events || [])) {
      eventNames.add(event.name);
    }
  }

  console.log('━━━━ 최근 1시간 Chat 감사 이벤트 종류 ━━━━');
  for (const name of eventNames) console.log('  · ' + name);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('create_space 이벤트가 목록에 있으면 감사 로그 방식 사용 가능.');
}

// ═══════════════════════ 트리거 관리 ═══════════════════════

/**
 * ★ Step 6: 5분마다 자동 실행 트리거 등록 (1회만 실행)
 */
function setupAutoAddTrigger() {
  // 기존 중복 트리거 제거
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'autoAddBotToNewSpaces') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  ScriptApp.newTrigger('autoAddBotToNewSpaces')
    .timeBased()
    .everyMinutes(5)
    .create();

  console.log('✅ 트리거 등록 완료: autoAddBotToNewSpaces (5분마다)');
}

// ═══════════════════════ 기존 스페이스 일괄 봇 추가 ═══════════════════════

/**
 * 전체 스페이스에 봇 일괄 추가 (기존 방 대상 1회성 작업)
 *
 * 동작 방식:
 *   - Chat API로 전체 스페이스 목록을 페이지 단위로 순회
 *   - 이미 봇이 있는 방은 스킵 (tryAddBotToSpace_ 내부에서 처리)
 *   - n8n Webhook 알림은 발송하지 않음 (기존 방은 이미 DB에 존재)
 *   - 6분 실행 제한 대비: 5분 30초 경과 시 자동 중단 + pageToken 저장
 *   - 다음 실행 시 저장된 pageToken부터 이어서 처리
 *   - 완료 후 Script Properties의 체크포인트 자동 초기화
 *
 * 실행 방법:
 *   1. GAS 에디터에서 bulkAddBotToAllSpaces() 수동 실행
 *   2. 로그 확인 → "⏸ 중단 (시간 초과)" 메시지가 보이면 다시 실행
 *   3. "🎉 전체 완료" 메시지가 나올 때까지 반복
 *   ※ 관리자 계정으로 실행해야 전체 스페이스 조회 가능
 */
function bulkAddBotToAllSpaces() {
  const botName = resolveBotMemberName_();
  if (!botName) {
    console.error('❌ BOT_MEMBER_NAME 미설정. getBotMemberName() 먼저 실행하세요.');
    return;
  }

  const props      = PropertiesService.getScriptProperties();
  const PROP_TOKEN = 'bulk_pageToken';
  const PROP_STATS = 'bulk_stats';

  // 이전 실행에서 저장된 pageToken 및 통계 복원
  let pageToken = props.getProperty(PROP_TOKEN) || null;
  let stats     = JSON.parse(props.getProperty(PROP_STATS) || '{"added":0,"skipped":0,"failed":0,"total":0}');

  const startedAt  = Date.now();
  const TIME_LIMIT = 5.5 * 60 * 1000; // 5분 30초 (GAS 6분 제한 대비)

  console.log('=== bulkAddBotToAllSpaces 시작 ===');
  console.log('이어서 실행: ' + (pageToken ? '예 (pageToken 복원)' : '아니오 (처음부터)'));
  console.log('누적 통계: ' + JSON.stringify(stats));

  // Admin 권한 여부 사전 체크 (1회)
  let useAdminBulk = true;
  try {
    Chat.Spaces.list({ pageSize: 1, useAdminAccess: true });
  } catch (_) {
    useAdminBulk = false;
    console.log('  ℹ Admin 권한 없음 → 본인 소속 스페이스만 조회합니다.');
  }

  do {
    // 시간 초과 체크
    if (Date.now() - startedAt > TIME_LIMIT) {
      props.setProperty(PROP_TOKEN, pageToken || '');
      props.setProperty(PROP_STATS, JSON.stringify(stats));
      console.log('⏸ 중단 (시간 초과) — pageToken 저장 완료');
      console.log('   누적: 추가 ' + stats.added + ' / 스킵 ' + stats.skipped + ' / 실패 ' + stats.failed);
      console.log('   → bulkAddBotToAllSpaces() 다시 실행하면 이어서 진행합니다.');
      return;
    }

    const opts = { pageSize: 100 };
    if (useAdminBulk) opts.useAdminAccess = true;
    if (pageToken) opts.pageToken = pageToken;

    let resp;
    try {
      resp = Chat.Spaces.list(opts);
    } catch (e) {
      console.error('❌ Chat API 조회 실패: ' + e.message);
      props.setProperty(PROP_TOKEN, pageToken || '');
      props.setProperty(PROP_STATS, JSON.stringify(stats));
      return;
    }

    for (const space of (resp.spaces || [])) {
      if (!AUTO_BOT_CONFIG.TARGET_SPACE_TYPES.includes(space.spaceType)) continue;

      stats.total++;
      const result = tryAddBotToSpace_(space.name, botName);

      if (result) {
        // isBotAlreadyMember_가 true를 반환한 경우 이미 멤버이거나 새로 추가된 경우
        // 로그로 구분: tryAddBotToSpace_ 내부에서 "이미 멤버" or "추가 성공" 출력
        stats.added++;
      } else {
        stats.failed++;
      }

      // 시간 초과 체크 (스페이스 처리 중간에도)
      if (Date.now() - startedAt > TIME_LIMIT) {
        pageToken = resp.nextPageToken || null;
        props.setProperty(PROP_TOKEN, pageToken || '');
        props.setProperty(PROP_STATS, JSON.stringify(stats));
        console.log('⏸ 중단 (시간 초과, 루프 내) — pageToken 저장 완료');
        console.log('   누적: 추가/스킵 ' + stats.added + ' / 실패 ' + stats.failed + ' / 처리 ' + stats.total);
        console.log('   → bulkAddBotToAllSpaces() 다시 실행하면 이어서 진행합니다.');
        return;
      }
    }

    pageToken = resp.nextPageToken || null;

  } while (pageToken);

  // 완료 — 체크포인트 초기화
  props.deleteProperty(PROP_TOKEN);
  props.deleteProperty(PROP_STATS);

  console.log('🎉 전체 완료!');
  console.log('   추가/스킵: ' + stats.added + '건 / 실패: ' + stats.failed + '건 / 전체: ' + stats.total + '건');
}

/**
 * 일괄 추가 진행 상황 확인
 */
function checkBulkProgress() {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty('bulk_pageToken');
  const stats  = JSON.parse(props.getProperty('bulk_stats') || '{}');

  if (!token && !Object.keys(stats).length) {
    console.log('진행 중인 작업 없음 (완료됐거나 아직 시작 안 됨)');
    return;
  }

  console.log('진행 상태: 중단됨 (재실행 대기)');
  console.log('누적 통계: ' + JSON.stringify(stats));
  console.log('저장된 pageToken: ' + (token ? '있음' : '없음 (처음부터 재시작)'));
}

/**
 * 일괄 추가 체크포인트 초기화 (처음부터 다시 하고 싶을 때)
 */
function resetBulkProgress() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('bulk_pageToken');
  props.deleteProperty('bulk_stats');
  console.log('✅ 체크포인트 초기화 완료 — bulkAddBotToAllSpaces()를 처음부터 실행합니다.');
}

// ═══════════════════════ 전체 스페이스 연락처 일괄 스캔 ═══════════════════════

/**
 * 전체 스페이스 메시지를 순회하며 customer_phone·region 누락 건 채우기 (1회성)
 *
 * 동작:
 *   1. Chat API로 전체 스페이스 순회 (페이지 단위)
 *   2. Supabase에서 phone/region 상태 확인 → 둘 다 있으면 스킵
 *   3. Messages.list()로 파싱 → PATCH
 *   4. 6분 제한 대비 체크포인트 저장 (bulk_contact_pageToken)
 *      → "⏸ 중단" 뜨면 재실행, "🎉 완료" 뜰 때까지 반복
 *
 * 실행 방법: GAS 에디터에서 scanAllContactInfo() 수동 실행
 */
function scanAllContactInfo() {
  const props       = PropertiesService.getScriptProperties();
  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const supabaseKey = props.getProperty('SUPABASE_SERVICE_KEY');
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 미설정');
    return;
  }

  const PROP_TOKEN = 'bulk_contact_pageToken';
  const PROP_STATS = 'bulk_contact_stats';

  let pageToken = props.getProperty(PROP_TOKEN) || null;
  let stats = JSON.parse(props.getProperty(PROP_STATS)
    || '{"patched":0,"skipped":0,"noData":0,"total":0}');

  const startedAt = Date.now();
  const TIME_LIMIT = 5.5 * 60 * 1000;

  const baseUrl = supabaseUrl.replace(/\/$/, '') + '/rest/v1/consultations';

  console.log('=== scanAllContactInfo 시작 ===');
  console.log('이어서 실행: ' + (pageToken ? '예' : '아니오 (처음부터)'));
  console.log('누적 통계: ' + JSON.stringify(stats));

  // Admin 권한 여부 사전 체크
  let useAdmin = true;
  try {
    Chat.Spaces.list({ pageSize: 1, useAdminAccess: true });
  } catch (_) {
    useAdmin = false;
    console.log('  ℹ Admin 권한 없음 → 본인 소속 스페이스만 조회합니다.');
  }

  do {
    if (Date.now() - startedAt > TIME_LIMIT) {
      props.setProperty(PROP_TOKEN, pageToken || '');
      props.setProperty(PROP_STATS, JSON.stringify(stats));
      console.log('⏸ 중단 (시간 초과) — scanAllContactInfo() 다시 실행하면 이어서 진행합니다.');
      console.log('   누적: ' + JSON.stringify(stats));
      return;
    }

    const opts = { pageSize: 100 };
    if (useAdmin) opts.useAdminAccess = true;
    if (pageToken) opts.pageToken = pageToken;

    let resp;
    try {
      resp = Chat.Spaces.list(opts);
    } catch (e) {
      console.error('❌ Chat API 조회 실패: ' + e.message);
      props.setProperty(PROP_TOKEN, pageToken || '');
      props.setProperty(PROP_STATS, JSON.stringify(stats));
      return;
    }

    for (const space of (resp.spaces || [])) {
      if (!AUTO_BOT_CONFIG.TARGET_SPACE_TYPES.includes(space.spaceType)) continue;
      stats.total++;

      // Supabase에서 현재 phone/region 상태 확인
      const checkUrl = baseUrl
        + '?channel_chat_id=eq.' + encodeURIComponent(space.name)
        + '&select=customer_phone,region';
      let current;
      try {
        const r = UrlFetchApp.fetch(checkUrl, {
          method:  'get',
          headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
          muteHttpExceptions: true,
        });
        const rows = JSON.parse(r.getContentText());
        if (!rows.length) { stats.skipped++; continue; } // Supabase에 없는 스페이스
        current = rows[0];
      } catch (e) {
        console.warn('  ⚠ 상태 조회 실패: ' + space.name);
        continue;
      }

      if (current.customer_phone && current.region) { stats.skipped++; continue; }

      // 메시지 파싱
      const { phone, region } = parseContactFromMessages_(space.name);
      const patch = {};
      if (!current.customer_phone && phone)  patch.customer_phone = phone;
      if (!current.region         && region) patch.region         = region;

      if (!Object.keys(patch).length) {
        stats.noData++;
        continue;
      }

      // PATCH
      try {
        const patchUrl = baseUrl + '?channel_chat_id=eq.' + encodeURIComponent(space.name);
        UrlFetchApp.fetch(patchUrl, {
          method:  'patch',
          headers: {
            'apikey':        supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
          },
          payload:            JSON.stringify(patch),
          muteHttpExceptions: true,
        });
        stats.patched++;
        console.log('  📱 ' + space.name + ' → ' + JSON.stringify(patch));
      } catch (e) {
        console.error('  ❌ PATCH 실패: ' + space.name + ' — ' + e.message);
      }

      // 루프 내 시간 초과 체크
      if (Date.now() - startedAt > TIME_LIMIT) {
        pageToken = resp.nextPageToken || null;
        props.setProperty(PROP_TOKEN, pageToken || '');
        props.setProperty(PROP_STATS, JSON.stringify(stats));
        console.log('⏸ 중단 (루프 내) — scanAllContactInfo() 다시 실행하면 이어서 진행합니다.');
        console.log('   누적: ' + JSON.stringify(stats));
        return;
      }
    }

    pageToken = resp.nextPageToken || null;
  } while (pageToken);

  props.deleteProperty(PROP_TOKEN);
  props.deleteProperty(PROP_STATS);

  console.log('\n🎉 전체 완료!');
  console.log('   갱신: ' + stats.patched + '건');
  console.log('   이미 있음(스킵): ' + stats.skipped + '건');
  console.log('   메시지에 정보 없음: ' + stats.noData + '건');
  console.log('   전체 처리: ' + stats.total + '건');
}

/**
 * scanAllContactInfo 체크포인트 초기화 (처음부터 다시 하고 싶을 때)
 */
function resetScanContactProgress() {
  PropertiesService.getScriptProperties().deleteProperty('bulk_contact_pageToken');
  PropertiesService.getScriptProperties().deleteProperty('bulk_contact_stats');
  console.log('✅ scanAllContactInfo 체크포인트 초기화 완료');
}

// ═══════════════════════ 연락처 드라이런 (시트 검증 후 적용) ═══════════════════════

/**
 * 전체 스페이스 연락처 파싱 결과를 구글 시트에 저장 (Supabase 미변경)
 *
 * 사전 설정:
 *   Script Properties에 CONTACT_SCAN_SHEET_ID 추가
 *   (구글 시트 URL의 /d/{SHEET_ID}/ 부분)
 *
 * 실행 순서:
 *   1. dryRunContactScan() 반복 실행 → "🎉 드라이런 완료" 뜰 때까지
 *   2. 시트에서 파싱값 검증
 *      - E열(파싱_phone), F열(파싱_region) 수정 가능
 *      - 적용 불필요한 행은 G열 체크박스 해제 (FALSE)
 *   3. applyContactScanFromSheet() 실행 → G열=TRUE인 행만 Supabase PATCH
 */
function dryRunContactScan() {
  const props       = PropertiesService.getScriptProperties();
  const sheetId     = props.getProperty('CONTACT_SCAN_SHEET_ID');
  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const supabaseKey = props.getProperty('SUPABASE_SERVICE_KEY');

  if (!sheetId) {
    console.error('❌ CONTACT_SCAN_SHEET_ID 미설정 — Script Properties에 구글 시트 ID를 추가하세요.');
    return;
  }
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 미설정');
    return;
  }

  const PROP_TOKEN = 'dryrun_contact_pageToken';
  const PROP_STATS = 'dryrun_contact_stats';

  let pageToken = props.getProperty(PROP_TOKEN) || null;
  let stats = JSON.parse(props.getProperty(PROP_STATS)
    || '{"written":0,"skipped":0,"noData":0,"total":0}');

  const startedAt  = Date.now();
  const TIME_LIMIT = 5.5 * 60 * 1000;
  const baseUrl    = supabaseUrl.replace(/\/$/, '') + '/rest/v1/consultations';

  // 시트 준비
  const ss    = SpreadsheetApp.openById(sheetId);
  let   sheet = ss.getSheetByName('연락처_스캔결과');
  if (!sheet) sheet = ss.insertSheet('연락처_스캔결과');

  // 첫 실행(pageToken 없음): 헤더 초기화 + G열 체크박스 유효성 설정
  if (!pageToken) {
    sheet.clearContents();
    sheet.appendRow(['space_name', 'project_name', '현재_phone', '현재_region', '파싱_phone', '파싱_region', '적용여부']);
    const hdr = sheet.getRange(1, 1, 1, 7);
    hdr.setFontWeight('bold');
    hdr.setBackground('#4a86e8');
    hdr.setFontColor('#ffffff');
  }

  console.log('=== dryRunContactScan 시작 ===');
  console.log('이어서 실행: ' + (pageToken ? '예' : '아니오 (처음부터)'));
  console.log('누적 통계: ' + JSON.stringify(stats));

  let useAdmin = true;
  try {
    Chat.Spaces.list({ pageSize: 1, useAdminAccess: true });
  } catch (_) {
    useAdmin = false;
    console.log('  ℹ Admin 권한 없음 → 본인 소속 스페이스만 조회합니다.');
  }

  do {
    if (Date.now() - startedAt > TIME_LIMIT) {
      props.setProperty(PROP_TOKEN, pageToken || '');
      props.setProperty(PROP_STATS, JSON.stringify(stats));
      console.log('⏸ 중단 (시간 초과) — dryRunContactScan() 다시 실행하면 이어서 진행합니다.');
      console.log('   누적: ' + JSON.stringify(stats));
      return;
    }

    const opts = { pageSize: 100 };
    if (useAdmin)  opts.useAdminAccess = true;
    if (pageToken) opts.pageToken      = pageToken;

    let resp;
    try {
      resp = Chat.Spaces.list(opts);
    } catch (e) {
      console.error('❌ Chat API 조회 실패: ' + e.message);
      props.setProperty(PROP_TOKEN, pageToken || '');
      props.setProperty(PROP_STATS, JSON.stringify(stats));
      return;
    }

    const rowsToAppend = [];

    for (const space of (resp.spaces || [])) {
      if (!AUTO_BOT_CONFIG.TARGET_SPACE_TYPES.includes(space.spaceType)) continue;
      stats.total++;

      // Supabase 현재 상태 조회
      const checkUrl = baseUrl
        + '?channel_chat_id=eq.' + encodeURIComponent(space.name)
        + '&select=project_name,customer_phone,region';
      let current;
      try {
        const r = UrlFetchApp.fetch(checkUrl, {
          method:  'get',
          headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
          muteHttpExceptions: true,
        });
        const rows = JSON.parse(r.getContentText());
        if (!rows.length) { stats.skipped++; continue; }
        current = rows[0];
      } catch (e) {
        console.warn('  ⚠ 상태 조회 실패: ' + space.name);
        continue;
      }

      // 둘 다 있으면 스킵 (파싱 불필요)
      if (current.customer_phone && current.region) { stats.skipped++; continue; }

      // 메시지 파싱
      const { phone, region } = parseContactFromMessages_(space.name);

      // 파싱 결과가 아무것도 없으면 스킵
      if (!phone && !region) { stats.noData++; continue; }

      // 이미 있는 필드는 파싱값 불필요 → 빈칸으로
      rowsToAppend.push([
        space.name,
        current.project_name || space.displayName || '',
        current.customer_phone || '',
        current.region         || '',
        (!current.customer_phone && phone)  ? phone  : '',
        (!current.region         && region) ? region : '',
        true,  // 적용여부 기본값 TRUE (체크박스)
      ]);
      stats.written++;

      if (Date.now() - startedAt > TIME_LIMIT) {
        if (rowsToAppend.length) {
          const startRow = sheet.getLastRow() + 1;
          sheet.getRange(startRow, 1, rowsToAppend.length, 7).setValues(rowsToAppend);
          sheet.getRange(startRow, 7, rowsToAppend.length, 1).setDataValidation(
            SpreadsheetApp.newDataValidation().requireCheckbox().build()
          );
        }
        pageToken = resp.nextPageToken || null;
        props.setProperty(PROP_TOKEN, pageToken || '');
        props.setProperty(PROP_STATS, JSON.stringify(stats));
        console.log('⏸ 중단 (루프 내) — dryRunContactScan() 다시 실행하면 이어서 진행합니다.');
        console.log('   누적: ' + JSON.stringify(stats));
        return;
      }
    }

    // 페이지 단위 batch write
    if (rowsToAppend.length) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToAppend.length, 7).setValues(rowsToAppend);
      sheet.getRange(startRow, 7, rowsToAppend.length, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireCheckbox().build()
      );
    }

    pageToken = resp.nextPageToken || null;
  } while (pageToken);

  props.deleteProperty(PROP_TOKEN);
  props.deleteProperty(PROP_STATS);

  console.log('\n🎉 드라이런 완료! 시트를 검토 후 applyContactScanFromSheet()를 실행하세요.');
  console.log('   시트 기록: ' + stats.written + '건');
  console.log('   이미 있음(스킵): ' + stats.skipped + '건');
  console.log('   메시지에 정보 없음: ' + stats.noData + '건');
  console.log('   전체: ' + stats.total + '건');
}

/**
 * dryRunContactScan 시트 검토 후 Supabase에 적용
 *
 * G열(적용여부) 체크박스가 TRUE인 행만 PATCH.
 * E열(파싱_phone), F열(파싱_region)에 수동으로 수정한 값도 그대로 반영됨.
 */
function applyContactScanFromSheet() {
  const props       = PropertiesService.getScriptProperties();
  const sheetId     = props.getProperty('CONTACT_SCAN_SHEET_ID');
  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const supabaseKey = props.getProperty('SUPABASE_SERVICE_KEY');

  if (!sheetId)                    { console.error('❌ CONTACT_SCAN_SHEET_ID 미설정');          return; }
  if (!supabaseUrl || !supabaseKey){ console.error('❌ SUPABASE_URL / SERVICE_KEY 미설정');      return; }

  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName('연락처_스캔결과');
  if (!sheet) {
    console.error('❌ "연락처_스캔결과" 시트 없음 — dryRunContactScan() 먼저 실행하세요.');
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { console.log('시트에 데이터 없음'); return; }

  // 헤더 제외, A~G 전체 읽기
  const data    = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const baseUrl = supabaseUrl.replace(/\/$/, '') + '/rest/v1/consultations';

  let applied = 0, skipped = 0, failed = 0;

  for (const row of data) {
    const [spaceName, , , , parsedPhone, parsedRegion, apply] = row;

    if (!apply || !spaceName) { skipped++; continue; }

    const patch = {};
    const ph = String(parsedPhone  || '').trim();
    const rg = String(parsedRegion || '').trim();
    if (ph) patch.customer_phone = ph;
    if (rg) patch.region         = rg;
    if (!Object.keys(patch).length) { skipped++; continue; }

    try {
      const url  = baseUrl + '?channel_chat_id=eq.' + encodeURIComponent(spaceName);
      const resp = UrlFetchApp.fetch(url, {
        method:  'patch',
        headers: {
          'apikey':        supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        payload:            JSON.stringify(patch),
        muteHttpExceptions: true,
      });
      const code = resp.getResponseCode();
      if (code >= 200 && code < 300) {
        applied++;
        console.log('  ✅ ' + spaceName + ' → ' + JSON.stringify(patch));
      } else {
        failed++;
        console.warn('  ⚠ 실패 (' + code + '): ' + spaceName);
      }
    } catch (e) {
      failed++;
      console.error('  ❌ 예외: ' + spaceName + ' — ' + e.message);
    }
  }

  console.log('\n🎉 적용 완료!');
  console.log('   적용: ' + applied + '건 / 스킵: ' + skipped + '건 / 실패: ' + failed + '건');
}

/**
 * dryRunContactScan 체크포인트 초기화 (처음부터 다시 하고 싶을 때)
 */
function resetDryRunProgress() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('dryrun_contact_pageToken');
  props.deleteProperty('dryrun_contact_stats');
  console.log('✅ dryRunContactScan 체크포인트 초기화 완료');
}

// ═══════════════════════ Supabase 누락 스페이스 동기화 ═══════════════════════

/**
 * Chat API 전체 스페이스 중 Supabase에 없는 것만 찾아 insert (1회성 작업)
 *
 * 동작 방식:
 *   1. Supabase에서 metadata.space_id 전체 목록 수집 (페이지 반복)
 *   2. Chat API로 도메인 전체 스페이스 조회 (useAdminAccess)
 *   3. Supabase에 없는 스페이스만 골라 직접 insert
 *      - project_name: displayName
 *      - metadata: { space_id, google_chat_url }
 *      - start_date: createTime에서 파싱 (없으면 null)
 *      - status: '신규', customer_grade: '신규', is_visible: true
 *   4. 6분 제한 대비 체크포인트 (bulk_sync_pageToken / bulk_sync_stats)
 *   5. 완료 시 체크포인트 자동 초기화
 *
 * 실행 방법:
 *   1. syncMissingSpacesToSupabase() 수동 실행
 *   2. "⏸ 중단" 뜨면 다시 실행 (이어서 처리)
 *   3. "🎉 전체 완료" 뜰 때까지 반복
 *   ※ Script Properties에 SUPABASE_URL, SUPABASE_SERVICE_KEY 필수
 */
function syncMissingSpacesToSupabase() {
  const props = PropertiesService.getScriptProperties();
  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const supabaseKey = props.getProperty('SUPABASE_SERVICE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 미설정');
    return;
  }

  const PROP_TOKEN = 'bulk_sync_pageToken';
  const PROP_STATS = 'bulk_sync_stats';

  let pageToken = props.getProperty(PROP_TOKEN) || null;
  let stats = JSON.parse(props.getProperty(PROP_STATS) || '{"inserted":0,"skipped":0,"failed":0,"total":0}');

  const startedAt = Date.now();
  const TIME_LIMIT = 5.5 * 60 * 1000;

  console.log('=== syncMissingSpacesToSupabase 시작 ===');
  console.log('이어서 실행: ' + (pageToken ? '예' : '아니오 (처음부터)'));
  console.log('누적 통계: ' + JSON.stringify(stats));

  // 제외할 space_id 목록 (Script Properties: SYNC_EXCLUDE_SPACE_IDS, 쉼표 구분)
  const excludeRaw = props.getProperty('SYNC_EXCLUDE_SPACE_IDS') || '';
  const excludeIds = new Set(excludeRaw.split(',').map(s => s.trim()).filter(Boolean));
  if (excludeIds.size) console.log('  제외 목록: ' + excludeIds.size + '개 (' + excludeRaw + ')');

  // Step 1: Supabase에서 기존 space_id 전체 수집
  console.log('\nStep 1. Supabase space_id 목록 수집 중...');
  const existingSpaceIds = fetchAllSupabaseSpaceIds_(supabaseUrl, supabaseKey);
  if (existingSpaceIds === null) {
    console.error('❌ Supabase 조회 실패 — 중단');
    return;
  }
  console.log('  → Supabase 기존 space_id: ' + existingSpaceIds.size + '개');

  // Step 2: Chat API 전체 스페이스 순회
  console.log('\nStep 2. Chat API 스페이스 순회 및 누락 insert 중...');

  // Admin 권한 여부 사전 체크 (1회)
  let useAdmin = true;
  try {
    Chat.Spaces.list({ pageSize: 1, useAdminAccess: true });
  } catch (_) {
    useAdmin = false;
    console.log('  ℹ Admin 권한 없음 → 본인 소속 스페이스만 조회합니다.');
  }

  do {
    if (Date.now() - startedAt > TIME_LIMIT) {
      props.setProperty(PROP_TOKEN, pageToken || '');
      props.setProperty(PROP_STATS, JSON.stringify(stats));
      console.log('⏸ 중단 (시간 초과) — pageToken 저장');
      console.log('   누적: insert ' + stats.inserted + ' / 스킵 ' + stats.skipped + ' / 실패 ' + stats.failed);
      console.log('   → syncMissingSpacesToSupabase() 다시 실행하면 이어서 진행합니다.');
      return;
    }

    const opts = { pageSize: 100 };
    if (useAdmin) opts.useAdminAccess = true;
    if (pageToken) opts.pageToken = pageToken;

    let resp;
    try {
      resp = Chat.Spaces.list(opts);
    } catch (e) {
      console.error('❌ Chat API 조회 실패: ' + e.message);
      props.setProperty(PROP_TOKEN, pageToken || '');
      props.setProperty(PROP_STATS, JSON.stringify(stats));
      return;
    }

    for (const space of (resp.spaces || [])) {
      if (!AUTO_BOT_CONFIG.TARGET_SPACE_TYPES.includes(space.spaceType)) continue;

      // spaces/XXXXXX → XXXXXX
      const spaceId = space.name.replace('spaces/', '');
      stats.total++;

      if (existingSpaceIds.has(spaceId) || excludeIds.has(spaceId)) {
        stats.skipped++;
        continue;
      }

      // start_date 파싱: "2024-01-15T09:30:00Z" → "2024-01-15"
      let startDate = null;
      if (space.createTime) {
        const m = String(space.createTime).match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) startDate = m[1];
      }

      const row = {
        project_name:    space.displayName || spaceId,
        link:            'https://chat.google.com/room/' + spaceId,
        start_date:      startDate,
        update_date:     startDate,
        status:          '접수',
        customer_grade:  '신규',
        is_visible:      true,
        metadata: {
          space_id:         spaceId,
          google_chat_url:  'https://chat.google.com/room/' + spaceId
        }
      };

      const ok = insertToSupabase_(supabaseUrl, supabaseKey, row);
      if (ok) {
        stats.inserted++;
        existingSpaceIds.add(spaceId); // 중복 방지
        console.log('  ✅ insert: ' + row.project_name + ' (' + spaceId + ')');
      } else {
        stats.failed++;
      }

      if (Date.now() - startedAt > TIME_LIMIT) {
        pageToken = resp.nextPageToken || null;
        props.setProperty(PROP_TOKEN, pageToken || '');
        props.setProperty(PROP_STATS, JSON.stringify(stats));
        console.log('⏸ 중단 (루프 내) — pageToken 저장');
        console.log('   누적: insert ' + stats.inserted + ' / 스킵 ' + stats.skipped + ' / 실패 ' + stats.failed);
        return;
      }
    }

    pageToken = resp.nextPageToken || null;

  } while (pageToken);

  props.deleteProperty(PROP_TOKEN);
  props.deleteProperty(PROP_STATS);

  console.log('\n🎉 전체 완료!');
  console.log('   신규 insert: ' + stats.inserted + '건');
  console.log('   이미 있음(스킵): ' + stats.skipped + '건');
  console.log('   실패: ' + stats.failed + '건');
  console.log('   전체 처리: ' + stats.total + '건');
}

/**
 * Supabase에서 metadata.space_id 전체 수집 (페이지 반복)
 * @returns {Set<string>|null} space_id Set, 실패 시 null
 */
function fetchAllSupabaseSpaceIds_(supabaseUrl, supabaseKey) {
  const ids = new Set();
  let offset = 0;
  const limit = 1000;

  while (true) {
    const url = supabaseUrl.replace(/\/$/, '') +
      '/rest/v1/consultations?select=metadata&offset=' + offset + '&limit=' + limit;

    let resp;
    try {
      resp = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: {
          'apikey': supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey
        },
        muteHttpExceptions: true
      });
    } catch (e) {
      console.error('Supabase fetch 실패: ' + e.message);
      return null;
    }

    if (resp.getResponseCode() >= 300) {
      console.error('Supabase 응답 오류: ' + resp.getResponseCode() + ' ' + resp.getContentText());
      return null;
    }

    const rows = JSON.parse(resp.getContentText());
    for (const row of rows) {
      const sid = row.metadata && row.metadata.space_id;
      if (sid) ids.add(sid);
    }

    if (rows.length < limit) break;
    offset += limit;
  }

  return ids;
}

/**
 * Supabase consultations에 단건 insert
 * @returns {boolean} 성공 여부
 */
function insertToSupabase_(supabaseUrl, supabaseKey, row) {
  const url = supabaseUrl.replace(/\/$/, '') + '/rest/v1/consultations';
  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      payload: JSON.stringify(row),
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    if (code >= 200 && code < 300) return true;
    console.error('  insert 실패 (' + code + '): ' + resp.getContentText().slice(0, 200));
    return false;
  } catch (e) {
    console.error('  insert 예외: ' + e.message);
    return false;
  }
}

/**
 * 누락 동기화 체크포인트 초기화
 */
function resetSyncProgress() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('bulk_sync_pageToken');
  props.deleteProperty('bulk_sync_stats');
  console.log('✅ syncMissingSpacesToSupabase 체크포인트 초기화 완료');
}

/**
 * 트리거 삭제
 */
function removeAutoAddTrigger() {
  let count = 0;
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'autoAddBotToNewSpaces') {
      ScriptApp.deleteTrigger(trigger);
      count++;
    }
  }
  console.log('트리거 ' + count + '개 삭제 완료');
}

// ═══════════════════════ 상태 확인 및 연결 테스트 ═══════════════════════

/**
 * 현재 설정값 및 동작 상태 출력
 * 배포 전 전체 설정이 올바른지 한눈에 확인할 때 사용
 */
function checkAutoBotStatus() {
  const props     = PropertiesService.getScriptProperties();
  const lastCheck = props.getProperty(AUTO_BOT_CONFIG.PROP_LAST_CHECK) || '없음';
  const processed = JSON.parse(props.getProperty(AUTO_BOT_CONFIG.PROP_PROCESSED) || '[]');
  const botName   = resolveBotMemberName_() || '❌ 미설정';
  const webhookUrl = props.getProperty('MAKE_SYNC_WEBHOOK_URL') || '❌ 미설정';

  const triggers = ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'autoAddBotToNewSpaces'; });

  console.log('━━━━ AutoAddBot 상태 ━━━━');
  console.log('봇 멤버 이름    : ' + botName);
  console.log('n8n Webhook    : ' + (webhookUrl.startsWith('http') ? '✅ 설정됨' : webhookUrl));
  console.log('마지막 체크     : ' + lastCheck);
  console.log('처리된 스페이스 : ' + processed.length + '개');
  console.log('활성 트리거     : ' + triggers.length + '개');
  console.log('──────────────────────────');

  if (botName.includes('REPLACE_ME') || botName === '❌ 미설정') {
    console.warn('⚠ BOT_MEMBER_NAME 미설정 → getBotMemberName() 실행 필요');
  }
  if (!webhookUrl.startsWith('http')) {
    console.warn('⚠ MAKE_SYNC_WEBHOOK_URL 미설정 → 스크립트 속성에 추가 후 testWebhookConnection() 실행');
  }
  if (!triggers.length) {
    console.warn('⚠ 활성 트리거 없음 → setupAutoAddTrigger() 실행 필요');
  }
}

/**
 * ★ Step 5: n8n Webhook 연결 테스트 (운영 투입 전 필수 실행)
 *
 * 스크립트 속성 MAKE_SYNC_WEBHOOK_URL로 테스트 페이로드를 전송하여
 * n8n 워크플로우가 정상적으로 수신하는지 확인한다.
 *
 * 실행 방법:
 *   1. n8n에서 해당 워크플로우가 활성화되어 있는지 확인한다.
 *   2. GAS 에디터에서 이 함수를 수동 실행한다.
 *   3. 로그에 "✅ n8n Webhook 연결 성공"이 뜨면 정상.
 *   4. n8n 실행 이력에서 수신된 데이터를 확인한다.
 *
 * 전송 데이터:
 *   { "spaceName": "spaces/TEST_CONNECTION", "timestamp": "...", "test": true }
 *   → n8n 워크플로우에서 test:true 여부로 실제 데이터와 구분 가능.
 */
function testWebhookConnection() {
  // 스크립트 속성에서 Webhook URL 읽기
  const webhookUrl = PropertiesService.getScriptProperties()
    .getProperty('MAKE_SYNC_WEBHOOK_URL');

  if (!webhookUrl) {
    console.error(
      '❌ MAKE_SYNC_WEBHOOK_URL 미설정.\n' +
      '   GAS 에디터 → 프로젝트 설정 → 스크립트 속성에서\n' +
      '   키: MAKE_SYNC_WEBHOOK_URL / 값: n8n Webhook URL을 추가하세요.'
    );
    return;
  }

  console.log('📡 n8n Webhook 연결 테스트 시작...');
  console.log('   URL: ' + webhookUrl.slice(0, 40) + '...');  // URL 일부만 출력 (보안)

  // test:true 플래그를 포함하여 n8n 워크플로우에서 실제 데이터와 구분할 수 있도록 함
  const payload = JSON.stringify({
    spaceName: 'spaces/TEST_CONNECTION',
    timestamp: new Date().toISOString(),
    test:      true   // n8n 워크플로우에서 이 필드로 테스트 요청 여부를 필터링 가능
  });

  let response;
  try {
    response = UrlFetchApp.fetch(webhookUrl, {
      method:             'post',
      contentType:        'application/json',
      payload:            payload,
      muteHttpExceptions: true
    });
  } catch (e) {
    // 네트워크 오류 (URL 오타, 방화벽 등)
    console.error('❌ 네트워크 오류: ' + (e.message || e));
    console.error('   → Webhook URL이 올바른지, 인터넷 연결을 확인하세요.');
    return;
  }

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code >= 200 && code < 300) {
    // n8n Webhook 정상 수신 — n8n 실행 이력에서 수신 데이터 확인 가능
    console.log('✅ n8n Webhook 연결 성공! (HTTP ' + code + ')');
    console.log('   n8n 실행 이력에서 수신된 데이터를 확인하세요.');
    console.log('   수신 확인 응답: ' + (body || '(없음)'));
  } else if (code === 0) {
    // URL 미도달 (잘못된 도메인 등)
    console.error('❌ Webhook URL에 도달하지 못했습니다 (HTTP 0).');
    console.error('   → URL을 다시 확인하세요: ' + webhookUrl);
  } else if (code === 400) {
    // Make가 페이로드 형식 오류로 거부
    console.error('❌ n8n이 요청을 거부했습니다 (HTTP 400): ' + body);
    console.error('   → n8n 워크플로우의 Webhook 데이터 구조를 확인하세요.');
  } else if (code === 404) {
    // Webhook URL이 Make에서 삭제됐거나 잘못된 경우
    console.error('❌ Webhook URL을 찾을 수 없습니다 (HTTP 404).');
    console.error('   → n8n에서 Webhook URL을 재확인하고 스크립트 속성을 업데이트하세요.');
  } else {
    console.error('❌ Webhook 응답 오류 (HTTP ' + code + '): ' + body);
  }
}

// ─────────────────────────────────────────────────────────────────
// exportPhoneRegionToSheet
// Supabase consultations 전체를 읽어 구글 시트에 전화번호/지역 현황 출력
//
// Script Properties 필요:
//   SUPABASE_URL          — https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  — service_role 키
//   CONTACT_SCAN_SHEET_ID — 대상 구글 시트 파일 ID
//
// 실행: GAS 에디터에서 exportPhoneRegionToSheet() 선택 후 실행
// ─────────────────────────────────────────────────────────────────
function exportPhoneRegionToSheet() {
  const props      = PropertiesService.getScriptProperties();
  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const supabaseKey = props.getProperty('SUPABASE_SERVICE_KEY');
  const sheetId     = props.getProperty('CONTACT_SCAN_SHEET_ID');

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 미설정');
    return;
  }
  if (!sheetId) {
    console.error('❌ CONTACT_SCAN_SHEET_ID 미설정');
    return;
  }

  const ss        = SpreadsheetApp.openById(sheetId);
  const sheetName = 'PhoneRegionCheck';
  let sheet       = ss.getSheetByName(sheetName);
  if (sheet) {
    sheet.clearContents();
  } else {
    sheet = ss.insertSheet(sheetName);
  }

  // 헤더
  // A: channel_chat_id  B: project_name  C: customer_phone  D: phone_null
  // E: region           F: region_null   G: start_date      H: status
  // I: status_apply(체크박스)            J: chat_link
  const HEADERS = [
    'channel_chat_id', 'project_name', 'customer_phone', 'phone_null',
    'region', 'region_null', 'start_date', 'status', 'status_apply', 'chat_link'
  ];
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  const baseUrl = supabaseUrl.replace(/\/$/, '') + '/rest/v1/consultations';
  const PAGE    = 1000;
  let from      = 0;
  let allRows   = [];

  // 페이지네이션으로 전체 fetch
  while (true) {
    const url = baseUrl
      + '?select=channel_chat_id,project_name,customer_phone,region,start_date,status'
      + '&channel_chat_id=not.is.null'
      + '&order=start_date.desc.nullslast'
      + '&offset=' + from
      + '&limit='  + PAGE;

    const res  = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'apikey':        supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey,
        'Range-Unit':    'items',
        'Range':         from + '-' + (from + PAGE - 1),
        'Prefer':        'count=none'
      },
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    if (code !== 200 && code !== 206) {
      console.error('Supabase 오류 ' + code + ': ' + res.getContentText());
      break;
    }

    const batch = JSON.parse(res.getContentText());
    if (!batch || batch.length === 0) break;

    for (const r of batch) {
      // spaces/XXXXXX → https://chat.google.com/room/XXXXXX
      const chatLink = r.channel_chat_id
        ? 'https://chat.google.com/room/' + r.channel_chat_id.replace('spaces/', '')
        : '';
      allRows.push([
        r.channel_chat_id  || '',
        r.project_name     || '',
        r.customer_phone   || '',
        r.customer_phone   ? 'N' : 'Y',   // phone_null
        r.region           || '',
        r.region           ? 'N' : 'Y',   // region_null
        r.start_date       ? r.start_date.slice(0, 10) : '',
        r.status           || '',
        false,                             // status_apply (체크박스, 기본 FALSE)
        chatLink
      ]);
    }

    console.log('fetch: ' + allRows.length + '건 누적');
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  if (allRows.length === 0) {
    console.log('데이터 없음');
    return;
  }

  // 시트에 쓰기 (한 번에)
  sheet.getRange(2, 1, allRows.length, HEADERS.length).setValues(allRows);

  // status_apply 열(I) 체크박스 설정
  sheet.getRange(2, 9, allRows.length, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build()
  );

  // chat_link 열(J)을 하이퍼링크로 변환
  const linkCol = 10;
  for (let i = 0; i < allRows.length; i++) {
    const chatLink = allRows[i][9];
    if (chatLink) {
      const cell = sheet.getRange(i + 2, linkCol);
      cell.setFormula('=HYPERLINK("' + chatLink + '","채팅방 열기")');
    }
  }

  // phone_null / region_null 열 색상 표시 (Y = 빨강)
  const phoneNullCol  = 4;
  const regionNullCol = 6;
  for (let i = 0; i < allRows.length; i++) {
    const row = i + 2;
    if (allRows[i][3] === 'Y') {
      sheet.getRange(row, phoneNullCol).setBackground('#ffd7d7');
    }
    if (allRows[i][5] === 'Y') {
      sheet.getRange(row, regionNullCol).setBackground('#ffd7d7');
    }
  }

  // 통계 요약
  const phoneNull  = allRows.filter(r => r[3] === 'Y').length;
  const regionNull = allRows.filter(r => r[5] === 'Y').length;
  console.log('=== 완료 ===');
  console.log('총 레코드: ' + allRows.length + '건');
  console.log('phone null: ' + phoneNull + '건 (' + Math.round(phoneNull / allRows.length * 100) + '%)');
  console.log('region null: ' + regionNull + '건 (' + Math.round(regionNull / allRows.length * 100) + '%)');

  SpreadsheetApp.flush();
  console.log('시트 기록 완료: ' + sheetName);
}

// ─────────────────────────────────────────────────────────────────
// applyPhoneRegionFromSheet
// PhoneRegionCheck 시트에서 수정한 phone/region을 Supabase에 반영
//
// 사용 방법:
//   1. exportPhoneRegionToSheet() 실행 → 시트 확인
//   2. C열(customer_phone), E열(region) 직접 수정
//   3. applyPhoneRegionFromSheet() 실행 → 변경된 행만 Supabase PATCH
//
// 판단 기준:
//   - D열(phone_null)이 Y인데 C열에 값이 있으면 → phone PATCH 대상
//   - F열(region_null)이 Y인데 E열에 값이 있으면 → region PATCH 대상
// ─────────────────────────────────────────────────────────────────
function applyPhoneRegionFromSheet() {
  const props       = PropertiesService.getScriptProperties();
  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const supabaseKey = props.getProperty('SUPABASE_SERVICE_KEY');
  const sheetId     = props.getProperty('CONTACT_SCAN_SHEET_ID');

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 미설정');
    return;
  }
  if (!sheetId) {
    console.error('❌ CONTACT_SCAN_SHEET_ID 미설정');
    return;
  }

  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName('PhoneRegionCheck');
  if (!sheet) {
    console.error('❌ PhoneRegionCheck 시트 없음 — exportPhoneRegionToSheet() 먼저 실행하세요.');
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { console.log('시트에 데이터 없음'); return; }

  // A~I 열 읽기
  // A:channel_chat_id  C:phone  D:phone_null  E:region  F:region_null
  // H:status  I:status_apply(체크박스)
  const data    = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  const baseUrl = supabaseUrl.replace(/\/$/, '') + '/rest/v1/consultations';

  let applied = 0, skipped = 0, failed = 0;

  for (const row of data) {
    const channelChatId = String(row[0] || '').trim();
    const phone         = String(row[2] || '').trim();
    const phoneNull     = String(row[3] || '').trim();
    const region        = String(row[4] || '').trim();
    const regionNull    = String(row[5] || '').trim();
    const status        = String(row[7] || '').trim();
    const statusApply   = row[8];  // 체크박스 (true/false)

    if (!channelChatId) { skipped++; continue; }

    const patch = {};
    // phone_null=Y였는데 C열에 값이 채워진 경우만 적용
    if (phoneNull === 'Y' && phone)   patch.customer_phone = phone;
    // region_null=Y였는데 E열에 값이 채워진 경우만 적용
    if (regionNull === 'Y' && region) patch.region         = region;
    // I열(status_apply) 체크 + H열에 유효한 status가 있으면 적용
    if (statusApply && status)        patch.status         = status;

    if (!Object.keys(patch).length) { skipped++; continue; }

    try {
      const url  = baseUrl + '?channel_chat_id=eq.' + encodeURIComponent(channelChatId);
      const resp = UrlFetchApp.fetch(url, {
        method:  'patch',
        headers: {
          'apikey':        supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        payload:            JSON.stringify(patch),
        muteHttpExceptions: true,
      });
      const code = resp.getResponseCode();
      if (code >= 200 && code < 300) {
        applied++;
        console.log('  ✅ ' + channelChatId + ' → ' + JSON.stringify(patch));
      } else {
        failed++;
        console.warn('  ⚠ 실패 (' + code + '): ' + channelChatId);
      }
    } catch (e) {
      failed++;
      console.error('  ❌ 예외: ' + channelChatId + ' — ' + e.message);
    }
  }

  console.log('\n=== applyPhoneRegionFromSheet 완료 ===');
  console.log('적용: ' + applied + '건 / 스킵: ' + skipped + '건 / 실패: ' + failed + '건');
}
