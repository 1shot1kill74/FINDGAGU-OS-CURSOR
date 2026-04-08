(() => {
const draft = $('초안 정리 및 검수 요청 준비').first().json;
const response = $input.first().json ?? {};
const rawContent = response.choices?.[0]?.message?.content ?? '';

let parsed;
try {
  parsed = JSON.parse(rawContent);
} catch (error) {
  parsed = {
    score: 0,
    pass: false,
    reason: '검수 응답 JSON 파싱 실패',
    review_note: rawContent,
    checklist: []
  };
}

const score = Number(parsed.score ?? parsed.quality_score ?? 0);
const qualityPassed = typeof parsed.pass === 'boolean'
  ? parsed.pass
  : score >= Number(draft.qualityThreshold ?? 85);

const checklist = Array.isArray(parsed.checklist)
  ? parsed.checklist.map((item) => String(item).trim()).filter(Boolean)
  : [];

return [{
  json: {
    ...draft,
    qualityScore: score,
    qualityPassed,
    qualityReason: parsed.reason ?? '',
    reviewNote: parsed.review_note ?? '',
    qualityChecklist: checklist,
    reviewedAt: new Date().toISOString()
  }
}];
})();
