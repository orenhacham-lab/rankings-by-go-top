/**
 * The Shopify App Store icon, from the same geometry as every other app icon
 * (components/brand/mark-geometry.ts), so the listing, the tab icon and the
 * sidebar mark stay one drawing.
 *
 * Two things differ from scripts/brand/icons.ts, both because of the App Store:
 *   - 1200x1200, the size the submission form asks for;
 *   - NO rounded corners in the file. Shopify rounds the icon itself, and a
 *     corner rounded twice leaves a pale notch, so the navy runs edge to edge.
 * The mark is also the whole icon: Shopify's icon guidance says to avoid text,
 * so the "GO TOP" wordmark of the full logo is not in it.
 *
 *   npx tsx scripts/brand/shopify-app-icon.ts [outDir]
 *
 * sharp is Next's own image dependency; nothing is fetched.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import sharp from 'sharp'
import { BRAND_BLUE, BRAND_NAVY, markShapes } from '../../components/brand/mark-geometry'

const SIZE = 1200
/** The cyan of the wordmark logo the owner supplied on 2026-10-11. */
const BRAND_CYAN = '#5EEAFF'

/**
 * The mark at 80% on a square ground, the same margin the other app icons keep,
 * which also leaves the mark clear of the corners Shopify rounds off.
 */
function iconSvg(ground: string, mark: string): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    + `<rect width="100" height="100" fill="${ground}"/>`
    + `<g transform="translate(10 11) scale(0.8)">${markShapes(mark)}</g>`
    + '</svg>'
}

const VARIANTS: [string, string, string][] = [
  // The app's own identity: what a merchant already sees in the sidebar and the tab.
  ['icon-navy-blue-1200.png', BRAND_NAVY, BRAND_BLUE],
  // The supplied logo's cyan, on the app's navy.
  ['icon-navy-cyan-1200.png', BRAND_NAVY, BRAND_CYAN],
  // Closest to the supplied file, with the wordmark dropped.
  ['icon-white-cyan-1200.png', '#FFFFFF', BRAND_CYAN],
]

async function main() {
  const outDir = process.argv[2] || join(__dirname, '..', '..', 'out-icons')
  mkdirSync(outDir, { recursive: true })
  for (const [name, ground, mark] of VARIANTS) {
    // Rendered well above the target, then resized, so the diagonal pixels stay clean.
    const data = await sharp(Buffer.from(iconSvg(ground, mark)), { density: 72 * 48 })
      .resize(SIZE, SIZE)
      .png({ compressionLevel: 9 })
      .toBuffer()
    writeFileSync(join(outDir, name), data)
    console.log(`${name}  ${SIZE}x${SIZE}  ${Math.round(data.length / 1024)}KB`)
  }
  console.log(`\nwritten to ${outDir}`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
