/**
 * 구글 시트 ↔ Supabase consultations 양방향 실시간 동기화
 *
 * 구글챗 상담카드 이미지 업로드: GoogleChatCardImage.gs 참조 (메뉴 [구글챗 상담카드]).
 * 스크립트 속성 추가: CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET
 *
 * 시트 이름: '시트1' (SHEET_NAME) — 실제 탭 이름 기준
 * 열 매핑:
 *   A(0): 업체명(프로젝트명) → project_name
 *   B(1): 구글챗/스페이스 링크 → link
 *   C(2): 시작일자 → start_date / created_at
 *   D(3): 업데이트일 → update_date
 *   E(4): 상태 → status
 *   F(5): 견적가 → estimate_amount
 *
 * 1) 시트 → 앱: onEdit(e) 트리거로 '상담리스트' 편집 시 해당 행만 Supabase에 즉시 전송 (update_single_consultation_from_sheet RPC)
 * 2) 전체 일괄 동기화: syncAllDataBatch() — UrlFetchApp 1회로 전체 시트를 한 번에 전송 (update_multiple_consultations_from_sheet RPC, 200건 기준 10초 이내)
 * 3) 앱 → 시트: 앱 [최종 확정] 시 doPost 웹앱을 호출해 해당 행의 상태·견적가 갱신 (syncAppToSheet)
 *
 * 설정: 스크립트 속성에 SUPABASE_URL, SUPABASE_SERVICE_KEY 필수. 웹앱 인증용 SYNC_WEBAPP_TOKEN 권장.
 */

const SHEET_NAME = '시트1';
const COL = {
  PROJECT_NAME: 0,
  LINK: 1,
  START_DATE: 2,
  UPDATE_DATE: 3,
  STATUS: 4,
  ESTIMATE_AMOUNT: 5
};

const CONFIG = {
  get supabaseUrl() {
    return PropertiesService.getScriptProperties().getProperty('SUPABASE_URL') || '';
  },
  get supabaseKey() {
    return PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY') || '';
  },
  get webappToken() {
    return PropertiesService.getScriptProperties().getProperty('SYNC_WEBAPP_TOKEN') || '';
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

/** 시트 값 → YYYY-MM-DD (update_date, start_date용). 빈 값이면 null */
function toDateOnly(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  const d = s.match(/(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (d) {
    const y = d[1];
    const mon = ('0' + d[2]).slice(-2);
    const day = ('0' + d[3]).slice(-2);
    return y + '-' + mon + '-' + day;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const mon = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return y + '-' + mon + '-' + day;
  }
  return null;
}

/** 견적가 셀 값 → 정수 (빈 값/숫자아니면 null) */
function parseEstimateAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && !isNaN(value)) return Math.round(value);
  const s = String(value).replace(/,/g, '').trim();
  if (s === '') return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
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

/**
 * 전체 시트 데이터를 한 번에 Supabase로 전송 (UrlFetchApp 1회).
 * 100건 이상 시 8분 걸리던 단건 RPC 대신 200건 기준 10초 이내 목표.
 * RPC: update_multiple_consultations_from_sheet(rows jsonb) — project_name 기준 일괄 upsert.
 * @returns {{ ok: boolean, processed?: number, error?: string, durationMs?: number }}
 */
function syncAllDataBatch() {
  const url = CONFIG.supabaseUrl;
  const key = CONFIG.supabaseKey;
  if (!url || !key) {
    return { ok: false, error: '스크립트 속성에 SUPABASE_URL, SUPABASE_SERVICE_KEY를 설정하세요.' };
  }

  const started = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    return { ok: false, error: '시트 "' + SHEET_NAME + '"을(를) 찾을 수 없습니다.' };
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return { ok: true, processed: 0, durationMs: Date.now() - started, message: '데이터 행 없음' };
  }

  const rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var projectName = row[COL.PROJECT_NAME] != null && String(row[COL.PROJECT_NAME]).trim() !== ''
      ? String(row[COL.PROJECT_NAME]).trim() : null;
    if (!projectName) continue;

    var link = row[COL.LINK] != null && String(row[COL.LINK]).trim() !== '' ? String(row[COL.LINK]).trim() : null;
    var startDateStr = toDateOnly(row[COL.START_DATE]);
    var updateDateStr = toDateOnly(row[COL.UPDATE_DATE]);
    var created_at = row[COL.START_DATE] != null && String(row[COL.START_DATE]).trim() !== ''
      ? toCreatedAtISO(row[COL.START_DATE]) : null;
    // D열(업데이트일)을 앱 '오늘 갱신' / 미갱신 D-Day 표시용으로 metadata.sheet_update_date에 전달
    var sheet_update_date = updateDateStr || null;

    rows.push({
      project_name: projectName,
      link: link,
      start_date: startDateStr,
      update_date: updateDateStr,
      created_at: created_at,
      sheet_update_date: sheet_update_date
    });
  }

  if (rows.length === 0) {
    return { ok: true, processed: 0, durationMs: Date.now() - started, message: '유효한 project_name 없음' };
  }

  var apiUrl = url.replace(/\/$/, '') + '/rest/v1/rpc/update_multiple_consultations_from_sheet';
  var options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': 'Bearer ' + key
    },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(apiUrl, options);
  var code = response.getResponseCode();
  var body = response.getContentText();
  var durationMs = Date.now() - started;

  if (code < 200 || code >= 300) {
    Logger.log('syncAllDataBatch 실패: ' + code + ' - ' + body);
    return { ok: false, error: 'Supabase ' + code + ' - ' + body, durationMs: durationMs };
  }

  var result = { ok: true, processed: rows.length, durationMs: durationMs };
  try {
    var parsed = JSON.parse(body);
    if (parsed && typeof parsed.processed === 'number') result.processed = parsed.processed;
    if (parsed && parsed.error) result.error = parsed.error;
    if (parsed && parsed.ok === false) result.ok = false;
  } catch (_) {}
  Logger.log('syncAllDataBatch 완료: ' + result.processed + '건, ' + result.durationMs + 'ms');
  return result;
}

// ---------- 실시간 시트 → Supabase (onEdit) ----------

/**
 * '상담리스트' 시트에서 A~D열(project_name, link, start_date, update_date) 편집 시 해당 행만 Supabase로 즉시 전송.
 * 데이터 일원화: 시트에서 빈 값이 오면 RPC가 DB에도 null로 반영.
 * E·F열(status, estimate_amount) 편집 시에는 동기화하지 않음(앱 전용).
 */
function onEdit(e) {
  if (!e || !e.range) return;
  try {
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
  } catch (err) {
    Logger.log('onEdit: sheet name check failed - ' + (err && err.message));
    return;
  }

  var col = e.range.getColumn();
  if (col > 4) return; // A=1, B=2, C=3, D=4 만 반응. E·F열 편집 시 스킵

  var rowIndex = e.range.getRow();
  if (rowIndex < 2) return; // 헤더 행 스킵

  const url = CONFIG.supabaseUrl;
  const key = CONFIG.supabaseKey;
  if (!url || !key) {
    Logger.log('onEdit: SUPABASE_URL or SUPABASE_SERVICE_KEY not set');
    return;
  }

  try {
    var sheet = e.range.getSheet();
    var lastCol = Math.max(COL.ESTIMATE_AMOUNT + 1, sheet.getLastColumn());
    var row = sheet.getRange(rowIndex, 1, rowIndex, lastCol).getValues()[0];
    var projectName = row[COL.PROJECT_NAME] != null && String(row[COL.PROJECT_NAME]).trim() !== ''
      ? String(row[COL.PROJECT_NAME]).trim() : null;
    if (!projectName) {
      Logger.log('onEdit: row ' + rowIndex + ' has no project_name, skip');
      return;
    }

    var link = row[COL.LINK] != null && String(row[COL.LINK]).trim() !== '' ? String(row[COL.LINK]).trim() : null;
    var startDateStr = toDateOnly(row[COL.START_DATE]);
    var updateDateStr = toDateOnly(row[COL.UPDATE_DATE]);
    var created_at = row[COL.START_DATE] != null && String(row[COL.START_DATE]).trim() !== ''
      ? toCreatedAtISO(row[COL.START_DATE]) : null;

    // 빈 셀은 null로 전달 → RPC가 DB도 null로 동기화 (데이터 일원화)
    // D열(업데이트일)을 sheet_update_date로 함께 전달 → metadata.sheet_update_date 갱신 (앱 '오늘 갱신' / D-Day 표시)
    var payload = {
      project_name: projectName,
      link: link,
      start_date: startDateStr,
      update_date: updateDateStr,
      created_at: created_at,
      sheet_update_date: updateDateStr
    };

    var apiUrl = url.replace(/\/$/, '') + '/rest/v1/rpc/update_single_consultation_from_sheet';
    var options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(apiUrl, options);
    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code >= 200 && code < 300) {
      Logger.log('onEdit: row ' + rowIndex + ' synced to Supabase');
    } else {
      Logger.log('onEdit: Supabase returned ' + code + ' - ' + body);
    }
  } catch (err) {
    Logger.log('onEdit error: ' + (err && err.message));
  }
}

// ---------- 앱 → 시트 (최종 확정 시 시트 갱신) ----------

/**
 * 앱에서 [최종 확정] 시 호출. project_name에 해당하는 행의 상태·견적가를 시트에 반영.
 * @param {string} projectName - consultations.project_name (업체명)
 * @param {string} status - 예: '계약완료'
 * @param {number} estimateAmount - 최종 견적가(원)
 * @returns {{ ok: boolean, row?: number, error?: string }}
 */
function syncAppToSheet(projectName, status, estimateAmount) {
  if (!projectName || String(projectName).trim() === '') {
    return { ok: false, error: 'project_name required' };
  }
  projectName = String(projectName).trim();
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return { ok: false, error: 'Sheet "' + SHEET_NAME + '" not found' };
    }
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return { ok: false, error: 'No data rows' };

    let targetRow = -1;
    for (let i = 1; i < data.length; i++) {
      const cell = data[i][COL.PROJECT_NAME];
      if (cell != null && String(cell).trim() === projectName) {
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow < 0) {
      return { ok: false, error: 'Row not found for project_name: ' + projectName };
    }

    if (status != null && String(status).trim() !== '') {
      sheet.getRange(targetRow, COL.STATUS + 1).setValue(String(status).trim());
    }
    if (typeof estimateAmount === 'number' && !isNaN(estimateAmount)) {
      sheet.getRange(targetRow, COL.ESTIMATE_AMOUNT + 1).setValue(estimateAmount);
    }
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    sheet.getRange(targetRow, COL.UPDATE_DATE + 1).setValue(today);

    return { ok: true, row: targetRow };
  } catch (err) {
    Logger.log('syncAppToSheet error: ' + (err && err.message));
    return { ok: false, error: (err && err.message) || 'Unknown error' };
  }
}

/**
 * 웹앱 doPost: 앱이 [최종 확정] 후 이 URL로 POST하면 시트 해당 행 갱신.
 * Body: JSON { project_name, status?, estimate_amount?, token? }
 * token이 스크립트 속성 SYNC_WEBAPP_TOKEN과 일치하면 실행 (비어 있으면 토큰 검사 생략).
 */
function doPost(e) {
  const contentType = (e && e.postData && e.postData.type) ? e.postData.type : '';
  let params = {};
  try {
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const token = CONFIG.webappToken;
  if (token && params.token !== token) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const projectName = params.project_name;
  const status = params.status != null ? String(params.status) : null;
  const estimateAmount = params.estimate_amount != null ? Number(params.estimate_amount) : null;

  const result = syncAppToSheet(projectName, status, estimateAmount);
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
