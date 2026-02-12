import { useState, useEffect } from 'react'
import { getColorChips, getColorOptionsForSelect, type ColorChip } from '@/lib/colorChips'

export function useColorChips(): {
  chips: ColorChip[]
  options: { group: string; value: string; label: string }[]
  isLoading: boolean
} {
  const [chips, setChips] = useState<ColorChip[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getColorChips().then((list) => {
      if (!cancelled) {
        setChips(list)
        setIsLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const options = getColorOptionsForSelect(chips)
  return { chips, options, isLoading }
}
