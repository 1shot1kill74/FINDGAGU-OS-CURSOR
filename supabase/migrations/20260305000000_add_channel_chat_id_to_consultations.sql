-- consultations 테이블에 구글챗 스페이스 ID 컬럼 추가
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS channel_chat_id text;

COMMENT ON COLUMN consultations.channel_chat_id IS '구글챗 스페이스 ID (spaces/XXXXXX)';
