# Railway Shorts Worker 실행 명령 모음

## 1. Supabase 마이그레이션 적용

```bash
npx supabase db push
```

특정 SQL만 수동 적용할 경우:

```sql
alter table public.showroom_shorts_jobs
  drop constraint if exists showroom_shorts_jobs_status_check;

alter table public.showroom_shorts_jobs
  add constraint showroom_shorts_jobs_status_check
  check (
    status in (
      'draft',
      'requested',
      'generating',
      'generated',
      'composition_queued',
      'composition_processing',
      'composited',
      'ready_for_review',
      'failed'
    )
  );
```

## 2. Railway 워커 로컬 확인

```bash
cd worker
npm install
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
SHOWROOM_SHORTS_WORKER_TOKEN=... \
npm run dev
```

헬스체크:

```bash
curl http://127.0.0.1:8080/health
```

## 3. Vercel 서버 환경 변수

```bash
npx vercel env add SHOWROOM_SHORTS_WORKER_URL production
npx vercel env add SHOWROOM_SHORTS_WORKER_TOKEN production
```

필요하면 preview에도 동일하게:

```bash
npx vercel env add SHOWROOM_SHORTS_WORKER_URL preview
npx vercel env add SHOWROOM_SHORTS_WORKER_TOKEN preview
```

## 4. Railway 환경 변수

Railway 대시보드에서 아래 값 입력:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SHOWROOM_SHORTS_WORKER_TOKEN`
- 선택: `SHOWROOM_SHORTS_BGM_URL`

`SHOWROOM_SHORTS_BGM_URL` 미설정 시 기본값:

```text
https://findgagu-os-cursor.vercel.app/assets/bgm/bright-lines-new-light-sample-b-24-34.mp3
```

## 5. 워커 합성 테스트

직접 Railway 워커 테스트:

```bash
curl -X POST "https://<railway-domain>/jobs/compose" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <worker-token>" \
  --data '{"jobId":"<job-id>"}'
```

상태 확인:

```bash
curl "https://<railway-domain>/jobs/<job-id>" \
  -H "Authorization: Bearer <worker-token>"
```

프론트 프록시 경유 테스트:

```bash
curl -X POST "https://<vercel-domain>/api/showroom-shorts-worker" \
  -H "Content-Type: application/json" \
  --data '{"jobId":"<job-id>"}'
```

```bash
curl "https://<vercel-domain>/api/showroom-shorts-worker?jobId=<job-id>"
```
