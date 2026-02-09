-- 상담 카드 '읽지 않은 새 메시지' 알람용: 마지막 확인 시각
alter table public.consultations
  add column if not exists last_viewed_at timestamptz;

comment on column public.consultations.last_viewed_at is '상담 채팅을 마지막으로 확인한 시각; 읽지 않은 메시지 알람 판단용';
