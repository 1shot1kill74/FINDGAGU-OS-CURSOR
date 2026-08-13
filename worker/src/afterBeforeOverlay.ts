/**
 * BA 숏츠(After 콜드오픈) 자막 레이어. env·supabase에 의존하지 않는 순수 모듈이라
 * 합성 워커와 검증 스크립트가 같은 필터 그래프를 쓴다.
 */

export const OUTPUT_WIDTH = 720
export const OUTPUT_HEIGHT = 1280
/** message_bands: 영상을 정사각으로 두고 남는 위·아래를 검정 밴드로 쓴다. */
export const BAND_VIDEO_SIZE = 720
export const BAND_TOP = Math.floor((OUTPUT_HEIGHT - BAND_VIDEO_SIZE) / 2)
export const BAND_BOTTOM_Y = BAND_TOP + BAND_VIDEO_SIZE
/** 현장명 자막 위치. 밴드는 훅(y=76) 위 여백, full_bleed는 배지 반대쪽 우상단. */
const SITE_LINE_BAND_Y = 30
const SITE_LINE_FULL_BLEED_Y = 56
/** 밴드 폭(720px) 기준 한 줄 상한. 넘으면 장소명만 줄이고 견적번호는 남긴다. */
const ON_SCREEN_SITE_MAX_LENGTH = 28
/** 입고 이름 앞에 붙는 내부 상태 토큰. `A/S`는 슬래시 분리보다 먼저 떼야 한다. */
const SITE_NAME_STATUS_PREFIX = /^(?:(?:완료|견적|A\/S)[\s_]+)+/iu

export type AfterBeforeTextKey =
  | 'hookLine1'
  | 'hookLine2'
  | 'afterBadge'
  | 'beforeBadge'
  | 'storyLine'
  | 'ctaLine'
  | 'siteLine'

/**
 * 자막용 현장명. 앱 `toOnScreenShowroomShortsSiteName`과 같은 규칙.
 * 월 코드와 끝 견적번호는 남기고 채널톡 메모 같은 내부 기록만 걷어낸다.
 * 예: `견적 2509 부천 /채널톡 나비933 / 7311` → `2509 부천 7311`
 */
export function toOnScreenSiteLine(value: string | null | undefined): string {
  const normalized = (value ?? '').replace(/_/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  const segments = normalized
    .replace(SITE_NAME_STATUS_PREFIX, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
  const [head, ...rest] = segments
  if (!head || head === '이 공간') return ''

  // 슬래시 뒤는 채널톡 상담 메모 같은 내부 기록이라 버리고, 거기 있는 견적번호만 건진다.
  const tailNumber = rest
    .flatMap((segment) => segment.split(' '))
    .filter((token) => /^\d{3,}$/u.test(token))
    .pop()
  const stripped =
    tailNumber && !new RegExp(`(?:^|\\s)${tailNumber}$`, 'u').test(head)
      ? `${head} ${tailNumber}`
      : head
  if (stripped.length <= ON_SCREEN_SITE_MAX_LENGTH) return stripped

  const estimateNo = /\s(\d{3,})$/u.exec(stripped)?.[1] ?? ''
  if (!estimateNo) return `${stripped.slice(0, ON_SCREEN_SITE_MAX_LENGTH - 1)}…`
  const nameOnly = stripped.slice(0, stripped.length - estimateNo.length - 1).trim()
  const nameBudget = ON_SCREEN_SITE_MAX_LENGTH - estimateNo.length - 2
  return `${nameOnly.slice(0, Math.max(1, nameBudget))}… ${estimateNo}`
}

/**
 * 프레임 모드별 자막 레이어.
 * full_bleed는 사진 위에 반투명 박스를 깔고 얹는다.
 * message_bands는 위 밴드에 훅·보조 자막, 아래 밴드에 CTA를 넣어 사진을 가리지 않는다.
 * 배지(BEFORE/AFTER)는 두 모드 모두 영상 영역 좌상단에 붙고 yShift를 받지 않는다.
 * 현장명은 전 구간 고정 노출이라 훅·배지와 겹치지 않는 위치에 따로 얹는다.
 */
export function buildAfterBeforeOverlaySteps(input: {
  bandMode: boolean
  hookColor: string
  ctaColor: string
  yShift: number
  escape: (value: string) => string
  fonts: { body: string; bold: string; hook: string }
  textPaths: Record<AfterBeforeTextKey, string>
  hasSiteLine: boolean
  afterOpenEnable: string
  beforeEnable: string
  hookEnable: string
  storyEnable: string
  holdEnable: string
}): string[] {
  const { bandMode, hookColor, ctaColor, yShift, escape, textPaths } = input
  const bold = escape(input.fonts.bold)
  const body = escape(input.fonts.body)
  // 훅·CTA만 브랜드 폰트. 배지·보조 자막은 가독성 우선으로 Noto 유지.
  const hookFont = escape(input.fonts.hook)
  const badgeBoxY = bandMode ? BAND_TOP + 16 : 48
  const badgeTextY = bandMode ? BAND_TOP + 28 : 60
  const hook1Y = (bandMode ? 76 : 1010) + yShift
  const hook2Y = (bandMode ? 122 : 1070) + yShift
  const storyY = (bandMode ? 180 : 1188) + yShift
  const ctaY = (bandMode ? BAND_BOTTOM_Y + 123 : 1100) + yShift
  const hookFontSize = bandMode ? 42 : 46
  const storyFontSize = bandMode ? 24 : 28
  const ctaFontSize = bandMode ? 34 : 30

  const steps: string[] = [
    `[story]drawbox=x=28:y=${badgeBoxY}:w=168:h=54:color=black@0.72:t=fill:enable='${input.afterOpenEnable}'[s1]`,
    `[s1]drawtext=fontfile='${bold}':textfile='${escape(textPaths.afterBadge)}':fontcolor=${hookColor}:fontsize=28:x=64:y=${badgeTextY}:enable='${input.afterOpenEnable}'[s2]`,
    `[s2]drawbox=x=28:y=${badgeBoxY}:w=188:h=54:color=black@0.72:t=fill:enable='${input.beforeEnable}'[s3]`,
    `[s3]drawtext=fontfile='${bold}':textfile='${escape(textPaths.beforeBadge)}':fontcolor=white:fontsize=28:x=58:y=${badgeTextY}:enable='${input.beforeEnable}'[s4]`,
  ]

  // 밴드 모드는 밴드 자체가 검정이라 훅 배경 박스가 필요없다.
  steps.push(
    bandMode
      ? `[s4]null[s5]`
      : `[s4]drawbox=x=40:y=${980 + yShift}:w=640:h=170:color=black@0.55:t=fill:enable='${input.hookEnable}'[s5]`,
  )

  steps.push(
    `[s5]drawtext=fontfile='${hookFont}':textfile='${escape(textPaths.hookLine1)}':fontcolor=${hookColor}:fontsize=${hookFontSize}:borderw=1.2:bordercolor=black@0.25:shadowcolor=black@0.55:shadowx=0:shadowy=3:x=(w-text_w)/2:y=${hook1Y}:enable='${input.hookEnable}'[s6]`,
    `[s6]drawtext=fontfile='${hookFont}':textfile='${escape(textPaths.hookLine2)}':fontcolor=${hookColor}:fontsize=${hookFontSize}:borderw=1.2:bordercolor=black@0.25:shadowcolor=black@0.55:shadowx=0:shadowy=3:x=(w-text_w)/2:y=${hook2Y}:enable='${input.hookEnable}'[s7]`,
    `[s7]drawtext=fontfile='${body}':textfile='${escape(textPaths.storyLine)}':fontcolor=white:fontsize=${storyFontSize}:borderw=1:bordercolor=black@0.2:x=(w-text_w)/2:y=${storyY}:enable='${input.storyEnable}'[s8]`,
    `[s8]drawbox=x=28:y=${badgeBoxY}:w=168:h=54:color=black@0.72:t=fill:enable='${input.holdEnable}'[s9]`,
    `[s9]drawtext=fontfile='${bold}':textfile='${escape(textPaths.afterBadge)}':fontcolor=${hookColor}:fontsize=28:x=64:y=${badgeTextY}:enable='${input.holdEnable}'[s10]`,
    `[s10]drawtext=fontfile='${hookFont}':textfile='${escape(textPaths.ctaLine)}':fontcolor=${ctaColor}:fontsize=${ctaFontSize}:borderw=1:bordercolor=black@0.2:x=(w-text_w)/2:y=${ctaY}:enable='${input.holdEnable}'[s11]`,
  )

  // 현장명은 "여기가 어디인가"만 알려주면 되므로 훅보다 작고 낮은 명도로 전 구간 유지한다.
  // 견적번호가 붙어 있어 직원이 영상만 보고 현장을 역추적할 수 있다.
  if (input.hasSiteLine) {
    steps.push(
      bandMode
        ? `[s11]drawtext=fontfile='${body}':textfile='${escape(textPaths.siteLine)}':fontcolor=white@0.9:fontsize=26:borderw=1:bordercolor=black@0.3:x=(w-text_w)/2:y=${SITE_LINE_BAND_Y}[vout]`
        : `[s11]drawtext=fontfile='${body}':textfile='${escape(textPaths.siteLine)}':fontcolor=white@0.92:fontsize=24:box=1:boxcolor=black@0.5:boxborderw=12:shadowcolor=black@0.4:shadowx=0:shadowy=2:x=w-text_w-40:y=${SITE_LINE_FULL_BLEED_Y}[vout]`,
    )
  } else {
    steps.push('[s11]null[vout]')
  }

  return steps
}
