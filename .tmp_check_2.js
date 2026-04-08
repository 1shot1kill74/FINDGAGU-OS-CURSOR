const incoming = $input.first().json ?? {};
const body = incoming.body ?? incoming ?? {};

const toArray = (value) => {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && item !== '');
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const truncate = (value, max = 120) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const relabelBusinessType = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text === '관리형' ? '관리형 스터디카페' : text;
};

const buildProtectedImageUrl = (value) => {
  const url = String(value ?? '').trim();
  if (!url || !url.includes('/image/upload/') || url.includes('/l_text:Arial_28_bold:FINDGAGU')) return url;
  const transformation = [
    'f_auto',
    'q_auto',
    'fl_lossy',
    'w_1280',
    'c_limit',
    'l_text:Arial_28_bold:FINDGAGU',
    'co_rgb:ffffff',
    'o_28',
    'g_south_east',
    'x_28',
    'y_24',
  ].join(',');
  return url.replace('/image/upload/', `/image/upload/${transformation}/`);
};

const normalizeImage = (image, index, forcedRole = null) => {
  if (!image) return null;
  if (typeof image === 'string') {
    return {
      id: `img-${index + 1}`,
      url: image,
      delivery_url: buildProtectedImageUrl(image),
      caption: '',
      product_name: '',
      color_name: '',
      before_after_role: forcedRole,
      before_after_group_id: '',
      order: index + 1,
    };
  }

  const url = image.url ?? image.secure_url ?? image.image_url ?? image.src ?? '';
  if (!url) return null;

  const role = forcedRole
    ?? (image.before_after_role === 'before' || image.before_after_role === 'after' ? image.before_after_role : null)
    ?? (image.beforeAfterRole === 'before' || image.beforeAfterRole === 'after' ? image.beforeAfterRole : null);

  return {
    id: image.id ?? image.asset_id ?? image.public_id ?? `img-${index + 1}`,
    url,
    delivery_url: buildProtectedImageUrl(url),
    caption: image.caption ?? image.description ?? '',
    product_name: image.product_name ?? image.productName ?? '',
    color_name: image.color_name ?? image.colorName ?? '',
    before_after_role: role,
    before_after_group_id: image.before_after_group_id ?? image.beforeAfterGroupId ?? image.pair_id ?? image.pairId ?? '',
    order: image.order ?? index + 1,
  };
};

const rawBeforeImages = toArray(body.before_images ?? body.beforeImages)
  .map((image, index) => normalizeImage(image, index, 'before'))
  .filter(Boolean);
const rawAfterImages = toArray(body.after_images ?? body.afterImages)
  .map((image, index) => normalizeImage(image, index, 'after'))
  .filter(Boolean);
const rawImages = [
  ...toArray(body.representative_images),
  ...toArray(body.source_images),
  ...toArray(body.images),
].map((image, index) => normalizeImage(image, index)).filter(Boolean);

const maxImagesRaw = Number(body.max_images ?? body.maxImages ?? 8);
const maxImages = Number.isFinite(maxImagesRaw) ? Math.max(1, Math.min(maxImagesRaw, 12)) : 8;
const selectedBeforeImagesRaw = rawBeforeImages.slice(0, Math.min(maxImages, 4));
const selectedAfterImagesRaw = (rawAfterImages.length ? rawAfterImages : rawImages.filter((image) => image.before_after_role !== 'before')).slice(0, maxImages);
const selectedImagesRaw = selectedBeforeImagesRaw.length
  ? [...selectedBeforeImagesRaw, ...selectedAfterImagesRaw]
  : selectedAfterImagesRaw;

const publicSiteName = body.site_name ?? body.siteName ?? body.external_display_name ?? body.externalDisplayName ?? body.showroom_name ?? body.showroomName ?? '파인드가구 쇼룸';
const internalSiteName = body.internal_site_name ?? body.internalSiteName ?? '';
const locationKr = body.location_kr ?? body.locationKr ?? body.location ?? '';
const businessTypeKr = relabelBusinessType(body.business_type_kr ?? body.businessTypeKr ?? body.business_type ?? body.businessType ?? '');
const productNames = toArray(body.product_names ?? body.productNames);
const colorNames = toArray(body.color_names ?? body.colorNames);
const faqTopics = toArray(body.faq_topics ?? body.faqTopics);
const seoDescription = String(body.seo_description ?? body.seoDescription ?? '').trim();
const comparisonFocus = toArray(body.comparison_focus ?? body.comparisonFocus);
const primaryKeyword = body.primary_keyword ?? body.primaryKeyword ?? productNames[0] ?? publicSiteName;
const ctaText = body.cta_text ?? body.ctaText ?? '비슷한 사례를 더 보려면 파인드가구 홈페이지 쇼룸에서 다양한 현장 사례를 먼저 확인해보세요.';
const reviewEmail = body.review_email ?? body.reviewEmail ?? 'admin@findgagu.com';
const titleHint = body.title_hint ?? body.titleHint ?? `${publicSiteName} 사례 콘텐츠`;
const contentItemId = body.content_item_id ?? body.contentItemId ?? body.showroom_group_key ?? body.showroomGroupKey ?? `manual-${Date.now()}`;
const showroomGroupKey = body.showroom_group_key ?? body.showroomGroupKey ?? contentItemId;
const qualityThresholdRaw = Number(body.quality_threshold ?? body.qualityThreshold ?? 85);
const qualityThreshold = Number.isFinite(qualityThresholdRaw) ? qualityThresholdRaw : 85;
const beforeAfterAvailable = selectedBeforeImagesRaw.length > 0 && selectedAfterImagesRaw.length > 0;

const buildDefaultAlt = (image, index) => {
  const roleLabel = image.before_after_role === 'before'
    ? '비포어'
    : image.before_after_role === 'after'
      ? '애프터'
      : '현장';
  const parts = [publicSiteName, roleLabel, locationKr, businessTypeKr, image.product_name, image.color_name, image.caption]
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
  return truncate(parts.join(' - ') || `${publicSiteName} ${roleLabel} 이미지 ${index + 1}`, 110);
};

const selectedImages = selectedImagesRaw.map((image, index) => ({
  ...image,
  default_alt: buildDefaultAlt(image, index),
}));

const imageMetaLines = selectedImages.length
  ? selectedImages.map((image, index) => {
      const roleLabel = image.before_after_role === 'before' ? 'before' : 'after';
      const productText = roleLabel === 'before' ? '추정 금지' : (image.product_name || '미기재');
      const colorText = roleLabel === 'before' ? '추정 금지' : (image.color_name || '미기재');
      return [
        `이미지${index + 1}`,
        `- role: ${roleLabel}`,
        `- 제품명: ${productText}`,
        `- 색상: ${colorText}`,
        `- pair_id: ${image.before_after_group_id || '없음'}`,
        `- 설명: ${image.caption || '없음'}`,
      ].join('\n');
    }).join('\n\n')
  : '이미지 메타데이터 없음';

const modeLabel = beforeAfterAvailable ? '비포어/애프터 비교형 사례' : '일반 시공 사례';
const sectionRule = beforeAfterAvailable
  ? '본문 H2는 최대 4개로 제한하고, 전후 비교 섹션 1개를 포함한다.'
  : '본문 H2는 최대 3개로 제한하고, 전후 비교 섹션은 만들지 않는다.';

const promptText = [
  '당신은 교육공간과 스터디카페 기획에 강한 콘텐츠 에디터입니다.',
  '독자는 글보다 먼저 사진을 보고, 신뢰가 생기면 내용을 읽고, 마지막에 홈페이지 안의 온라인 쇼룸에서 더 비교해볼지 판단합니다.',
  '따라서 본문은 사진을 먼저 보고 읽기 쉬운 구조를 전제로 작성하세요.',
  '출력은 네이버 블로그 발행 초안 기준으로 작성하세요.',
  'SEO, AEO, GEO를 함께 만족해야 하며 첫 문단 3~5줄 안에서 핵심 답을 먼저 제시하세요.',
  '제목과 도입부는 검색 사용자의 질문 의도에 바로 답하는 설명형 문장으로 시작하세요.',
  '대표 이미지로 가장 적합한 컷 1장을 함께 고르고, 그 이유도 짧게 설명하세요.',
  '',
  `[콘텐츠 모드]`,
  modeLabel,
  '',
  `[공개 표기명 규칙]`,
  `공개용 현장명: ${publicSiteName}`,
  `내부 현장명: ${internalSiteName || '없음'}`,
  '응답에는 공개용 현장명만 사용하고, 내부 현장명은 절대 쓰지 마세요.',
  '',
  `[프로젝트 정보]`,
  `지역: ${locationKr || '미기재'}`,
  `업종: ${businessTypeKr || '미기재'}`,
  `핵심 키워드: ${primaryKeyword || '미기재'}`,
  `제품명: ${productNames.length ? productNames.join(', ') : '미기재'}`,
  `색상: ${colorNames.length ? colorNames.join(', ') : '미기재'}`,
  `비교 초점: ${comparisonFocus.length ? comparisonFocus.join(', ') : '공간 구성 변화, 동선 변화, 분위기 변화'}`,
  `SEO 설명: ${seoDescription || '미기재'}`,
  `CTA: ${ctaText}`,
  '',
  `[이미지별 메타데이터]`,
  imageMetaLines,
  '',
  `[절대 규칙]`,
  '1. 지역과 업종은 한국어로만 작성한다.',
  '2. 자재, 마감, 구조, 성능은 사진이나 메타데이터로 확인되지 않으면 추정하지 않는다.',
  '3. 메타데이터에 없는 제품명/색상은 만들지 않는다.',
  '4. before 이미지는 관찰 가능한 사실만 쓴다.',
  '5. before 이미지에 제품명, 브랜드명, 자재명, 색상명을 추정해서 쓰지 않는다.',
  '6. after 이미지만 제공된 메타데이터를 활용해 제품명과 색상을 구체적으로 반영한다.',
  '7. "첫 번째 사진", "두 번째 이미지" 같은 순번 표현은 금지한다.',
  '8. body_html은 HTML 조각으로 작성하고 html/body 태그는 넣지 않는다.',
  `9. ${sectionRule}`,
  '10. 기존 구조처럼 "한눈에 보기", "프로젝트 소개", "공간 기획 포인트", "공간 기획의 디테일"을 모두 분리하지 말고 묶어서 줄인다.',
  '11. 사진 설명 뒤에는 독자가 홈페이지 안의 온라인 쇼룸에서 비슷한 사례를 더 비교해보고 싶어질 만한 이유를 자연스럽게 이어준다.',
  '12. human_touch는 과장된 에피소드 창작이 아니라, 현장감이 느껴지는 짧은 코멘트로만 쓴다.',
  '13. 업종 메타가 "관리형 스터디카페"이면 본문과 제목에서도 반드시 그 표현만 쓰고 "관리형 학습공간" 표현은 쓰지 않는다.',
  '',
  `[본문 구조]`,
  '1. 도입 1블록: 현장 성격과 핵심 포인트를 3~4문장으로 요약',
  beforeAfterAvailable
    ? '2. 변화 포인트 1블록: 전후 비교 핵심만 3~5개로 정리'
    : '2. 핵심 포인트 1블록: 이 현장에서 눈여겨볼 점을 3~5개로 정리',
  '3. 공간별 설명 1블록: 각 사진 기반의 독립 단락으로 구성',
  '4. 온라인 쇼룸 유도 1블록: 홈페이지 안에서 비슷한 사례를 더 비교해볼 이유와 CTA 포함',
  '',
  `[추가 작성 규칙]`,
  '1. featured_answer: 검색/요약에 바로 노출될 수 있는 2~3문장 답변형 요약. 오프라인 방문 유도처럼 쓰지 말고 온라인 사례 비교 맥락으로 작성',
  '2. faq_qas: 3개 이상',
  '3. geo_points: 3~5개. 지역 키워드를 줄바꿈으로 나열하지 말고, 검색 사용자에게 도움이 되는 짧은 문장형 포인트로 작성',
  '4. image_alts: 이미지 수와 동일한 개수',
  '5. image_captions는 사진 먼저 보게 만드는 짧고 선명한 문장형으로',
  '6. hashtags는 3개 안팎으로 간결하게',
  '7. 여기서 말하는 쇼룸은 오프라인 전시장이 아니라 파인드가구 홈페이지 안의 온라인 사례 쇼룸이다. 오프라인 방문, 실물 체험, 직접 와서 본다 같은 표현은 금지한다.',
  '8. geo_points와 featured_answer에는 지역명만 나열하지 말고, 이 사례를 온라인에서 왜 더 살펴볼 가치가 있는지 문장형으로 설명한다.',
  '9. representative_image_index는 현재 전달된 이미지 배열 기준 1부터 시작하는 번호로 반환한다.',
  '10. representative_image_reason은 왜 그 컷이 대표 이미지로 적합한지 한두 문장으로 작성한다.',
  '11. image_order는 네이버 블로그 본문에 추천하는 이미지 노출 순서를 1-based 배열로 반환한다.',
  '',
  `[출력 JSON 스키마]`,
  '{',
  '  "title": "string",',
  '  "summary": "string",',
  '  "featured_answer": "string",',
  '  "before_after_points": ["string"],',
  '  "body_html": "string",',
  '  "social_text": "string",',
  '  "hashtags": ["#태그1", "#태그2", "#태그3"],',
  '  "seo_keywords": ["string"],',
  '  "geo_points": ["string"],',
  '  "faq_qas": [{"question": "string", "answer": "string"}],',
  '  "image_alts": ["string"],',
  '  "image_captions": ["string"],',
  '  "representative_image_index": 1,',
  '  "representative_image_reason": "string",',
  '  "image_order": [1, 2, 3],',
  '  "human_touch": "string"',
  '}',
  '',
  '반드시 JSON만 반환하세요.',
].join('\n');

const userContent = [
  ...selectedImages.map((image) => ({
    type: 'image_url',
    image_url: {
      url: image.url,
    },
  })),
  {
    type: 'text',
    text: promptText,
  },
];

const draftRequestBody = {
  model: body.model ?? 'gpt-4.1',
  temperature: 0.7,
  max_tokens: 8192,
  response_format: {
    type: 'json_object',
  },
  messages: [
    {
      role: 'user',
      content: userContent,
    },
  ],
};

return [{
  json: {
    requestSource: incoming.body ? 'webhook' : 'manual',
    contentItemId,
    showroomGroupKey,
    siteName: publicSiteName,
    internalSiteName,
    locationKr,
    businessTypeKr,
    productNames,
    colorNames,
    faqTopics,
    seoDescription,
    comparisonFocus,
    beforeAfterAvailable,
    beforeImages: selectedImages.filter((image) => image.before_after_role === 'before'),
    afterImages: selectedImages.filter((image) => image.before_after_role !== 'before'),
    primaryKeyword,
    ctaText,
    reviewEmail,
    titleHint,
    selectedImages,
    imageCount: selectedImages.length,
    qualityThreshold,
    draftRequestBody,
  },
}];