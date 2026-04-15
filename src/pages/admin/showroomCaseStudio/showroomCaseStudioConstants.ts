import type { ShowroomCaseCardNewsSlide } from '@/lib/showroomCaseContentPackage'

export const SLIDE_KEY_OPTIONS: { value: ShowroomCaseCardNewsSlide['key']; label: string }[] = [
  { value: 'hook', label: '훅' },
  { value: 'problem', label: '문제 인식' },
  { value: 'specific-problem', label: '구체 문제' },
  { value: 'solution', label: '해결 접근' },
  { value: 'evidence', label: '변화 포인트' },
  { value: 'cta', label: 'CTA' },
]

export const PROBLEM_FRAME_OPTIONS = [
  { code: 'focus-fatigue', label: '집중 피로', summary: '오래 머물기 어렵고 집중이 쉽게 끊기는 구조입니다.' },
  { code: 'broken-flow', label: '동선 단절', summary: '이동과 관리 흐름이 끊겨 사용성과 운영 효율이 함께 떨어집니다.' },
  { code: 'storage-chaos', label: '수납 혼선', summary: '정리와 보관 체계가 공간 안에서 해결되지 않아 어수선함이 누적됩니다.' },
  { code: 'weak-zoning', label: '구역 모호', summary: '공간의 역할 구분이 약해 학습, 협업, 대기 흐름이 섞여 보입니다.' },
] as const

export const SOLUTION_FRAME_OPTIONS = [
  { code: 'layout-for-focus', label: '집중 중심 배치', summary: '오래 머물 수 있는 좌석 흐름을 먼저 잡고, 가구를 그에 맞춰 배치합니다.' },
  { code: 'flow-optimized', label: '동선 최적화', summary: '이동과 관리 동선을 짧게 만들어 사용하는 사람과 운영자 모두 덜 힘든 구조로 정리합니다.' },
  { code: 'storage-integrated', label: '수납 일체화', summary: '정리는 사후 관리가 아니라 가구 구성 안에서 자연스럽게 해결되도록 만듭니다.' },
  { code: 'zoning-by-purpose', label: '역할별 구역화', summary: '한 공간 안에서도 활동 목적에 따라 구역이 읽히도록 제품과 배치를 정리합니다.' },
] as const
