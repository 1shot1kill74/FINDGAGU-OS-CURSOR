-- 잘못된 상담 데이터 삭제: "견적 2602 대치동 플레온학원"
-- FK CASCADE로 연관 자식(consultation_messages, estimates, order_documents 등) 함께 삭제됨
DELETE FROM consultations
WHERE COALESCE(project_name, company_name, '') ILIKE '%견적 2602 대치동 플레온학원%';
