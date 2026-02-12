# 구글 시트 → Supabase consultations 동기화 (Apps Script)

## 시트 열 매핑

| 시트 열 | 인덱스 | DB 컬럼 | 설명 |
|---------|--------|---------|------|
| A | data[0] | project_name | 업체명(프로젝트명) |
| B | data[1] | link | 구글챗 링크 |
| C | data[2] | created_at | 시작일자 (과거 날짜 그대로 Overwrite) |

## 설정

1. [Google Apps Script](https://script.google.com) 에서 새 프로젝트 생성
2. `Code.gs` 내용 복사 후 붙여넣기
3. **스크립트 속성** 설정:
   - 파일 → 프로젝트 속성 → 스크립트 속성
   - `SUPABASE_URL`: `https://your-project.supabase.co`
   - `SUPABASE_SERVICE_KEY`: Service Role Key (Supabase 대시보드 → 설정 → API)

## 사용

### 1. 기존 데이터 삭제 후 재동기화

1. `runDeleteAllConsultations()` 실행 (트리거에서 선택 후 실행)
2. `initialSyncAll()` 실행

### 2. 일반 동기화

- `initialSyncAll()` 실행 — 활성 시트의 데이터를 Supabase로 Upsert (project_name 기준)

## 날짜 형식

시작일자(C열)는 아래 형식 지원:

- `YYYY-MM-DD`
- `YYYY.MM.DD`, `YYYY/MM/DD`
- `YYYYMMDD`
- Excel 날짜 번호
