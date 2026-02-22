/**
 * 구글챗 상담카드 이미지 — 이미지 자산 관리 시스템과 동일 종착지
 *
 * 원칙: "입구가 하나 더 생기는 것뿐, 데이터의 종착지는 동일하다"
 * - Cloudinary: CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET (이미지 자산 관리와 동일)
 * - public_id 폴더/규칙: consultation/YYMMDD_업체명_구글챗_01
 * - 업로드 시 context(custom): site_name, project_name, upload_date, source=google_chat_card
 * - tags: 구글챗, 상담카드
 * - 업로드 성공 후: 1) image_assets에 동일 메타데이터로 Insert, 2) consultation_messages에 타임라인 반영 (file_url + metadata.public_id)
 *
 * 구글 시트는 project_name을 얻기 위한 통로만 사용. 시트 행에 데이터를 쌓지 않음.
 */

var CONFIG = {
  get supabaseUrl() { return (PropertiesService.getScriptProperties().getProperty('SUPABASE_URL') || '').replace(/\/$/, ''); },
  get supabaseKey() { return PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY') || ''; },
  get cloudName() { return PropertiesService.getScriptProperties().getProperty('CLOUDINARY_CLOUD_NAME') || ''; },
  get uploadPreset() { return PropertiesService.getScriptProperties().getProperty('CLOUDINARY_UPLOAD_PRESET') || ''; }
};

var THUMB_OPTS = 'w_800,c_scale,e_improve,e_sharpen,f_auto,q_auto';

function buildCloudinaryUrl_(basePath, publicId) {
  return 'https://res.cloudinary.com/' + CONFIG.cloudName + '/image/upload/' + (basePath ? basePath + '/' : '') + publicId;
}

function buildPublicId_(projectName, index) {
  var yymmdd = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd');
  var seg = (projectName || '업체명없음').toString().trim().replace(/\s+/g, '_').replace(/\//g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || '업체명없음';
  var seq = (index >= 1) ? ('0' + Math.floor(index)).slice(-2) : '01';
  return 'consultation/' + yymmdd + '_' + seg + '_구글챗_' + seq;
}

/**
 * Cloudinary 업로드 — context(custom), tags 포함 (이미지 자산 관리와 동일 규격)
 */
function uploadToCloudinary_(blob, publicId, projectName) {
  if (!CONFIG.cloudName || !CONFIG.uploadPreset) throw new Error('CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET 설정 필요');
  var uploadDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var contextStr = 'site_name=' + (projectName || '').replace(/\|/g, ' ') + '|project_name=' + (projectName || '').replace(/\|/g, ' ') + '|upload_date=' + uploadDate + '|source=google_chat_card';
  var tagsStr = '구글챗,상담카드';

  var boundary = '----Boundary' + Utilities.getUuid();
  var d = '\r\n--' + boundary + '\r\n';
  var end = '\r\n--' + boundary + '--\r\n';
  var payload = d + 'Content-Disposition: form-data; name="upload_preset"\r\n\r\n' + CONFIG.uploadPreset + d +
    'Content-Disposition: form-data; name="public_id"\r\n\r\n' + publicId + d +
    'Content-Disposition: form-data; name="context"\r\n\r\n' + contextStr + d +
    'Content-Disposition: form-data; name="tags"\r\n\r\n' + tagsStr + d +
    'Content-Disposition: form-data; name="file"; filename="' + (blob.getName() || 'image.jpg') + '"\r\nContent-Type: ' + (blob.getContentType() || 'image/jpeg') + '\r\n\r\n';
  var body = Utilities.newBlob(payload).getBytes().concat(blob.getBytes()).concat(Utilities.newBlob(end).getBytes());

  var res = UrlFetchApp.fetch('https://api.cloudinary.com/v1_1/' + CONFIG.cloudName + '/image/upload', {
    method: 'post',
    contentType: 'multipart/form-data; boundary=' + boundary,
    payload: body,
    muteHttpExceptions: true
  });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) throw new Error('Cloudinary 업로드 실패: ' + res.getContentText());
  var json = JSON.parse(res.getContentText());
  var pid = json.public_id || '';
  if (!pid) throw new Error('Cloudinary public_id 없음');
  return {
    public_id: pid,
    cloudinary_url: json.secure_url || buildCloudinaryUrl_('', pid),
    thumbnail_url: buildCloudinaryUrl_(THUMB_OPTS, pid)
  };
}

/** project_name → consultations.id */
function getConsultationId_(projectName) {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) throw new Error('SUPABASE_URL, SUPABASE_SERVICE_KEY 설정 필요');
  var res = UrlFetchApp.fetch(CONFIG.supabaseUrl + '/rest/v1/consultations?project_name=eq.' + encodeURIComponent(projectName) + '&select=id', {
    headers: { 'apikey': CONFIG.supabaseKey, 'Authorization': 'Bearer ' + CONFIG.supabaseKey },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return null;
  var rows = JSON.parse(res.getContentText());
  return (rows && rows[0]) ? rows[0].id : null;
}

/**
 * image_assets Insert — 이미지 자산 관리와 동일 테이블/메타 (종착지 통일)
 */
function insertImageAsset_(projectName, cloudinaryUrl, thumbnailUrl, optionalFileName) {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var payload = {
    cloudinary_url: cloudinaryUrl,
    thumbnail_url: thumbnailUrl,
    site_name: projectName,
    photo_date: today,
    is_main: false,
    metadata: { source: 'google_chat_card', original_name: optionalFileName || '구글챗 카드 이미지.jpg' }
  };
  var res = UrlFetchApp.fetch(CONFIG.supabaseUrl + '/rest/v1/image_assets', {
    method: 'post',
    headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.supabaseKey, 'Authorization': 'Bearer ' + CONFIG.supabaseKey, 'Prefer': 'return=minimal' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) throw new Error('image_assets 삽입 실패: ' + res.getContentText());
}

/**
 * consultation_messages Insert — 타임라인에 즉시 반영. file_url=썸네일, metadata에 public_id 저장 (앱에서 변환 API용)
 */
function insertConsultationMessage_(consultationId, thumbnailUrl, publicId, fileName) {
  var payload = {
    consultation_id: consultationId,
    sender_id: 'google_chat',
    content: '[구글챗 카드 이미지]',
    message_type: 'FILE',
    file_url: thumbnailUrl,
    file_name: fileName || '구글챗 카드 이미지.jpg',
    is_visible: true,
    metadata: { public_id: publicId, cloud_name: CONFIG.cloudName }
  };
  var res = UrlFetchApp.fetch(CONFIG.supabaseUrl + '/rest/v1/consultation_messages', {
    method: 'post',
    headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.supabaseKey, 'Authorization': 'Bearer ' + CONFIG.supabaseKey, 'Prefer': 'return=representation' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) throw new Error('consultation_messages 삽입 실패: ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

/**
 * 공통 업로드 플로우: Cloudinary → image_assets → consultation_messages (시트에 데이터 쌓지 않음)
 */
function uploadGoogleChatCardImageFromBlob(projectName, blob, optionalFileName, index) {
  projectName = (projectName && String(projectName).trim()) ? String(projectName).trim() : '';
  if (!projectName) return { ok: false, error: 'project_name 필요' };
  if (!blob) return { ok: false, error: '이미지 Blob 필요' };
  index = (index != null && index >= 1) ? index : 1;

  try {
    var publicId = buildPublicId_(projectName, index);
    var up = uploadToCloudinary_(blob, publicId, projectName);
    var consultationId = getConsultationId_(projectName);
    if (!consultationId) return { ok: false, error: '해당 project_name 상담 없음: ' + projectName };

    insertImageAsset_(projectName, up.cloudinary_url, up.thumbnail_url, optionalFileName);
    var inserted = insertConsultationMessage_(consultationId, up.thumbnail_url, up.public_id, optionalFileName || '구글챗 카드 이미지.jpg');
    var msgId = Array.isArray(inserted) && inserted[0] ? inserted[0].id : (inserted && inserted.id) ? inserted.id : null;

    return { ok: true, message_id: msgId, thumbnail_url: up.thumbnail_url, public_id: up.public_id };
  } catch (err) {
    Logger.log(err);
    return { ok: false, error: (err && err.message) || '업로드 실패' };
  }
}

function uploadGoogleChatCardImageFromDrive(projectName, driveFileId, index) {
  if (!projectName || !driveFileId) return { ok: false, error: 'project_name과 Drive 파일 ID 필요' };
  projectName = String(projectName).trim();
  driveFileId = String(driveFileId).trim();
  try {
    var file = DriveApp.getFileById(driveFileId);
    var blob = file.getBlob();
    if (blob.getContentType() && blob.getContentType().indexOf('image/') !== 0) return { ok: false, error: '이미지 파일만 가능' };
    return uploadGoogleChatCardImageFromBlob(projectName, blob, file.getName(), index);
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'Drive 조회 실패' };
  }
}

function uploadGoogleChatCardImageFromUrl(projectName, imageUrl, index) {
  if (!projectName || !imageUrl) return { ok: false, error: 'project_name과 이미지 URL 필요' };
  projectName = String(projectName).trim();
  imageUrl = String(imageUrl).trim();
  try {
    var res = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) return { ok: false, error: 'URL 다운로드 실패' };
    var blob = res.getBlob();
    var name = (imageUrl.split('/').pop() || 'image.jpg').split('?')[0];
    return uploadGoogleChatCardImageFromBlob(projectName, blob, name, index);
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'URL 실패' };
  }
}

/** 다이얼로그용: projectName은 인자로만 전달 (시트 조작 최소화) */
function uploadFromDialog(projectName, imageUrl, driveFileId) {
  projectName = (projectName && String(projectName).trim()) ? String(projectName).trim() : '';
  if (!projectName) return { ok: false, error: '업체명 없음' };
  if (imageUrl && imageUrl.trim()) return uploadGoogleChatCardImageFromUrl(projectName, imageUrl.trim());
  if (driveFileId && driveFileId.trim()) return uploadGoogleChatCardImageFromDrive(projectName, driveFileId.trim());
  return { ok: false, error: '이미지 URL 또는 Drive 파일 ID 입력' };
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('구글챗 상담카드').addItem('이미지 업로드 (현재 행 업체명)', 'runUploadDialog').addToUi();
}

/** 시트는 project_name 읽기 1회만. 업로드/저장은 모두 Cloudinary + Supabase */
function runUploadDialog() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== '시트1') { SpreadsheetApp.getUi().alert('시트1에서 실행하세요.'); return; }
  var row = sheet.getActiveRange() ? sheet.getActiveRange().getRow() : 2;
  if (row < 2) { SpreadsheetApp.getUi().alert('데이터 행을 선택하세요.'); return; }
  var projectName = sheet.getRange(row, 1).getValue();
  if (projectName == null || String(projectName).trim() === '') { SpreadsheetApp.getUi().alert('A열(업체명)을 입력하세요.'); return; }
  projectName = String(projectName).trim();

  var safe = projectName.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '&lt;').replace(/>/g, '&gt;');
  var html = '<p><strong>' + safe + '</strong></p><p>URL 또는 Drive 파일 ID 입력 후 버튼 클릭</p>' +
    '<p><input type="text" id="url" placeholder="https://..." style="width:100%;"/></p>' +
    '<p><input type="text" id="driveId" placeholder="Drive 파일 ID" style="width:100%;"/></p>' +
    '<p><button id="bUrl">URL 업로드</button> <button id="bDrive">Drive ID 업로드</button></p>' +
    '<script>var PN="' + safe + '";' +
    'document.getElementById("bUrl").onclick=function(){var u=document.getElementById("url").value.trim();if(!u){alert("URL 입력");return;}google.script.run.withSuccessHandler(function(r){alert(r.error||"완료. 타임라인에 반영됨");if(!r.error)google.script.host.close();}).withFailureHandler(function(e){alert(e);}).uploadFromDialog(PN,u,null);};' +
    'document.getElementById("bDrive").onclick=function(){var d=document.getElementById("driveId").value.trim();if(!d){alert("Drive ID 입력");return;}google.script.run.withSuccessHandler(function(r){alert(r.error||"완료");if(!r.error)google.script.host.close();}).withFailureHandler(function(e){alert(e);}).uploadFromDialog(PN,null,d);};</script>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(400).setHeight(220), '구글챗 카드 이미지');
}
