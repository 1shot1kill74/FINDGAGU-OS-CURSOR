# 에이전트 인수인계서

작성일: 2026-04-08

## 현재 결론

- 현재 `쇼룸 숏츠` 최종 합성은 `Railway worker`에서 돈다.
- 현재 방식은 `Kling 원본 생성 -> Supabase에 source_video_url 저장 -> Vercel API 프록시 -> Railway ffmpeg 합성 -> Supabase Storage MP4 업로드` 구조다.
- `브라우저 canvas + MediaRecorder + ffmpeg.wasm` 합성 경로는 운영 흐름에서 제거됐다.
- 현재 핵심 목표는 `운영 안정화`와 `Meta 업로드 호환성 검증`이다.
- 숏츠 최종 영상에는 `워터마크를 넣지 않는다`.

## 사용자 의도와 작업 범위

- 사용자는 이 기능을 장기적으로 `상업용 앱` 수준으로 가져갈 생각이 있다.
- 사용자는 브라우저 합성보다 `서버 합성`을 허용했다.
- 사용자는 Railway를 워커 서버 후보로 보고 있다.
- 사용자는 지금 단계에서 `오픈쇼룸 이미지 보호 작업`과 `숏츠 서버 전환 작업`을 분리해서 봐야 한다고 정리했다.
- 이 문서의 범위는 `숏츠 비디오 워커 서버`다. 오픈쇼룸 워터마크/프록시 이슈는 여기서 다루지 않는다.

## 이전 문제 정의

### 왜 바꿨나

- 기존 최종 산출물은 `.mp4`로 저장되지만, 생성 과정이 `WebM -> MP4 재인코딩`이었다.
- 이 방식은 브라우저 환경과 ffmpeg.wasm 제약에 따라 결과 코덱/품질/성능이 흔들렸다.
- 특히 Meta 계열 플랫폼은 `컨테이너가 mp4인지`보다 `실제 코덱 조합(H.264/AAC, yuv420p 등)`에 민감하다.
- 그래서 서버 합성으로 전환했다.

### 이전 코드 기준 핵심 병목

- `src/lib/showroomShortsComposer.ts`
  - 과거에는 `MediaRecorder`와 `ffmpeg.wasm`을 사용했다.
  - 현재는 브라우저 합성 코드가 제거되고 `downloadShowroomShortsFinalAsMp4()`만 남아 있다.

## 현재 구현 상태

### 현재 합성 흐름

1. 내부 쇼룸에서 `숏츠 만들기` 초안 생성
2. Supabase Edge Function `showroom-shorts-create`로 Kling 원본 영상 요청
3. `showroom-shorts-poll`이 원본 영상 상태를 확인하고 `source_video_url` 저장
4. 관리자 페이지 `/admin/showroom-shorts`에서 `워커 합성 요청`
5. 프론트가 `/api/showroom-shorts-worker` 호출
6. Vercel API가 `Railway worker`로 프록시
7. Railway worker가 `ffmpeg`로 9:16 서버 합성
8. Supabase Storage `showroom-shorts-videos`에 최종 MP4 업로드
9. `showroom_shorts_jobs.final_video_url`, `status=ready_for_review` 갱신

### 현재 관련 핵심 파일

- `src/lib/showroomShortsComposer.ts`
  - 현재는 최종 MP4 다운로드 유틸만 담당
- `src/lib/showroomShorts.ts`
  - job/target 조회, Railway worker 요청, 상태 조회 담당
- `src/pages/admin/ShowroomShortsPage.tsx`
  - 검수 페이지 UI, `워커 합성 요청/상태 확인` 버튼 담당
- `api/showroom-shorts-worker.ts`
  - Vercel 서버 프록시. 브라우저 토큰 노출 없이 Railway worker 연결
- `worker/src/index.ts`
  - Railway 배포용 ffmpeg 워커
- `supabase/functions/showroom-shorts-create/index.ts`
  - Kling 원본 생성 요청
- `supabase/functions/showroom-shorts-poll/index.ts`
  - Kling 결과 polling 및 원본 저장
- `supabase/migrations/20260409001000_expand_showroom_shorts_worker_statuses.sql`
  - `composition_queued`, `composition_processing` 상태 추가

## 현재 운영 상태

- Railway 프로젝트/서비스 생성 완료
- Railway worker 배포 완료
- Railway 도메인 생성 완료
  - `https://showroom-shorts-worker-production.up.railway.app`
- Vercel 프로덕션 배포 완료
  - `https://findgagu-os-cursor.vercel.app`
- Vercel 서버 환경변수 반영 완료
  - `SHOWROOM_SHORTS_WORKER_URL`
  - `SHOWROOM_SHORTS_WORKER_TOKEN`
- Railway 환경변수 반영 완료
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SHOWROOM_SHORTS_WORKER_TOKEN`
  - `SHOWROOM_SHORTS_BGM_URL`
- 실제 job 여러 건 서버 합성 성공 확인
- 과거 브라우저 합성 실패 job도 Railway worker로 재합성 복구 성공

## 현재 우선순위

### 1순위

`운영 안정화 및 업로드 호환성 검증`

즉 아래 목표를 만족해야 한다.

- 입력: `source_video_url`, job metadata, 텍스트/BGM 설정
- 출력: `표준 MP4`
- 권장 인코딩 목표:
  - `H.264`
  - `AAC`
  - `yuv420p`
  - `+faststart`
- 결과 저장: 기존처럼 Supabase Storage `showroom-shorts-videos`
- 결과 반영: 기존처럼 `showroom_shorts_jobs.final_video_url`

### 2순위

`로컬 개발 서버와 운영 서버 동작을 최대한 맞추기`

- 현재 로컬 `Vite` 개발 서버도 `/api/showroom-shorts-worker`를 운영 Vercel 프록시로 넘기도록 설정해 두었다.
- 로컬 테스트에서 문제가 나면 `npm run dev` 재시작 후 다시 확인하면 된다.

## 권장 아키텍처

### 현실적인 1차 구조

- 프론트: 기존 Vercel 유지
- DB/Storage: 기존 Supabase 유지
- 비디오 워커: Railway + Docker + ffmpeg
- 작업 큐: 초기는 DB 상태 기반 polling으로도 가능

### 1차 워커 동작 흐름

1. 프론트가 `/api/showroom-shorts-worker` 호출
2. 워커가 `source_video_url` 다운로드
3. 워커가 ffmpeg filter_complex로 9:16 합성
4. 텍스트/BGM/줌 효과를 서버에서 렌더링
5. 결과를 MP4로 생성
6. Supabase Storage 업로드
7. `showroom_shorts_jobs.final_video_url`, `status=ready_for_review` 업데이트

## 서버에서 구현해야 할 핵심

### API

- `POST /jobs/compose`
  - 입력: `jobId`
  - 역할: DB에서 job 읽고 실제 합성 시작

- `GET /jobs/:id`
  - 역할: 합성 상태 확인
  - 상태 예시:
    - `queued`
    - `processing`
    - `completed`
    - `failed`

### ffmpeg 요구사항

- 입력:
  - Kling 원본 영상
  - BGM 파일
  - 텍스트 문구
- 출력:
  - `mp4`
  - `libx264`
  - `aac`
  - `-pix_fmt yuv420p`
  - `-movflags +faststart`

### 시각/오디오 요구사항

이 요소들은 현재 Railway worker의 ffmpeg 합성으로 반영된다.

- 상단 카피: `잠시 후, 이 공간은 완전히 달라집니다`
- 뱃지: `실제사진 기반 Before & After`
- 질문 문구: `뭐가 가장 달라보이시나요? 댓글로 알려주세요`
- CTA: `자세한 구성은 파인드가구 온라인 쇼룸에서 확인하세요`
- BGM:
  - `public/assets/bgm/bright-lines-new-light-sample-b-24-34.mp3`
  - fade in / fade out
  - 낮은 볼륨
- 마지막 2초 줌 효과
- 최종 규격: `9:16`

중요:

- 숏츠 영상에는 워터마크를 넣지 않는다.

## 현재 코드에서 확인할 부분

### 서버 합성/프록시 로직

- `worker/src/index.ts`
  - `POST /jobs/compose`
  - `GET /jobs/:id`
  - ffmpeg 실행
  - Supabase Storage 업로드
  - job 상태 업데이트

- `api/showroom-shorts-worker.ts`
  - Vercel 서버 프록시
  - 로컬/운영 프론트가 공통으로 호출하는 경로

- `src/lib/showroomShorts.ts`
  - `requestShowroomShortsComposition()`
  - `getShowroomShortsCompositionStatus()`

## 권장 전환 방식

### 하지 말 것

- 브라우저 합성 경로를 다시 살리는 방향
- 브라우저 ffmpeg.wasm 품질/코덱 튜닝으로 되돌아가는 방향
- Supabase Edge Function 안에서 무거운 ffmpeg 작업을 직접 돌리는 방향

### 할 것

- Railway worker 유지
- ffmpeg는 서버 컨테이너 안에서 실행
- 결과 코덱 고정 유지
- 프론트는 `합성 요청/상태 확인/결과 열기` 역할만 담당

## Railway 권장 이유

- Docker 기반 ffmpeg 워커를 올리기 쉽다.
- 초기 상용화 단계에서 운영 난이도가 낮다.
- 별도 CPU 작업 서버로 쓰기 적합하다.
- 지금 프로젝트 규모에서 `가장 빨리 붙일 수 있는 선택지`다.

## 다음 에이전트가 바로 해야 할 실무 순서

1. 인스타그램/페이스북 업로드 테스트 기준으로 실제 호환성 검증
2. 필요하면 템플릿 문구/레이아웃/볼륨/줌 강도 미세 조정
3. 운영 문서 최신화 유지
4. 필요 시 worker autoscaling 또는 재시도 정책 보강

## 성공 기준

- 브라우저 로컬 합성 없이 서버에서 최종 MP4가 생성된다.
- 결과가 유튜브뿐 아니라 인스타그램/페이스북에도 안정적으로 업로드된다.
- 검수 페이지에서 기존처럼 `합성 요청 -> 최종 영상 확인` 흐름을 유지한다.
- 숏츠 영상에는 워터마크가 없다.

## 지금 시점에서 굳이 하지 않아도 되는 것

- SNS 자동 게시 API 붙이기
- 채널별 템플릿 분기 고도화
- 여러 영상 스타일 프리셋 확장
- worker autoscaling 고급 튜닝

## 다음 에이전트에게 주는 실무 메모

- 사용자는 긴 설명보다 결론형 진행을 선호한다.
- 사용자는 한국어 응답을 원한다.
- 서버 합성 전환은 이미 완료됐다.
- 워커 서버는 현재 Railway에서 실제 운영 중이다.
- 숏츠와 오픈쇼룸 이미지 보호 작업은 서로 다른 문제로 취급해야 한다.

## 한 줄 요약

현재 숏츠 합성은 `Vercel 프록시 + Railway ffmpeg worker` 기반 서버 합성으로 전환 완료됐고, 다음 에이전트는 운영 안정화와 Meta 업로드 검증에 집중하면 된다.
