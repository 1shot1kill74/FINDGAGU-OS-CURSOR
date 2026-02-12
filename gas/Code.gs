/**
 * 구글 시트 → Supabase consultations 동기화
 *
 * 동기화 규칙 (sync_consultations_from_sheet RPC):
 *   - Null 덮어쓰기 방지: 시트 필드가 빈 값이면 Supabase 기존 데이터 유지
 *   - 신규 행에만 기본값: status='상담중', estimate_amount=0
 *   - 데이터 주권: status, estimate_amount는 앱(Supabase)이 주인, 시트는 정보 전달만
 *
 * 시트 열 매핑:
 *   A(data[0]): 업체명(프로젝트명) → project_name
 *   B(data[1]): 구글챗링크 → link
 *   C(data[2]): 시작일자 → created_at (과거 날짜 그대로 Overwrite)
 *
 * 사용: Apps Script 편집기에서 initialSyncAll() 실행
 * 설정: 스크립트 속성에 SUPABASE_URL, SUPABASE_SERVICE_KEY 추가
 */

const CONFIG = {
  get supabaseUrl() {
    return PropertiesService.getScriptProperties().getProperty('SUPABASE_URL') || '';
  },
  get supabaseKey() {
    return PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY') || '';
  }
};

/** 시트의 시작일자(YYYY-MM-DD 또는 기타) → ISO 8601 */
function toCreatedAtISO(value) {
  if (value === null || value === undefined || value === '') {
    return new Date().toISOString();
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return m[1] + '-' + m[2] + '-' + m[3] + 'T00:00:00.000Z';
  }
  const d = s.match(/(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (d) {
    const y = d[1];
    const mon = ('0' + d[2]).slice(-2);
    const day = ('0' + d[3]).slice(-2);
    return y + '-' + mon + '-' + day + 'T00:00:00.000Z';
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

/** 시트 한 행 → Supabase consultations row */
function sheetRowToConsultation(row, startRowIndex) {
  // A: 업체명(프로젝트명), B: 구글챗링크, C: 시작일자
  const projectName = row[0] !== null && row[0] !== undefined && String(row[0]).trim() !== ''
    ? String(row[0]).trim() : null;
  if (!projectName) return null;

  const link = row[1] !== null && row[1] !== undefined && String(row[1]).trim() !== ''
    ? String(row[1]).trim() : null;
  const startDateRaw = row[2]; // C열: 시작일자
  const created_at = toCreatedAtISO(startDateRaw);

  return {
    project_name: projectName,
    link: link,
    created_at: created_at,
    start_date: created_at.slice(0, 10),
    is_visible: true
  };
}

/** 전체 시트 데이터를 Supabase로 동기화 (project_name 기준, RPC 사용) */
function initialSyncAll() {
  const url = CONFIG.supabaseUrl;
  const key = CONFIG.supabaseKey;
  if (!url || !key) {
    throw new Error('스크립트 속성에 SUPABASE_URL, SUPABASE_SERVICE_KEY를 설정하세요.');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    Logger.log('헤더만 있거나 데이터 없음');
    return { ok: false, message: '데이터 없음', count: 0 };
  }

  const rows = data.slice(1);
  const consultations = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const obj = sheetRowToConsultation(row, i + 2);
    if (obj) consultations.push(obj);
  }

  if (consultations.length === 0) {
    Logger.log('유효한 project_name 없음');
    return { ok: false, message: '유효한 업체명 없음', count: 0 };
  }

  // RPC 호출: null 덮어쓰기 방지, 신규만 기본값, status/estimate_amount 앱 주권
  const apiUrl = url.replace(/\/$/, '') + '/rest/v1/rpc/sync_consultations_from_sheet';
  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': 'Bearer ' + key
    },
    payload: JSON.stringify({ rows: consultations }),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(apiUrl, options);
  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code >= 200 && code < 300) {
    let result = { inserted: 0, updated: 0 };
    try {
      const parsed = JSON.parse(body);
      result = Array.isArray(parsed) && parsed[0] ? parsed[0] : (parsed || result);
    } catch (_) {}
    Logger.log('Sync 완료: 신규 ' + result.inserted + '건, 수정 ' + result.updated + '건');
    return { ok: true, count: consultations.length, inserted: result.inserted, updated: result.updated };
  }

  Logger.log('Sync 실패: ' + code + ' ' + body);
  throw new Error('Supabase Sync 실패: ' + code + ' - ' + body);
}

/** 기존 consultations 전체 삭제. 재동기화 전 실행 → 그 다음 initialSyncAll() */
function runDeleteAllConsultations() {
  const url = CONFIG.supabaseUrl;
  const key = CONFIG.supabaseKey;
  if (!url || !key) {
    throw new Error('스크립트 속성에 SUPABASE_URL, SUPABASE_SERVICE_KEY를 설정하세요.');
  }

  const delUrl = url.replace(/\/$/, '') + '/rest/v1/consultations?id=neq.00000000-0000-0000-0000-000000000000';
  const res = UrlFetchApp.fetch(delUrl, {
    method: 'delete',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key
    },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
    Logger.log('삭제 완료');
    return { ok: true };
  }
  throw new Error('삭제 실패: ' + res.getResponseCode() + ' ' + res.getContentText());
}
