# FINDGAGU OS — 기술 스택 & 데이터 흐름 지도

> 마지막 갱신: 2026-02-20

## 1. 개발 환경 레이어

| 도구 | 역할 | 상태 |
|------|------|------|
| **Lovable** | 초기 UI 디자인 및 컴포넌트 생성 | 크레딧 소진 후 GitHub 이관 완료, 이후 직접 개발 |
| **Cursor** | 시각적 코드 편집 (이부장 페르소나) | 운영 중 |
| **Claude Code** | 터미널 기반 에이전트 작업 | 운영 중 |

## 2. 런타임 기술 스택

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend/DB:** Supabase (Auth, Database, Storage, Edge Functions, Realtime)
- **AI 메인:** Gemini 2.0 Flash (`@google/generative-ai`)
- **AI 폴백:** OpenAI GPT-4o (REST API)
- **이미지 CDN:** Cloudinary (고화질 + Named Transformation)
- **시트 연동:** Google Apps Script (GAS) — gas/Code.gs

## 3. 데이터 흐름 맵

### A. 고객 유입 흐름
```
채널톡 메시지
  → Supabase Edge Function (channel-talk-webhook)
  → consultations UPSERT (display_name, contact, metadata.ai_suggestions)
  → Realtime 구독 → 앱 리스트 자동 갱신
```

### B. 구글 시트 ↔ Supabase 양방향 동기화

**⚠️ 현재 버그:** Code.gs SHEET_NAME = '상담리스트', 실제 탭 = '시트1' (불일치)

**[시트 → DB 단건]**
```
사용자 편집 (A~D열) → GAS onEdit
  → update_single_consultation_from_sheet RPC
  → DB: project_name / link / start_date / update_date 갱신
  ⚠️ sheet_update_date 미전달 → metadata.sheet_update_date 미갱신
```

**[시트 → DB 배치]**
```
GAS syncAllDataBatch() 수동 실행
  → update_multiple_consultations_from_sheet RPC
  → DB + metadata.sheet_update_date 갱신
  ⚠️ SHEET_NAME 불일치로 현재 시트를 찾지 못함
```

**[DB → 시트]**
```
앱 [최종 확정] 클릭
  → fetch(VITE_GOOGLE_SHEET_SYNC_URL, POST) → GAS doPost
  → syncAppToSheet → 시트 E열(status), F열(금액), D열(오늘날짜) 갱신
  ⚠️ SHEET_NAME 불일치로 현재 행을 찾지 못함
```

**[앱 캐시 자동 갱신]**
```
Supabase Realtime INSERT/UPDATE → fetchLeads 전체 재조회
document.visibilitychange → visible → fetchLeads
```

### C. AI 파싱 흐름 (PDF/이미지 — 운영 중)
```
EstimateFilesGallery 업로드
  → parseFileWithAI.ts: 파일 카테고리 자동 분류 (Estimates / VendorPrice)
  → [메인] Gemini 2.0 Flash (VITE_GOOGLE_GEMINI_API_KEY)
  → [폴백] OpenAI GPT-4o (VITE_OPENAI_API_KEY) — 429/500/503 자동 전환 + 토스트 안내
  → 견적서(Estimates): estimates 저장 + products 저장
  → 원가표(VendorPrice): vendor_price_book 저장 + products(supply_price = cost ÷ 0.7) 저장
```

### D. AI 퀵 커맨드 (Mock 단계)
```
EstimateForm 퀵 커맨드 입력
  → estimateAiService.parseQuickCommand
  → [현재] 정규식 기반 Mock 파싱
  → [예정] /api/estimate-parse (Claude API 연동 대기)
```

### E. 이미지 자산 이원화
```
uploadConstructionImageDual(file, publicId)
  → Cloudinary Upload API (VITE_CLOUDINARY_*) — 고화질 원본
  → Supabase Storage construction-assets — 썸네일
  → project_images 테이블: cloudinary_public_id로 1:1 매핑
```

### F. 공유 흐름
```
시공 사례 뱅크(PortfolioBank) 사진 선택
  → ShareCart → /public/share?ids=uuid,uuid,...
  → 카카오 공유 (VITE_KAKAO_JS_KEY 있을 때만)
```

### G. 자동화 (로드맵 — 미구현)
```
Wake-up 알림 → n8n / Make 스케줄러 (미구현)
시공 사진 → OpenClaw 멀티채널 배포 (미구현)
```

## 4. 환경변수 맵

| 변수 | 용도 | 상태 |
|------|------|------|
| VITE_SUPABASE_URL | Supabase 프로젝트 URL | ✅ 필수 |
| VITE_SUPABASE_ANON_KEY | Supabase 익명 키 | ✅ 필수 |
| VITE_GOOGLE_GEMINI_API_KEY | Gemini 2.0 Flash AI 파싱 | ✅ 운영 |
| VITE_OPENAI_API_KEY | GPT-4o 폴백 | ✅ 운영 |
| VITE_GOOGLE_SHEET_SYNC_URL | GAS doPost 웹앱 URL | ✅ 설정 필요 |
| VITE_GOOGLE_SHEET_SYNC_TOKEN | GAS 인증 토큰 | 선택 |
| VITE_CLOUDINARY_CLOUD_NAME | Cloudinary 클라우드 이름 | ✅ 필수 |
| VITE_CLOUDINARY_UPLOAD_PRESET | Unsigned 업로드 프리셋 | ✅ 필수 |
| VITE_KAKAO_JS_KEY | 카카오 공유 SDK | 선택 |
| VITE_MIGRATION_PARSE_API | 외부 AI 파싱 엔드포인트 | 미사용(Mock) |
| CHANNELTALK_WEBHOOK_SECRET | 채널톡 서명 검증 (Edge Function Secret) | ⚠️ 테스트 bypass 중 |

## 5. Supabase 리소스 맵

### 주요 테이블
| 테이블 | 역할 |
|--------|------|
| consultations | 핵심 CRM (상담 카드) |
| estimates | 견적서 버전 관리 |
| consultation_messages | 채팅 타임라인 |
| project_images | 이미지 자산 (Cloudinary 연동) |
| products | 표준 단가표 (supply_price = 판매가) |
| vendor_price_book | 원가표 (cost = 원가) |
| order_documents | PPT/PDF 발주서 |
| tag_mappings | 제품명-Cloudinary 태그 1:N 매핑 |

### Storage 버킷
| 버킷 | 용도 | 접근 |
|------|------|------|
| measurement-drawings | 실측 도면 PDF | 비공개, Signed URL |
| order-documents | 발주서 PPT/PDF | 비공개 |
| vendor-assets | 원가표 이미지 | 비공개, Signed URL |
| estimate-documents | 견적 파일 | 비공개 |
| construction-assets | 시공 사진 썸네일 | 비공개 |
| project-thumbnails | 프로젝트 썸네일 | 비공개 |

### Edge Functions
- `channel-talk-webhook`: 채널톡 이벤트 → consultations UPSERT

### RPC 함수
| 함수 | 용도 | 상태 |
|------|------|------|
| update_single_consultation_from_sheet | 단건 시트→DB | ✅ (sheet_update_date 미지원) |
| update_multiple_consultations_from_sheet | 배치 시트→DB + sheet_update_date | ✅ |
| get_consultations_by_phone | 동일 연락처 조회 | ✅ |
| sync_consultations_from_sheet | initialSyncAll용 | ⚠️ Deprecated, DB에 없음 |
