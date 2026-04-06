import { useEffect } from 'react'
import {
  bootPublicShowroomChannelTalk,
  shutdownPublicShowroomChannelTalk,
} from '@/lib/channelTalkWeb'

export function usePublicShowroomChannelTalk(enabled = true) {
  useEffect(() => {
    if (!enabled) return

    bootPublicShowroomChannelTalk()
    return () => {
      shutdownPublicShowroomChannelTalk()
    }
  }, [enabled])
}
