#!/usr/bin/env node
/**
 * Supabase image_assets의 product_name 메타데이터 기준으로 올데이 시리즈 핸드아웃 HTML 생성.
 * 쇼룸「제품 보기」와 동일: 제품명별 그룹, 대표 이미지 = is_main → (내부점수+공유+조회) → 최신순.
 *
 * 환경변수: VITE_SUPABASE_URL + (SUPABASE_SERVICE_ROLE_KEY 권장 | VITE_SUPABASE_ANON_KEY)
 * 기본: is_consultation=true 이고 견적/도면 카테고리 제외 (fetchShowroomImageAssets와 동일)
 * 옵션: --all-assets → is_consultation 필터 생략
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(REPO_ROOT, "product-handout-oldei.html");

dotenv.config({ path: path.join(REPO_ROOT, ".env") });

const args = process.argv.slice(2);
const ALL_ASSETS = args.includes("--all-assets");

const OLDEI_TOKEN = "올데이".normalize("NFC");
const PAGE_SIZE = 500;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function hashId(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/** ShowroomPage.parseProductSeries */
function parseProductSeries(productName) {
  const normalizedName = productName.trim().replace(/\s+/g, " ");
  if (!normalizedName) {
    return { baseName: "", seriesSuffix: null, normalizedName: "" };
  }
  const firstToken = normalizedName.split(" ")[0] ?? normalizedName;
  const tokenMatch = firstToken.match(/^(.*?)([A-Za-z]+)$/);
  if (!tokenMatch) {
    return { baseName: normalizedName, seriesSuffix: null, normalizedName };
  }
  const tokenBase = tokenMatch[1]?.trim();
  const seriesSuffix = tokenMatch[2]?.toUpperCase() ?? null;
  if (!tokenBase || !seriesSuffix) {
    return { baseName: normalizedName, seriesSuffix: null, normalizedName };
  }
  const rest = normalizedName.slice(firstToken.length).trim();
  const baseName = `${tokenBase}${rest ? ` ${rest}` : ""}`.trim();
  return {
    baseName: baseName || normalizedName,
    seriesSuffix,
    normalizedName,
  };
}

function compareSeriesSuffix(a, b) {
  if (a && !b) return -1;
  if (!a && b) return 1;
  if (!a && !b) return 0;
  return a.localeCompare(b, "en", { numeric: true });
}

function compareProductNamesLikeShowroom(nameA, nameB, siteCountA, siteCountB, imgCountA, imgCountB) {
  const aSeries = parseProductSeries(nameA);
  const bSeries = parseProductSeries(nameB);
  const aHasSeries = aSeries.seriesSuffix ? 1 : 0;
  const bHasSeries = bSeries.seriesSuffix ? 1 : 0;
  if (aHasSeries !== bHasSeries) return bHasSeries - aHasSeries;
  const baseCompare = aSeries.baseName.localeCompare(bSeries.baseName, "ko");
  if (baseCompare !== 0) return baseCompare;
  const seriesCompare = compareSeriesSuffix(aSeries.seriesSuffix, bSeries.seriesSuffix);
  if (seriesCompare !== 0) return seriesCompare;
  if (siteCountA !== siteCountB) return siteCountB - siteCountA;
  if (imgCountA !== imgCountB) return imgCountB - imgCountA;
  return aSeries.normalizedName.localeCompare(bSeries.normalizedName, "ko");
}

function sortRowsForRepresentative(rows) {
  return [...rows].sort((a, b) => {
    const aMain = a.is_main ? 1 : 0;
    const bMain = b.is_main ? 1 : 0;
    if (aMain !== bMain) return bMain - aMain;
    const aScore =
      (a.internal_score ?? 0) + (a.share_count ?? 0) * 0.2 + (a.view_count ?? 0) * 0.05;
    const bScore =
      (b.internal_score ?? 0) + (b.share_count ?? 0) * 0.2 + (b.view_count ?? 0) * 0.05;
    if (aScore !== bScore) return bScore - aScore;
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

function pickPublicImageUrl(row) {
  const t = row.thumbnail_url?.trim();
  const c = row.cloudinary_url?.trim();
  if (t && /^https?:\/\//i.test(t)) return t;
  if (c && /^https?:\/\//i.test(c)) return c;
  return null;
}

function buildGridPage(products) {
  const n = products.length;
  const cols = n <= 12 ? 4 : n <= 24 ? 5 : 6;
  const rows = Math.ceil(n / cols);

  const cells = products
    .map((p) => {
      const id = hashId(`oldei-meta:${p.name}`);
      const imgHtml = p.imageUrl
        ? `<img class="cell-img" src="${escapeHtmlAttr(p.imageUrl)}" alt="" loading="lazy" />`
        : `<div class="cell-img cell-img--empty">URL 없음</div>`;
      const subParts = [];
      if (p.siteLabel) subParts.push(p.siteLabel);
      if (p.imageCount > 1) subParts.push(`사진 ${p.imageCount}장 중 대표`);
      const sub = subParts.length
        ? `<div class="cell-sub">${escapeHtml(subParts.join(" · "))}</div>`
        : "";
      return `
        <article class="grid-cell" data-handout-cell data-product="${escapeHtmlAttr(p.name)}">
          <label class="cell-pick screen-only" title="항목 선택">
            <input type="checkbox" class="cell-cb" aria-label="이 항목 선택" />
          </label>
          ${imgHtml}
          <div class="cell-title" title="${escapeHtmlAttr(p.name)}">${escapeHtml(p.name)}</div>
          ${sub}
          <label class="sr-only" for="note-${id}">기준점 · 설명</label>
          <textarea id="note-${id}" class="cell-notes" rows="2" placeholder="설명"></textarea>
        </article>`;
    })
    .join("\n");

  const filterNote = ALL_ASSETS
    ? "전체 image_assets 중 product_name에 올데이 포함"
    : "상담용(is_consultation)만 · 쇼룸 제품 보기와 동일 필터";

  return `
    <section class="oldei-page" style="--grid-cols: ${cols}; --approx-rows: ${rows};">
      <header class="oldei-header">
        <h1>올데이 시리즈</h1>
        <p class="oldei-meta">출처: image_assets <strong>product_name</strong> · ${filterNote} · 제품 <strong id="handout-count">${n}</strong>종 · 대표사진 규칙 동일 · ${cols}열</p>
      </header>
      <div class="oldei-grid">
        ${cells}
      </div>
    </section>`;
}

async function main() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  ).trim();
  if (!url || !key) {
    console.error(
      "Supabase URL/키가 없습니다. .env에 VITE_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY(권장) 또는 VITE_SUPABASE_ANON_KEY 를 설정하세요."
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const collected = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase
      .from("image_assets")
      .select(
        "id, cloudinary_url, thumbnail_url, site_name, product_name, is_main, created_at, view_count, share_count, internal_score, category, is_consultation"
      )
      .ilike("product_name", "%올데이%")
      .not("category", "in", '("purchase_order","floor_plan")')
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (!ALL_ASSETS) {
      q = q.eq("is_consultation", true);
    }

    const { data, error } = await q;
    if (error) {
      console.error("조회 실패:", error.message);
      process.exit(1);
    }
    if (!data?.length) break;
    collected.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  const rows = collected.filter((r) => {
    const pn = (r.product_name ?? "").normalize("NFC").trim();
    return pn && pn.includes(OLDEI_TOKEN) && pn !== "미지정";
  });

  const byProduct = new Map();
  for (const r of rows) {
    const name = (r.product_name ?? "").trim();
    if (!name) continue;
    const list = byProduct.get(name) ?? [];
    list.push(r);
    byProduct.set(name, list);
  }

  const siteNamesSet = (list) =>
    new Set(list.map((x) => (x.site_name ?? "").trim()).filter(Boolean));

  const products = Array.from(byProduct.entries()).map(([name, list]) => {
    const sorted = sortRowsForRepresentative(list);
    const top = sorted[0];
    const sites = siteNamesSet(list);
    const siteLabel =
      sites.size === 1 ? [...sites][0] : sites.size > 1 ? `현장 ${sites.size}곳` : "";
    return {
      name,
      imageUrl: top ? pickPublicImageUrl(top) : null,
      siteLabel,
      imageCount: list.length,
    };
  });

  products.sort((a, b) => {
    const listA = byProduct.get(a.name) ?? [];
    const listB = byProduct.get(b.name) ?? [];
    return compareProductNamesLikeShowroom(
      a.name,
      b.name,
      siteNamesSet(listA).size,
      siteNamesSet(listB).size,
      listA.length,
      listB.length
    );
  });

  if (products.length === 0) {
    console.warn(
      "조건에 맞는 제품이 없습니다. --all-assets 로 전체 자산을 포함하거나, DB에 product_name에 올데이가 있는 상담용 사진이 있는지 확인하세요."
    );
  }

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>올데이 시리즈 — 안내용 시트 (메타데이터)</title>
  <style>
    :root {
      --ink: #1a1a1a;
      --muted: #5c5c5c;
      --line: #d0d0d0;
      --paper: #faf9f7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
      color: var(--ink);
      background: var(--paper);
      font-size: 11px;
      line-height: 1.35;
    }
    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0); border: 0;
    }
    .oldei-page {
      max-width: 210mm;
      margin: 0 auto;
      padding: 8mm 10mm 10mm;
      min-height: 297mm;
    }
    .oldei-header {
      border-bottom: 2px solid var(--ink);
      margin-bottom: 6mm;
      padding-bottom: 3mm;
    }
    .oldei-header h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
    }
    .oldei-meta {
      margin: 2mm 0 0;
      font-size: 10px;
      color: var(--muted);
    }
    .oldei-grid {
      display: grid;
      grid-template-columns: repeat(var(--grid-cols, 5), 1fr);
      gap: 3mm 2.5mm;
      align-items: start;
    }
    .handout-toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      margin: 0 auto 12px;
      max-width: 210mm;
      background: rgba(250, 249, 247, 0.96);
      border: 1px solid var(--line);
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .handout-toolbar button {
      font: inherit;
      font-size: 12px;
      padding: 6px 12px;
      border-radius: 4px;
      border: 1px solid var(--line);
      background: #fff;
      cursor: pointer;
      color: var(--ink);
    }
    .handout-toolbar button:hover { background: #f0f0f0; }
    .handout-toolbar button.danger {
      border-color: #c62828;
      color: #b71c1c;
      font-weight: 600;
    }
    .handout-toolbar button.danger:hover { background: #ffebee; }
    .handout-toolbar-hint {
      font-size: 11px;
      color: var(--muted);
      margin-left: auto;
    }
    .grid-cell {
      position: relative;
      border: 1px solid var(--line);
      border-radius: 3px;
      padding: 2mm;
      padding-top: 5mm;
      background: #fff;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .cell-pick {
      position: absolute;
      top: 1mm;
      right: 1mm;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      margin: 0;
      cursor: pointer;
    }
    .cell-pick input { width: 16px; height: 16px; margin: 0; cursor: pointer; }
    .cell-img {
      width: 100%;
      height: 22mm;
      object-fit: cover;
      display: block;
      border-radius: 2px;
      background: #eee;
    }
    .cell-img--empty {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      color: var(--muted);
    }
    .cell-title {
      margin-top: 1.5mm;
      font-size: 7.5px;
      font-weight: 600;
      color: var(--muted);
      line-height: 1.25;
      max-height: 2.6em;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      word-break: break-all;
    }
    .cell-sub {
      margin-top: 0.8mm;
      font-size: 6.5px;
      color: #888;
      line-height: 1.2;
      max-height: 2.4em;
      overflow: hidden;
    }
    .cell-notes {
      width: 100%;
      margin-top: 1.5mm;
      font: inherit;
      font-size: 8px;
      padding: 1mm;
      border: 1px solid var(--line);
      border-radius: 2px;
      resize: vertical;
      min-height: 7mm;
    }
    @media print {
      body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .oldei-page { padding: 6mm 8mm; max-width: none; }
      .cell-notes { border-color: #999; }
      .screen-only, .handout-toolbar { display: none !important; }
      .grid-cell { padding-top: 2mm; }
    }
    @media screen and (min-width: 900px) {
      .oldei-page { padding: 1.25rem; }
      .cell-img { height: 88px; }
    }
  </style>
</head>
<body>
  <div class="handout-toolbar screen-only" role="toolbar" aria-label="항목 편집">
    <button type="button" id="handout-select-all">전체 선택</button>
    <button type="button" id="handout-select-none">선택 해제</button>
    <button type="button" id="handout-delete-selected" class="danger">선택 삭제</button>
    <span class="handout-toolbar-hint">화면에서만 목록 제거 · DB/스토리지는 변경 없음</span>
  </div>
${buildGridPage(products)}
  <script>
(function () {
  var grid = document.querySelector(".oldei-grid");
  var countEl = document.getElementById("handout-count");
  if (!grid) return;
  function updateCount() {
    if (!countEl) return;
    countEl.textContent = String(grid.querySelectorAll(".grid-cell").length);
  }
  function getCheckedCells() {
    var out = [];
    grid.querySelectorAll(".grid-cell").forEach(function (cell) {
      var cb = cell.querySelector(".cell-cb");
      if (cb && cb.checked) out.push(cell);
    });
    return out;
  }
  var btnAll = document.getElementById("handout-select-all");
  var btnNone = document.getElementById("handout-select-none");
  var btnDel = document.getElementById("handout-delete-selected");
  if (btnAll) btnAll.addEventListener("click", function () {
    grid.querySelectorAll(".cell-cb").forEach(function (cb) { cb.checked = true; });
  });
  if (btnNone) btnNone.addEventListener("click", function () {
    grid.querySelectorAll(".cell-cb").forEach(function (cb) { cb.checked = false; });
  });
  if (btnDel) btnDel.addEventListener("click", function () {
    var selected = getCheckedCells();
    if (!selected.length) { alert("선택된 항목이 없습니다."); return; }
    if (!confirm("선택한 " + selected.length + "개 항목을 이 목록에서 제거할까요?\\n(새로고침하면 스크립트 재실행 전까지 복구되지 않습니다)")) return;
    selected.forEach(function (cell) { cell.remove(); });
    updateCount();
  });
})();
  </script>
</body>
</html>`;

  fs.writeFileSync(OUT_FILE, html, "utf8");
  console.log("작성 완료:", OUT_FILE);
  console.log("제품(product_name) 종류 수:", products.length);
  console.log("원본 행 수(올데이 필터 후):", rows.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
