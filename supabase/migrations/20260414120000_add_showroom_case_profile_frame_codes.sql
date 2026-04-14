alter table public.showroom_case_profiles
  add column if not exists problem_code text,
  add column if not exists solution_code text,
  add column if not exists pain_point_override text,
  add column if not exists solution_point_override text;

comment on column public.showroom_case_profiles.problem_code is
'대표 문제 프레임 코드. 예: broken-flow, focus-fatigue';

comment on column public.showroom_case_profiles.solution_code is
'대표 해결 프레임 코드. 예: flow-optimized, layout-for-focus';

comment on column public.showroom_case_profiles.pain_point_override is
'현장 맞춤 문제 설명 보정문. 비어 있으면 기본 문제 프레임 또는 pain_point를 사용.';

comment on column public.showroom_case_profiles.solution_point_override is
'현장 맞춤 해결 설명 보정문. 비어 있으면 기본 해결 프레임 또는 solution_point를 사용.';

create index if not exists idx_showroom_case_profiles_problem_code
  on public.showroom_case_profiles (problem_code);

create index if not exists idx_showroom_case_profiles_solution_code
  on public.showroom_case_profiles (solution_code);
