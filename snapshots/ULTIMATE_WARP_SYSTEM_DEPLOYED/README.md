# ULTIMATE_WARP_SYSTEM_DEPLOYED

**최종 세이브 포인트 — 가장 안정적인 최신 버전.**

- **캡처 일시**: 2025-02-07
- **포함**: `src/`, `public/`, `supabase/`(마이그레이션 포함), 루트 설정 파일

---

## [확정된 주요 기능 목록]

### 1. 통합 타임라인
- 모든 상담의 메시지를 **시간 순으로 정렬**해 한 화면에서 확인 가능.
- 채팅 UI에서 "전체 이력 합쳐보기" 시 동일 연락처 상담 메시지 통합 표시.

### 2. 지능형 워프(Warp)
- **채팅 배지 클릭** 시 한 번에:
  - 왼쪽 리스트로 **자동 스크롤**
  - 해당 카드 **자동 선택** (검은 테두리·선택 스타일)
  - 우측 **상담 히스토리 탭** 강제 전환
  - **종료** 건은 '종료' 탭, 그 외는 '전체' 탭으로 **필터 자동 전환**
  - **노란색 강조**로 "여기로 왔습니다" 시각 피드백

### 3. 채팅 고도화
- **직원 메시지 왼쪽** / 고객 메시지 오른쪽 배치.
- **한글 입력(IME) 버그** 수정: `isComposing` 체크로 조합 중 엔터 전송 방지.
- **수정/삭제 흔적 남기기**: 소프트 삭제(`[삭제된 메시지입니다]` + `deleted_at`), 수정 시 `(수정됨)` 표시.
- Hover 시 수정(연필)·삭제(쓰레기통) 아이콘 (직원 메시지만).

### 4. 알림 시스템
- **읽지 않은 메시지** 발생 시 상담 카드 우측 상단 **파란 점** 표시.
- `consultations.last_viewed_at` 기반; 카드 클릭 시 갱신되어 알람 **자동 제거**.

---

## 복원 방법

### 전체 복원
```bash
cp -r snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/src ./
cp -r snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/public ./
cp -r snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/supabase ./
cp snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/index.html .
cp snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/package.json snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/package-lock.json .
cp snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/tsconfig.json snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/tsconfig.node.json .
cp snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/vite.config.ts snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/tailwind.config.js .
cp snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/postcss.config.js snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/eslint.config.js .
```

### 채팅/상담 관련만 복원
```bash
cp snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/src/components/chat/ConsultationChat.tsx src/components/chat/
cp snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/src/pages/ConsultationManagement.tsx src/pages/
cp snapshots/ULTIMATE_WARP_SYSTEM_DEPLOYED/src/types/database.ts src/types/
```

복원 후 `npm run build` 로 확인 권장.
