import {
  ACADEMY_STUDY_ROOM_CHECKLIST,
  ACADEMY_STUDY_ROOM_FAQS,
  ACADEMY_STUDY_ROOM_FEATURED_ANSWER,
  ACADEMY_STUDY_ROOM_GUIDE_DESCRIPTION,
  ACADEMY_STUDY_ROOM_GUIDE_PATH,
  ACADEMY_STUDY_ROOM_GUIDE_TITLE,
} from './academyStudyRoomFurnitureGuide'
import {
  APARTMENT_COMMUNITY_CHECKLIST,
  APARTMENT_COMMUNITY_FAQS,
  APARTMENT_COMMUNITY_FEATURED_ANSWER,
  APARTMENT_COMMUNITY_GUIDE_DESCRIPTION,
  APARTMENT_COMMUNITY_GUIDE_PATH,
  APARTMENT_COMMUNITY_GUIDE_TITLE,
} from './apartmentCommunityFurnitureGuide'
import { FINDGAGU_COM_TREND_CORPUS } from './findgaguComTrendCorpus'
import {
  MANAGED_READING_ROOM_CHECKLIST,
  MANAGED_READING_ROOM_FAQS,
  MANAGED_READING_ROOM_FEATURED_ANSWER,
  MANAGED_READING_ROOM_GUIDE_DESCRIPTION,
  MANAGED_READING_ROOM_GUIDE_PATH,
  MANAGED_READING_ROOM_GUIDE_TITLE,
} from './managedReadingRoomFurnitureGuide'
import {
  MANAGED_STUDY_CAFE_CHECKLIST,
  MANAGED_STUDY_CAFE_FAQS,
  MANAGED_STUDY_CAFE_FEATURED_ANSWER,
  MANAGED_STUDY_CAFE_GUIDE_DESCRIPTION,
  MANAGED_STUDY_CAFE_GUIDE_PATH,
  MANAGED_STUDY_CAFE_GUIDE_TITLE,
} from './managedStudyCafeFurnitureGuide'
import type { ShowroomGuide } from './showroomGuideTypes'

export type { ShowroomGuide } from './showroomGuideTypes'

export const SHOWROOM_GUIDES: ShowroomGuide[] = [
  {
    slug: 'managed-study-cafe-furniture',
    path: MANAGED_STUDY_CAFE_GUIDE_PATH,
    title: MANAGED_STUDY_CAFE_GUIDE_TITLE,
    h1: '관리형 스터디카페 가구, 고르기 전에',
    description: MANAGED_STUDY_CAFE_GUIDE_DESCRIPTION,
    featuredAnswer: MANAGED_STUDY_CAFE_FEATURED_ANSWER,
    about: ['관리형 스터디카페 가구', '관리형 독서실 가구', '스터디카페 가구업체'],
    checklist: MANAGED_STUDY_CAFE_CHECKLIST,
    faqs: MANAGED_STUDY_CAFE_FAQS,
    concern: '관리형 창업 또는 전환',
    teaserLabel: '관리형 스터디카페',
    sources: FINDGAGU_COM_TREND_CORPUS.map((entry) => ({ title: entry.title, url: entry.url })),
  },
  {
    slug: 'managed-reading-room-furniture',
    path: MANAGED_READING_ROOM_GUIDE_PATH,
    title: MANAGED_READING_ROOM_GUIDE_TITLE,
    h1: '관리형 독서실 가구, 고르기 전에',
    description: MANAGED_READING_ROOM_GUIDE_DESCRIPTION,
    featuredAnswer: MANAGED_READING_ROOM_FEATURED_ANSWER,
    about: ['관리형 독서실 가구', '관리형 독학관 가구', '독서실 가구업체'],
    checklist: MANAGED_READING_ROOM_CHECKLIST,
    faqs: MANAGED_READING_ROOM_FAQS,
    concern: '관리형 창업 또는 전환',
    teaserLabel: '관리형 독서실',
  },
  {
    slug: 'academy-study-room-furniture',
    path: ACADEMY_STUDY_ROOM_GUIDE_PATH,
    title: ACADEMY_STUDY_ROOM_GUIDE_TITLE,
    h1: '학원 자습실 가구, 고르기 전에',
    description: ACADEMY_STUDY_ROOM_GUIDE_DESCRIPTION,
    featuredAnswer: ACADEMY_STUDY_ROOM_FEATURED_ANSWER,
    about: ['학원 자습실 가구', '고교학점제 학습공간', '학원 인테리어'],
    checklist: ACADEMY_STUDY_ROOM_CHECKLIST,
    faqs: ACADEMY_STUDY_ROOM_FAQS,
    concern: '학원 자습실 상담',
    teaserLabel: '학원 자습실',
  },
  {
    slug: 'apartment-community-furniture',
    path: APARTMENT_COMMUNITY_GUIDE_PATH,
    title: APARTMENT_COMMUNITY_GUIDE_TITLE,
    h1: '아파트 커뮤니티 독서실 가구, 고르기 전에',
    description: APARTMENT_COMMUNITY_GUIDE_DESCRIPTION,
    featuredAnswer: APARTMENT_COMMUNITY_FEATURED_ANSWER,
    about: ['아파트 커뮤니티 독서실', '입주민 독서실 가구', '아파트 커뮤니티 시설'],
    checklist: APARTMENT_COMMUNITY_CHECKLIST,
    faqs: APARTMENT_COMMUNITY_FAQS,
    concern: '아파트 리뉴얼 제안서',
    teaserLabel: '아파트 커뮤니티',
  },
]

export function getShowroomGuideBySlug(slug: string | undefined): ShowroomGuide | undefined {
  const normalized = (slug ?? '').trim()
  if (!normalized) return undefined
  return SHOWROOM_GUIDES.find((guide) => guide.slug === normalized)
}

export function getRelatedShowroomGuides(slug: string): ShowroomGuide[] {
  return SHOWROOM_GUIDES.filter((guide) => guide.slug !== slug)
}
