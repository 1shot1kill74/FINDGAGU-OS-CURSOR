# 롤백 매뉴얼 — 세이브 포인트별 복구

이전 안정 상태로 되돌릴 때는 아래에서 해당 세이브 포인트를 찾아 복구하면 됩니다.

---

## 최신 세이브 포인트 (2026-02-09)

**상담 숨기기·아카이브·마이그레이션 완료** 시점.  
상세 내용·변경 파일 목록·Git 태그 예시는 **JOURNAL.md** 하단의 **「세이브 포인트 2026-02-09」** 블록을 참고.

```bash
# 이 시점을 태그로 남겼다면
git checkout save-20260209-archive-migration
```

---

## 1. Git으로 복구 (채팅형 히스토리 이전 — 2026-02-07)

채팅형 히스토리 구현 중 **성능 저하** 또는 **데이터 혼선**이 발생하면, 아래 순서대로 진행하면 **약 1분 안에** 이전 안정 상태로 되돌릴 수 있습니다.

---

## 1. Git으로 복구 (저장소가 있는 경우)

※ 프로젝트가 Git 저장소가 아니면 이 단계는 건너뛰고 **2. 스냅샷 복사본으로 복구**만 진행하면 됩니다.

현재 프로젝트가 Git 저장소라면, 먼저 세이브 포인트를 만들어 두었을 수 있습니다.

```bash
# 태그가 있다면 해당 커밋으로 체크아웃
git checkout checkpoint-20260207-before-chat-upgrade

# 또는 안정 브랜치가 있다면
git checkout feature/safe-stable
```

이후 `src/pages/ConsultationManagement.tsx`, `src/components/estimate/EstimateForm.tsx` 등이 해당 시점 코드로 복구됩니다.

---

## 2. 스냅샷 복사본으로 복구 (Git 없거나 파일만 되돌리고 싶을 때)

스냅샷은 **`.cursor/snapshots/stable-v1/`** 에 있습니다. 아래 파일들을 **원본 경로로 덮어쓰기**하면 됩니다.

```bash
# 프로젝트 루트에서 실행
cp .cursor/snapshots/stable-v1/ConsultationManagement.tsx src/pages/
cp .cursor/snapshots/stable-v1/EstimateForm.tsx src/components/estimate/
cp .cursor/snapshots/stable-v1/database.ts src/types/
# DB 스키마는 이미 적용된 상태라면 migrations 복사는 선택 사항
# cp .cursor/snapshots/stable-v1/migrations/20260207000000_create_estimates_table.sql supabase/migrations/
```

- **ConsultationManagement.tsx** — 상담 상세 패널·견적 관리 탭·풀스크린 견적서 모달이 포함된 버전입니다.
- **EstimateForm.tsx** — 예산 기획/확정 견적 듀얼 모드, ref 기반 임시저장/발행승인 버전입니다.
- **database.ts** — 당시 사용 중이던 Supabase 타입 정의입니다.

---

## 3. 확인

1. `npm run build` 또는 `npm run dev` 로 빌드/실행이 되는지 확인합니다.
2. 상담 관리 → 견적 관리 탭 → 신규 견적 작성 → 풀스크린 모달이 정상 동작하는지 확인합니다.

---

## 4. 세이브 포인트를 아직 안 만들었다면 (Git 사용 시)

**2026-02-09 현재 상태**를 세이브 포인트로 남기려면:

```bash
git add -A
git commit -m "checkpoint: 상담 숨기기·아카이브·마이그레이션 완료"
git tag save-20260209-archive-migration
```

채팅형 히스토리 **이전** 상태를 남기려면:

```bash
git add -A
git commit -m "checkpoint: before chat-history upgrade"
git tag checkpoint-20260207-before-chat-upgrade
# 또는
git checkout -b feature/safe-stable
```

이 문서와 스냅샷은 **채팅형 히스토리 트라이 이전**의 안정 좌표를 위한 것입니다.
