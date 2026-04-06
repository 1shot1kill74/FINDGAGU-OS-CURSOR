type FreshnessEntry = {
  label: string
  actionLabel: string
  at: string
}

function toTimestamp(value: string) {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function formatActionLabels(labels: string[]) {
  if (labels.length <= 1) return labels[0] ?? '새로고침'
  if (labels.length === 2) return `${labels[0]} 또는 ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')} 또는 ${labels[labels.length - 1]}`
}

export function buildFreshnessHint(
  entries: FreshnessEntry[],
  staleThresholdMinutes = 5
) {
  const normalized = entries
    .map((entry) => {
      const timestamp = toTimestamp(entry.at)
      return timestamp === null ? null : { ...entry, timestamp }
    })
    .filter(Boolean) as Array<FreshnessEntry & { timestamp: number }>

  if (normalized.length < 2) {
    return {
      tone: 'slate' as const,
      message: '새로고침 비교 기준이 충분하지 않습니다.',
    }
  }

  const sorted = [...normalized].sort((a, b) => b.timestamp - a.timestamp)
  const newest = sorted[0]!
  const oldest = sorted[sorted.length - 1]!
  const spreadMinutes = Math.round((newest.timestamp - oldest.timestamp) / 60000)

  if (spreadMinutes < staleThresholdMinutes) {
    return {
      tone: 'slate' as const,
      message: '기준 시각 차이가 크지 않습니다. 추가 새로고침은 필요할 때만 진행하면 됩니다.',
    }
  }

  const staleTargets = sorted.filter(
    (entry) => newest.timestamp - entry.timestamp >= staleThresholdMinutes * 60000
  )

  if (staleTargets.length === 0) {
    return {
      tone: 'slate' as const,
      message: '기준 시각 차이가 크지 않습니다. 추가 새로고침은 필요할 때만 진행하면 됩니다.',
    }
  }

  const staleLabels = staleTargets.map((entry) => entry.label).join(', ')
  const actionLabels = formatActionLabels(staleTargets.map((entry) => entry.actionLabel))

  return {
    tone: 'amber' as const,
    message: `${staleLabels}이(가) 더 오래되었습니다. ${actionLabels}을(를) 권장합니다.`,
  }
}
