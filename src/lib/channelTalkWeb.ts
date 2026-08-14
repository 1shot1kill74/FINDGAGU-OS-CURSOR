import { getChannelTalkPluginKey } from '@/lib/config'

declare global {
  interface Window {
    ChannelIO?: (...args: unknown[]) => void
  }
}

const CHANNEL_TALK_SCRIPT_ID = 'channel-talk-plugin-script'
const CHANNEL_TALK_SCRIPT_SRC = 'https://cdn.channel.io/plugin/ch-plugin-web.js'
const SHOWROOM_CONTEXT_SOURCE = 'public_showroom'

let publicShowroomMountCount = 0

export type PublicShowroomChannelTalkContext = {
  pagePath?: string
  search?: string
}

function ensureChannelTalkStub() {
  if (typeof window === 'undefined' || window.ChannelIO) return

  const queue: unknown[][] = []
  const channelIO = (...args: unknown[]) => {
    queue.push(args)
  }

  ;(channelIO as typeof channelIO & { q?: unknown[][] }).q = queue
  window.ChannelIO = channelIO
}

function ensureChannelTalkScript() {
  if (typeof document === 'undefined') return
  if (document.getElementById(CHANNEL_TALK_SCRIPT_ID)) return

  const script = document.createElement('script')
  script.id = CHANNEL_TALK_SCRIPT_ID
  script.async = true
  script.src = CHANNEL_TALK_SCRIPT_SRC
  document.head.appendChild(script)
}

function readSearchParam(search: string | undefined, key: string): string | undefined {
  const value = new URLSearchParams(search ?? '').get(key)?.trim()
  return value || undefined
}

function buildShowroomChannelTalkProfile(context?: PublicShowroomChannelTalkContext): Record<string, string> {
  const search = context?.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const pagePath = context?.pagePath ?? (typeof window !== 'undefined' ? window.location.pathname : '')
  const profile: Record<string, string> = {
    homepage_context_source: SHOWROOM_CONTEXT_SOURCE,
    showroom_source: SHOWROOM_CONTEXT_SOURCE,
  }
  if (pagePath) profile.page_path = pagePath

  const utmSource = readSearchParam(search, 'utm_source')
  const utmMedium = readSearchParam(search, 'utm_medium')
  const utmCampaign = readSearchParam(search, 'utm_campaign')
  const entry = readSearchParam(search, 'entry')
  if (utmSource) profile.utm_source = utmSource
  if (utmMedium) profile.utm_medium = utmMedium
  if (utmCampaign) profile.utm_campaign = utmCampaign
  if (entry) profile.entry = entry

  return profile
}

export function bootPublicShowroomChannelTalk(context?: PublicShowroomChannelTalkContext) {
  const pluginKey = getChannelTalkPluginKey()
  if (!pluginKey || typeof window === 'undefined') return

  const profile = buildShowroomChannelTalkProfile(context)
  publicShowroomMountCount += 1
  if (publicShowroomMountCount > 1) {
    window.ChannelIO?.('updateUser', { profile })
    return
  }

  ensureChannelTalkStub()
  ensureChannelTalkScript()
  window.ChannelIO?.('boot', { pluginKey, profile })
}

export function openPublicShowroomChannelTalk(): boolean {
  if (typeof window === 'undefined' || !window.ChannelIO) return false
  window.ChannelIO('show')
  return true
}

export function shutdownPublicShowroomChannelTalk() {
  if (typeof window === 'undefined' || publicShowroomMountCount === 0) return

  publicShowroomMountCount -= 1
  if (publicShowroomMountCount > 0) return

  window.ChannelIO?.('shutdown')
}
