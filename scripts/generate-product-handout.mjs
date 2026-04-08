#!/usr/bin/env node
/**
 * 시공현장 이미지 폴더를 스캔해 제품(하위 폴더 = 제품명)별 안내 HTML을 생성합니다.
 *
 * 기본: 제품명 가나다순, 제품당 1페이지.
 * --올데이 / --oldei: 폴더명에「올데이」가 포함된 항목만, 한 페이지 그리드(썸네일+제목+설명란).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const IMAGE_ROOT = path.join(REPO_ROOT, "시공현장 이미지");

const args = process.argv.slice(2);
const OLDEI_ONLY =
  args.includes("--올데이") || args.includes("--oldei") || args.includes("--only=oldei");

const OUT_FILE = OLDEI_ONLY
  ? path.join(REPO_ROOT, "product-handout-oldei.html")
  : path.join(REPO_ROOT, "product-handout.html");

const OLDEI_TOKEN = "올데이".normalize("NFC");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function walkImages(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "desktop.ini") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walkImages(full));
    } else {
      const ext = path.extname(e.name).toLowerCase();
      if (IMAGE_EXT.has(ext)) out.push(full);
    }
  }
  return out;
}

function pickRandom(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function relUrl(fromFile, absolutePath) {
  let rel = path.relative(path.dirname(fromFile), absolutePath);
  rel = rel.split(path.sep).map(encodeURIComponent).join("/");
  return rel;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function hashId(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/** 올데이 폴더 내 정렬: 올데이 뒤 알파벳 토큰 우선, 없으면 전체 문자열 */
function oldeiSortKey(folderName) {
  const n = folderName.normalize("NFC");
  const m = n.match(/올데이\s*([A-Z]{1,3})/i);
  if (m) return m[1].toUpperCase();
  return "";
}

function compareOldeiFolders(a, b) {
  const ka = oldeiSortKey(a);
  const kb = oldeiSortKey(b);
  if (ka && kb && ka !== kb) return ka.localeCompare(kb, "en", { numeric: true });
  if (ka && !kb) return -1;
  if (!ka && kb) return 1;
  return a.localeCompare(b, "ko");
}

function buildOldeiGridPage(products) {
  const n = products.length;
  const cols = n <= 12 ? 4 : n <= 24 ? 5 : 6;
  const rows = Math.ceil(n / cols);

  const cells = products
    .map((p) => {
      const id = hashId(`oldei:${p.name}`);
      const imgHtml = p.image
        ? `<img class="cell-img" src="${p.image}" alt="" loading="lazy" />`
        : `<div class="cell-img cell-img--empty">없음</div>`;
      return `
        <article class="grid-cell" data-handout-cell data-folder="${escapeHtmlAttr(p.name)}">
          <label class="cell-pick screen-only" title="항목 선택">
            <input type="checkbox" class="cell-cb" aria-label="이 항목 선택" />
          </label>
          ${imgHtml}
          <div class="cell-title" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
          <label class="sr-only" for="note-${id}">기준점 · 설명</label>
          <textarea id="note-${id}" class="cell-notes" rows="2" placeholder="설명"></textarea>
        </article>`;
    })
    .join("\n");

  return `
    <section class="oldei-page" style="--grid-cols: ${cols}; --approx-rows: ${rows};">
      <header class="oldei-header">
        <h1>올데이 시리즈</h1>
        <p class="oldei-meta">시공현장 폴더 기준 <strong id="handout-count">${n}</strong>건 · 폴더당 랜덤 1장 · ${cols}열 그리드 · 화면에서 항목 선택 후 삭제 가능 (인쇄 시 체크박스 숨김)</p>
      </header>
      <div class="oldei-grid">
        ${cells}
      </div>
    </section>`;
}

function main() {
  if (!fs.existsSync(IMAGE_ROOT)) {
    console.error("폴더가 없습니다:", IMAGE_ROOT);
    process.exit(1);
  }

  const entries = fs.readdirSync(IMAGE_ROOT, { withFileTypes: true });
  let productDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (OLDEI_ONLY) {
    productDirs = productDirs.filter((name) => name.normalize("NFC").includes(OLDEI_TOKEN));
    productDirs.sort(compareOldeiFolders);
  }

  const products = productDirs.map((dirName) => {
    const absDir = path.join(IMAGE_ROOT, dirName);
    const images = walkImages(absDir);
    const chosen = pickRandom(images);
    return {
      name: dirName,
      image: chosen ? relUrl(OUT_FILE, chosen) : null,
    };
  });

  if (!OLDEI_ONLY) {
    products.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  if (OLDEI_ONLY) {
    const oldeiHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>올데이 시리즈 — 안내용 시트</title>
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
    .handout-toolbar button:hover {
      background: #f0f0f0;
    }
    .handout-toolbar button.danger {
      border-color: #c62828;
      color: #b71c1c;
      font-weight: 600;
    }
    .handout-toolbar button.danger:hover {
      background: #ffebee;
    }
    .handout-toolbar-hint {
      font-size: 11px;
      color: var(--muted);
      margin-left: auto;
    }
    .screen-only { }
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
    .cell-pick input {
      width: 16px;
      height: 16px;
      margin: 0;
      cursor: pointer;
    }
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
      .screen-only,
      .handout-toolbar { display: none !important; }
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
    <span class="handout-toolbar-hint">목록에서만 제거됩니다 · 실제 폴더/파일은 삭제되지 않습니다</span>
  </div>
${buildOldeiGridPage(products)}
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

  if (btnAll) {
    btnAll.addEventListener("click", function () {
      grid.querySelectorAll(".cell-cb").forEach(function (cb) {
        cb.checked = true;
      });
    });
  }
  if (btnNone) {
    btnNone.addEventListener("click", function () {
      grid.querySelectorAll(".cell-cb").forEach(function (cb) {
        cb.checked = false;
      });
    });
  }
  if (btnDel) {
    btnDel.addEventListener("click", function () {
      var selected = getCheckedCells();
      if (!selected.length) {
        alert("선택된 항목이 없습니다.");
        return;
      }
      if (!confirm("선택한 " + selected.length + "개 항목을 이 목록에서 제거할까요?\\n(브라우저에서만 사라지며, 새로고침하면 다시 불러옵니다)")) {
        return;
      }
      selected.forEach(function (cell) {
        cell.remove();
      });
      updateCount();
    });
  }
})();
  </script>
</body>
</html>`;
    fs.writeFileSync(OUT_FILE, oldeiHtml, "utf8");
    console.log("작성 완료 (올데이만):", OUT_FILE);
    console.log("포함 폴더 수:", products.length);
    return;
  }

  const pagesHtml = products
    .map((p) => {
      const id = hashId(p.name);
      const imgHtml = p.image
        ? `<img class="product-photo" src="${p.image}" alt="" loading="lazy" />`
        : `<div class="product-photo product-photo--empty">사진 없음</div>`;
      return `
    <section class="product-page" aria-labelledby="title-${id}">
      <header class="page-header">
        <h1 id="title-${id}" class="product-title">${escapeHtml(p.name)}</h1>
      </header>
      <div class="product-body">
        <div class="product-meta">
          ${imgHtml}
        </div>
        <div class="product-notes">
          <label class="notes-label" for="note-${id}">기준점 · 설명</label>
          <textarea id="note-${id}" class="notes-area" rows="8" placeholder="설명을 입력하세요."></textarea>
        </div>
      </div>
    </section>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>제품별 안내용 시트 (제품명 순)</title>
  <style>
    :root {
      --ink: #1a1a1a;
      --muted: #5c5c5c;
      --line: #d8d8d8;
      --paper: #faf9f7;
      --card: #fff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
      color: var(--ink);
      background: var(--paper);
      line-height: 1.45;
      font-size: 14px;
    }
    .product-page {
      max-width: 900px;
      margin: 0 auto;
      padding: 1.5rem 1.25rem 2rem;
      break-after: page;
      page-break-after: always;
    }
    .product-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
    .page-header {
      border-bottom: 2px solid var(--ink);
      padding-bottom: 0.65rem;
      margin-bottom: 1.25rem;
    }
    .product-title {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      word-break: break-word;
    }
    .product-body {
      display: grid;
      grid-template-columns: minmax(240px, 400px) 1fr;
      gap: 1.25rem;
      align-items: start;
    }
    .product-meta {
      min-width: 0;
    }
    .product-photo {
      width: 100%;
      max-height: 320px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid var(--line);
      display: block;
      background: #eee;
    }
    .product-photo--empty {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      color: var(--muted);
      font-size: 0.9rem;
      border-radius: 6px;
      border: 1px dashed var(--line);
    }
    .product-notes {
      display: flex;
      flex-direction: column;
      min-height: 200px;
    }
    .notes-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 0.35rem;
    }
    .notes-area {
      flex: 1;
      width: 100%;
      min-height: 180px;
      padding: 0.55rem 0.65rem;
      border: 1px solid var(--line);
      border-radius: 4px;
      font: inherit;
      resize: vertical;
      background: var(--card);
    }
    .notes-area:focus {
      outline: 2px solid #333;
      outline-offset: 1px;
    }
    @media (max-width: 720px) {
      .product-body {
        grid-template-columns: 1fr;
      }
      .product-photo { max-height: 260px; }
    }
    @media print {
      body { background: #fff; }
      .product-page { padding: 0.6cm; max-width: none; }
      .notes-area {
        border: 1px solid #999;
        min-height: 140px;
      }
    }
  </style>
</head>
<body>
${pagesHtml}
</body>
</html>`;

  fs.writeFileSync(OUT_FILE, html, "utf8");
  console.log("작성 완료:", OUT_FILE);
  console.log("제품(폴더) 수:", products.length);
}

main();
