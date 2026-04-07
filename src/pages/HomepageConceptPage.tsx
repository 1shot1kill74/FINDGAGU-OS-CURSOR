import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import {
  buildSiteGroups,
  CONCERN_CARDS,
  matchesConcern,
  type ConcernId,
  type SiteGroup,
} from '@/features/지능형쇼룸홈페이지/useShowroomHomepageData'
import HeroSection from '@/features/지능형쇼룸홈페이지/components/HeroSection'
import ConcernSection from '@/features/지능형쇼룸홈페이지/components/ConcernSection'
import FeaturedSitesSection from '@/features/지능형쇼룸홈페이지/components/FeaturedSitesSection'
import CaseDetailSection from '@/features/지능형쇼룸홈페이지/components/CaseDetailSection'
import StoryBridgeSection from '@/features/지능형쇼룸홈페이지/components/StoryBridgeSection'
import RenewalSection from '@/features/지능형쇼룸홈페이지/components/RenewalSection'
import ClosingCtaSection from '@/features/지능형쇼룸홈페이지/components/ClosingCtaSection'
import { fetchPublicShowroomAssets } from '@/lib/showroomShareService'
import { trackShowroomEvent } from '@/lib/showroomEngagementService'

export default function HomepageConceptPage() {
  const [assets, setAssets] = useState<ShowroomImageAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedConcernId, setSelectedConcernId] = useState<ConcernId>('all')
  const [selectedSiteKey, setSelectedSiteKey] = useState<string | null>(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const trackedSiteViews = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    fetchPublicShowroomAssets()
      .then((list) => {
        if (!cancelled) {
          setAssets(list)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssets([])
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void trackShowroomEvent({
      eventName: 'showroom_open',
      sourceSurface: 'homepage',
      metadata: { entry: 'showroom_homepage' },
    })
  }, [])

  const selectedConcern = useMemo(
    () => CONCERN_CARDS.find((card) => card.id === selectedConcernId) ?? CONCERN_CARDS[0],
    [selectedConcernId]
  )

  const showroomAssets = useMemo(
    () => assets.filter((asset) => asset.before_after_role !== 'before'),
    [assets]
  )

  const siteGroups = useMemo(() => buildSiteGroups(showroomAssets), [showroomAssets])

  const featuredSites = useMemo(() => {
    const candidates = siteGroups.filter((group) => group.images.length >= 4 || group.hasBeforeAfter)
    return (candidates.length > 0 ? candidates : siteGroups).slice(0, 12)
  }, [siteGroups])

  const filteredSites = useMemo(() => {
    const matched = featuredSites.filter((group) => matchesConcern(group, selectedConcern))
    if (matched.length > 0) return matched.slice(0, 6)
    return featuredSites.slice(0, 6)
  }, [featuredSites, selectedConcern])

  const heroSites = useMemo(() => filteredSites.slice(0, 3), [filteredSites])

  const topProducts = useMemo(() => {
    const productCount = new Map<string, number>()
    filteredSites.forEach((group) => {
      group.products.forEach((product) => {
        productCount.set(product, (productCount.get(product) ?? 0) + 1)
      })
    })
    return Array.from(productCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
  }, [filteredSites])

  const beforeAfterSites = useMemo(
    () => featuredSites.filter((group) => group.hasBeforeAfter).slice(0, 2),
    [featuredSites]
  )

  const selectedSite = useMemo(
    () => featuredSites.find((group) => group.key === selectedSiteKey) ?? filteredSites.find((group) => group.key === selectedSiteKey) ?? null,
    [featuredSites, filteredSites, selectedSiteKey]
  )

  const openSiteDetail = useCallback((site: SiteGroup, startFrom: 'before' | 'after' | 'main' = 'main') => {
    setSelectedSiteKey(site.key)
    const targetIndex =
      startFrom === 'main'
        ? site.images.findIndex((image) => image.is_main)
        : site.images.findIndex((image) => image.before_after_role === startFrom)
    setSelectedImageIndex(targetIndex >= 0 ? targetIndex : 0)
    window.scrollTo({ top: 0, behavior: 'smooth' })

    if (!trackedSiteViews.current.has(site.key)) {
      trackedSiteViews.current.add(site.key)
      void trackShowroomEvent({
        eventName: 'showroom_view_case',
        sourceSurface: 'homepage',
        siteName: site.siteName,
        industry: site.businessTypes[0] ?? null,
        beforeAfter: site.hasBeforeAfter,
      })
    }

    if (site.hasBeforeAfter) {
      void trackShowroomEvent({
        eventName: 'showroom_view_before_after',
        sourceSurface: 'homepage',
        siteName: site.siteName,
        industry: site.businessTypes[0] ?? null,
        beforeAfter: true,
      })
    }
  }, [])

  const closeSiteDetail = useCallback(() => {
    setSelectedSiteKey(null)
    setSelectedImageIndex(0)
  }, [])

  const showPreviousImage = useCallback(() => {
    setSelectedImageIndex((prev) =>
      selectedSite ? (prev === 0 ? selectedSite.images.length - 1 : prev - 1) : prev
    )
  }, [selectedSite])

  const showNextImage = useCallback(() => {
    setSelectedImageIndex((prev) =>
      selectedSite ? (prev === selectedSite.images.length - 1 ? 0 : prev + 1) : prev
    )
  }, [selectedSite])

  const trackReplyIntent = useCallback((site: SiteGroup) => {
    void trackShowroomEvent({
      eventName: 'showroom_reply_intent',
      sourceSurface: 'homepage',
      siteName: site.siteName,
      industry: site.businessTypes[0] ?? null,
      beforeAfter: site.hasBeforeAfter,
    })
  }, [])

  useEffect(() => {
    if (!selectedSite) return

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSiteDetail()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        showPreviousImage()
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        showNextImage()
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [closeSiteDetail, selectedSite, showNextImage, showPreviousImage])

  const heroBackground = heroSites[0]?.mainImage?.cloudinary_url || heroSites[0]?.mainImage?.thumbnail_url || ''

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-sm text-neutral-300">대표 시공사례를 불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-50">
      <HeroSection
        heroSites={heroSites}
        heroBackground={heroBackground}
        onOpenSite={openSiteDetail}
      />

      <ConcernSection
        selectedConcernId={selectedConcernId}
        onSelectConcern={setSelectedConcernId}
      />

      <FeaturedSitesSection
        selectedConcern={selectedConcern}
        filteredSites={filteredSites}
        onOpenSite={openSiteDetail}
      />

      <StoryBridgeSection topProducts={topProducts} />

      <RenewalSection
        beforeAfterSites={beforeAfterSites}
        onOpenSite={openSiteDetail}
      />

      {selectedSite && selectedSite.images[selectedImageIndex] ? (
        <CaseDetailSection
          selectedSite={selectedSite}
          selectedConcern={selectedConcern}
          selectedImageIndex={selectedImageIndex}
          onClose={closeSiteDetail}
          onSelectImage={setSelectedImageIndex}
          onPreviousImage={showPreviousImage}
          onNextImage={showNextImage}
          onReplyIntent={trackReplyIntent}
        />
      ) : null}

      <ClosingCtaSection />
    </div>
  )
}
