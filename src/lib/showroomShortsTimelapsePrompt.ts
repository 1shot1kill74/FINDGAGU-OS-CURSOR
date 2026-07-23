/**
 * BA 타임랩스 공통 프롬프트.
 * Kling API prompt 한도: 0–2500자. 이 상수를 바꿀 때 반드시 길이 확인할 것.
 * 목표: 작업자가 계속 일하면서 가구가 설치되는 공사 타임랩스 (채널 숏츠 톤).
 * 금지: morph / 가구가 바닥에서 솟아오름.
 */
export const KLING_PROMPT_MAX_CHARS = 2500

export const SHOWROOM_SHORTS_TIMELAPSE_PROMPT = `Create a realistic 10-second renovation timelapse from exactly two reference images.
Image 1 = BEFORE. Image 2 = AFTER. Start from image 1, end at image 2. Never start from AFTER.

Managed study cafe / learning space. Keep camera framing, walls, and lighting consistent with image 1 until workers change them. Final frame must match image 2.

Timeline:
1) before space
2) workers enter with tools/parts
3) workers dismantle old desks, partitions, shelves by hand
4) workers remove debris and clean (stay visible)
5) workers carry in, set down, screw, and assemble every new piece
6) workers clean up
7) after reveal matching image 2

Must feel like a continuous construction timelapse: workers on screen during demo and install. Furniture changes ONLY because people physically move/install it. Documentary site-install look, not CGI morph.

Rules:
- major changes only while workers are visibly working
- no skip from before to after; no blending the two images
- no furniture/walls morphing, teleporting, sliding, rising from the floor, growing, popping in, or self-assembling
- no magical swap, floating objects, warped geometry
- drive all change with human labor: lift, carry, drill, assemble, install, dismantle, clean
- fixed wide camera, photoreal indoor light, smooth timelapse pacing

Negative: furniture morphing, morphogenesis, furniture rising from floor, desks popping up, shelves growing, empty-room magic remodel, floating furniture, CGI morph, object interpolation without people, after as start frame, before/after blend, surreal melt, ghost workers`

if (SHOWROOM_SHORTS_TIMELAPSE_PROMPT.length > KLING_PROMPT_MAX_CHARS) {
  throw new Error(
    `SHOWROOM_SHORTS_TIMELAPSE_PROMPT is ${SHOWROOM_SHORTS_TIMELAPSE_PROMPT.length} chars; Kling max is ${KLING_PROMPT_MAX_CHARS}`,
  )
}
