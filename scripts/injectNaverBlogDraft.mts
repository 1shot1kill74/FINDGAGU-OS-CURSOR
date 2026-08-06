/**
 * 네이버 블로그 SmartEditor 초안 주입 (Playwright).
 *
 * 완성 패키지 폴더 → 제목·본문·이미지 주입 → 임시저장.
 * 발행(publish) 버튼은 절대 누르지 않는다. 검수 후 사람이 발행.
 *
 * Usage:
 *   npx tsx scripts/injectNaverBlogDraft.mts ~/Downloads/naver-blog-packages/<패키지>
 *   npx tsx scripts/injectNaverBlogDraft.mts --login-only
 *   npx tsx scripts/injectNaverBlogDraft.mts --dry-run ~/Downloads/naver-blog-packages/<패키지>
 *   npx tsx scripts/injectNaverBlogDraft.mts --blog-id findgagu <패키지>
 *
 * Profile: ~/.findgagu/naver-blog-pw-profile (일상 Chrome과 분리)
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium, type Frame, type Page } from 'playwright'

// ─── SELECTORS (SE UI 개편 시 여기만 수정) ───────────────────────────────────

const SELECTORS = {
  mainFrame: '#mainFrame',
  titleCandidates: [
    '.se-title-text .se-ff-nanumbarungothic',
    '.se-title-text',
    '.se-section-documentTitle',
    '[contenteditable="true"].se-ff-nanumbarungothic',
    '.se-title-input',
  ],
  bodyCandidates: [
    '.se-section-text .se-component-content',
    '.se-component.se-text .se-component-content',
    '.se-section-text',
    '.se-main-container',
    '[contenteditable="true"]',
  ],
  photoButtonCandidates: [
    'button[data-name="image"]',
    'button[data-type="image"]',
    'button.se-image-toolbar-button',
    'button[aria-label*="사진"]',
    'button[title*="사진"]',
    'button:has-text("사진")',
  ],
  fileInput: 'input[type="file"]',
  draftSaveCandidates: [
    'button:has-text("임시저장")',
    'button[data-click-area="tpb.save"]',
    '[class*="save_btn"]:has-text("임시저장")',
    'span:has-text("임시저장")',
  ],
  /** 발행 관련 — 코드에서 클릭하지 않음. 존재만 문서화. */
  // publish: NEVER CLICK
  draftRestoreDismissCandidates: [
    'button:has-text("취소")',
    'button:has-text("닫기")',
    'button:has-text("아니오")',
    '.se-popup-button-cancel',
    '[class*="popup"] button:has-text("취소")',
  ],
} as const

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_BLOG_ID = 'findgagu'
const PROFILE_DIR = path.join(os.homedir(), '.findgagu', 'naver-blog-pw-profile')
const IMAGE_MARKER_RE = /\[이미지\s*(\d+)\]/g
const IMAGE_MARKER_HTML_RE =
  /(?:<p[^>]*>\s*)?\[이미지\s*(\d+)\](?:\s*<\/p>)?/gi

type BodyBlock =
  | { kind: 'text'; html: string }
  | { kind: 'image'; index: number }

type ParsedPackage = {
  dir: string
  title: string
  hashtags: string
  blocks: BodyBlock[]
  images: Map<number, string> // 1-base index → absolute path
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const flags = new Set<string>()
  const positional: string[] = []
  let blogId = DEFAULT_BLOG_ID

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--login-only' || a === '--dry-run' || a === '--help' || a === '-h') {
      flags.add(a.replace(/^--/, '').replace(/^-/, ''))
      if (a === '-h') flags.add('help')
      continue
    }
    if (a === '--blog-id') {
      blogId = String(argv[++i] || '').trim() || DEFAULT_BLOG_ID
      continue
    }
    if (a.startsWith('--blog-id=')) {
      blogId = a.slice('--blog-id='.length).trim() || DEFAULT_BLOG_ID
      continue
    }
    if (a.startsWith('-')) {
      throw new Error(`unknown option: ${a}`)
    }
    positional.push(a)
  }

  return {
    loginOnly: flags.has('login-only'),
    dryRun: flags.has('dry-run'),
    help: flags.has('help'),
    blogId,
    packageDir: positional[0] ? path.resolve(positional[0]) : null,
  }
}

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/injectNaverBlogDraft.mts <packageDir>
  npx tsx scripts/injectNaverBlogDraft.mts --login-only
  npx tsx scripts/injectNaverBlogDraft.mts --dry-run <packageDir>

Options:
  --blog-id <id>   default: findgagu
  --login-only     open headed browser for Naver login (profile bootstrap)
  --dry-run        parse package only (no browser)

Profile: ${PROFILE_DIR}
Safety: never clicks 발행/publish. Draft save only.
`)
}

// ─── Package parser ──────────────────────────────────────────────────────────

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

function stripOuterTitleH1(html: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html
    .replace(new RegExp(`^\\s*<h1[^>]*>\\s*${escaped}\\s*</h1>\\s*`, 'i'), '')
    .trim()
}

function splitBodyIntoBlocks(raw: string, isHtml: boolean): BodyBlock[] {
  const blocks: BodyBlock[] = []
  const re = isHtml ? IMAGE_MARKER_HTML_RE : IMAGE_MARKER_RE
  re.lastIndex = 0

  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const before = raw.slice(last, m.index).trim()
    if (before) {
      blocks.push({ kind: 'text', html: before })
    }
    blocks.push({ kind: 'image', index: Number(m[1]) })
    last = m.index + m[0].length
  }
  const after = raw.slice(last).trim()
  if (after) {
    blocks.push({ kind: 'text', html: after })
  }
  return blocks
}

async function resolveImageMap(packageDir: string): Promise<Map<number, string>> {
  const imagesDir = path.join(packageDir, 'images')
  const map = new Map<number, string>()

  const alts = await readTextIfExists(path.join(packageDir, 'alts.txt'))
  if (alts) {
    for (const line of alts.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const [idxRaw, filename] = trimmed.split('\t')
      const idx = Number(idxRaw)
      if (!Number.isFinite(idx) || idx < 1 || !filename) continue
      const abs = path.join(imagesDir, filename.trim())
      try {
        await fs.access(abs)
        map.set(idx, abs)
      } catch {
        /* skip missing */
      }
    }
  }

  let entries: string[] = []
  try {
    entries = (await fs.readdir(imagesDir)).filter((f) => !f.startsWith('.'))
  } catch {
    throw new Error(`images/ 폴더가 없습니다: ${imagesDir}`)
  }

  for (const file of entries) {
    const m = file.match(/^(\d+)/)
    if (!m) continue
    const idx = Number(m[1])
    if (!Number.isFinite(idx) || idx < 1) continue
    if (!map.has(idx)) {
      map.set(idx, path.join(imagesDir, file))
    }
  }

  return map
}

async function parsePackage(packageDir: string): Promise<ParsedPackage> {
  const stat = await fs.stat(packageDir).catch(() => null)
  if (!stat?.isDirectory()) {
    throw new Error(`패키지 폴더가 없습니다: ${packageDir}`)
  }

  const titleSelected = (await readTextIfExists(path.join(packageDir, 'title.selected.txt')))?.trim()
  const titlesFirst = (await readTextIfExists(path.join(packageDir, 'titles.txt')))
    ?.split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean)
  const title = titleSelected || titlesFirst || ''
  if (!title) throw new Error('title.selected.txt / titles.txt 에 제목이 없습니다')

  const bodyHtml = await readTextIfExists(path.join(packageDir, 'body.html'))
  const bodyMd = await readTextIfExists(path.join(packageDir, 'body.md'))
  if (!bodyHtml?.trim() && !bodyMd?.trim()) {
    throw new Error('body.html 또는 body.md 가 필요합니다')
  }

  const isHtml = Boolean(bodyHtml?.trim())
  let body = (isHtml ? bodyHtml! : bodyMd!).trim()
  if (isHtml) body = stripOuterTitleH1(body, title)

  const blocks = splitBodyIntoBlocks(body, isHtml)
  const images = await resolveImageMap(packageDir)
  const hashtags = ((await readTextIfExists(path.join(packageDir, 'hashtags.txt'))) || '').trim()

  const needed = new Set(blocks.filter((b): b is Extract<BodyBlock, { kind: 'image' }> => b.kind === 'image').map((b) => b.index))
  const missing = [...needed].filter((i) => !images.has(i)).sort((a, b) => a - b)
  if (missing.length) {
    throw new Error(`이미지 파일 없음: [이미지 ${missing.join(', ')}] — images/ 확인`)
  }

  return { dir: packageDir, title, hashtags, blocks, images }
}

function summarizePackage(pkg: ParsedPackage) {
  const textBlocks = pkg.blocks.filter((b) => b.kind === 'text').length
  const imageBlocks = pkg.blocks.filter((b) => b.kind === 'image').length
  return {
    dir: pkg.dir,
    title: pkg.title,
    textBlocks,
    imageBlocks,
    imageFiles: [...pkg.images.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([i, p]) => `${i}:${path.basename(p)}`),
    hashtags: pkg.hashtags ? pkg.hashtags.split(/\s+/).filter(Boolean).length : 0,
    blockOrder: pkg.blocks.map((b) => (b.kind === 'text' ? 'T' : `I${b.index}`)).join(' '),
  }
}

// ─── Browser helpers ─────────────────────────────────────────────────────────

function humanDelayMs(min = 1000, max = 3000): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

function isProfileLockError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /SingletonLock|profile.*lock|user data directory|already in use|ProcessSingleton/i.test(msg)
}

async function launchNaverContext() {
  await fs.mkdir(PROFILE_DIR, { recursive: true })
  try {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1440, height: 960 },
      locale: 'ko-KR',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--lang=ko-KR',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    })
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined)
    return context
  } catch (err) {
    if (isProfileLockError(err)) {
      throw new Error(
        `프로필이 이미 사용 중입니다: ${PROFILE_DIR}\n` +
          `다른 Chromium/Playwright 창을 닫고 다시 실행하세요.`,
      )
    }
    throw err
  }
}

async function writeClipboard(page: Page, html: string, plain: string) {
  const ok = await page.evaluate(
    async ({ htmlText, plainText }) => {
      try {
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          const item = new ClipboardItem({
            'text/html': new Blob([htmlText], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
          })
          await navigator.clipboard.write([item])
          return true
        }
      } catch {
        /* fall through */
      }
      try {
        await navigator.clipboard.writeText(plainText)
        return true
      } catch {
        return false
      }
    },
    { htmlText: html, plainText: plain },
  )
  if (!ok) {
    // fallback: insert via execCommand on focused element (last resort)
    await page.evaluate(
      ({ htmlText, plainText }) => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) {
          document.execCommand('insertText', false, plainText)
          return
        }
        const range = sel.getRangeAt(0)
        range.deleteContents()
        try {
          const tmp = document.createElement('div')
          tmp.innerHTML = htmlText
          const frag = document.createDocumentFragment()
          while (tmp.firstChild) frag.appendChild(tmp.firstChild)
          range.insertNode(frag)
        } catch {
          document.execCommand('insertText', false, plainText)
        }
      },
      { htmlText: html, plainText: plain },
    )
    return 'insert'
  }
  return 'clipboard'
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function firstVisible(frame: Frame | Page, selectors: readonly string[], timeout = 8000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const loc = frame.locator(sel).first()
      if (await loc.count().catch(() => 0)) {
        if (await loc.isVisible().catch(() => false)) return loc
      }
    }
    await sleep(200)
  }
  return null
}

async function dismissDraftRestorePopup(frame: Frame, page: Page) {
  // try inside editor frame and top page
  for (const root of [frame, page] as const) {
    for (const sel of SELECTORS.draftRestoreDismissCandidates) {
      const btn = root.locator(sel).first()
      if ((await btn.count()) === 0) continue
      if (!(await btn.isVisible().catch(() => false))) continue
      // Avoid dismissing unrelated dialogs that might be publish-related by text filter
      const text = ((await btn.textContent()) || '').trim()
      if (/발행|게시|publish/i.test(text)) continue
      await btn.click({ timeout: 2000 }).catch(() => undefined)
      await sleep(500)
      return
    }
  }
}

async function pasteInto(page: Page, frame: Frame, targetSelectors: readonly string[], html: string) {
  const target = await firstVisible(frame, targetSelectors, 12000)
  if (!target) throw new Error(`붙여넣기 대상 없음: ${targetSelectors.join(' | ')}`)
  await target.click({ timeout: 5000 })
  await sleep(200)
  // select-all existing content only for title (caller may clear first)
  const mode = await writeClipboard(page, html, htmlToPlain(html))
  if (mode === 'clipboard') {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V')
  }
  await sleep(400)
}

async function clearAndPasteTitle(page: Page, frame: Frame, title: string) {
  const target = await firstVisible(frame, SELECTORS.titleCandidates, 15000)
  if (!target) throw new Error(`제목 입력란을 찾지 못했습니다: ${SELECTORS.titleCandidates.join(' | ')}`)
  await target.click({ timeout: 5000 })
  await sleep(200)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await sleep(100)
  await page.keyboard.press('Backspace')
  await sleep(150)
  const mode = await writeClipboard(page, title, title)
  if (mode === 'clipboard') {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V')
  }
  await sleep(400)
}

async function focusBodyEnd(frame: Frame, page: Page) {
  const body = await firstVisible(frame, SELECTORS.bodyCandidates, 15000)
  if (!body) throw new Error(`본문 영역을 찾지 못했습니다: ${SELECTORS.bodyCandidates.join(' | ')}`)
  await body.click({ timeout: 5000 })
  // move caret to end
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'End')
  await sleep(200)
  return body
}

async function uploadImage(page: Page, frame: Frame, filePath: string) {
  // Prefer direct file input if already in DOM
  let fileInput = frame.locator(SELECTORS.fileInput).first()
  let hasInput = (await fileInput.count()) > 0

  if (!hasInput) {
    const photoBtn = await firstVisible(frame, SELECTORS.photoButtonCandidates, 8000)
    if (!photoBtn) {
      // try page-level toolbar (some SE layouts)
      const pageBtn = await firstVisible(page, SELECTORS.photoButtonCandidates, 3000)
      if (!pageBtn) throw new Error('사진 업로드 버튼을 찾지 못했습니다')
      await pageBtn.click()
    } else {
      await photoBtn.click()
    }
    await sleep(600)
    fileInput = frame.locator(SELECTORS.fileInput).first()
    hasInput = (await fileInput.count()) > 0
    if (!hasInput) {
      fileInput = page.locator(SELECTORS.fileInput).first()
      hasInput = (await fileInput.count()) > 0
    }
  }

  if (!hasInput) throw new Error('input[type=file] 을 찾지 못했습니다')

  await fileInput.setInputFiles(filePath)
  // wait for upload/processing
  await sleep(humanDelayMs(1800, 3200))
}

async function tryPasteHashtags(page: Page, frame: Frame, hashtags: string) {
  if (!hashtags.trim()) return false
  const tagSelectors = [
    '.se-hashtag',
    '[placeholder*="태그"]',
    '[placeholder*="해시"]',
    'button:has-text("태그")',
    '.se-section-tag',
  ]
  const target = await firstVisible(frame, tagSelectors, 3000)
  if (!target) return false
  try {
    await target.click({ timeout: 2000 })
    await sleep(200)
    await writeClipboard(page, hashtags, hashtags)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V')
    await sleep(400)
    return true
  } catch {
    return false
  }
}

async function clickDraftSave(frame: Frame, page: Page) {
  const candidates = [
    page.getByRole('button', { name: '임시저장' }).first(),
    frame.getByRole('button', { name: '임시저장' }).first(),
    page.getByText('임시저장', { exact: true }).first(),
    frame.getByText('임시저장', { exact: true }).first(),
    ...SELECTORS.draftSaveCandidates.flatMap((sel) => [
      page.locator(sel).first(),
      frame.locator(sel).first(),
    ]),
  ]

  for (const btn of candidates) {
    if ((await btn.count().catch(() => 0)) === 0) continue
    if (!(await btn.isVisible().catch(() => false))) continue
    const text = ((await btn.textContent().catch(() => '')) || '').trim()
    // hard guard: never click publish
    if (/발행|게시|공개\s*발행|publish/i.test(text) && !/임시저장/.test(text)) continue
    if (text && !/임시저장/.test(text)) continue
    await btn.click({ timeout: 5000 })
    return true
  }
  return false
}

async function saveFailureScreenshot(page: Page, packageDir: string) {
  const out = path.join(packageDir, '_inject-failed.png')
  try {
    await page.screenshot({ path: out, fullPage: true })
    console.error(`실패 스크린샷: ${out}`)
  } catch (err) {
    console.error('스크린샷 저장 실패:', err)
  }
}

function writeUrl(blogId: string) {
  // GoBlogWrite uses logged-in account; blog-id kept for future / logging
  void blogId
  return 'https://blog.naver.com/GoBlogWrite.naver'
}

// ─── Main flows ──────────────────────────────────────────────────────────────

async function runLoginOnly() {
  console.log(`프로필: ${PROFILE_DIR}`)
  console.log('브라우저를 엽니다. 네이버 로그인 후 이 터미널에서 Enter 를 누르세요.')
  const context = await launchNaverContext()
  const page = context.pages()[0] || (await context.newPage())
  await page.goto('https://blog.naver.com/nidlogin.login?url=https://blog.naver.com/GoBlogWrite.naver', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  })
  await new Promise<void>((resolve) => {
    process.stdin.resume()
    process.stdin.once('data', () => resolve())
  })
  console.log('로그인 세션 저장됨. 창을 닫습니다.')
  await context.close()
}

async function runInject(packageDir: string, blogId: string) {
  const pkg = await parsePackage(packageDir)
  console.log(JSON.stringify({ phase: 'parsed', ...summarizePackage(pkg) }, null, 2))

  const context = await launchNaverContext()
  const page = context.pages()[0] || (await context.newPage())

  try {
    const url = writeUrl(blogId)
    console.log(`글쓰기 진입: ${url} (blog-id=${blogId})`)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await sleep(2000)

    // login check
    if (/nid\.naver\.com|nidlogin/i.test(page.url())) {
      throw new Error(
        '로그인이 필요합니다. 먼저 실행하세요:\n' +
          `  npx tsx scripts/injectNaverBlogDraft.mts --login-only`,
      )
    }

    // wait for editor iframe (#mainFrame)
    await page.waitForSelector(SELECTORS.mainFrame, { timeout: 30_000 }).catch(() => undefined)
    let editorFrame: Frame | null = null
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      editorFrame =
        page.frame({ name: 'mainFrame' }) ||
        page.frames().find((f) => f.name() === 'mainFrame') ||
        null
      if (!editorFrame) {
        const byUrl = page.frames().find((f) => /PostWrite|SmartEditor|blog\.naver\.com/i.test(f.url()))
        if (byUrl && byUrl !== page.mainFrame()) editorFrame = byUrl
      }
      if (editorFrame) break
      await sleep(400)
    }
    if (!editorFrame) {
      editorFrame = page.mainFrame()
      console.warn('경고: #mainFrame 을 못 찾았습니다. 메인 프레임으로 진행합니다.')
    }

    await dismissDraftRestorePopup(editorFrame, page)
    await sleep(800)

    // Title
    console.log('제목 주입…')
    await clearAndPasteTitle(page, editorFrame, pkg.title)
    await sleep(humanDelayMs())

    // Body blocks
    console.log(`본문 블록 ${pkg.blocks.length}개 주입…`)
    await focusBodyEnd(editorFrame, page)

    // Clear default empty paragraph content once
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await sleep(100)
    await page.keyboard.press('Backspace')
    await sleep(300)

    for (let i = 0; i < pkg.blocks.length; i++) {
      const block = pkg.blocks[i]
      if (block.kind === 'text') {
        console.log(`  [${i + 1}/${pkg.blocks.length}] 텍스트`)
        // After first block, click body again and go to end before paste
        if (i > 0) {
          await focusBodyEnd(editorFrame, page)
          await page.keyboard.press('Enter')
          await sleep(200)
        }
        await pasteInto(page, editorFrame, SELECTORS.bodyCandidates, block.html)
      } else {
        const filePath = pkg.images.get(block.index)!
        console.log(`  [${i + 1}/${pkg.blocks.length}] 이미지 ${block.index} ← ${path.basename(filePath)}`)
        await focusBodyEnd(editorFrame, page)
        await page.keyboard.press('Enter')
        await sleep(200)
        await uploadImage(page, editorFrame, filePath)
      }
      await sleep(humanDelayMs())
    }

    // Hashtags (best-effort)
    if (pkg.hashtags) {
      const ok = await tryPasteHashtags(page, editorFrame, pkg.hashtags)
      console.log(ok ? '해시태그 주입 시도: 성공' : '해시태그 주입 시도: 스킵(필드 없음/실패)')
    }

    // Draft save only
    console.log('임시저장 클릭…')
    const saved = await clickDraftSave(editorFrame, page)
    if (!saved) {
      throw new Error('임시저장 버튼을 찾지 못했습니다 (발행 버튼은 클릭하지 않음)')
    }
    await sleep(2000)

    console.log('')
    console.log('✅ 초안 주입 + 임시저장 완료.')
    console.log('👉 브라우저를 열어 둔 채 검수 후, 직접 「발행」하세요. (자동화는 발행을 누르지 않습니다)')
    console.log('종료하려면 이 터미널에서 Enter.')
    await new Promise<void>((resolve) => {
      process.stdin.resume()
      process.stdin.once('data', () => resolve())
    })
  } catch (err) {
    await saveFailureScreenshot(page, packageDir)
    throw err
  } finally {
    await context.close().catch(() => undefined)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  if (args.loginOnly) {
    await runLoginOnly()
    return
  }

  if (!args.packageDir) {
    printHelp()
    throw new Error('패키지 폴더 경로가 필요합니다')
  }

  if (args.dryRun) {
    const pkg = await parsePackage(args.packageDir)
    console.log(JSON.stringify({ ok: true, dryRun: true, ...summarizePackage(pkg) }, null, 2))
    return
  }

  await runInject(args.packageDir, args.blogId)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
