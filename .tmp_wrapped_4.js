(() => {
const normalized = $('입력 정규화 및 샘플 보강').first().json;
const response = $input.first().json ?? {};

const stripCodeFences = (value) => {
  if (typeof value !== 'string') return '';
  return value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
};

const rawContent = stripCodeFences(response.choices?.[0]?.message?.content ?? '');

let parsed;
try {
  parsed = JSON.parse(rawContent);
} catch (error) {
  parsed = {
    title: normalized.titleHint,
    summary: '',
    featured_answer: '',
    before_after_points: [],
    body_html: rawContent,
    social_text: '',
    hashtags: [],
    seo_keywords: [],
    geo_points: [],
    faq_qas: [],
    image_alts: [],
    image_captions: [],
    human_touch: '',
  };
}

const toTextArray = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  return [];
};

const normalizeFaqs = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      question: String(item?.question ?? item?.q ?? '').trim(),
      answer: String(item?.answer ?? item?.a ?? '').trim(),
    }))
    .filter((item) => item.question && item.answer)
    .slice(0, 5);
};

const truncate = (value, max = 125) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeAttr = (value) => escapeHtml(value).replace(/\n/g, ' ');

const emailImageStyle = 'width: 100%; max-width: 640px; height: auto; display: block; margin: 16px auto; border-radius: 18px; -webkit-user-select: none; user-select: none; -webkit-user-drag: none;';
const figureStyle = 'margin: 0 0 24px; text-align: center;';
const captionStyle = 'font-size: 12px; line-height: 1.7; color: #555; text-align: center; margin-top: 8px; padding: 0 4px;';
const sectionStyle = 'margin: 0 0 28px;';
const headingStyle = 'font-size: 22px; line-height: 1.45; margin: 0 0 14px; color: #111;';
const subHeadingStyle = 'font-size: 19px; line-height: 1.5; margin: 0 0 12px; color: #111;';
const paragraphStyle = 'font-size: 16px; line-height: 1.9; color: #222; margin: 0 0 16px;';
const listStyle = 'font-size: 16px; line-height: 1.9; color: #222; padding-left: 20px; margin: 0 0 16px;';
const listItemStyle = 'margin: 0 0 10px;';
const quoteStyle = 'font-size: 15px; line-height: 1.85; color: #374151; margin: 0 0 18px; padding: 14px 16px; border-left: 3px solid #d1d5db; background: #f8fafc;';

const mergeInlineStyle = (tag, styleText) => {
  const styleRegex = /\sstyle\s*=\s*([\"\'])(.*?)\1/i;
  if (styleRegex.test(tag)) {
    return tag.replace(styleRegex, (_match, quote, styles) => {
      const merged = `${String(styles ?? '').trim().replace(/;?$/, ';')} ${styleText}`.trim();
      return ` style=${quote}${merged}${quote}`;
    });
  }
  return tag.replace(/\s*\/?>$/, (ending) => ` style=\"${styleText}\"${ending.includes('/') ? ' />' : '>'}`);
};

const enforceEmailImageSizing = (html) => {
  if (typeof html !== 'string' || !html.trim()) return '';
  return html
    .replace(/<section\b[^>]*>/gi, (tag) => mergeInlineStyle(tag, sectionStyle))
    .replace(/<article\b[^>]*>/gi, (tag) => mergeInlineStyle(tag, sectionStyle))
    .replace(/<h2\b[^>]*>/gi, (tag) => mergeInlineStyle(tag, headingStyle))
    .replace(/<h3\b[^>]*>/gi, (tag) => mergeInlineStyle(tag, subHeadingStyle))
    .replace(/<p\b[^>]*>/gi, (tag) => mergeInlineStyle(tag, paragraphStyle))
    .replace(/<ul\b[^>]*>/gi, (tag) => mergeInlineStyle(tag, listStyle))
    .replace(/<ol\b[^>]*>/gi, (tag) => mergeInlineStyle(tag, listStyle))
    .replace(/<li\b[^>]*>/gi, (tag) => mergeInlineStyle(tag, listItemStyle))
    .replace(/<blockquote\b[^>]*>/gi, (tag) => mergeInlineStyle(tag, quoteStyle))
    .replace(/<figure\b[^>]*>/gi, (tag) => mergeInlineStyle(tag, figureStyle))
    .replace(/<figcaption\b[^>]*>/gi, (tag) => mergeInlineStyle(tag, captionStyle))
    .replace(/<img\b[^>]*>/gi, (tag) => {
      let nextTag = tag
        .replace(/\swidth\s*=\s*([\"\']).*?\1/gi, '')
        .replace(/\sheight\s*=\s*([\"\']).*?\1/gi, '');

      nextTag = mergeInlineStyle(nextTag, emailImageStyle);

      if (!/\swidth\s*=\s*([\"\']).*?\1/i.test(nextTag)) {
        nextTag = nextTag.replace(/<img/i, '<img width=\"640\"');
      }

      if (!/\salt\s*=\s*([\"\']).*?\1/i.test(nextTag)) {
        nextTag = nextTag.replace(/<img/i, '<img alt=\"현장 사진\"');
      }

      if (!/\sloading\s*=\s*([\"\']).*?\1/i.test(nextTag)) {
        nextTag = nextTag.replace(/<img/i, '<img loading=\"lazy\"');
      }

      if (!/\sdraggable\s*=\s*([\"\']).*?\1/i.test(nextTag)) {
        nextTag = nextTag.replace(/<img/i, '<img draggable=\"false\"');
      }

      return nextTag;
    });
};

const title = parsed.title ?? parsed.blog_title ?? normalized.titleHint;
const summary = parsed.summary ?? parsed.excerpt ?? '';
const featuredAnswer = parsed.featured_answer ?? parsed.featuredAnswer ?? summary;
const beforeAfterPoints = normalized.beforeAfterAvailable
  ? toTextArray(parsed.before_after_points ?? parsed.beforeAfterPoints).slice(0, 5)
  : [];
const socialText = parsed.social_text ?? parsed.socialText ?? '';
const hashtags = toTextArray(parsed.hashtags).slice(0, 3);
const seoKeywords = toTextArray(parsed.seo_keywords ?? parsed.seoKeywords);
const geoPoints = toTextArray(parsed.geo_points ?? parsed.geoPoints).slice(0, 5);
const faqQas = normalizeFaqs(parsed.faq_qas ?? parsed.faqQas);
const humanTouch = String(parsed.human_touch ?? parsed.humanTouch ?? '').trim();
const selectedImages = Array.isArray(normalized.selectedImages) ? normalized.selectedImages : [];
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
const representativeImage = representativeImageIndex ? selectedImages[representativeImageIndex - 1] ?? null : null;
const rewriteSelectedImageUrls = (html) => {
  if (typeof html !== 'string' || !html.trim()) return '';
  return selectedImages.reduce((acc, image) => {
    const originalUrl = String(image.url ?? '').trim();
    const protectedUrl = String(image.delivery_url ?? image.url ?? '').trim();
    if (!originalUrl || !protectedUrl || originalUrl === protectedUrl) return acc;
    return acc.split(originalUrl).join(protectedUrl);
  }, html);
};

const defaultAlt = (image, index) => {
  const roleLabel = image.before_after_role === 'before'
    ? '비포어'
    : image.before_after_role === 'after'
      ? '애프터'
      : '현장';
  const parts = [normalized.siteName, roleLabel, normalized.locationKr, normalized.businessTypeKr, image.product_name, image.color_name, image.caption]
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
  return truncate(parts.join(' - ') || `${normalized.siteName} ${roleLabel} 이미지 ${index + 1}`, 110);
};

const imageAltCandidates = toTextArray(parsed.image_alts ?? parsed.imageAlts ?? parsed.alt_texts ?? parsed.altTexts);
const imageCaptionCandidates = toTextArray(parsed.image_captions ?? parsed.imageCaptions ?? parsed.captions);
const imageAlts = selectedImagesForRender.map((image, index) => truncate(imageAltCandidates[index] || image.default_alt || defaultAlt(image, index), 125));
const imageCaptions = selectedImagesForRender.map((image, index) => String(
  imageCaptionCandidates[index]
  || image.caption
  || `${image.before_after_role === 'before' ? '비포어' : '애프터'} 이미지 ${index + 1}`
).trim());

const bodyHtmlRaw = parsed.body_html ?? parsed.bodyHtml ?? parsed.blog_body ?? rawContent;
let coreBodyHtml = typeof bodyHtmlRaw === 'string' && bodyHtmlRaw.trim()
  ? enforceEmailImageSizing(rewriteSelectedImageUrls(bodyHtmlRaw.trim()))
  : `<p>${escapeHtml(String(bodyHtmlRaw ?? '')).replace(/\n/g, '</p><p>')}</p>`;

if (humanTouch && !coreBodyHtml.includes(humanTouch)) {
  coreBodyHtml = `${coreBodyHtml}\n\n<section class=\"human-touch\"><p>${escapeHtml(humanTouch)}</p></section>`;
}

const imageSection = selectedImagesForRender.length
  ? `<section class="showroom-images"><h2>${normalized.beforeAfterAvailable ? '비포어 · 애프터 사진' : '현장 사진'}</h2>${selectedImagesForRender.map((image, index) => `<figure style="${figureStyle}"><img src="${escapeAttr(image.delivery_url ?? image.url)}" alt="${escapeAttr(imageAlts[index])}" width="640" loading="lazy" draggable="false" style="${emailImageStyle}" /><figcaption style="${captionStyle}">${escapeHtml(imageCaptions[index])}</figcaption></figure>`).join('')}</section>`
  : '';

const comparisonSection = beforeAfterPoints.length
  ? `<section class=\"before-after-summary\"><h2>달라진 점</h2><ul>${beforeAfterPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`
  : '';

const geoSection = featuredAnswer || geoPoints.length
  ? `<section class="geo-summary"><h2>이 현장 먼저 보기</h2>${featuredAnswer ? `<p>${escapeHtml(featuredAnswer)}</p>` : ''}${geoPoints.length ? geoPoints.map((item) => `<p>${escapeHtml(item)}</p>`).join('') : ''}</section>`
  : '';

const faqSection = faqQas.length
  ? `<section class=\"faq-section\"><h2>자주 묻는 질문</h2>${faqQas.map((item) => `<article><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></article>`).join('')}</section>`
  : '';

const hasImageTag = /<img\b/i.test(coreBodyHtml);
const bodyHtml = enforceEmailImageSizing([
  hasImageTag ? '' : imageSection,
  geoSection,
  comparisonSection,
  coreBodyHtml,
  faqSection,
].filter(Boolean).join('\n\n'));

const qualityPrompt = [
  '다음 네이버 블로그 초안이 파인드가구 홈페이지 쇼룸 사례 원고로 적절한지 검수하라.',
  '평가 기준:',
  '1. 공개명으로 external/public 이름만 쓰고 내부 현장명은 드러나지 않는지',
  '2. 사진 우선 구조가 자연스럽게 보이는지',
  '3. 섹션 수가 과하지 않고 읽기 쉬운지',
  '4. 제목과 요약의 명확성 및 SEO 키워드 반영',
  '4-1. 전달받은 SEO 설명이 있으면 제목/요약/본문의 검색 문맥에 자연스럽게 반영되었는지',
  '5. featured answer / FAQ 등 AEO 구조 적절성',
  '5-1. geo_points가 지역 키워드 나열이 아니라 문장형 정보로 작성되었는지',
  '6. before/after가 있으면 before 추정 금지와 after 메타 활용이 지켜졌는지',
  '7. 이미지 삽입 및 alt 텍스트/캡션 적절성',
  '8. 온라인 쇼룸/홈페이지 사례 비교 CTA가 과하지 않으면서 자연스럽게 이어지는지',
  '9. 네이버 블로그 특성상 첫 문단에서 핵심 답변과 검색 의도가 바로 연결되는지',
  '10. SEO/AEO/GEO 관점에서 정의형 문장, FAQ, 사례 문장이 인용 가능한 수준으로 정리됐는지',
  '응답은 JSON만 반환:',
  '{"score": 0-100, "pass": true/false, "reason": "string", "review_note": "string", "checklist": ["string"]}',
  '',
  `[제목]\n${title}`,
  '',
  `[요약]\n${summary}`,
  '',
  `[한 줄 코멘트]\n${humanTouch}`,
  '',
  `[본문 HTML]\n${bodyHtml}`,
  '',
  `[FAQ]\n${faqQas.map((item) => `Q. ${item.question}\nA. ${item.answer}`).join('\n\n')}`,
  '',
  `[이미지 ALT]\n${imageAlts.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
  '',
  `[메타]\n공개명=${normalized.siteName}\n내부명=${normalized.internalSiteName || '없음'}\n지역=${normalized.locationKr}\n업종=${normalized.businessTypeKr}\n제품=${normalized.productNames.join(', ')}\n컬러=${normalized.colorNames.join(', ')}\nSEO설명=${normalized.seoDescription || '없음'}\nCTA=${normalized.ctaText}`,
].join('\n');

const qualityRequestBody = {
  model: 'gpt-4.1-mini',
  temperature: 0.2,
  max_tokens: 1400,
  response_format: {
    type: 'json_object',
  },
  messages: [
    {
      role: 'system',
      content: '당신은 네이버 블로그 품질 검수 에디터다. 공개명 사용, 사진 우선 구조, 섹션 단순화, SEO/AEO/GEO, 첫 문단 답변 구조, 이미지 품질, 그리고 쇼룸을 오프라인 전시장이 아닌 홈페이지 내 온라인 사례 쇼룸 의미로 썼는지까지 함께 보수적으로 평가하고 JSON만 반환한다.',
    },
    {
      role: 'user',
      content: qualityPrompt,
    },
  ],
};

return [{
  json: {
    ...normalized,
    title,
    summary,
    featuredAnswer,
    beforeAfterPoints,
    humanTouch,
    bodyHtml,
    socialText,
    hashtags,
    seoKeywords,
    geoPoints,
    faqQas,
    imageAlts,
    imageCaptions,
    representativeImageIndex,
    representativeImageReason,
    representativeImageLabel: representativeImageIndex ? `${representativeImageIndex}번 이미지` : '',
    imageOrder,
    representativeImageUrl: representativeImage?.delivery_url ?? representativeImage?.url ?? '',
    rawDraft: rawContent,
    qualityRequestBody,
  },
}];
})();
