-- 채팅형 히스토리: 메시지 테이블
create table if not exists public.consultation_messages (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  sender_id text not null default 'staff',
  content text not null default '',
  message_type text not null default 'TEXT' check (message_type in ('TEXT', 'FILE')),
  file_url text,
  file_name text,
  created_at timestamptz default now()
);

create index if not exists idx_consultation_messages_consultation_created
  on public.consultation_messages(consultation_id, created_at desc);

comment on table public.consultation_messages is '상담별 채팅형 히스토리; 이미지/PDF는 Storage chat-media에 저장 후 URL만 기록';

-- chat-media 버킷 (프로젝트별 경로: chat-media/{consultation_id}/)
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

create policy "chat-media insert"
  on storage.objects for insert to public
  with check (bucket_id = 'chat-media');

create policy "chat-media select"
  on storage.objects for select to public
  using (bucket_id = 'chat-media');
