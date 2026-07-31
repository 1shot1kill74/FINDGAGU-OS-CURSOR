-- 교육용 가구 B2B 아웃리치 (공개 시그널 → AI 점수 → 사람 승인 → 발송 로그)
-- Human-in-the-loop: 승인 전 자동 발송 없음. SNS 비공개 스크래핑 없음.

create extension if not exists pgcrypto;

create table if not exists public.edu_outreach_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  source_type text not null check (source_type in (
    'google_news_rss',
    'g2b_notice',
    'school_notice',
    'manual_import',
    'other_public'
  )),
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_polled_at timestamptz,
  last_poll_status text,
  last_poll_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.edu_outreach_signals (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.edu_outreach_sources(id) on delete set null,
  external_id text not null,
  title text,
  body text,
  source_url text,
  published_at timestamptz,
  region_hint text,
  industry_hint text,
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (external_id)
);

create index if not exists edu_outreach_signals_published_idx
  on public.edu_outreach_signals (published_at desc nulls last);

create table if not exists public.edu_outreach_leads (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references public.edu_outreach_signals(id) on delete set null,
  org_name text,
  contact_channel text not null default 'manual'
    check (contact_channel in ('manual', 'email', 'phone', 'form', 'official_bid', 'unknown')),
  contact_value text,
  industry text not null default 'unknown'
    check (industry in (
      'academy',
      'school',
      'study_cafe',
      'managed_reading_room',
      'apartment_community',
      'military',
      'unknown',
      'excluded'
    )),
  intent text,
  region text,
  status text not null default 'new'
    check (status in (
      'new',
      'scored',
      'queued',
      'approved',
      'rejected',
      'sent',
      'replied',
      'converted',
      'excluded'
    )),
  fit_score numeric(5,2),
  score_payload jsonb not null default '{}'::jsonb,
  evidence_quote text,
  source_url text,
  why text,
  outreach_angle text,
  cta_url text,
  preferred_contact_window text not null default 'lunch_or_late_evening'
    check (preferred_contact_window in ('lunch_or_late_evening', 'business_hours', 'official_channel_only')),
  scored_at timestamptz,
  queued_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists edu_outreach_leads_status_score_idx
  on public.edu_outreach_leads (status, fit_score desc nulls last, created_at desc);

create index if not exists edu_outreach_leads_industry_idx
  on public.edu_outreach_leads (industry, created_at desc);

create table if not exists public.edu_outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.edu_outreach_leads(id) on delete cascade,
  channel text not null default 'manual_copy'
    check (channel in ('manual_copy', 'email', 'form', 'official_bid')),
  subject text,
  body text not null,
  cta_url text,
  engine text not null default 'heuristic'
    check (engine in ('heuristic', 'ai', 'human')),
  version int not null default 1,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists edu_outreach_drafts_lead_current_idx
  on public.edu_outreach_drafts (lead_id, is_current)
  where is_current = true;

create table if not exists public.edu_outreach_approvals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.edu_outreach_leads(id) on delete cascade,
  draft_id uuid references public.edu_outreach_drafts(id) on delete set null,
  action text not null check (action in ('approve', 'reject', 'edit_approve')),
  actor_user_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists edu_outreach_approvals_lead_idx
  on public.edu_outreach_approvals (lead_id, created_at desc);

create table if not exists public.edu_outreach_send_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.edu_outreach_leads(id) on delete cascade,
  draft_id uuid references public.edu_outreach_drafts(id) on delete set null,
  channel text not null default 'manual_copy',
  status text not null default 'logged'
    check (status in ('logged', 'sent', 'failed', 'bounced')),
  destination text,
  message_snapshot text,
  error_message text,
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists edu_outreach_send_logs_lead_idx
  on public.edu_outreach_send_logs (lead_id, created_at desc);

create table if not exists public.edu_outreach_poll_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.edu_outreach_sources(id) on delete set null,
  status text not null default 'running',
  signals_new int not null default 0,
  leads_new int not null default 0,
  leads_scored int not null default 0,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- seed sources (공개 RSS + 수동 입찰 공고)
insert into public.edu_outreach_sources (slug, name, source_type, config)
values
  (
    'google_news_edu_furniture',
    'Google News RSS — 교육공간 가구 시그널',
    'google_news_rss',
    '{
      "queries": [
        "학원 개원 OR 학원 이전 OR 학원 리모델링",
        "스터디카페 오픈 OR 스터디카페 인테리어",
        "관리형 독서실 오픈 OR 독서실 리모델링",
        "아파트 커뮤니티 독서실 OR 아파트 스터디룸",
        "학교 특별실 가구 OR 학교 기자재 책상"
      ],
      "hl": "ko",
      "gl": "KR",
      "ceid": "KR:ko"
    }'::jsonb
  ),
  (
    'g2b_manual_import',
    '나라장터/공식 입찰 공고 (수동·공식 채널만)',
    'g2b_notice',
    '{"mode": "manual_paste_only", "auto_dm": false}'::jsonb
  )
on conflict (slug) do nothing;

alter table public.edu_outreach_sources enable row level security;
alter table public.edu_outreach_signals enable row level security;
alter table public.edu_outreach_leads enable row level security;
alter table public.edu_outreach_drafts enable row level security;
alter table public.edu_outreach_approvals enable row level security;
alter table public.edu_outreach_send_logs enable row level security;
alter table public.edu_outreach_poll_runs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_edu_outreach_sources') then
    create policy "authenticated_all_edu_outreach_sources" on public.edu_outreach_sources
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_edu_outreach_signals') then
    create policy "authenticated_all_edu_outreach_signals" on public.edu_outreach_signals
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_edu_outreach_leads') then
    create policy "authenticated_all_edu_outreach_leads" on public.edu_outreach_leads
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_edu_outreach_drafts') then
    create policy "authenticated_all_edu_outreach_drafts" on public.edu_outreach_drafts
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_edu_outreach_approvals') then
    create policy "authenticated_all_edu_outreach_approvals" on public.edu_outreach_approvals
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_edu_outreach_send_logs') then
    create policy "authenticated_all_edu_outreach_send_logs" on public.edu_outreach_send_logs
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_edu_outreach_poll_runs') then
    create policy "authenticated_all_edu_outreach_poll_runs" on public.edu_outreach_poll_runs
      for all to authenticated using (true) with check (true);
  end if;
end $$;
