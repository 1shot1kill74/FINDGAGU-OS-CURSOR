/**
 * AutoAddBot.gs — 새 구글챗 스페이스에 앱(봇) 자동 추가
 *
 * 동작 방식:
 *   5분마다 타이머 트리거 → 새 스페이스 감지 → 봇 자동 설치
 *
 * 감지 방식 (우선순위):
 *   1순위: Admin Reports API 감사 로그 (create_space 이벤트)
 *   2순위 폴백: Chat API 전체 목록 비교 (처리된 목록 ScriptProperties 보관)
 *
 * ────────────── 초기 설정 순서 ──────────────
 *   Step 1. GAS 에디터 → 확장 프로그램 → Apps Script API 추가
 *           - Google Chat API (v1)
 *           - Admin Reports API (v1)
 *   Step 2. appsscript.json의 oauthScopes 확인 (gas/appsscript.json 참조)
 *   Step 3. 이미 봇이 들어가 있는 스페이스 이름을 KNOWN_SPACE_WITH_BOT에 입력
 *           → getBotMemberName() 실행 → 로그에서 봇 이름 확인
 *   Step 4. BOT_MEMBER_NAME에 확인한 값 붙여넣기 (예: "users/123456789")
 *   Step 5. setupAutoAddTrigger() 실행 → 트리거 등록 완료
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
  BOT_MEMBER_NAME: 'users/REPLACE_ME',

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
 * 새 스페이스 감지 후 봇 자동 설치
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

  const newSpaces = detectNewSpaces_();
  if (!newSpaces.length) {
    console.log('⏭ 새 스페이스 없음 — ' + new Date().toLocaleString('ko-KR'));
    return;
  }

  console.log('🔍 새 스페이스 ' + newSpaces.length + '개 감지: ' + newSpaces.join(', '));
  for (const spaceName of newSpaces) {
    tryAddBotToSpace_(spaceName, botName);
  }
}

// ═══════════════════════ 스페이스 감지 ═══════════════════════

/**
 * 새 스페이스 감지
 * 1순위: Admin Reports API 감사 로그 (create_space 이벤트)
 * 2순위: Chat API 전체 목록 비교 (폴백)
 */
function detectNewSpaces_() {
  const props    = PropertiesService.getScriptProperties();
  const now      = new Date();
  const lastStr  = props.getProperty(AUTO_BOT_CONFIG.PROP_LAST_CHECK);

  // 첫 실행: 10분 전부터 / 이후: 마지막 체크 시점부터
  const startTime = lastStr
    ? new Date(lastStr)
    : new Date(now.getTime() - 10 * 60 * 1000);

  // 다음 체크를 위해 현재 시간 저장
  props.setProperty(AUTO_BOT_CONFIG.PROP_LAST_CHECK, now.toISOString());

  const processedStr = props.getProperty(AUTO_BOT_CONFIG.PROP_PROCESSED) || '[]';
  const processed    = new Set(JSON.parse(processedStr));

  let newSpaces = [];

  // ── 1순위: Admin Reports API ──
  try {
    newSpaces = detectViaAuditLog_(startTime, now, processed);
    console.log('📋 감사 로그 방식: ' + newSpaces.length + '개 신규');
  } catch (e) {
    console.warn('⚠ Admin Reports API 실패 → Chat API 폴백: ' + e.message);

    // ── 2순위 폴백: Chat API ──
    try {
      newSpaces = detectViaChatApi_(processed);
      console.log('📋 Chat API 폴백: ' + newSpaces.length + '개 신규');
    } catch (e2) {
      console.error('❌ 스페이스 감지 전체 실패: ' + e2.message);
      return [];
    }
  }

  // 처리 목록 갱신 (최대 1000개 유지)
  for (const s of newSpaces) processed.add(s);
  const trimmed = Array.from(processed).slice(-1000);
  props.setProperty(AUTO_BOT_CONFIG.PROP_PROCESSED, JSON.stringify(trimmed));

  return newSpaces;
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
 * Chat API 전체 목록 비교로 새 스페이스 감지
 * Admin 권한 없을 때 폴백 — 인증된 사용자가 멤버인 스페이스만 조회됨
 */
function detectViaChatApi_(processed) {
  const newSpaces = [];
  let pageToken   = null;

  do {
    const opts = { pageSize: 100 };
    if (pageToken) opts.pageToken = pageToken;

    let resp;
    try {
      // Admin 권한이 있을 때: useAdminAccess로 전체 조직 스페이스 조회
      resp = Chat.Spaces.list(Object.assign({}, opts, { useAdminAccess: true }));
    } catch (_) {
      // Admin 권한 없을 때: 본인이 속한 스페이스만 조회
      resp = Chat.Spaces.list(opts);
    }

    for (const space of (resp.spaces || [])) {
      if (
        AUTO_BOT_CONFIG.TARGET_SPACE_TYPES.includes(space.spaceType) &&
        !processed.has(space.name)
      ) {
        newSpaces.push(space.name);
        console.log('  신규 스페이스 감지 (Chat API): ' + space.name);
      }
    }

    pageToken = resp.nextPageToken || null;
  } while (pageToken);

  return newSpaces;
}

/**
 * 감사 로그 이벤트 파라미터에서 spaces/{id} 형식 추출
 */
function extractSpaceNameFromEvent_(event) {
  for (const p of (event.parameters || [])) {
    // 공식 파라미터 이름 (버전에 따라 다를 수 있음)
    if (p.name === 'space_id')   return 'spaces/' + p.value;
    if (p.name === 'space_name' && String(p.value).startsWith('spaces/')) return p.value;
    if (p.name === 'space_resource_name') return p.value;
  }
  return null;
}

// ═══════════════════════ 봇 추가 ═══════════════════════

/**
 * 스페이스에 봇 추가 (에러 유형별 분기 처리)
 */
function tryAddBotToSpace_(spaceName, botMemberName) {
  try {
    // 이미 멤버인지 사전 확인 (불필요한 API 호출 방지)
    if (isBotAlreadyMember_(spaceName, botMemberName)) {
      console.log('  ↩ 이미 멤버: ' + spaceName);
      return;
    }

    Chat.Spaces.Members.create(
      {
        member: {
          name: botMemberName,
          type: 'BOT',
        },
      },
      spaceName
    );

    console.log('  ✅ 봇 추가 성공: ' + spaceName);

  } catch (e) {
    const msg = e.message || '';

    if (msg.includes('409') || msg.toLowerCase().includes('already exists')) {
      // 이미 멤버 — 정상 (중복 방지 체크 타이밍 미스)
      console.log('  ↩ 이미 멤버 (409): ' + spaceName);

    } else if (msg.includes('403') || msg.toLowerCase().includes('permission')) {
      // 권한 없음 — 외부 스페이스 또는 봇 추가 비허용 정책
      console.warn('  ⛔ 권한 없음 (403): ' + spaceName + ' — ' + msg);

    } else if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
      // 스페이스가 이미 삭제됨
      console.warn('  🗑 스페이스 없음 (404): ' + spaceName);

    } else {
      console.error('  ❌ 봇 추가 실패: ' + spaceName + ' — ' + msg);
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
      return m.member && m.member.name === botMemberName;
    });
  } catch (_) {
    // 조회 실패 시 false 반환 → 추가 시도
    return false;
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
  const now       = new Date();
  const oneHrAgo  = new Date(now.getTime() - 60 * 60 * 1000);

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
 * ★ Step 5: 5분마다 자동 실행 트리거 등록 (1회만 실행)
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

/**
 * 현재 상태 확인 — 설정값 및 처리된 스페이스 수 출력
 */
function checkAutoBotStatus() {
  const props     = PropertiesService.getScriptProperties();
  const lastCheck = props.getProperty(AUTO_BOT_CONFIG.PROP_LAST_CHECK) || '없음';
  const processed = JSON.parse(props.getProperty(AUTO_BOT_CONFIG.PROP_PROCESSED) || '[]');
  const botName   = resolveBotMemberName_() || '❌ 미설정';

  const triggers = ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'autoAddBotToNewSpaces'; });

  console.log('━━━━ AutoAddBot 상태 ━━━━');
  console.log('봇 멤버 이름  : ' + botName);
  console.log('마지막 체크   : ' + lastCheck);
  console.log('처리된 스페이스: ' + processed.length + '개');
  console.log('활성 트리거   : ' + triggers.length + '개');
  console.log('──────────────────────────');

  if (botName.includes('REPLACE_ME') || botName === '❌ 미설정') {
    console.warn('⚠ 아직 BOT_MEMBER_NAME이 설정되지 않았습니다. getBotMemberName() 실행 필요');
  }
  if (!triggers.length) {
    console.warn('⚠ 활성 트리거 없음. setupAutoAddTrigger() 실행 필요');
  }
}
