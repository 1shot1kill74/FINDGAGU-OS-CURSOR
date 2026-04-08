# Showroom Shorts Worker

Railway에 올리는 서버 합성 워커입니다.

## 역할

- `POST /jobs/compose`로 합성 요청 수신
- Supabase에서 `showroom_shorts_jobs` 조회
- 원본 영상을 다운로드한 뒤 `ffmpeg`로 9:16 MP4 생성
- 결과를 `showroom-shorts-videos` 버킷에 업로드
- `showroom_shorts_jobs.final_video_url`, `status=ready_for_review` 갱신

## Railway 설정

서비스 루트를 `worker/`로 지정하고 `Dockerfile` 배포를 사용합니다.

필수 환경 변수:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

선택 환경 변수:

- `SHOWROOM_SHORTS_BGM_URL`
- `SHOWROOM_SHORTS_WORKER_TOKEN`
- `SHOWROOM_SHORTS_FONT_FILE`
- `PORT`

Vercel 서버 환경 변수:

- `SHOWROOM_SHORTS_WORKER_URL`
- `SHOWROOM_SHORTS_WORKER_TOKEN`

브라우저 환경 변수:

- 기본값은 같은 도메인의 `/api/showroom-shorts-worker` 프록시입니다.
- 직접 오버라이드가 필요할 때만 `VITE_SHOWROOM_SHORTS_WORKER_URL` 사용

## 로컬 실행

```bash
npm install
npm run dev
```

## 엔드포인트

- `GET /health`
- `POST /jobs/compose`
- `GET /jobs/:id`

## 권장 운영 메모

- `SHOWROOM_SHORTS_BGM_URL`은 Railway 컨테이너가 직접 읽을 수 있는 공개 URL이어야 합니다.
- 미설정 시 기본값으로 `https://findgagu-os-cursor.vercel.app/assets/bgm/bright-lines-new-light-sample-b-24-34.mp3`를 사용합니다.
- 더 안정적인 운영을 원하면 나중에 Supabase Storage 또는 Cloudinary 공개 URL로 분리해도 됩니다.
- 브라우저에 워커 토큰을 노출하지 않도록 프론트는 `/api/showroom-shorts-worker` 프록시를 통해 Railway를 호출합니다.
