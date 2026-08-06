# 교육용 가구 B2B 아웃리치 파이프라인

Human-in-the-loop 반자동 시스템. 공개 시그널만 수집하고, 휴리스틱이 점수화하며, **사람 승인 후에만** 제안/쇼룸 링크를 보낸다(MVP는 복사+발송 로그).

## 1. 아키텍처 요약

```
Source → Collect → Normalize → Score → Approval Queue → Send(manual) → Log
```

| 단계 | 주력 | 비고 |
|------|------|------|
| Source | **네이버 블로그 검색** (액티베이팅) + **네이버 지역** | 뉴스는 트렌드 보조 |
| Collect | `POST /api/edu-outreach-collect` `{ provider }` | `naver_blog` / `naver_local` / `naver_news` / `google_news` |
| Score | `eduOutreachActivation.ts` + `eduOutreachScoring.ts` | 활성(신선도) + 공간의도 + 업종 |
| Approval | `/admin/edu-outreach` | 승인 전 자동 발송 없음 |
| Send | 클립보드 복사 + send_logs | 자동 DM/메일 금지 |

## 2. 블로그 액티베이팅 점수

| 레벨 | 기준 | 의미 |
|------|------|------|
| hot | 최근 글 ≤30일 | 채널 잘 관리 |
| warm | ≤90일 | 운영 중 |
| cool | ≤180일 | 저활성 |
| dormant | >180일 | 방치 가능(≠사업 부진) |

`fit` = 활성 점수 + 업종 + **공간의도**(리모델링/좌석/개원 등).  
활성만 높고 공간 키워드 없으면 중간 점수 → 워밍 대상.

## 3. 수집 버튼 (OS)

1. **블로그 활성 수집** — 학원/스터디카페/관리형 독서실 블로그를 블로거 단위로 묶음
2. **네이버 지역** — 업체 디렉터리(전화 저장만, 자동 콜 금지)
3. 뉴스/Google — 트렌드 참고용

환경변수: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` (검색 > 블로그·뉴스·지역 활성화)

마이그레이션: `supabase/migrations/20260801060000_edu_outreach_blog_activation.sql`
