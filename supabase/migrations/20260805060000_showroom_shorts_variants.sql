-- 광고대기실 BA 쇼츠: 제목/영상/오디오 실험 포맷의 정본 메타데이터

alter table public.showroom_shorts_jobs
  add column if not exists composition_config jsonb not null default '{}'::jsonb;

alter table public.showroom_shorts_targets
  add column if not exists title_variant text null,
  add column if not exists video_variant text null,
  add column if not exists audio_variant text null;

alter table public.showroom_shorts_targets
  drop constraint if exists showroom_shorts_targets_title_variant_check;

alter table public.showroom_shorts_targets
  add constraint showroom_shorts_targets_title_variant_check
  check (title_variant is null or title_variant in (
    'after_reveal', 'problem_solution', 'split_compare', 'detail_proof'
  ));

alter table public.showroom_shorts_targets
  drop constraint if exists showroom_shorts_targets_video_variant_check;

alter table public.showroom_shorts_targets
  add constraint showroom_shorts_targets_video_variant_check
  check (video_variant is null or video_variant in (
    'after_reveal', 'problem_solution', 'split_compare', 'detail_proof'
  ));

alter table public.showroom_shorts_targets
  drop constraint if exists showroom_shorts_targets_audio_variant_check;

alter table public.showroom_shorts_targets
  add constraint showroom_shorts_targets_audio_variant_check
  check (audio_variant is null or audio_variant in ('tts_hook_bgm', 'bgm_only'));

create index if not exists showroom_shorts_targets_variant_idx
  on public.showroom_shorts_targets (video_variant, title_variant, published_at desc);

comment on column public.showroom_shorts_jobs.composition_config is
  'Railway 합성 정본: 포맷 팩·첫 화면 훅·TTS 스크립트·BGM 레벨';
