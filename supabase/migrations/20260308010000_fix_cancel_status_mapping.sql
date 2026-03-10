-- 레거시 status '캔슬'은 현재 표준값 '거절'로 통일
UPDATE consultations
SET status = '거절'
WHERE status = '캔슬';
