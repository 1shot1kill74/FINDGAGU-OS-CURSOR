# image_assets 메타데이터 정리

`image_assets`는 시공·쇼룸용 이미지의 **1행 = 1파일** 레코드이다. 구조는 **테이블 컬럼(정규 필드)**과 **`metadata` JSONB(확장 필드)**로 나뉜다.

정본은 Supabase 스키마이며, 아래는 코드베이스(`imageAssetService.ts`, `imageAssetUploadService.ts`, `imageScoringService.ts`, 마이그레이션, RPC) 기준으로 정리한 참고 문서다.

---

## 1. 테이블 컬럼 (`public.image_assets`)

| 컬럼 | 타입(개략) | 설명 |
|------|------------|------|
| `id` | uuid | PK |
| `created_at` | timestamptz | 생성 시각 |
| `cloudinary_url` | text | 원본(또는 주) 이미지 URL |
| `thumbnail_url` | text | 썸네일 URL |
| `site_name` | text | 현장명 등 그룹핑용 |
| `photo_date` | date 등 | 촬영일(있을 때) |
| `location` | text | 지역 |
| `business_type` | text | 업종(필터·쇼룸에 사용) |
| `category` | text | 구분(예: 가구 카테고리, `purchase_order`, `floor_plan` 등) |
| `product_name` | text | 제품명 태그 |
| `color_name` | text | 색상 |
| `is_main` | boolean | 동일 현장(`site_name`) 내 대표 이미지 여부 |
| `memo` | text | 운영 메모 |
| `metadata` | jsonb | 확장 메타 — **2절** |
| `storage_type` | text | `cloudinary` \| `supabase` |
| `storage_path` | text | `storage_type = supabase`일 때 Storage 경로 |
| `ai_score` | numeric | AI 품질 점수(앱·배치에서 갱신) |
| `is_consultation` | boolean | 상담용 이미지 여부(쇼룸·공유 필터) |
| `view_count` | integer 등 | 조회 수 |
| `share_count` | integer 등 | 공유 수 |
| `internal_score` | numeric | 내부 종합 점수(스코어링) |

### 참고

- 마이그레이션에 `sector` 컬럼 추가가 **주석 처리**된 이력이 있다. 실제 배포 DB에 포함 여부는 Supabase에서 확인할 것.
- `src/types/database.ts`에 `image_assets`가 없을 수 있으며, 생성 시점에 따라 타입 생성 범위가 다를 수 있다.

---

## 2. `metadata` (JSONB) — 앱에서 사용하는 키

### 2.1 현장·상담·공개 표시명

| 키 | 설명 |
|----|------|
| `consultation_id` | 상담(`consultations`) UUID 연결 |
| `space_id` | Google Chat 스페이스 등 — 묶음·공개 그룹 키 생성에 사용 |
| `canonical_site_name` | 표준 현장명 |
| `legacy_site_name` | 이전 현장명 |
| `space_display_name` | 스페이스/공간 표시명 |
| `external_display_name` | 외부 노출용 표시명 |
| `public_display_name` | 공개 쇼룸 표시명 우선 후보(RPC `open_showroom_display_name` 등) |

### 2.2 비포 / 애프터

| 키 | 설명 |
|----|------|
| `before_after_role` | `"before"` \| `"after"` |
| `before_after_group_id` | 전후 짝을 묶는 문자열 ID |

### 2.3 파일·중복·기술 스코어

| 키 | 설명 |
|----|------|
| `original_name` | 원본 파일명(중복 지문 등) |
| `file_size` | 바이트 |
| `width` | 픽셀(있을 때) |
| `height` | 픽셀(있을 때) |

### 2.4 기타

| 키 | 설명 |
|----|------|
| `display_name` | 표시용 이름(업로드/스페이스 관련 코드에서 참조) |

`metadata`는 JSONB이므로 **위 목록 외 임의 키**가 추가될 수 있다. 운영·스크립트에서 넣은 값은 DB에서 직접 조회해 보완할 것.

---

## 3. 코드·SQL 참조 위치

| 용도 | 위치 |
|------|------|
| 메타 파싱 | `src/lib/imageAssetService.ts` — `parseImageAssetMeta`, `parseBeforeAfterMeta` |
| 업로드 insert | `src/lib/imageAssetUploadService.ts` — `ImageAssetInsertPayload`, `insertImageAsset` |
| 스코어 | `src/lib/imageScoringService.ts` — `ImageAssetForScoring` |
| 공개 쇼룸 표시명·그룹 키 | `supabase/migrations/*secure_open_showroom_public_fields.sql` 등 — `open_showroom_display_name`, `open_showroom_group_key` |

---

## 4. 인사이트·토픽 태그 (향후)

교육 공간 **과제/토픽**을 이미지와 연결하려면, 현재 스키마에는 **전용 컬럼이 없다**. 선택지는 다음과 같다.

- `metadata`에 예: `topic_slugs: string[]` 저장
- 별도 테이블 `showroom_topic_tags` + 조인 테이블(또는 `image_asset_topics`)

도메인 온톨로지 확장 시 `docs/domain-ontology-v1.md`와 함께 갱신하는 것을 권장한다.

---

*문서 버전: 1 · 기준: 리포지토리 코드 및 마이그레이션*
