export type SplitSegment = {
  taskId: string
  status?: string
  url?: string | null
  duration?: number
}

/** 철거 5초 + 설치 5초 */
export type DemoInstallSplitState = {
  mode: "split_demo_install_v1"
  /** 철거 마지막 프레임 → 설치 시작 이미지 */
  startFrameUrl?: string | null
  demo: SplitSegment
  install: SplitSegment
}

/** 빈 방: 구도 맞춤 3초 + 설치 8초 */
export type AlignInstallSplitState = {
  mode: "split_align_install_v1"
  /** 구도 맞춤 마지막 프레임 → 설치 시작 이미지 */
  startFrameUrl?: string | null
  align: SplitSegment
  install: SplitSegment
}

export type SplitKlingState = DemoInstallSplitState | AlignInstallSplitState

export function encodeSplitState(state: SplitKlingState): string {
  return JSON.stringify(state)
}

function parseSegment(raw: unknown): SplitSegment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const taskId = typeof row.taskId === "string" ? row.taskId.trim() : ""
  if (!taskId) return null
  return {
    taskId,
    status: typeof row.status === "string" ? row.status : undefined,
    url: typeof row.url === "string" ? row.url : null,
    duration: typeof row.duration === "number" && Number.isFinite(row.duration) ? row.duration : undefined,
  }
}

export function parseSplitState(raw: unknown): SplitKlingState | null {
  if (typeof raw !== "string" || !raw.trim().startsWith("{")) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const mode = parsed?.mode
    const startFrameUrl =
      typeof parsed.startFrameUrl === "string" && parsed.startFrameUrl.trim()
        ? parsed.startFrameUrl.trim()
        : null

    if (mode === "split_align_install_v1") {
      const align = parseSegment(parsed.align)
      if (!align) return null
      const install = parseSegment(parsed.install) ?? { taskId: "", status: "pending", url: null }
      return {
        mode: "split_align_install_v1",
        startFrameUrl,
        align,
        install: {
          taskId: install.taskId,
          status: install.status,
          url: install.url ?? null,
          duration: install.duration,
        },
      }
    }

    if (mode === "split_demo_install_v1") {
      const demo = parseSegment(parsed.demo)
      if (!demo) return null
      const install = parseSegment(parsed.install) ?? { taskId: "", status: "pending", url: null }
      return {
        mode: "split_demo_install_v1",
        startFrameUrl,
        demo,
        install: {
          taskId: install.taskId,
          status: install.status,
          url: install.url ?? null,
          duration: install.duration,
        },
      }
    }

    return null
  } catch {
    return null
  }
}

export function isDemoInstallSplit(state: SplitKlingState): state is DemoInstallSplitState {
  return state.mode === "split_demo_install_v1"
}

export function isAlignInstallSplit(state: SplitKlingState): state is AlignInstallSplitState {
  return state.mode === "split_align_install_v1"
}

/** 첫 세그먼트(철거 또는 구도 맞춤) */
export function getFirstSegment(state: SplitKlingState): SplitSegment {
  return isAlignInstallSplit(state) ? state.align : state.demo
}

export function isSplitReady(state: SplitKlingState) {
  const first = getFirstSegment(state)
  return Boolean(first.url && state.install.url)
}

export function needsInstallStart(state: SplitKlingState) {
  const first = getFirstSegment(state)
  return Boolean(first.url && !state.install.taskId)
}

export function getFirstSegmentLabel(state: SplitKlingState): "demo" | "align" {
  return isAlignInstallSplit(state) ? "align" : "demo"
}
