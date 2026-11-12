/**
 * Every public page offers a link preview image.
 *
 * The defect this guards against, measured on 12.11.2026: a page that declares
 * its own `openGraph` object does not inherit the root layout's `images`, so 79
 * public pages served no `og:image` at all. A directory fetching a preview of
 * our free AI-crawler checker — the asset that earns our do-follow links — got
 * `null`, and every share of those pages showed a bare link.
 *
 * Run: npx tsx lib/seo/__qa__/social-preview.qa.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SOCIAL_PREVIEW_IMAGE } from '../social-preview'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++
  else { failed++; console.log('FAIL', name, detail) }
}

const ROOT = join(__dirname, '..', '..', '..')
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(p)
  }
  return out
}

/** The `openGraph: { ... }` object's text, or null when the file declares none. */
function openGraphBlock(src: string): string | null {
  const at = src.search(/openGraph:\s*\{/)
  if (at === -1) return null
  const start = src.indexOf('{', at)
  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return null
}

const files = [...sourceFiles(join(ROOT, 'app'))]
const declaring = files
  .map((p) => ({ p, block: openGraphBlock(stripComments(readFileSync(p, 'utf8'))) }))
  .filter((f): f is { p: string; block: string } => f.block !== null)

check('A1: some page declares openGraph, so this suite is measuring something',
  declaring.length > 0, String(declaring.length))

const imageless = declaring.filter((f) => !/\bimages\b/.test(f.block))
check('A2: every page that declares openGraph also declares images, because a declared openGraph does not inherit the layout\'s',
  imageless.length === 0, imageless.map((f) => f.p.slice(ROOT.length + 1)).join(', '))

check('A3: the preview image is an absolute URL — this project sets no metadataBase, so a relative path does not resolve to our origin',
  SOCIAL_PREVIEW_IMAGE.startsWith('https://www.gotopseo.com/'), SOCIAL_PREVIEW_IMAGE)

check('A4: the preview image is not on the agency domain',
  !SOCIAL_PREVIEW_IMAGE.includes('gotop.co.il'), SOCIAL_PREVIEW_IMAGE)

const asset = SOCIAL_PREVIEW_IMAGE.replace('https://www.gotopseo.com/', '')
let assetBytes = 0
try { assetBytes = statSync(join(ROOT, 'public', asset)).size } catch { assetBytes = 0 }
check('A5: the file the preview image points at is actually in public/, so the URL is not a 404',
  assetBytes > 0, `public/${asset}`)

check('MUTATION CONTROL: a page declaring openGraph with no images is caught',
  /\bimages\b/.test(openGraphBlock("openGraph: { title: 'x', url: 'y' }") ?? '') === false)
check('MUTATION CONTROL: a relative preview path is caught',
  '/gotop-primary.png'.startsWith('https://www.gotopseo.com/') === false)
check('MUTATION CONTROL: the block reader finds images when they are there',
  /\bimages\b/.test(openGraphBlock("openGraph: { images: ['a'], title: 'x' }") ?? ''))
check('MUTATION CONTROL: a missing public asset is caught',
  (() => { try { return statSync(join(ROOT, 'public', 'no-such-preview.png')).size > 0 } catch { return false } })() === false)

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
