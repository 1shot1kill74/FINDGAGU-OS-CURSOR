create table if not exists public.shared_gallery_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  title text,
  description text,
  items jsonb not null,
  source text,
  created_by uuid,
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint shared_gallery_links_token_length check (char_length(token) >= 24),
  constraint shared_gallery_links_items_array check (jsonb_typeof(items) = 'array')
);

comment on table public.shared_gallery_links is '공개 공유용 갤러리 토큰과 공개 스냅샷 데이터를 저장한다.';
comment on column public.shared_gallery_links.items is '공개 페이지에서 바로 렌더링할 수 있는 자산 스냅샷 배열(JSONB).';

create index if not exists idx_shared_gallery_links_token on public.shared_gallery_links (token);
create index if not exists idx_shared_gallery_links_expires_at on public.shared_gallery_links (expires_at);

alter table public.shared_gallery_links enable row level security;

drop policy if exists shared_gallery_links_authenticated_all on public.shared_gallery_links;
create policy shared_gallery_links_authenticated_all
  on public.shared_gallery_links
  for all
  to authenticated
  using (true)
  with check (true);

create or replace function public.resolve_shared_gallery(share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  select jsonb_build_object(
    'token', sgl.token,
    'title', coalesce(nullif(btrim(sgl.title), ''), '선별 시공 사례'),
    'description', coalesce(nullif(btrim(sgl.description), ''), '담당자가 고른 참고 사진입니다.'),
    'items', sgl.items,
    'created_at', sgl.created_at,
    'expires_at', sgl.expires_at
  )
  into payload
  from public.shared_gallery_links sgl
  where sgl.token = share_token
    and sgl.revoked_at is null
    and (sgl.expires_at is null or sgl.expires_at > now())
  limit 1;

  return payload;
end;
$$;

grant execute on function public.resolve_shared_gallery(text) to anon, authenticated;
