import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_INPUT = '/Users/findgagu/Downloads/IMPORT_THIS__N8N__GOOGLE_BLOG_ONLY.json'
const DEFAULT_OUTPUT = '/Users/findgagu/Desktop/FINDGAGU-OS-CURSOR/docs/content-system/IMPORT_THIS__N8N__NAVER_BLOG_ONLY__GMAIL_FINAL.json'
const SUCCESS_MAIL_MESSAGE = `=<html><body style="font-family: 'Malgun Gothic', sans-serif; line-height: 1.85; color: #222; max-width: 760px; margin: 0 auto; padding: 24px; font-size: 16px; background: #ffffff;"><main style="margin: 0 auto;"><h1 style="font-size: 30px; line-height: 1.42; margin: 0 0 20px; color: #111; word-break: keep-all;">{{ $json.title }}</h1><div style="font-size: 16px; line-height: 1.9; color: #222;">{{ $json.bodyHtml }}</div><section style="margin-top: 28px;"><p style="margin: 0 0 10px; font-size: 16px; line-height: 1.9; color: #222;">{{ Array.isArray($json.hashtags) ? $json.hashtags.join(' ') : $json.hashtags }}</p></section></main></body></html>`
const REVIEW_MAIL_MESSAGE = `=<html><body style="font-family: 'Malgun Gothic', sans-serif; line-height: 1.85; color: #222; max-width: 760px; margin: 0 auto; padding: 24px; font-size: 16px; background: #ffffff;"><section style="margin-bottom: 20px; padding: 14px 16px; border: 1px solid #fecaca; border-radius: 14px; background: #fef2f2;"><p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.04em; color: #b91c1c; text-transform: uppercase;">검토 필요</p><p style="margin: 0; color: #7f1d1d;">{{ $json.qualityReason || '검토 사유가 없습니다.' }}</p></section><main style="margin: 0 auto;"><h1 style="font-size: 30px; line-height: 1.42; margin: 0 0 20px; color: #111; word-break: keep-all;">{{ $json.title }}</h1><div style="font-size: 16px; line-height: 1.9; color: #222;">{{ $json.bodyHtml }}</div><section style="margin-top: 28px;"><p style="margin: 0 0 10px; font-size: 16px; line-height: 1.9; color: #222;">{{ Array.isArray($json.hashtags) ? $json.hashtags.join(' ') : $json.hashtags }}</p></section></main></body></html>`
const SUCCESS_MAIL_SUBJECT = `={{ \`[파인드가구][네이버 블로그 최종본][\${String($json.reviewedAt || '').replace('T', ' ').slice(0, 19)}] \${$json.title}\` }}`
const REVIEW_MAIL_SUBJECT = `={{ \`[파인드가구][네이버 블로그 검토 필요][\${String($json.reviewedAt || '').replace('T', ' ').slice(0, 19)}] \${$json.title}\` }}`

function deepMapStrings(value, mapper) {
  if (typeof value === 'string') {
    return mapper(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepMapStrings(item, mapper))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deepMapStrings(entry, mapper)])
    )
  }
  return value
}

function replaceAll(text) {
  let next = text

  const replacements = [
    ['Findgagu Showroom -> Google Blog Only', 'Findgagu Showroom -> Naver Blog Only'],
    ['findgaguShowroomGoogleBlogOnly', 'findgaguShowroomNaverBlogOnly'],
    ['findgagu-showroom-google-blog-only', 'findgagu-showroom-naver-blog-only'],
    ['Google Blog Preview', 'Naver Blog Preview'],
    ['구글 블로그 초안이 파인드가구 홈페이지 쇼룸 사례 원고로 적절한지 검수하라.', '네이버 블로그 초안이 파인드가구 홈페이지 쇼룸 사례 원고로 적절한지 검수하라.'],
    ['[파인드가구][블로그 미리보기]', '[파인드가구][네이버 블로그 미리보기]'],
  ]

  for (const [from, to] of replacements) {
    next = next.split(from).join(to)
  }

  next = next.replace(
    "'따라서 본문은 사진을 먼저 보고 읽기 쉬운 구조를 전제로 작성하세요.',",
    [
      "'따라서 본문은 사진을 먼저 보고 읽기 쉬운 구조를 전제로 작성하세요.',",
      "'출력은 네이버 블로그 발행 초안 기준으로 작성하세요.',",
      "'SEO, AEO, GEO를 함께 만족해야 하며 첫 문단 3~5줄 안에서 핵심 답을 먼저 제시하세요.',",
      "'제목과 도입부는 검색 사용자의 질문 의도에 바로 답하는 설명형 문장으로 시작하세요.',",
      "'대표 이미지로 가장 적합한 컷 1장을 함께 고르고, 그 이유도 짧게 설명하세요.',",
    ].join('\n  ')
  )

  next = next.replace(
    "'8. geo_points와 featured_answer에는 지역명만 나열하지 말고, 이 사례를 온라인에서 왜 더 살펴볼 가치가 있는지 문장형으로 설명한다.',",
    [
      "'8. geo_points와 featured_answer에는 지역명만 나열하지 말고, 이 사례를 온라인에서 왜 더 살펴볼 가치가 있는지 문장형으로 설명한다.',",
      "'9. representative_image_index는 현재 전달된 이미지 배열 기준 1부터 시작하는 번호로 반환한다.',",
      "'10. representative_image_reason은 왜 그 컷이 대표 이미지로 적합한지 한두 문장으로 작성한다.',",
      "'11. image_order는 네이버 블로그 본문에 추천하는 이미지 노출 순서를 1-based 배열로 반환한다.',",
    ].join('\n  ')
  )

  next = next.replace(
    '\'  "image_captions": ["string"],\',',
    [
      '\'  "image_captions": ["string"],\',',
      '\'  "representative_image_index": 1,\',',
      '\'  "representative_image_reason": "string",\',',
      '\'  "image_order": [1, 2, 3],\',',
    ].join('\n  ')
  )

  next = next.replace(
    "'8. 온라인 쇼룸/홈페이지 사례 비교 CTA가 과하지 않으면서 자연스럽게 이어지는지',",
    [
      "'8. 온라인 쇼룸/홈페이지 사례 비교 CTA가 과하지 않으면서 자연스럽게 이어지는지',",
      "'9. 네이버 블로그 특성상 첫 문단에서 핵심 답변과 검색 의도가 바로 연결되는지',",
      "'10. SEO/AEO/GEO 관점에서 정의형 문장, FAQ, 사례 문장이 인용 가능한 수준으로 정리됐는지',",
    ].join('\n  ')
  )

  next = next.replace(
    "content: '당신은 품질 검수 에디터다. 공개명 사용, 사진 우선 구조, 섹션 단순화, SEO/AEO/GEO, 이미지 품질, 그리고 쇼룸을 오프라인 전시장이 아닌 홈페이지 내 온라인 사례 쇼룸 의미로 썼는지까지 함께 보수적으로 평가하고 JSON만 반환한다.',",
    "content: '당신은 네이버 블로그 품질 검수 에디터다. 공개명 사용, 사진 우선 구조, 섹션 단순화, SEO/AEO/GEO, 첫 문단 답변 구조, 이미지 품질, 그리고 쇼룸을 오프라인 전시장이 아닌 홈페이지 내 온라인 사례 쇼룸 의미로 썼는지까지 함께 보수적으로 평가하고 JSON만 반환한다.',"
  )

  next = next.replace(
    'showroom-google-blog',
    'showroom-naver-blog'
  )

  return next
}

function updateNodeNames(workflow) {
  if (!Array.isArray(workflow.nodes)) return workflow

  workflow.nodes = workflow.nodes.map((node) => {
    if (!node || typeof node !== 'object') return node
    const nextNode = { ...node }
    if (nextNode.name === '쇼룸 블로그 생성 요청') nextNode.name = '쇼룸 네이버 블로그 생성 요청'
    if (nextNode.name === 'OpenAI 블로그 초안 생성') nextNode.name = 'OpenAI 네이버 블로그 초안 생성'
    if (nextNode.name === 'Gmail 초안 발송') nextNode.name = 'Gmail 네이버 초안 발송'
    if (nextNode.name === 'Gmail 검토 요청 발송') nextNode.name = 'Gmail 네이버 검토 요청 발송'
    if (nextNode.name === '초안 정리 및 검수 요청 준비' && typeof nextNode.parameters?.jsCode === 'string') {
      nextNode.parameters = {
        ...nextNode.parameters,
        jsCode: nextNode.parameters.jsCode
          .replace(
            "const selectedImages = Array.isArray(normalized.selectedImages) ? normalized.selectedImages : [];",
            `const selectedImages = Array.isArray(normalized.selectedImages) ? normalized.selectedImages : [];
const parseImageIndex = (value, max) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > max) return null;
  return parsed;
};
const parseImageOrder = (value, max) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((entry) => parseImageIndex(entry, max))
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
};
const representativeImageIndex =
  parseImageIndex(
    parsed.representative_image_index
    ?? parsed.representativeImageIndex
    ?? parsed.hero_image_index
    ?? parsed.heroImageIndex,
    selectedImages.length
  )
  ?? (selectedImages.length > 0 ? 1 : null);
const representativeImageReason = String(
  parsed.representative_image_reason
  ?? parsed.representativeImageReason
  ?? parsed.hero_image_reason
  ?? parsed.heroImageReason
  ?? ''
).trim();
const imageOrder = parseImageOrder(parsed.image_order ?? parsed.imageOrder, selectedImages.length);
const selectedImagesForRender = imageOrder.length > 0
  ? imageOrder.map((index) => selectedImages[index - 1]).filter(Boolean)
  : representativeImageIndex
    ? [
        selectedImages[representativeImageIndex - 1],
        ...selectedImages.filter((_image, index) => index !== representativeImageIndex - 1),
      ].filter(Boolean)
    : selectedImages;
const representativeImage = representativeImageIndex ? selectedImages[representativeImageIndex - 1] ?? null : null;`
          )
          .replace('const imageAlts = selectedImages.map((image, index) => truncate(imageAltCandidates[index] || image.default_alt || defaultAlt(image, index), 125));', 'const imageAlts = selectedImagesForRender.map((image, index) => truncate(imageAltCandidates[index] || image.default_alt || defaultAlt(image, index), 125));')
          .replace('const imageCaptions = selectedImages.map((image, index) => String(', 'const imageCaptions = selectedImagesForRender.map((image, index) => String(')
          .replace('const imageSection = selectedImages.length', 'const imageSection = selectedImagesForRender.length')
          .replace('${selectedImages.map((image, index) =>', '${selectedImagesForRender.map((image, index) =>')
          .replace(
            "    imageCaptions,\n    rawDraft: rawContent,\n    qualityRequestBody,",
            `    imageCaptions,
    representativeImageIndex,
    representativeImageReason,
    representativeImageLabel: representativeImageIndex ? \`\${representativeImageIndex}번 이미지\` : '',
    imageOrder,
    representativeImageUrl: representativeImage?.delivery_url ?? representativeImage?.url ?? '',
    rawDraft: rawContent,
    qualityRequestBody,`
          ),
      }
    }
    if (nextNode.name === 'Gmail 네이버 초안 발송' && nextNode.parameters) {
      nextNode.parameters = {
        ...nextNode.parameters,
        subject: SUCCESS_MAIL_SUBJECT,
        message: SUCCESS_MAIL_MESSAGE,
      }
    }
    if (nextNode.name === 'Gmail 네이버 검토 요청 발송' && nextNode.parameters) {
      nextNode.parameters = {
        ...nextNode.parameters,
        subject: REVIEW_MAIL_SUBJECT,
        message: REVIEW_MAIL_MESSAGE,
      }
    }
    return nextNode
  })

  if (workflow.connections && typeof workflow.connections === 'object') {
    const nextConnections = {}
    for (const [key, value] of Object.entries(workflow.connections)) {
      let nextKey = key
      if (key === '쇼룸 블로그 생성 요청') nextKey = '쇼룸 네이버 블로그 생성 요청'
      if (key === 'OpenAI 블로그 초안 생성') nextKey = 'OpenAI 네이버 블로그 초안 생성'
      if (key === 'Gmail 초안 발송') nextKey = 'Gmail 네이버 초안 발송'
      if (key === 'Gmail 검토 요청 발송') nextKey = 'Gmail 네이버 검토 요청 발송'

      nextConnections[nextKey] = JSON.parse(
        JSON.stringify(value)
          .split('"쇼룸 블로그 생성 요청"').join('"쇼룸 네이버 블로그 생성 요청"')
          .split('"OpenAI 블로그 초안 생성"').join('"OpenAI 네이버 블로그 초안 생성"')
          .split('"Gmail 초안 발송"').join('"Gmail 네이버 초안 발송"')
          .split('"Gmail 검토 요청 발송"').join('"Gmail 네이버 검토 요청 발송"')
      )
    }
    workflow.connections = nextConnections
  }

  return workflow
}

async function main() {
  const inputPath = process.argv[2] || DEFAULT_INPUT
  const outputPath = process.argv[3] || DEFAULT_OUTPUT

  const raw = await fs.readFile(inputPath, 'utf8')
  const parsed = JSON.parse(raw)
  const transformed = deepMapStrings(parsed, replaceAll)

  transformed.name = 'Findgagu Showroom -> Naver Blog Only'
  transformed.id = 'findgaguShowroomNaverBlogOnly'

  updateNodeNames(transformed)

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(transformed, null, 2)}\n`, 'utf8')

  process.stdout.write(`generated: ${outputPath}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
