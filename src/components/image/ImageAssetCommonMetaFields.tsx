/**
 * 현장명 검색 + 공통 속성 — 업로드 폼·대기실→쇼룸 승격에서 공유
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { useColorChips } from '@/hooks/useColorChips'
import {
  getExistingSiteNames,
  type SpaceDisplayNameOption,
} from '@/lib/imageAssetUploadService'
import { filterSiteNameSuggestions } from '@/lib/imageAssetSiteNameSearch'

export const IMAGE_ASSET_CATEGORY_OPTIONS = ['책상', '의자', '책장', '사물함', '기타'] as const
export const IMAGE_ASSET_BUSINESS_TYPE_OPTIONS = [
  '학원',
  '관리형',
  '스터디카페',
  '학교',
  '아파트',
  '기타',
] as const

export type ImageAssetCommonMetaValue = {
  site_name: string
  selectedSpaceOption: SpaceDisplayNameOption | null
  photo_date: string
  location: string
  business_type: string
  category: string
  product_name: string
  color_name: string
  memo: string
  beforeAfterRole: 'before' | 'after'
}

export const EMPTY_IMAGE_ASSET_COMMON_META: ImageAssetCommonMetaValue = {
  site_name: '',
  selectedSpaceOption: null,
  photo_date: '',
  location: '',
  business_type: '',
  category: '책상',
  product_name: '',
  color_name: '',
  memo: '',
  beforeAfterRole: 'after',
}

type Props = {
  value: ImageAssetCommonMetaValue
  onChange: (patch: Partial<ImageAssetCommonMetaValue>) => void
  /** 상담카드 prefill 등으로 현장명 고정 */
  siteNameReadOnly?: boolean
  /** 업종·색상·촬영일 등에 “권장” 힌트 */
  showRecommendedHints?: boolean
  /** 배치 성격 필드 표시 (기본 true) */
  showBeforeAfterRole?: boolean
  beforeAfterRoleHint?: string
  /** 현장명 / 공통 속성 중 일부만 렌더 (업로드 폼 레이아웃용) */
  parts?: Array<'site' | 'attributes'>
  /** true면 목록에서 상담카드(스페이스)를 골라야 함. 자유 입력만으로는 부족 */
  requireSpaceSelection?: boolean
  siteNameHint?: string
}

export function ImageAssetCommonMetaFields({
  value,
  onChange,
  siteNameReadOnly = false,
  showRecommendedHints = false,
  showBeforeAfterRole = true,
  beforeAfterRoleHint = '이번에 올리는 사진 묶음 전체에 동일하게 적용됩니다. 대부분은 애프터로 두고, 비포어 사진일 때만 변경하세요.',
  parts = ['site', 'attributes'],
  requireSpaceSelection = false,
  siteNameHint,
}: Props) {
  const showSite = parts.includes('site')
  const showAttributes = parts.includes('attributes')
  const { chips: colorChips, isLoading: colorLoading } = useColorChips()
  const colorByGroup = colorChips.reduce<Record<string, string[]>>((acc, c) => {
    if (!acc[c.color_type]) acc[c.color_type] = []
    acc[c.color_type].push(c.color_name)
    return acc
  }, {})

  const [siteNameSuggestions, setSiteNameSuggestions] = useState<SpaceDisplayNameOption[]>([])
  const [siteNameOptions, setSiteNameOptions] = useState<SpaceDisplayNameOption[]>([])
  const [siteNameOpen, setSiteNameOpen] = useState(false)
  const siteNameInputRef = useRef<HTMLInputElement>(null)

  const refreshSiteNameOptions = useCallback(async () => {
    const options = await getExistingSiteNames()
    setSiteNameOptions(options)
    return options
  }, [])

  useEffect(() => {
    void refreshSiteNameOptions()
  }, [refreshSiteNameOptions])

  useEffect(() => {
    if (siteNameReadOnly) return
    if (!value.site_name.trim()) return
    setSiteNameSuggestions(filterSiteNameSuggestions(siteNameOptions, value.site_name))
  }, [siteNameOptions, value.site_name, siteNameReadOnly])

  const recommended = (label: string) =>
    showRecommendedHints ? (
      <span className="ml-1 text-[10px] font-normal text-muted-foreground">(권장)</span>
    ) : null

  return (
    <div className="space-y-4">
      {showSite ? (
      <div className="rounded-lg border border-border p-4 bg-muted/20">
        <label className="block text-sm font-medium mb-2">
          {requireSpaceSelection ? '상담카드 현장명 / 스페이스 *' : '현장명 / 스페이스 표시명 *'}
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          {requireSpaceSelection
            ? '대기실 임시 이름이 아니라, 상담카드에 등록된 스페이스 표시명을 검색해 목록에서 고르세요. 선택해야 상담 ID·스페이스 ID가 연결됩니다.'
            : '상담 데이터에 연결된 스페이스 표시명을 검색합니다. 선택하면 해당 상담 ID와 스페이스 ID도 함께 연결됩니다.'}
        </p>
        {siteNameHint ? (
          <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            대기실 임시 이름: <span className="font-medium">{siteNameHint}</span> (검색 힌트로만 사용)
          </p>
        ) : null}
        <div className="relative">
          <Input
            ref={siteNameInputRef}
            type="text"
            value={value.site_name}
            onChange={(e) => {
              const v = e.target.value
              onChange({ site_name: v, selectedSpaceOption: null })
              setSiteNameSuggestions(filterSiteNameSuggestions(siteNameOptions, v))
              setSiteNameOpen(true)
            }}
            onFocus={() => {
              setSiteNameOpen(true)
              void refreshSiteNameOptions().then((options) => {
                setSiteNameSuggestions(filterSiteNameSuggestions(options, value.site_name))
              })
            }}
            onBlur={() => {
              setTimeout(() => setSiteNameOpen(false), 180)
            }}
            placeholder={
              requireSpaceSelection
                ? '상담카드 현장명 검색 후 목록에서 선택'
                : '예: 강남 테헤란로 오피스'
            }
            className="w-full"
            autoComplete="off"
            readOnly={siteNameReadOnly}
          />
          {siteNameOpen && !siteNameReadOnly && siteNameSuggestions.length > 0 && (
            <ul
              className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background text-popover-foreground shadow-lg max-h-48 overflow-auto"
              role="listbox"
            >
              {siteNameSuggestions.map((option) => (
                <li
                  key={`${option.consultation_id}:${option.space_id ?? option.display_name}`}
                  role="option"
                  className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange({
                      site_name: option.display_name,
                      selectedSpaceOption: option,
                    })
                    setSiteNameSuggestions([])
                    setSiteNameOpen(false)
                  }}
                >
                  <div className="text-sm">{option.display_name}</div>
                  {option.space_id && (
                    <div className="text-[11px] text-muted-foreground">{option.space_id}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {value.selectedSpaceOption ? (
          <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-2">
            상담카드 연결됨
            {value.selectedSpaceOption.space_id
              ? ` · 스페이스 ID: ${value.selectedSpaceOption.space_id}`
              : ''}
            {value.selectedSpaceOption.consultation_id
              ? ` · 상담 ID: ${value.selectedSpaceOption.consultation_id.slice(0, 8)}…`
              : ''}
          </p>
        ) : requireSpaceSelection && value.site_name.trim() ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2">
            아직 목록에서 선택하지 않았습니다. 검색 결과 중 하나를 클릭해야 합니다.
          </p>
        ) : null}
      </div>
      ) : null}

      {showAttributes ? (
      <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/20">
        <h2 className="text-sm font-semibold">공통 속성 (선택한 모든 사진에 적용)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              촬영일
              {recommended('촬영일')}
            </label>
            <Input
              type="date"
              value={value.photo_date}
              onChange={(e) => onChange({ photo_date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              지역
              {recommended('지역')}
            </label>
            <Input
              value={value.location}
              onChange={(e) => onChange({ location: e.target.value })}
              placeholder="위도, 경도 또는 지역명"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            업종
            {recommended('업종')}
          </label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={value.business_type}
            onChange={(e) => onChange({ business_type: e.target.value })}
          >
            <option value="">선택</option>
            {IMAGE_ASSET_BUSINESS_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">제품 카테고리 *</label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={value.category}
            onChange={(e) => onChange({ category: e.target.value })}
          >
            {IMAGE_ASSET_CATEGORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">제품명 *</label>
          <Input
            value={value.product_name}
            onChange={(e) => onChange({ product_name: e.target.value })}
            placeholder="예: 스마트A 책상"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            색상 (공식 컬러칩)
            {recommended('색상')}
          </label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={value.color_name}
            onChange={(e) => onChange({ color_name: e.target.value })}
            disabled={colorLoading}
          >
            <option value="">선택</option>
            {colorByGroup.Standard?.length ? (
              <optgroup label="기본 컬러 (Standard)">
                {colorByGroup.Standard.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {colorByGroup.Special?.length ? (
              <optgroup label="스페셜 컬러 (Special)">
                {colorByGroup.Special.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {colorByGroup.Other?.length ? (
              <optgroup label="기타">
                {colorByGroup.Other.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </div>
        {showBeforeAfterRole ? (
          <div>
            <label className="block text-sm font-medium mb-1">배치 성격 *</label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={value.beforeAfterRole}
              onChange={(e) =>
                onChange({ beforeAfterRole: e.target.value === 'before' ? 'before' : 'after' })
              }
            >
              <option value="after">애프터 (기본)</option>
              <option value="before">비포어</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">{beforeAfterRoleHint}</p>
          </div>
        ) : null}
        <div>
          <label className="block text-sm font-medium mb-1">메모</label>
          <Input
            value={value.memo}
            onChange={(e) => onChange({ memo: e.target.value })}
            placeholder="기타 메모"
          />
        </div>
      </div>
      ) : null}
    </div>
  )
}
