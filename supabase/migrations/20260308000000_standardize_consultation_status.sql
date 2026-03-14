-- status 값 표준화: 접수/견적/진행/완료/AS/무효/거절 7종으로 통일
-- 레거시 값 → 신규 값 매핑
UPDATE consultations SET status = '접수'  WHERE status IN ('상담중', '신규', '상담접수', '접수중', '신규접수');
UPDATE consultations SET status = '견적'  WHERE status IN ('견적발송', '견적중', '견적발송중');
UPDATE consultations SET status = '진행'  WHERE status IN ('계약완료', '진행중', '계약', '계약중');
UPDATE consultations SET status = '완료'  WHERE status IN ('휴식기', '시공완료', '완료됨', '종료');
UPDATE consultations SET status = 'AS'    WHERE status = 'AS_WAITING';
-- 거절·무효는 이미 동일 값이므로 변경 없음
