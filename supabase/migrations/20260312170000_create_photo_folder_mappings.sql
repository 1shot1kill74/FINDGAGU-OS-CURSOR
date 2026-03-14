create table if not exists public.photo_folder_mappings (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'google_drive',
  folder_id text null,
  folder_name text not null,
  folder_path text not null,
  file_count integer not null default 0,
  sample_file text null,
  consultation_id uuid null,
  space_id text null,
  space_display_name text null,
  site_name text null,
  mapping_status text not null default 'pending',
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photo_folder_mappings_mapping_status_check
    check (mapping_status in ('pending', 'matched', 'ignored')),
  constraint photo_folder_mappings_folder_path_key unique (folder_path)
);

create index if not exists idx_photo_folder_mappings_consultation_id
  on public.photo_folder_mappings (consultation_id);

create index if not exists idx_photo_folder_mappings_space_id
  on public.photo_folder_mappings (space_id);

create index if not exists idx_photo_folder_mappings_mapping_status
  on public.photo_folder_mappings (mapping_status);

comment on table public.photo_folder_mappings is '현장 사진 폴더(구글 드라이브 등)와 상담/스페이스를 연결하는 매핑 테이블';
comment on column public.photo_folder_mappings.folder_id is '구글 드라이브 폴더 ID 등 외부 소스의 원본 식별자';
comment on column public.photo_folder_mappings.folder_path is '현재 사진이 보관된 루트 기준 폴더 경로';
comment on column public.photo_folder_mappings.space_id is '구글챗/테이크아웃 기준 스페이스 ID';
comment on column public.photo_folder_mappings.space_display_name is '사람이 보는 현장명/스페이스 표시명';
