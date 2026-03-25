create table if not exists public.channel_talk_leads (
  id uuid primary key default gen_random_uuid(),
  channel_user_chat_id text not null unique,
  channel_user_id text,
  customer_name text,
  phone text,
  industry text,
  last_message text,
  raw_payload jsonb not null default '{}'::jsonb,
  source_event_type text,
  first_seen_at timestamptz not null default now(),
  last_event_at timestamptz not null default now(),
  showroom_share_token text,
  showroom_link_sent_at timestamptz,
  showroom_send_error text,
  google_chat_space_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.channel_talk_leads is '채널톡에서 확보한 고객 정보를 임시로 보관하고 쇼룸 링크 발송 상태를 추적한다.';

create index if not exists idx_channel_talk_leads_phone on public.channel_talk_leads (phone);
create index if not exists idx_channel_talk_leads_industry on public.channel_talk_leads (industry);
create index if not exists idx_channel_talk_leads_showroom_share_token on public.channel_talk_leads (showroom_share_token);

alter table public.channel_talk_leads enable row level security;

drop policy if exists channel_talk_leads_authenticated_all on public.channel_talk_leads;
create policy channel_talk_leads_authenticated_all
  on public.channel_talk_leads
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.showroom_share_links
  add column if not exists industry_scope text,
  add column if not exists source text,
  add column if not exists channel_user_chat_id text;

comment on column public.showroom_share_links.industry_scope is '링크로 허용할 업종 범위. null이면 전체 쇼룸을 허용한다.';
comment on column public.showroom_share_links.source is '링크 생성 출처 (예: channel_talk_auto, internal_showroom_manual).';
comment on column public.showroom_share_links.channel_user_chat_id is '채널톡 자동 발송으로 생성된 경우 userChat 식별자.';

create index if not exists idx_showroom_share_links_industry_scope on public.showroom_share_links (industry_scope);
create index if not exists idx_showroom_share_links_channel_user_chat_id on public.showroom_share_links (channel_user_chat_id);

create or replace function public.resolve_public_showroom_share(share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  select jsonb_build_object(
    'token', ssl.token,
    'title', coalesce(nullif(btrim(ssl.title), ''), '시공사례 쇼룸'),
    'description', coalesce(nullif(btrim(ssl.description), ''), '담당자가 전달한 외부 쇼룸 링크입니다.'),
    'industry_scope', nullif(btrim(ssl.industry_scope), ''),
    'source', nullif(btrim(ssl.source), ''),
    'created_at', ssl.created_at,
    'expires_at', ssl.expires_at
  )
  into payload
  from public.showroom_share_links ssl
  where ssl.token = share_token
    and ssl.revoked_at is null
    and ssl.expires_at > now()
  limit 1;

  return payload;
end;
$$;

grant execute on function public.resolve_public_showroom_share(text) to anon, authenticated;

create or replace function public.get_public_showroom_assets_by_share_token(share_token text)
returns table (
  id uuid,
  cloudinary_url text,
  thumbnail_url text,
  site_name text,
  location text,
  business_type text,
  color_name text,
  product_name text,
  is_main boolean,
  created_at timestamptz,
  metadata jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    ia.id,
    ia.cloudinary_url,
    ia.thumbnail_url,
    ia.site_name,
    ia.location,
    ia.business_type,
    ia.color_name,
    ia.product_name,
    ia.is_main,
    ia.created_at,
    coalesce(ia.metadata, '{}'::jsonb) as metadata
  from public.image_assets ia
  join public.showroom_share_links ssl
    on ssl.token = share_token
  where ssl.revoked_at is null
    and ssl.expires_at > now()
    and (
      nullif(btrim(ssl.industry_scope), '') is null
      or coalesce(ia.business_type, '') ilike ('%' || btrim(ssl.industry_scope) || '%')
    )
    and coalesce(ia.is_consultation, false) = true
    and coalesce(ia.category, '') not in ('purchase_order', 'floor_plan')
    and nullif(btrim(ia.cloudinary_url), '') is not null
  order by ia.created_at desc nulls last;
$$;

grant execute on function public.get_public_showroom_assets_by_share_token(text) to anon, authenticated;
