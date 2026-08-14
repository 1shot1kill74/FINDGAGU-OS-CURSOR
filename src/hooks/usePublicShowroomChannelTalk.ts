import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  bootPublicShowroomChannelTalk,
  shutdownPublicShowroomChannelTalk,
} from '@/lib/channelTalkWeb'

export function usePublicShowroomChannelTalk(enabled = true) {
  const location = useLocation()

  useEffect(() => {
    if (!enabled) return

    bootPublicShowroomChannelTalk({
      pagePath: location.pathname,
      search: location.search,
    })
    return () => {
      shutdownPublicShowroomChannelTalk()
    }
  }, [enabled, location.pathname, location.search])
}
