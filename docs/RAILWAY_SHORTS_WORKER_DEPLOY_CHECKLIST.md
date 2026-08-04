# Railway Shorts Worker 배포 체크리스트

## 목표

- 브라우저 합성 대신 `Railway worker + ffmpeg`로 최종 MP4 생성
- 프론트는 `Vercel API 프록시 -> Railway worker` 구조로 호출
- 워커 토큰은 브라우저에 노출하지 않음

## 1. Supabase

- SQL 마이그레이션 적용:
  - `supabase/migrations/20260409001000_expand_showroom_shorts_worker_statuses.sql`

## 2. Railway 서비스 생성

- 새 서비스 생성
- 루트 디렉터리: `worker/`
- 배포 방식: `Dockerfile`

Railway 환경 변수:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SHOWROOM_SHORTS_WORKER_TOKEN`
- 선택: `SHOWROOM_SHORTS_BGM_URL`
- 선택: `SHOWROOM_SHORTS_FONT_FILE=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`
- TTS 사용: `ELEVENLABS_API_KEY`
- TTS 사용: `ELEVENLABS_VOICE_ID` (ElevenLabs 음성 라이브러리에서 복사)
- 선택: `ELEVENLABS_MODEL_ID=eleven_multilingual_v2`

권장 BGM URL 조건:

- Railway에서 직접 접근 가능한 공개 URL
- 예: Supabase Storage public URL, Cloudinary URL
- 현재 워커 기본값은 `https://findgagu-os-cursor.vercel.app/assets/bgm/bright-lines-new-light-sample-b-24-34.mp3`
- 더 안정적으로 분리하고 싶으면 나중에 Supabase Storage public URL로 교체

## 3. Vercel 환경 변수

서버 환경 변수:

- `SHOWROOM_SHORTS_WORKER_URL=https://<railway-domain>`
- `SHOWROOM_SHORTS_WORKER_TOKEN=<same-shared-secret>`

브라우저 환경 변수:

- 기본적으로 추가 설정 불필요
- 프론트는 `/api/showroom-shorts-worker`를 통해 워커를 호출함
- 특별한 이유가 있을 때만 `VITE_SHOWROOM_SHORTS_WORKER_URL` 사용

## 4. 요청 흐름

1. 관리자 페이지에서 `워커 합성 요청`
2. 프론트가 `/api/showroom-shorts-worker` 호출
3. Vercel API가 Railway worker로 프록시
4. `audio_variant=tts_hook_bgm`이면 ElevenLabs TTS 훅 생성 후 BGM과 믹싱
5. Railway worker가 ffmpeg 합성
6. 결과 MP4를 Supabase Storage 업로드
7. `showroom_shorts_jobs.final_video_url`, `status=ready_for_review` 갱신

## 5. 첫 검증 시나리오

1. 기존에 `source_video_url`이 채워진 job 1건 선택
2. 관리자 페이지에서 `워커 합성 요청`
3. job 상태가 `composition_queued` -> `composition_processing` -> `ready_for_review`로 변하는지 확인
4. `final_video_url`이 mp4로 저장되는지 확인
5. 인스타그램/페이스북 업로드 테스트

## 6. 문제 발생 시 확인 포인트

- Railway 로그에서 `ffmpeg` 실행 실패 여부
- `SHOWROOM_SHORTS_BGM_URL`이 Railway에서 실제로 열리는지
- `SUPABASE_SERVICE_ROLE_KEY` 권한 문제
- `showroom-shorts-videos` 버킷 업로드 가능 여부
- 원본 `source_video_url`이 만료되었거나 외부에서 차단되지 않았는지
- `/health`의 `elevenLabsConfigured=true`인지 (키와 Voice ID 값 자체는 노출되지 않음)
- TTS 실패 시 합성 로그의 `tts_status`를 확인. 영상은 BGM-only로 완료되므로 재합성이 필요할 때만 키·Voice ID·크레딧을 확인

## 7. 미발행 쇼츠 재합성

- `source_video_url`이 있으면 Kling 원본을 다시 만들지 않고 Railway 합성만 다시 실행한다.
- 예약(`scheduled`)된 채널은 재합성 직전에 예약을 해제한다. 새 최종 MP4가 생성되면 업로드 준비를 다시 만든다.
- `preparing` 또는 `publishing` 상태의 채널은 동시 재합성을 막고, 완료된 뒤 재시도한다.
- 이미 `published`인 채널은 재합성 대상에서 제외한다.
