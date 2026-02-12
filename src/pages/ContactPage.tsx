/**
 * 쇼룸 시공사례에서 진입하는 문의(상담) 페이지
 * - URL query: site_name, category, image_url → 문의 내용 자동 완성 및 metadata 저장
 * - 관리자 상담 목록에서 쇼룸 썸네일(showroom_image_url) 확인 가능
 */
import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Json } from '@/types/database'

const DEFAULT_MESSAGE = (siteName: string) => `[현장명: ${siteName}]의 시공사례를 보고 문의드립니다.`

export default function ContactPage() {
  const [searchParams] = useSearchParams()
  const siteName = searchParams.get('site_name') ?? ''
  const category = searchParams.get('category') ?? ''
  const imageUrl = searchParams.get('image_url') ?? ''

  const [companyName, setCompanyName] = useState('')
  const [managerName, setManagerName] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')
  const [facilityCondition, setFacilityCondition] = useState('')

  useEffect(() => {
    const cat = (category || '').trim()
    if (cat === '학원 자습실 문의') {
      setMessage('학원 자습실 맞춤형 예산 상담을 신청합니다.')
      return
    }
    if (cat === '고교학점제 행정 상담') {
      setMessage('학교 예산 및 공간 규격에 맞는 맞춤형 제안서 및 견적을 요청합니다.')
      setCompanyName(siteName)
      setContact(searchParams.get('contact') ?? '')
      return
    }
    if (cat === '아파트 리뉴얼 제안서') {
      setMessage('아파트 독서실·커뮤니티 공간 리뉴얼 맞춤형 제안서를 요청합니다.')
      return
    }
    const initial = siteName ? DEFAULT_MESSAGE(siteName) : ''
    setMessage(initial)
  }, [siteName, category, searchParams])

  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const company = companyName.trim()
    const name = managerName.trim()
    const phone = (contact || '').trim().replace(/\s/g, '')
    const isHighSchoolConsult = (category || '').trim() === '고교학점제 행정 상담'
    const displayNameForSubmit = isHighSchoolConsult && !name ? '(학교 담당자)' : name
    if (!displayNameForSubmit || !phone) {
      toast.error(isHighSchoolConsult ? '연락처를 입력해 주세요.' : '성함과 연락처를 입력해 주세요.')
      return
    }
    setSubmitting(true)
    try {
      const displayName = company ? `${company} ${displayNameForSubmit}` : displayNameForSubmit
      const isApartmentRenewal = (category || '').trim() === '아파트 리뉴얼 제안서'
      const metadata: Record<string, unknown> = {
        source: '쇼룸',
        pain_point: (message || '').trim() || null,
        customer_tier: '신규',
        display_name: displayName,
        showroom_site_name: siteName || null,
        showroom_category: category || null,
        showroom_image_url: imageUrl || null,
        ...(isApartmentRenewal && {
          apartment_complex_name: company || null,
          facility_condition: (facilityCondition || '').trim() || null,
        }),
      }
      const { error } = await supabase.from('consultations').insert({
        company_name: company || (isHighSchoolConsult ? '(학교명 미입력)' : isApartmentRenewal ? '(단지명 미입력)' : '(업체명 없음)'),
        manager_name: displayNameForSubmit,
        contact: phone,
        status: '상담중',
        metadata: metadata as Json,
        is_visible: true,
        expected_revenue: 0,
      })
      if (error) throw error
      toast.success('문의가 접수되었습니다. 빠른 시일 내에 연락드리겠습니다.')
      setMessage('')
      setCompanyName('')
      setManagerName('')
      setContact('')
      setFacilityCondition('')
    } catch (err) {
      console.error(err)
      toast.error('접수에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <header className="bg-white border-b border-neutral-200 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <Link to="/showroom" className="text-sm text-neutral-500 hover:text-neutral-900">
            ← 쇼룸으로
          </Link>
          <h1 className="text-lg font-semibold text-neutral-900">무료 레이아웃 컨설팅</h1>
          <span className="w-14" aria-hidden />
        </div>
      </header>
      <main className="max-w-xl mx-auto w-full px-4 py-8 flex-1">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              {(category || '').trim() === '고교학점제 행정 상담'
                ? '학교명'
                : (category || '').trim() === '아파트 리뉴얼 제안서'
                  ? '아파트 단지명'
                  : '업체명 (선택)'}
            </label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={
                (category || '').trim() === '고교학점제 행정 상담'
                  ? '예: OO고등학교'
                  : (category || '').trim() === '아파트 리뉴얼 제안서'
                    ? '예: OO 아파트, OO 힐스테이트'
                    : '예: OO학원'
              }
              className="bg-white"
            />
          </div>
          {(category || '').trim() === '아파트 리뉴얼 제안서' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">노후 시설 현황 (선택)</label>
              <textarea
                value={facilityCondition}
                onChange={(e) => setFacilityCondition(e.target.value)}
                placeholder="예: 독서실 1곳, 면적 ㎡, 현재 가구·조명 상태, 이용 현황 등"
                rows={3}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm leading-relaxed placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-1 resize-y"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">{(category || '').trim() === '고교학점제 행정 상담' ? '담당자 성함 (선택)' : '성함 *'}</label>
            <Input
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder="담당자 성함"
              className="bg-white"
              required={(category || '').trim() !== '고교학점제 행정 상담'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">연락처 *</label>
            <Input
              type="tel"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="010-0000-0000"
              className="bg-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">문의 내용</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={DEFAULT_MESSAGE(siteName || '현장')}
              rows={4}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm leading-relaxed placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-1 resize-y"
            />
          </div>
          <Button type="submit" className="w-full h-12 font-semibold" disabled={submitting}>
            {submitting
              ? '접수 중…'
              : (category || '').trim() === '고교학점제 행정 상담' || (category || '').trim() === '아파트 리뉴얼 제안서'
                ? '제안서 요청하기'
                : '문의 접수하기'}
          </Button>
        </form>
      </main>
    </div>
  )
}
