# YouTube Analytics OAuth 설정 (FINDGAGU OS)

FINDGAGU 채널 쇼츠 지표(`views`, `engagedViews`, `averageViewPercentage` 등)를 OS에 동기화합니다.  
경쟁사 수집용 `YOUTUBE_DATA_API_KEY`와 **역할이 다릅니다.** 이 문서는 **채널 주인 OAuth** 전용입니다.

| 항목 | 값 |
|------|-----|
| Admin UI | `/admin/ad-inbox` (연결·동기화·카드별 지표, 주 사용처) · `/admin/showroom-shorts` (동일 패널) |
| API | `/api/youtube-analytics-*` |
| 테이블 | `youtube_analytics_oauth`, `youtube_shorts_analytics` |

## API로 되는 것 / 안 되는 것

| 지표 | 가능 | 비고 |
|------|------|------|
| views | O | Shorts는 재생 시작만으로도 카운트(2025-03~) |
| engagedViews | O | 넘김 대리지표 → `engaged / views` |
| averageViewPercentage / Duration | O | 완독·유지율 |
| 시청함 vs 넘김 | X | Studio UI 전용 |

## 1. Google Cloud

1. [API 라이브러리](https://console.cloud.google.com/apis/library)에서 사용 설정:
   - **YouTube Analytics API**
   - **YouTube Data API v3**
2. [사용자 인증 정보](https://console.cloud.google.com/apis/credentials) → **OAuth 클라이언트 ID** → 애플리케이션 유형 **웹 애플리케이션**
3. 승인된 리디렉션 URI:
   - 프로덕션: `https://findgagu-os-cursor.vercel.app/api/youtube-analytics-oauth-callback`
   - (로컬 API 프록시 쓸 때) `http://127.0.0.1:5173/api/youtube-analytics-oauth-callback` 등
4. [OAuth 동의 화면](https://console.cloud.google.com/apis/credentials/consent)
   - 테스트 사용자에 **채널 Google 계정** 추가
   - 스코프(민감):
     - `https://www.googleapis.com/auth/yt-analytics.readonly`
     - `https://www.googleapis.com/auth/youtube.readonly`

## 2. 환경 변수 (Vercel + 로컬 `.env`)

```bash
GOOGLE_YT_ANALYTICS_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_YT_ANALYTICS_CLIENT_SECRET=...
GOOGLE_YT_ANALYTICS_REDIRECT_URI=https://findgagu-os-cursor.vercel.app/api/youtube-analytics-oauth-callback
YOUTUBE_ANALYTICS_TOKEN_ENC_KEY=   # openssl rand -hex 32
SUPABASE_SERVICE_ROLE_KEY=         # oauth/analytics 쓰기용 (브라우저에 넣지 말 것)
```

기존 `YOUTUBE_DATA_API_KEY`는 그대로 두고 **추가**만 합니다.

암호화 키 생성:

```bash
openssl rand -hex 32
```

## 3. DB 마이그레이션

```bash
npx supabase@latest db push --linked
# 또는 해당 SQL 파일만 적용
```

마이그레이션: `supabase/migrations/20260805020000_youtube_analytics_oauth.sql`

## 4. 연결·동기화

1. `@findgagu.com` 계정으로 OS 로그인
2. `/admin/ad-inbox` → **유튜브 애널리틱스 연결**
3. Google 동의(채널 계정) 완료 → 광고대기실로 복귀
4. **지표 동기화** 클릭 → 상단 표 + 게시 완료 YT 칩에 조회·Engaged% 표시

## 5. 에이전트·SQL 조회

```sql
select
  video_id,
  title,
  views,
  engaged_views,
  round(100.0 * engaged_views / nullif(views, 0), 1) as engaged_pct,
  avg_view_percentage,
  synced_at
from public.youtube_shorts_analytics
order by synced_at desc, views desc
limit 30;
```

판독 규칙:

- `engaged_pct` 낮음 → 넘김·훅 실패 쪽
- `avg_view_percentage` 낮음 → 중반 이탈
- 여러 편이 동시에 동일하게 나쁨 → 채널/템플릿(슬롭성) 신호

## 6. API 엔드포인트

| Method | Path | 인증 |
|--------|------|------|
| POST | `/api/youtube-analytics-oauth-start` | Bearer 내부관리자 → `{ authorizeUrl }` |
| GET | `/api/youtube-analytics-oauth-callback` | Google redirect + state |
| GET | `/api/youtube-analytics-status` | Bearer |
| POST | `/api/youtube-analytics-sync` | Bearer · body `{ days?: number }` |
| GET | `/api/youtube-analytics-report` | Bearer |

## 트러블슈팅

| 증상 | 조치 |
|------|------|
| `needs_reconnect` | 연결 버튼으로 재동의 (refresh 폐기됨) |
| `redirect_uri_mismatch` | GCP Redirect URI와 `GOOGLE_YT_ANALYTICS_REDIRECT_URI` 일치 확인 |
| sync 403 | Analytics API 사용 설정·동의 스코프 확인 |
| engagedViews 0 | 신규 영상은 지연될 수 있음 · views만 먼저 쌓임 |
