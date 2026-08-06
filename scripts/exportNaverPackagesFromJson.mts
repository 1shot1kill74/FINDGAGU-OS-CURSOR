/**
 * One-off: build naver-blog package folders from exported canonical_blog_post JSON files.
 * Usage:
 *   npx tsx scripts/exportNaverPackagesFromJson.mts /tmp/naver_posts_export ~/Downloads/naver-blog-packages
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

async function main() {
  const srcDir = process.argv[2] || '/tmp/naver_posts_export'
  const outRoot = process.argv[3] || path.join(process.env.HOME || '', 'Downloads/naver-blog-packages')
  await fs.mkdir(outRoot, { recursive: true })

  const files = (await fs.readdir(srcDir)).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(path.join(srcDir, file), 'utf8')) as {
      site_name: string
      post: ShowroomCaseCanonicalBlogPost
    }
    const post = raw.post
    const siteName = raw.site_name || post.siteName
    const pkg = buildNaverBlogPackage({
      post,
      displayLabel: siteName,
      publicBaseUrl: PUBLIC_BASE,
    })

    const folderName = siteName.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80)
    const dir = path.join(outRoot, folderName)
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
    console.log(
      JSON.stringify({
        siteName,
        dir,
        markers: markerCount,
        imagesListed: pkg.images.length,
        downloaded,
        skipped,
        title: pkg.titleCandidates[0],
        source: pkg.canonicalSourceUrl,
      }),
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
