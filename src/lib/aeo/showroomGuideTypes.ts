export type ShowroomGuideSource = {
  title: string
  url: string
}

export type ShowroomGuide = {
  slug: string
  path: string
  title: string
  h1: string
  description: string
  featuredAnswer: string
  about: string[]
  checklist: ReadonlyArray<{ label: string; detail: string }>
  faqs: ReadonlyArray<{ question: string; answer: string }>
  concern: string
  teaserLabel: string
  sources?: ReadonlyArray<ShowroomGuideSource>
}
