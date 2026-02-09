# STABLE_CHAT_V3_FINAL_UI

**채팅 V3 최종 UI 기준 백업.**  
이 시점까지 반영된 채팅·상담 UI/기능을 완전히 보관한 스냅샷입니다.

- **캡처 일시**: 2025-02-07
- **포함 내용**: `src/` 전체, `public/`, `supabase/`(마이그레이션 포함, `consultations_last_viewed_at` 포함), 루트 설정 파일

---

## 이 스냅샷에 포함된 기능

1. **한글 입력 엔터 버그 해결**  
   메시지 입력창 `onKeyDown`에서 `e.nativeEvent.isComposing` 체크 → 조합 중 엔터 시 전송 방지.

2. **메시지/파일 수정·삭제(흔적 남기기)**  
   - Hover 시 수정(연필)·삭제(쓰레기통) 아이콘 (직원 메시지만)  
   - 삭제: 소프트 삭제 — 내용을 `[삭제된 메시지입니다]` / `[이 파일은 삭제되었습니다]`로 교체, `metadata.deleted_at` 기록, 말풍선 흐리게 표시  
   - 수정: 텍스트 즉시 수정, `metadata.edited_at` + "(수정됨)" 표시  

3. **채팅창 2/3 비중 + 직원 메시지 왼쪽 배치**  
   - 좌측 상담 리스트 35%, 우측 채팅 65% (grid)  
   - 직원(staff) 메시지 = 왼쪽 말풍선, 고객 = 오른쪽 말풍선  
   - 파일 타입별 아이콘(FileText, FileSpreadsheet, Presentation 등) + 클릭 시 열기/다운로드  

4. **읽지 않은 메시지 알림 기초**  
   - `consultations.last_viewed_at` 컬럼 사용  
   - 마지막 메시지 시각 > last_viewed_at 이면 카드 우측 상단 파란 점  
   - 카드 클릭 시 last_viewed_at 갱신 → 알람 마크 제거  

---

## 복원 방법

### 전체 복원
```bash
cp -r snapshots/STABLE_CHAT_V3_FINAL_UI/src ./
cp -r snapshots/STABLE_CHAT_V3_FINAL_UI/public ./
cp -r snapshots/STABLE_CHAT_V3_FINAL_UI/supabase ./
cp snapshots/STABLE_CHAT_V3_FINAL_UI/index.html .
cp snapshots/STABLE_CHAT_V3_FINAL_UI/package.json snapshots/STABLE_CHAT_V3_FINAL_UI/package-lock.json .
cp snapshots/STABLE_CHAT_V3_FINAL_UI/tsconfig.json snapshots/STABLE_CHAT_V3_FINAL_UI/tsconfig.node.json .
cp snapshots/STABLE_CHAT_V3_FINAL_UI/vite.config.ts snapshots/STABLE_CHAT_V3_FINAL_UI/tailwind.config.js .
cp snapshots/STABLE_CHAT_V3_FINAL_UI/postcss.config.js snapshots/STABLE_CHAT_V3_FINAL_UI/eslint.config.js .
```

### 채팅/상담 관련만 복원
```bash
cp snapshots/STABLE_CHAT_V3_FINAL_UI/src/components/chat/ConsultationChat.tsx src/components/chat/
cp snapshots/STABLE_CHAT_V3_FINAL_UI/src/pages/ConsultationManagement.tsx src/pages/
cp snapshots/STABLE_CHAT_V3_FINAL_UI/src/types/database.ts src/types/
```

복원 후 `npm run build`로 확인 권장.
