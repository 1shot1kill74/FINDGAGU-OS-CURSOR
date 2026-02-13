# AI 퀵 가이드 — 제품명 입력 시 참조 데이터 소스

견적서 화면의 **AI 퀵 커맨드**에 제품명(또는 품명+규격+색상)을 입력했을 때, **어떤 파일이 어떤 DB/값을 참고하는지** 정리한 문서입니다.

---

## 1. 흐름 요약

1. 사용자가 AI 퀵 커맨드 입력창에 텍스트 입력 (예: `스마트A 1200 600 모번`, `올데이C`)
2. **Enter** 시 `handleQuickCommandSubmit` → `parseQuickCommand`(aiParse) 호출
3. 결과가 **add_row** 이고 **unitPrice === 0** 이면 → "비교대상" 추천 표시
4. 비교대상은 **과거 견적 행** + **원가표(vendor_price_book)** 조회 결과를 병합·중복 제거 후 최대 8건
5. 사용자가 카드에서 **[선택]** 클릭 시 해당 단가/원가로 견적 행 추가
6. 행 추가 직후, **제품 마스터(products)** 에서 동일 품명의 `supply_price`를 조회해 빈 단가 행을 채우는 로직이 있음 (별도 useEffect)

---

## 2. 참조하는 파일 → 테이블/값

### 2.1 파싱 (제품명·규격·색상 추출)

| 파일 | 역할 | 참조 |
|------|------|------|
| `src/lib/estimateAiService.ts` | `parseQuickCommand()` | API `/api/ai-estimate` 호출 시도 → 실패 시 **Mock** `mockParseWithPromptStyle()`. DB 직접 참조 없음. |

- **Mock** 이면 입력 문자열만으로 `add_row` / `past_price` / `target_total` / `needs_spec` 등 타입과 `name`, `spec`, `color`, `qty`, `unitPrice` 추출.

---

### 2.2 비교대상(추천) 목록 계산

제품명이 들어가서 **add_row + unitPrice 0** 인 경우, 아래 두 경로가 사용됩니다.

#### A) 과거 견적 이력 (pastCaseRows)

| 파일 | 함수/위치 | 참조 테이블 | 참조 컬럼(값) |
|------|-----------|-------------|----------------|
| `ConsultationManagement.tsx` | `useEffect` (estimateModalOpen 시) | **estimates** | `id`, `consultation_id`, `payload`, `final_proposal_data`, `approved_at`, `created_at` |
| | | 조건 | `is_visible = true`, `order by created_at desc`, `limit 200` |
| `EstimateForm.tsx` | `handleQuickCommandSubmit` 내부 → `searchPastCaseRecommendations()` 인자로 전달 | (위에서 넘어온 **pastEstimates** 사용) | 각 estimate의 **payload** 또는 **final_proposal_data** (approved_at 있으면 final_proposal_data) |
| | | 사용하는 값 | `rows[].name`, `rows[].spec`, `rows[].color`, `rows[].unitPrice`, `rows[].costPrice` + `quoteDate`, `recipientName` → appliedDate, siteName |

- **pastEstimates** = `mergedPastEstimatesForGuide` (현재 상담의 `estimatesList` + 전역 `pastEstimatesForGuide` 200건 병합).
- **퀵 가이드 비교대상**에서는 `searchPastCaseRecommendations(..., products: [], pastCaseRows)` 로 호출하므로, 이 경로에서는 **제품 마스터(products)는 검색 대상에 포함되지 않음**.

#### B) 원가표 / 제품DB (vendor)

| 파일 | 함수 | 참조 테이블 | 참조 컬럼(값) |
|------|------|-------------|----------------|
| `src/lib/estimateRecommendationService.ts` | `getVendorPriceRecommendations(supabase, productName)` | **vendor_price_book** | `id`, `product_name`, `cost`, `image_url`, `spec`, `site_name`, `created_at`, `updated_at` |
| | | 조건 | `is_visible = true`, `product_name ILIKE '%${name}%'`, `order by updated_at desc`, `limit 10` |
| | | 사용하는 값 | **cost** → 마진 30% 역산해 **unitPrice** 계산. **spec**, **site_name**, **image_url**, 날짜 → appliedDate |
| `estimateRecommendationService.ts` | `getVendorPriceRecommendation()` (단일 건) | **vendor_price_book** 위와 동일 후, 없으면 **products** | **products**: `id`, `name`, `supply_price`, `created_at`, `updated_at` → supply_price를 판매단가로, 원가는 역산 |

- 퀵 가이드에서는 **다건** `getVendorPriceRecommendations`를 호출해, 품명에 검색어가 포함된 원가표 행을 여러 건 가져온 뒤, `PastCaseRecommendation` 형태로 변환해 **과거 견적 추천과 병합**합니다.

---

### 2.3 행 추가 직후 단가 채우기 (제품 마스터)

| 파일 | 위치 | 참조 테이블 | 참조 컬럼 |
|------|------|-------------|-----------|
| `EstimateForm.tsx` | `useEffect` (lastQuickCommandProductNameRef + showProfitabilityPanel) | **products** | `supply_price` (단, `name`이 품명과 **일치**하는 1건, `maybeSingle()`) |

- 퀵 커맨드로 **행만 추가**하고 단가가 비어 있으면, 해당 행의 품명으로 **products.name** 일치 조회 후 **supply_price**를 그 행에 넣습니다 (`applySellingToRow`).

---

### 2.4 제품 마스터 목록 (행 선택 시 가이드용 — 퀵 가이드 비교대상 아님)

| 파일 | 위치 | 참조 테이블 | 참조 컬럼 |
|------|------|-------------|-----------|
| `EstimateForm.tsx` | `useEffect` (modalOpen 시) | **products** | `name`, `supply_price`, `spec`, `color` |

- 이 목록(**productsList**)은 **견적서에서 행을 선택했을 때** 나오는 "AI 추천 가이드" (선택된 행의 품명으로 과거 이력 + 원가표 + **제품 마스터** 추천)용입니다.
- **퀵 커맨드 비교대상**에서는 의도적으로 `products: []` 로 넣어서, **과거 이력 + 원가표만** 쓰고 제품 마스터는 쓰지 않습니다.

---

## 3. 표로 보는 “제품명 입력 시” 참조 요약

| 데이터 소스 | 테이블 | 어떤 값이 퀵 가이드에 쓰이는가 |
|-------------|--------|--------------------------------|
| 과거 견적 | **estimates** (payload / final_proposal_data) | 행별 name, spec, color, unitPrice, costPrice, quoteDate, recipientName → 비교대상 카드 + 원본보기(consultation_id, estimate_id) |
| 원가표 | **vendor_price_book** | product_name, cost(→역산 단가), spec, site_name, image_url → 비교대상 카드 + 원본보기(image_url) |
| 제품 마스터 (단가 채우기) | **products** | name 일치 1건의 supply_price → 퀵 커맨드로 추가한 **빈 단가 행** 자동 채우기 |
| 제품 마스터 (비교대상) | **products** | 퀵 가이드 비교대상 목록에는 **의도적으로 미포함** (products: []). 행 선택 가이드용 productsList와 별개. |

---

## 4. 관련 코드 위치 (라인 근사)

- **EstimateForm.tsx**  
  - 퀵 커맨드 제출: `handleQuickCommandSubmit` (약 824~942)  
  - add_row + 비교대상: `searchPastCaseRecommendations(..., products: [], pastCaseRows)`, `getVendorPriceRecommendations(supabase, res.name)` (약 873~906)  
  - 행 추가 후 products로 단가 채우기: `useEffect` + `lastQuickCommandProductNameRef` (약 657~676)  
  - productsList 로드: `useEffect` + `modalOpen` (약 571~583)
- **estimateAiService.ts**  
  - `parseQuickCommand`, `searchPastCaseRecommendations` (약 380~430, 464~481)
- **estimateRecommendationService.ts**  
  - `getVendorPriceRecommendations`, `getVendorPriceRecommendation` (약 58~125)
- **ConsultationManagement.tsx**  
  - 과거 견적 200건 로드: `from('estimates').select(...).eq('is_visible', true).limit(200)` (약 2251~2266)  
  - `mergedPastEstimatesForGuide` (약 2269~2276)

---

이 문서는 “오늘 견적서에서 AI 퀵 가이드를 완성”할 때, **제품명이 들어가면 어떤 파일이 어떤 DB/값을 참고하는지** 확인하기 위한 기준 문서입니다.
