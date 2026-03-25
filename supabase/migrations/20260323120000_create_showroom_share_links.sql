create table if not exists public.showroom_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  title text,
  description text,
  created_by uuid,
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint showroom_share_links_token_length check (char_length(token) >= 24)
);

comment on table public.showroom_share_links is '외부 공개 쇼룸 전체 접근용 만료 토큰 링크를 저장한다.';

create index if not exists idx_showroom_share_links_token on public.showroom_share_links (token);
create index if not exists idx_showroom_share_links_expires_at on public.showroom_share_links (expires_at);

alter table public.showroom_share_links enable row level security;

drop policy if exists showroom_share_links_authenticated_all on public.showroom_share_links;
create policy showroom_share_links_authenticated_all
  on public.showroom_share_links
  for all
  to authenticated
  using (true)
  with check (true);

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
  where exists (
    select 1
    from public.showroom_share_links ssl
    where ssl.token = share_token
      and ssl.revoked_at is null
      and ssl.expires_at > now()
  )
    and coalesce(ia.is_consultation, false) = true
    and coalesce(ia.category, '') not in ('purchase_order', 'floor_plan')
    and nullif(btrim(ia.cloudinary_url), '') is not null
  order by ia.created_at desc nulls last;
$$;

grant execute on function public.get_public_showroom_assets_by_share_token(text) to anon, authenticated;
