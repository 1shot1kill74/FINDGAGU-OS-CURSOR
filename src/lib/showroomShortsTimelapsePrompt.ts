/**
 * BA 타임랩스 프롬프트.
 * Kling prompt / negative_prompt 한도 각 2500자.
 * - standard: 철거 5초 → 마지막 프레임 → 설치 5초 → concat
 * - empty_room: 구도 맞춤 3초 → 마지막 프레임 → 설치 8초 → concat
 */
export const KLING_PROMPT_MAX_CHARS = 2500
export const KLING_SPLIT_SEGMENT_SECONDS = 5
export const KLING_EMPTY_ALIGN_SECONDS = 3
export const KLING_EMPTY_INSTALL_SECONDS = 8

/** job.prompt_text 앞에 넣어 empty_room 모드를 표시 (마이그레이션 없이) */
export const EMPTY_ROOM_TIMELAPSE_MARKER = '[empty_room_v1]'

/**
 * 작업자 인상. 파인드가구는 국내 현장만 시공해서 외국인 크루가 잡히면 영상이 겉돈다.
 * Kling은 국적을 얼굴·복장 묘사로 잡으므로 둘 다 적고, negative로 한 번 더 막는다.
 */
export const SHOWROOM_SHORTS_KOREAN_CREW_LINE =
  'Crew: 2-3 Korean installers — Korean East Asian men in their 30s-40s, black hair, clean-shaven — '
  + 'wearing dark navy or gray Korean-style work uniform with a company work vest, cotton work gloves, '
  + 'and safety shoes. This is a domestic South Korean interior site.'

/** API `negative_prompt` 전용 — 비상구/워터마크/모프/외국인 크루 억제 */
export const SHOWROOM_SHORTS_COMMON_NEGATIVE_PROMPT = [
  'non-Asian workers',
  'Western crew',
  'European construction crew',
  'Caucasian faces',
  'blonde hair',
  'blue eyes',
  'foreign-language text on uniform',
  'exit sign',
  'emergency exit',
  'emergency exit icon',
  'green safety sign',
  'running man exit symbol',
  'watermark',
  'logo',
  'overlay icon',
  'UI icon',
  'corner badge',
  'text overlay',
  'furniture morphing',
  'morphogenesis',
  'furniture rising from floor',
  'CGI morph',
  'floating furniture',
  'blurry',
  'low quality',
  'distorted',
].join(', ')

export const SHOWROOM_SHORTS_DEMOLISH_NEGATIVE_PROMPT = [
  SHOWROOM_SHORTS_COMMON_NEGATIVE_PROMPT,
  'empty-room magic vanish',
  'installing new desks',
  'finished after interior',
  'after image look',
].join(', ')

export const SHOWROOM_SHORTS_INSTALL_NEGATIVE_PROMPT = [
  SHOWROOM_SHORTS_COMMON_NEGATIVE_PROMPT,
  'desks popping up',
  'shelves growing',
  'object interpolation without people',
  'demolition',
  'dismantling old furniture',
  'magical remodel',
  'temporary furniture',
  'furniture that vanishes',
  'hallucinated cabinet',
  'locker not in after image',
  'wrong furniture on the side',
  'objects appearing then disappearing',
  'ghost furniture',
  'flickering cabinet',
].join(', ')

export const SHOWROOM_SHORTS_ALIGN_NEGATIVE_PROMPT = [
  SHOWROOM_SHORTS_COMMON_NEGATIVE_PROMPT,
  'demolition',
  'dismantling furniture',
  'workers carrying out desks',
  'debris',
  'construction mess',
  'installing new furniture',
  'finished after interior',
  'after image look',
  'hallucinated furniture',
  'temporary cabinet',
  'objects appearing then disappearing',
].join(', ')

export const SHOWROOM_SHORTS_EMPTY_INSTALL_NEGATIVE_PROMPT = [
  SHOWROOM_SHORTS_INSTALL_NEGATIVE_PROMPT,
  'fake demolition',
  'clearing already empty room',
  'removing furniture that is not there',
  'extra locker on the right',
  'storage cabinet not in after photo',
  'mid-clip prop that disappears before the end',
].join(', ')

/** 철거 5초 — Before만 사용 (image_tail 없음) */
export const SHOWROOM_SHORTS_DEMOLISH_PROMPT = `Create a realistic 5-second renovation DEMOLITION timelapse from the reference BEFORE image only.

Managed study cafe / learning space. Fixed wide camera matching the photo. Photoreal indoor light.

${SHOWROOM_SHORTS_KOREAN_CREW_LINE}

Show ONLY demolition with workers visible the whole time:
1) before space with old desks/partitions
2) workers enter with tools
3) workers dismantle and carry out old furniture by hand
4) workers remove debris and sweep
5) end on a mostly cleared empty room (same walls/camera)

Rules:
- workers must stay on screen during changes
- furniture moves only because people lift/carry it
- no morph, no rising from floor, no self-disappearing furniture
- do NOT install new furniture; do NOT jump to a finished after look
- do NOT add exit signs, watermarks, logos, or UI icons`

/** 설치 5초 — 철거 마지막 프레임 시작 + After 종료 */
export const SHOWROOM_SHORTS_INSTALL_PROMPT = `Create a realistic 5-second renovation INSTALLATION timelapse.
START image = cleared empty room (last frame after demolition). END image = finished AFTER. Never start from AFTER.

Managed study cafe. Fixed wide camera matching the photos. Photoreal indoor light.

${SHOWROOM_SHORTS_KOREAN_CREW_LINE}

Show ONLY installation with workers visible the whole time:
1) cleared empty room (same camera as start image)
2) workers carry in ONLY furniture that exists in the AFTER image
3) workers set down, screw, and assemble every piece by hand
4) workers adjust layout and clean
5) final frame matches the AFTER image — same pieces, same places

Rules:
- keep the start-frame room geometry; only add furniture via workers
- install ONLY items visible in the AFTER reference (desks/partitions/shelves as shown there)
- once a piece is placed, it must stay until the end — never vanish, fade, or get replaced mid-clip
- no temporary / wrong / extra cabinets, lockers, or props that are not in AFTER
- workers on screen for all major changes
- every piece carried/assembled by people — never self-assemble
- no morph, no furniture rising from floor, no popping into existence
- do NOT show demolition of old furniture
- do NOT add exit signs, watermarks, logos, or UI icons`

/** 빈 방 구도 맞춤 3초 — Before만. 철거·설치 금지 */
export const SHOWROOM_SHORTS_ALIGN_PROMPT = `Create a realistic 3-second CAMERA FRAMING settle from the reference BEFORE image only.

The BEFORE room is ALREADY EMPTY / CLEARED. Managed study cafe / learning space. Photoreal indoor light.

Show ONLY a subtle camera/framing alignment:
1) start exactly on the BEFORE empty room
2) very slight pan/tilt/zoom to settle composition as if matching the final install camera
3) end on a still empty room — same walls, floor, windows; still no furniture

Rules:
- room stays empty the entire time
- NO demolition, NO workers removing furniture, NO debris, NO fake clear-out
- NO installing desks/shelves/cabinets; NO jump to a finished after look
- NO hallucinated temporary furniture that appears then disappears
- keep motion minimal and calm (about 2–3 seconds of settle)
- do NOT add exit signs, watermarks, logos, or UI icons`

/** 빈 방 설치 8초 — 구도 맞춤 마지막 프레임 시작 + After 종료 */
export const SHOWROOM_SHORTS_EMPTY_INSTALL_PROMPT = `Create a realistic 8-second renovation INSTALLATION timelapse.
START image = already-empty room (last frame after framing settle). END image = finished AFTER. Never start from AFTER.

Managed study cafe. Fixed wide camera matching the photos. Photoreal indoor light.

${SHOWROOM_SHORTS_KOREAN_CREW_LINE}

Show ONLY installation with workers visible the whole time:
1) empty cleared room (same camera as start image)
2) workers carry in ONLY furniture that exists in the AFTER image
3) workers set down, screw, and assemble every piece by hand
4) workers adjust layout and clean
5) final frame matches the AFTER image — same pieces, same places

Rules:
- keep the start-frame room geometry; only add furniture via workers
- install ONLY items visible in the AFTER reference; do not invent side cabinets/lockers not in AFTER
- once a piece is placed, it must stay until the end — never vanish, fade out, or swap mid-clip
- no temporary / wrong / extra props that appear then disappear
- workers on screen for all major changes
- every piece carried/assembled by people — never self-assemble
- no morph, no furniture rising from floor, no popping into existence
- do NOT show demolition or clearing of old furniture (room starts empty)
- do NOT add exit signs, watermarks, logos, or UI icons`
/** UI/레거시용 요약 (실제 클링 호출은 위 두 프롬프트 사용) */
export const SHOWROOM_SHORTS_TIMELAPSE_PROMPT = `Sequential 5s demolish + 5s install worker timelapse (stitched to 10s).
Demolish from BEFORE, then install starts from demolish last frame and ends at AFTER.
No morph / no furniture rising from floor.`

/** 빈 방 모드 UI/마커용 요약 */
export const SHOWROOM_SHORTS_EMPTY_ROOM_TIMELAPSE_PROMPT = `${EMPTY_ROOM_TIMELAPSE_MARKER} Sequential ~3s framing settle + 8s install (no demolish).
BEFORE is already empty. Align camera briefly, then workers install ending at AFTER.`

export function isEmptyRoomTimelapsePrompt(promptText: string | null | undefined): boolean {
  return (promptText ?? '').includes(EMPTY_ROOM_TIMELAPSE_MARKER)
}

function assertPromptLimit(name: string, prompt: string) {
  if (prompt.length > KLING_PROMPT_MAX_CHARS) {
    throw new Error(`${name} is ${prompt.length} chars; Kling max is ${KLING_PROMPT_MAX_CHARS}`)
  }
}

assertPromptLimit('SHOWROOM_SHORTS_DEMOLISH_PROMPT', SHOWROOM_SHORTS_DEMOLISH_PROMPT)
assertPromptLimit('SHOWROOM_SHORTS_INSTALL_PROMPT', SHOWROOM_SHORTS_INSTALL_PROMPT)
assertPromptLimit('SHOWROOM_SHORTS_ALIGN_PROMPT', SHOWROOM_SHORTS_ALIGN_PROMPT)
assertPromptLimit('SHOWROOM_SHORTS_EMPTY_INSTALL_PROMPT', SHOWROOM_SHORTS_EMPTY_INSTALL_PROMPT)
assertPromptLimit('SHOWROOM_SHORTS_DEMOLISH_NEGATIVE_PROMPT', SHOWROOM_SHORTS_DEMOLISH_NEGATIVE_PROMPT)
assertPromptLimit('SHOWROOM_SHORTS_INSTALL_NEGATIVE_PROMPT', SHOWROOM_SHORTS_INSTALL_NEGATIVE_PROMPT)
assertPromptLimit('SHOWROOM_SHORTS_ALIGN_NEGATIVE_PROMPT', SHOWROOM_SHORTS_ALIGN_NEGATIVE_PROMPT)
assertPromptLimit('SHOWROOM_SHORTS_EMPTY_INSTALL_NEGATIVE_PROMPT', SHOWROOM_SHORTS_EMPTY_INSTALL_NEGATIVE_PROMPT)
assertPromptLimit('SHOWROOM_SHORTS_TIMELAPSE_PROMPT', SHOWROOM_SHORTS_TIMELAPSE_PROMPT)
assertPromptLimit('SHOWROOM_SHORTS_EMPTY_ROOM_TIMELAPSE_PROMPT', SHOWROOM_SHORTS_EMPTY_ROOM_TIMELAPSE_PROMPT)
