# 견적서/원가표 업로드 — PDF 분석 라이브러리 검토

## 현재 사용 중

### pdfjs-dist (Mozilla PDF.js)

- **역할**: PDF에서 텍스트 추출 (`extractTextFromPDF`)
- **특징**: Mozilla 공식 라이브러리, 브라우저·Node.js 지원, 페이지별 세밀한 제어
- **장점**: 시각적 렌더링·메타데이터 파싱 가능, 유지보수 활발
- **단점**: API가 다소 복잡, Worker 설정 필요

### @google/generative-ai (Gemini 2.0 Flash)

- **역할**: 추출 텍스트 → 구조화 JSON 변환, 이미지 비전 분석
- **특징**: PDF 텍스트 + 이미지 Base64 모두 처리, 폴백으로 OpenAI GPT-4o 사용

---

## 대안 라이브러리 검토

| 라이브러리 | 용도 | 장점 | 단점 |
|------------|------|------|------|
| **pdf-parse** | PDF 텍스트 추출 | API 단순, Promise 기반 | pdfjs 기반 래퍼, 파싱 제어 제한 |
| **Supabase Edge Functions + AI** | 서버사이드 PDF 파싱 | 클라이언트 부하 감소 | Deno 환경, pdfjs/타 라이브러리 호환 검증 필요 |
| **pdfjs-dist** (현행) | PDF 텍스트 추출 | 검증됨, 유연함 | Worker/CDN 설정 필요 |

### 권장

- **클라이언트**: `pdfjs-dist` 유지 (이미 사용 중, 안정적)
- **이미지**: Base64 + Gemini Vision (현행 유지)
- **추가 검토**: 용량 큰 PDF·대량 처리 시 Supabase Edge Function으로 이전 검토
