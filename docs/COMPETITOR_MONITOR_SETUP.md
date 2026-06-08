# 경쟁사 모니터링 설정 (FINDGAGU OS)

## Supabase 프로젝트

| 항목 | 값 |
|------|-----|
| 프로젝트 | **findgagu-auto-os** (`sxxnshvidfwuemgbyuqz`) |
| Admin UI | `/admin/competitor-monitor` |
| Edge Function | `competitor-monitor-poll` |

> AI-Linker 프로젝트(`ugamlvogchmagcsouqpi`)가 아닌 **findgagu-auto-os**에 테이블·함수·시크릿이 있어야 합니다.

## 1. DB 마이그레이션 (최초 1회)

```bash
npx supabase@latest db query --linked --file supabase/migrations/20260608160000_create_competitor_monitoring.sql
npx supabase@latest migration repair --status applied 20260608160000 --linked
```

## 2. Edge Function 배포

```bash
npx supabase functions deploy competitor-monitor-poll --project-ref sxxnshvidfwuemgbyuqz
```

## 3. FINDGAGU 전용 YouTube API 키 (AI Linker와 분리)

### Google Cloud Console

1. [Google Cloud Console → API 및 서비스 → 사용자 인증 정보](https://console.cloud.google.com/apis/credentials)
2. **사용자 인증 정보 만들기 → API 키**
3. 이름 예: `findgagu-competitor-monitor`
4. **API 제한** → **키 제한** → **YouTube Data API v3** 만 선택
5. (선택) **애플리케이션 제한** → IP 또는 HTTP 리퍼러

### YouTube Data API 활성화

[YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) → **사용** 클릭

### Supabase 시크릿 등록

```bash
node scripts/setupYoutubeDataApiKey.mjs AIzaSy...YOUR_FINDGAGU_KEY
```

또는 `.env`에 `YOUTUBE_DATA_API_KEY=...` 저장 후:

```bash
node scripts/setupYoutubeDataApiKey.mjs --from-env
```

### 키 분리 원칙

| 키 | 용도 | 저장 위치 |
|----|------|-----------|
| `GOOGLE_GEMINI_API_KEY` | Gemini (채팅·생성) | Supabase / `.env` |
| `YOUTUBE_DATA_API_KEY` | 경쟁사 유튜브 수집 | **Supabase 시크릿만** (브라우저 노출 금지) |
| AI Linker `YOUTUBE_API_KEY` | AI Linker 스크래핑 | AI Linker `.env` (공유하지 않음) |

## 4. Apify 인스타 수집 (RSSHub 대체)

### Apify 가입·토큰

1. [Apify](https://apify.com/) 가입 (무료 월 $5 크레딧)
2. [Integrations → API token](https://console.apify.com/account/integrations) 복사

### Supabase 시크릿 등록

```bash
node scripts/setupApifyToken.mjs apify_api_YOUR_TOKEN
```

### 수집량·비용

| 채널 | 방식 | 건수/회 |
|------|------|---------|
| 유튜브 | YouTube Data API | 15 |
| 블로그 | 네이버 RSS | 20 |
| 인스타 | Apify (`apify/instagram-scraper`) | 15 |

@furnijuni 하루 1회 수집 기준 **월 ~450건 → 무료 크레딧($5) 안에서 충분**.

Apify 실패 시 RSSHub RSS → 수동 URL 등록 순으로 fallback.

## 6. 주간 자동 수집 (크론)

**매주 일요일 00:00 (KST)** 에 자동 수집됩니다.

```bash
# 1) pg_cron 확장 (최초 1회)
npx supabase@latest db query --linked --file supabase/migrations/20260609120000_schedule_competitor_monitor_cron.sql

# 2) 크론 스케줄 + 시크릿 등록
npm run setup:competitor-cron

# 3) Edge Function 재배포 (크론 인증 반영)
npx supabase functions deploy competitor-monitor-poll --project-ref sxxnshvidfwuemgbyuqz
```

- UTC `0 15 * * 6` = **일요일 00:00 KST**
- Admin 「지금 수집」은 기존처럼 수동 가능
- 크론은 `COMPETITOR_MONITOR_CRON_SECRET` 헤더로만 호출 (브라우저 노출 없음)

## 5. 로컬 확인

```bash
npm run dev:competitor
```

→ http://localhost:5180/admin/competitor-monitor

「지금 수집」 클릭 → 유튜브·블로그·키워드 매칭 확인
