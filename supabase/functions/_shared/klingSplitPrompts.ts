/** Keep in sync with src/lib/showroomShortsTimelapsePrompt.ts */
export const KLING_SPLIT_SEGMENT_SECONDS = 5

/** API `negative_prompt` 전용 — 비상구/워터마크/모프 억제 */
export const SHOWROOM_SHORTS_COMMON_NEGATIVE_PROMPT = [
  "exit sign",
  "emergency exit",
  "emergency exit icon",
  "green safety sign",
  "running man exit symbol",
  "watermark",
  "logo",
  "overlay icon",
  "UI icon",
  "corner badge",
  "text overlay",
  "furniture morphing",
  "morphogenesis",
  "furniture rising from floor",
  "CGI morph",
  "floating furniture",
  "blurry",
  "low quality",
  "distorted",
].join(", ")

export const SHOWROOM_SHORTS_DEMOLISH_NEGATIVE_PROMPT = [
  SHOWROOM_SHORTS_COMMON_NEGATIVE_PROMPT,
  "empty-room magic vanish",
  "installing new desks",
  "finished after interior",
  "after image look",
].join(", ")

export const SHOWROOM_SHORTS_INSTALL_NEGATIVE_PROMPT = [
  SHOWROOM_SHORTS_COMMON_NEGATIVE_PROMPT,
  "desks popping up",
  "shelves growing",
  "object interpolation without people",
  "demolition",
  "dismantling old furniture",
  "magical remodel",
].join(", ")

export const SHOWROOM_SHORTS_DEMOLISH_PROMPT = `Create a realistic 5-second renovation DEMOLITION timelapse from the reference BEFORE image only.

Managed study cafe / learning space. Fixed wide camera matching the photo. Photoreal indoor light.

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

export const SHOWROOM_SHORTS_INSTALL_PROMPT = `Create a realistic 5-second renovation INSTALLATION timelapse.
START image = cleared empty room (last frame after demolition). END image = finished AFTER. Never start from AFTER.

Managed study cafe. Fixed wide camera matching the photos. Photoreal indoor light.

Show ONLY installation with workers visible the whole time:
1) cleared empty room (same camera as start image)
2) workers carry in new desks, partitions, shelves
3) workers set down, screw, and assemble every piece by hand
4) workers adjust layout and clean
5) final frame matches the AFTER image

Rules:
- keep the start-frame room geometry; only add furniture via workers
- workers on screen for all major changes
- every piece carried/assembled by people — never self-assemble
- no morph, no furniture rising from floor, no popping into existence
- do NOT show demolition of old furniture
- do NOT add exit signs, watermarks, logos, or UI icons`
