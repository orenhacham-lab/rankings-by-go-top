/**
 * Brand colours: the palette an article is drawn in, derived from the owner's
 * colours, and the colours a site declares for itself, read off its home page.
 *
 * Every colour that leaves this file is a lower-case #rrggbb (normalizeHex), so
 * nothing a site or a request says can reach an article's style attribute.
 *
 * Reading a page is linear in its size: only the first SCAN_LIMIT characters
 * are looked at, and each pattern is bounded.
 */
import { FALLBACK_BRAND_COLOR, MAX_BRAND_COLORS, normalizeHex } from './types'

type Rgb = [number, number, number]

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** `a` moved towards `b` by `t` (0 keeps a, 1 is b). */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a), y = toRgb(b)
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

/** The colour darkened until it reads on white (4.5:1), for links and headings. */
export function readableOnWhite(hex: string): string {
  let c = hex
  for (let i = 0; i < 12 && contrast(c, '#ffffff') < 4.5; i++) c = mix(c, '#000000', 0.12)
  return c
}

/** Black or white, whichever reads better on the colour. */
export const inkOn = (hex: string) => (contrast(hex, '#ffffff') >= contrast(hex, '#111111') ? '#ffffff' : '#111111')

/** The article's palette: everything the formatted design paints with, from at most two brand colours. */
export type ArticlePalette = {
  /** The main brand colour as the owner chose it (box headers, the CTA). */
  brand: string
  /** Text on `brand`. */
  brandInk: string
  /** The brand colour dark enough for text on white: headings' rule, links, labels. */
  text: string
  /** A very light tint for box backgrounds. */
  soft: string
  /** A light tint for borders. */
  line: string
  /** The second brand colour when there is one, else a shade of the first: the takeaways' markers. */
  accent: string
  /** Body text and quiet text: neutral, never the brand. */
  ink: string
  muted: string
}

export function articlePalette(colors: readonly string[]): ArticlePalette {
  const brand = normalizeHex(colors[0]) ?? FALLBACK_BRAND_COLOR
  const second = normalizeHex(colors[1])
  const text = readableOnWhite(brand)
  return {
    brand,
    brandInk: inkOn(brand),
    text,
    soft: mix(brand, '#ffffff', 0.92),
    line: mix(brand, '#ffffff', 0.72),
    accent: second ? readableOnWhite(second) : mix(text, '#000000', 0.15),
    ink: '#1f2328',
    muted: '#57606a',
  }
}

// ── Reading a site's colours ───────────────────────────────────────────────

const SCAN_LIMIT = 400_000
const CSS_LIMIT = 200_000

export type SampledColor = { hex: string; source: 'theme' | 'brand' | 'frequent' }

function saturation(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max === min) return 0
  const l = (max + min) / 2
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
}

/** Greys, near-white and near-black say nothing about a brand. */
function isBrandish(hex: string): boolean {
  const l = luminance(hex)
  return saturation(hex) >= 0.18 && l > 0.02 && l < 0.9
}

/** Two colours a reader could not tell apart are one colour. */
function distinct(list: SampledColor[], hex: string): boolean {
  const [r, g, b] = toRgb(hex)
  return list.every((c) => {
    const [x, y, z] = toRgb(c.hex)
    return Math.abs(r - x) + Math.abs(g - y) + Math.abs(b - z) > 48
  })
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(`<meta\\b[^>]{0,300}?(?:name|property)\\s*=\\s*["']${name}["'][^>]{0,300}>`, 'i')
  const tag = html.match(re)?.[0]
  return tag?.match(/content\s*=\s*["']([^"']{1,40})["']/i)?.[1] ?? null
}

/**
 * The colours a home page declares for itself, best first: its theme colour,
 * CSS variables named like a brand colour (--primary, --brand, --accent…), then
 * the saturated colours its own CSS uses most. At most MAX_BRAND_COLORS.
 */
export function sampleSiteColors(rawHtml: string): SampledColor[] {
  const html = String(rawHtml ?? '').slice(0, SCAN_LIMIT)
  const out: SampledColor[] = []
  const add = (value: string | null | undefined, source: SampledColor['source']) => {
    const hex = normalizeHex(value)
    if (hex && isBrandish(hex) && distinct(out, hex) && out.length < MAX_BRAND_COLORS) out.push({ hex, source })
  }

  add(metaContent(html, 'theme-color'), 'theme')
  add(metaContent(html, 'msapplication-TileColor'), 'theme')

  // The page's own CSS: <style> blocks and style="" attributes.
  let css = ''
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
  let m: RegExpExecArray | null
  while ((m = styleRe.exec(html)) !== null && css.length < CSS_LIMIT) css += m[1] + '\n'
  const attrRe = /\bstyle\s*=\s*"([^"]{1,500})"/gi
  while ((m = attrRe.exec(html)) !== null && css.length < CSS_LIMIT) css += m[1] + ';\n'
  css = css.slice(0, CSS_LIMIT)

  const varRe = /--[a-z0-9-]*(?:primary|brand|accent|main|theme|secondary)[a-z0-9-]*\s*:\s*(#[0-9a-f]{3,6})\b/gi
  while ((m = varRe.exec(css)) !== null) add(m[1], 'brand')

  const counts = new Map<string, number>()
  const hexRe = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi
  while ((m = hexRe.exec(css)) !== null) {
    const hex = normalizeHex(m[0])
    if (hex && isBrandish(hex)) counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  for (const [hex] of [...counts.entries()].sort((a, b) => b[1] - a[1])) add(hex, 'frequent')
  return out
}
