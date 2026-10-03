/**
 * Renders the favicon and the app icons from the mark's SVG geometry, so the tab
 * icon, the home-screen icon and the sidebar mark are one drawing
 * (components/brand/mark-geometry.ts): the light-blue mark on the rail's navy,
 * with 22% corners (UX review, decision 1).
 *
 *   npx tsx scripts/brand/icons.ts            write the icon files
 *   npx tsx scripts/brand/icons.ts --check    exit 1 if any file differs from a fresh render
 *
 * sharp is Next's own image dependency; nothing is fetched.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import sharp from 'sharp'
import { appIconSvg } from '../../components/brand/mark-geometry'

const ROOT = join(__dirname, '..', '..')

const PNGS: [string, number][] = [
  ['public/favicon-16.png', 16],
  ['public/favicon-32.png', 32],
  ['public/favicon-64.png', 64],
  ['public/favicon-192.png', 192],
  ['public/favicon-512.png', 512],
  ['public/icon.png', 192],
  ['public/apple-touch-icon.png', 180],
  ['app/icon.png', 512],
  ['app/apple-icon.png', 180],
]
const ICOS = ['public/favicon.ico', 'app/favicon.ico']
const ICO_SIZES = [16, 32, 48]

async function png(size: number): Promise<Buffer> {
  // Rendered at a high density, then resized, so small sizes are antialiased cleanly.
  return sharp(Buffer.from(appIconSvg()), { density: 72 * Math.max(1, Math.ceil(size / 100) * 4) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** An .ico holding PNG images (valid since Windows Vista, read by every browser). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries: Buffer[] = []
  let offset = 6 + 16 * images.length
  for (const img of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 0)
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(img.data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += img.data.length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

async function main() {
  const check = process.argv.includes('--check')
  const files: [string, Buffer][] = []
  for (const [rel, size] of PNGS) files.push([rel, await png(size)])
  const icoData = ico(await Promise.all(ICO_SIZES.map(async (size) => ({ size, data: await png(size) }))))
  for (const rel of ICOS) files.push([rel, icoData])

  const stale: string[] = []
  for (const [rel, data] of files) {
    const path = join(ROOT, rel)
    if (check) {
      let current: Buffer | null = null
      try { current = readFileSync(path) } catch { /* missing */ }
      if (!current || !current.equals(data)) stale.push(rel)
    } else {
      writeFileSync(path, data)
    }
  }
  if (check) {
    console.log(stale.length === 0 ? 'icons: up to date' : `icons: stale ${stale.join(', ')}`)
    if (stale.length > 0) process.exit(1)
  } else {
    console.log(`icons: wrote ${files.length} files`)
  }
}
main()

export {}
