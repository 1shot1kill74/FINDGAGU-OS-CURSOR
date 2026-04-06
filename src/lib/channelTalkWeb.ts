import { getChannelTalkPluginKey } from '@/lib/config'

declare global {
  interface Window {
    ChannelIO?: (...args: unknown[]) => void
  }
}

const CHANNEL_TALK_SCRIPT_ID = 'channel-talk-plugin-script'
const CHANNEL_TALK_SCRIPT_SRC = 'https://cdn.channel.io/plugin/ch-plugin-web.js'

let publicShowroomMountCount = 0

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

export function bootPublicShowroomChannelTalk() {
  const pluginKey = getChannelTalkPluginKey()
  if (!pluginKey || typeof window === 'undefined') return

  publicShowroomMountCount += 1
  if (publicShowroomMountCount > 1) return

  ensureChannelTalkStub()
  ensureChannelTalkScript()
  window.ChannelIO?.('boot', { pluginKey })
}

export function shutdownPublicShowroomChannelTalk() {
  if (typeof window === 'undefined' || publicShowroomMountCount === 0) return

  publicShowroomMountCount -= 1
  if (publicShowroomMountCount > 0) return

  window.ChannelIO?.('shutdown')
}
