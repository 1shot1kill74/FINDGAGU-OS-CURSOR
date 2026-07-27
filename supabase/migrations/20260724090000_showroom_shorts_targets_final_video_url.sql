-- OSMU: 채널별 최종 MP4 URL (본편 BA는 공유, CTA/배지 문구만 다른 변형)
alter table public.showroom_shorts_targets
  add column if not exists final_video_url text null;

comment on column public.showroom_shorts_targets.final_video_url is
  '채널별 합성 최종 MP4. 없으면 부모 job.final_video_url(대표본)을 사용합니다.';
