/**
 * Single-site Naver package export (body images only via buildNaverBlogPackage).
 * Usage:
 *   npx tsx scripts/exportOneNaverPackage.mts /tmp/one_site.json ~/Downloads/naver-blog-packages
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildNaverBlogPackage } from '../src/lib/naverBlogPackageBuilder'
import type { ShowroomCaseCanonicalBlogPost } from '../src/lib/showroomCaseCanonicalBlog'

const PUBLIC_BASE = 'https://www.findgagu.co.kr'

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

function scrubBadSiteNames<T>(value: T): T {
  const text = JSON.stringify(value)
  const cleaned = text
    .replaceAll('2511 서울권 관리형 현장', '다원 DNA 독학관')
    .replaceAll('2511 서울권 관리형 7627', '견적 2511 다원 DNA 독학관')
    .replaceAll('서울권 관리형 7627', '다원 DNA 독학관')
    .replaceAll('서울권 관리형', '다원 DNA 독학관')
  return JSON.parse(cleaned) as T
}

async function main() {
  const srcPath = process.argv[2]
  const outRoot = process.argv[3] || path.join(process.env.HOME || '', 'Downloads/naver-blog-packages')
  if (!srcPath) throw new Error('usage: exportOneNaverPackage.mts <bundle.json> [outRoot]')

  const raw = JSON.parse(await fs.readFile(srcPath, 'utf8')) as {
    site_name?: string
    post?: ShowroomCaseCanonicalBlogPost
    bundle?: { site_name: string; post: ShowroomCaseCanonicalBlogPost }
  }
  const siteName = (raw.bundle?.site_name || raw.site_name || '').trim()
  let post = raw.bundle?.post || raw.post
  if (!siteName || !post) throw new Error('bundle missing site_name/post')

  post = scrubBadSiteNames(post)
  if (!post.bodyMarkdown?.trim()) throw new Error('bodyMarkdown empty')

  const pkg = buildNaverBlogPackage({
    post,
    displayLabel: siteName,
    publicBaseUrl: PUBLIC_BASE,
  })

  const folderName = siteName.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80)
  const dir = path.join(outRoot, folderName)
  // wipe previous package for this site
  await fs.rm(dir, { recursive: true, force: true })
  const imagesDir = path.join(dir, 'images')
  await fs.mkdir(imagesDir, { recursive: true })

  await fs.writeFile(path.join(dir, 'body.html'), pkg.bodyHtml, 'utf8')
  await fs.writeFile(path.join(dir, 'body.md'), pkg.bodyMarkdown, 'utf8')
  await fs.writeFile(path.join(dir, 'titles.txt'), pkg.titleCandidates.join('\n'), 'utf8')
  await fs.writeFile(path.join(dir, 'title.selected.txt'), pkg.titleCandidates[0] || post.title || '', 'utf8')
  await fs.writeFile(path.join(dir, 'hashtags.txt'), pkg.hashtags.join(' '), 'utf8')
  await fs.writeFile(
    path.join(dir, 'checklist.txt'),
    pkg.publishingChecklist.map((line, i) => `${i + 1}. ${line}`).join('\n'),
    'utf8',
  )
  await fs.writeFile(path.join(dir, 'source.url'), pkg.canonicalSourceUrl, 'utf8')
  await fs.writeFile(
    path.join(dir, 'alts.txt'),
    pkg.images.map((img) => `${img.index}\t${img.filename}\t${img.alt}`).join('\n'),
    'utf8',
  )

  let downloaded = 0
  const skipped: string[] = []
  for (const img of pkg.images) {
    const buf = await download(img.url)
    if (!buf) {
      skipped.push(img.filename)
      continue
    }
    await fs.writeFile(path.join(imagesDir, img.filename), buf)
    downloaded += 1
  }

  const markerCount = (pkg.bodyMarkdown.match(/\[이미지\s*\d+\]/g) || []).length
  const rawMdLeft = (pkg.bodyMarkdown.match(/!\[[^\]]*\]\(https?:\/\//g) || []).length
  const imageFiles = (await fs.readdir(imagesDir)).filter((f) => !f.startsWith('.'))

  const report = {
    ok:
      markerCount === pkg.images.length &&
      downloaded === pkg.images.length &&
      skipped.length === 0 &&
      rawMdLeft === 0 &&
      imageFiles.length === pkg.images.length,
    siteName,
    dir,
    title: pkg.titleCandidates[0],
    markers: markerCount,
    imagesListed: pkg.images.length,
    downloaded,
    imageFiles: imageFiles.length,
    skipped,
    rawMarkdownImagesLeft: rawMdLeft,
    source: pkg.canonicalSourceUrl,
  }
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(2)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
