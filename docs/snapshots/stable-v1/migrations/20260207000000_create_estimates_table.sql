-- 견적서 표준 양식 저장 — 상담 건별 다중 버전
create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  payload jsonb not null default '{}',
  supply_total bigint not null default 0,
  vat bigint not null default 0,
  grand_total bigint not null default 0,
  approved_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_estimates_consultation_id on public.estimates(consultation_id);
comment on table public.estimates is '견적서 표준 양식 저장; 상담 카드 부속 모듈, 다중 버전 지원';
