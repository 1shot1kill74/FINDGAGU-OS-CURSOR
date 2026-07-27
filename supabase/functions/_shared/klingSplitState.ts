export type SplitSegment = {
  taskId: string
  status?: string
  url?: string | null
}

export type SplitKlingState = {
  mode: "split_demo_install_v1"
  /** 철거 마지막 프레임 → 설치 시작 이미지 */
  startFrameUrl?: string | null
  demo: SplitSegment
  install: SplitSegment
}

export function encodeSplitState(state: SplitKlingState): string {
  return JSON.stringify(state)
}

export function parseSplitState(raw: unknown): SplitKlingState | null {
  if (typeof raw !== "string" || !raw.trim().startsWith("{")) return null
  try {
    const parsed = JSON.parse(raw) as Partial<SplitKlingState>
    if (parsed?.mode !== "split_demo_install_v1") return null
    const demoTaskId = typeof parsed.demo?.taskId === "string" ? parsed.demo.taskId.trim() : ""
    if (!demoTaskId) return null
    const installTaskId = typeof parsed.install?.taskId === "string" ? parsed.install.taskId.trim() : ""
    return {
      mode: "split_demo_install_v1",
      startFrameUrl:
        typeof parsed.startFrameUrl === "string" && parsed.startFrameUrl.trim()
          ? parsed.startFrameUrl.trim()
          : null,
      demo: {
        taskId: demoTaskId,
        status: typeof parsed.demo?.status === "string" ? parsed.demo.status : undefined,
        url: typeof parsed.demo?.url === "string" ? parsed.demo.url : null,
      },
      install: {
        taskId: installTaskId,
        status: typeof parsed.install?.status === "string" ? parsed.install.status : undefined,
        url: typeof parsed.install?.url === "string" ? parsed.install.url : null,
      },
    }
  } catch {
    return null
  }
}

export function isSplitReady(state: SplitKlingState) {
  return Boolean(state.demo.url && state.install.url)
}

export function needsInstallStart(state: SplitKlingState) {
  return Boolean(state.demo.url && !state.install.taskId)
}
