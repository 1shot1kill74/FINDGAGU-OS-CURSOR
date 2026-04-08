function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
}

function sanitizeFilenameSegment(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function downloadShowroomShortsFinalAsMp4(finalVideoUrl: string, filenameBase = 'showroom-shorts-final') {
  const trimmedUrl = finalVideoUrl.trim()
  if (!trimmedUrl) {
    throw new Error('최종 영상 URL이 없어 MP4 다운로드를 진행할 수 없습니다.')
  }

  const safeName = sanitizeFilenameSegment(filenameBase) || 'showroom-shorts-final'
  const response = await fetch(trimmedUrl)
  if (!response.ok) {
    throw new Error(`최종 MP4 파일 다운로드에 실패했습니다. (${response.status})`)
  }

  const mp4Blob = await response.blob()
  downloadBlob(mp4Blob, `${safeName}.mp4`)
}
