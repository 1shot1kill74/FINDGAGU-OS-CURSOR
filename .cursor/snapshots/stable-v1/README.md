# Stable v1 Snapshot (2026-02-07)

채팅형 히스토리 작업 **이전**의 안정 상태 백업입니다.

## 포함 파일

| 파일 | 원본 경로 | 비고 |
|------|-----------|------|
| `ConsultationManagement.tsx` | `src/pages/` | 상담 리스트·상세 패널(상담 히스토리/실측 자료/견적 관리 탭)·풀스크린 견적서 모달 |
| `EstimateForm.tsx` | `src/components/estimate/` | 예산 기획/확정 견적 듀얼 모드, ref(getCurrentData/requestApprove) |
| `database.ts` | `src/types/` | Supabase DB 타입 정의 |
| `migrations/20260207000000_create_estimates_table.sql` | `supabase/migrations/` | estimates 테이블 DDL |

## 복구 방법

`ROLLBACK.md` 참고.
