# 주말 작업 브리프 — 클링 타임랩스 얇은 입구

> 작성: 2026-07-22  
> 원칙: **안 쓰는 완벽한 파이프 < 쓰는 얇은 루프**  
> 공유 컨텍스트: `~/Desktop/hermes/context/NOW.md` · `DECISIONS.md` · `PROJECTS.md`

---

## 1. 왜 하는가

- 릴스/타임랩스는 고객 반응이 있다. 다만 **손이 많아서 안 쓰게 됨**이 진짜 병목.
- 쇼룸·SEO·제품/색상 메타는 욕심이 맞지만, **광고 원경로와 한 화면에 묶여 있으면** 입구가 무거워진다.
- 이번 주말 목표: **사진 2장만 고르면 돌아가게** 입구만 다듬고, 실제 1건 이상 사용.

---

## 2. 원경로 (고정)

```
Before + After 선택
  → 클링 타임랩스 생성 (기존 Edge)
  → (가능하면) 합성까지 자동 또는 최소 클릭
  → 검수함 ready_for_review
  → 기존 발행 게이트 (YT n8n / Meta Make)
```

- **일일 공장 엔진 = 클링** (어긋난 BA를 맞추며 모프하는 강점)
- **Claude + 힉스필드 MCP** = 히어로/실험용. 주말 범위 밖.
- **원소스 멀티유즈**(훅컷·썸네일·다채널) = 입구가 돈 뒤.

---

## 3. 인프라 사실 (오해 정리)

| 단계 | 현재 위치 |
|------|-----------|
| 클링 생성·폴링 | **이미 클라우드** — Supabase Edge (`showroom-shorts-create` / `showroom-shorts-poll`) |
| ffmpeg 합성 | **이미 클라우드** — Railway worker |
| 저장 | Supabase Storage |
| 맥/브라우저 | **사람이 버튼·검수**하는 UI |

→ “생성·합성·폴링을 클라우드로 옮기자”가 아님. **이미 클라우드.**  
→ 이동형 맥 문제는 워커 위치가 아니라 **내가 안 열면 트리거가 안 됨**.  
→ **미니맥 지금 구매 비추천.** 입구 사용 + 정책자금 이후. Tailscale+윈도우 이중 환경도 비추천.  
→ 나중 자동화 포인트는 장비보다 **폴링 완료 → 합성 자동 트리거**.

관련 문서:
- `docs/AGENT_HANDOFF_2026-04-08_RAILWAY_SHORTS_WORKER.md`
- `docs/SHOWROOM_SHORTS_PUBLISH_SETUP.md`

---

## 4. 주말 범위

### 한다

1. **얇은 입구 UI** — Before / After 두 장(+ 현장명 정도)만 보이게
2. 기존 클링 → (워커) → **검수함** 연결이 이 입구에서 한 줄로 이어지게
3. 제품·색상·문제/해결·SEO 필드는 **접기 또는 이 경로에서 제외**
4. **완료 정의:** 실제 현장 1건으로 이 경로 완주

### 안 한다 (명시적)

- 쇼룸/랜딩/SEO/GEO 강화
- AI 자동 BA 페어 선택 (나중: 제안+원탭은 가능, 이번 주말 X)
- OSMU 파생(훅컷·썸네일 자동)
- 힉스필드 연동
- 미니맥·Tailscale·윈도우 워커
- 파이프라인 전체 리팩터

---

## 5. 사진 수집 (입구만큼 중요)

손이  lag는 지점이 생성보다 **“어떤 두 장을 고르지?”** 인 경우가 많음.

주말 최소:
- 최근 업로드 / 현장 묶음에서 그리드 선택
- 탭: 이게 Before / 이게 After → 바로 만들기

후순위:
- AI가 페어 2~3개 제안 → 원탭 확정 (완전 자동 집행은 금지)

---

## 6. 광고·OSMU (기억만, 주말 구현 X)

- 릴스만으로는 톱퍼널. 반응은 나오나 전환은 얇을 수 있음.
- 같은 타임랩스 1개를 Shorts·IG/FB·훅컷·썸네일로 쪼개는 **원소스 멀티유즈**가 다음 레버리지.
- 발행 갈래(youtube / facebook / instagram)는 이미 있음 → 입구 안정 후 “검수 1건 → 다채널” 기본값화.

---

## 7. 주말 체크리스트

- [ ] 얇은 입구 화면/플로우 위치 확정 (`ShowroomCaseStudio` vs `showroom-shorts` 중 하나 또는 연결)
- [ ] BA 2장만으로 job 생성 가능
- [ ] 클링 생성 → 폴링 → 합성 → `ready_for_review` 도달
- [ ] 제품/색상 등 필수 입력 제거 또는 스킵
- [ ] 실사례 1건 완주
- [ ] (여유 시) 폴링 완료 후 합성 자동 트리거 — 있으면 이동 맥 의존↓

---

## 8. 코드·화면 힌트 (시작점)

| 용도 | 경로 |
|------|------|
| 쇼츠 job / 클링 invoke | `src/lib/showroomShorts.ts` |
| 검수 UI | `src/pages/admin/ShowroomShortsPage.tsx` |
| 사례 작업실(메타 무거움) | `src/pages/admin/ShowroomCaseStudioPage.tsx` |
| BA 이미지 매핑 | `src/lib/showroomCaseContentPackage.ts` |
| Basic Shorts(폴백 후보) | `src/lib/showroomBasicShortsDrafts.ts` |
| Edge create/poll | `supabase/functions/showroom-shorts-*` |
| Railway 합성 | `api/showroom-shorts-worker.ts`, `worker/` |

---

## 9. 구현 상태 (2026-07-24)

덧붙임 작업실(기존 OS 미개조):

- 경로: `/admin/ad-inbox`
- 코드: `src/pages/admin/AdInboxStudioPage.tsx`, `src/lib/adInboxStudio.ts`
- 저장: `image_assets` + `category=ad_inbox` + `metadata.source=ad_inbox` (`is_consultation=false` → 쇼룸 목록에 안 섞임)
- 묶음: `날짜 + 짧은 이름` → `before_after_group_id = ad:YYYY-MM-DD:이름`
- 타임랩스: 기존 `createShowroomShortsJob` 연결
- **인라인 검수(2026-07-24)**: 대기실에서 원본 재생·상태 폴링·워커 합성까지 진행. `/admin/showroom-shorts`는 채널 론칭(업로드 준비/승인)용 탈출구로만 유지

로컬 확인 후 커밋 예정.

## 10. 한 줄

**주말 = 입구만. 엔진·클라우드는 이미 있다. 미니맥·OSMU·쇼룸은 나중에.**
