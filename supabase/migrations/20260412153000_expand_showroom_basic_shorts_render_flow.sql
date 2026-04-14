alter table public.showroom_basic_shorts_drafts
  add column if not exists final_video_url text null,
  add column if not exists render_error text null;

comment on column public.showroom_basic_shorts_drafts.final_video_url is
'기본 쇼츠 자동 렌더링이 완료되면 생성된 최종 MP4 공개 URL을 저장한다.';

comment on column public.showroom_basic_shorts_drafts.render_error is
'기본 쇼츠 자동 렌더링 실패 시 마지막 오류 메시지를 저장한다.';
