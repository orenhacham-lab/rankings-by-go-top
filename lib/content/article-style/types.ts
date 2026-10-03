/**
 * Article design settings, per project: how a generated article looks and which
 * images it carries. Stored in public.project_article_styles
 * (supabase/migrations/20260928000300_project_article_styles.sql), one row per
 * project, owner-only under RLS.
 *
 * NO ROW MEANS TODAY'S BEHAVIOUR. Until the owner saves the card (or while the
 * table does not exist yet), DEFAULT_ARTICLE_STYLE applies, and it is exactly
 * what the app did before this setting existed: plain semantic HTML, the
 * realistic 16:9 hero, no automatic images inside the article.
 *
 * Pure: no I/O, safe in the browser and on the server.
 */

export const ARTICLE_DESIGNS = ['formatted', 'minimal'] as const
export type ArticleDesign = (typeof ARTICLE_DESIGNS)[number]

/** The image styles the generator knows how to ask for (lib/content/article-style/image-prompt.ts). */
export const IMAGE_STYLES = ['realistic', 'illustration', 'watercolor', 'sketch', 'render3d', 'clay'] as const
export type ImageStyle = (typeof IMAGE_STYLES)[number]

export const HERO_RATIOS = ['16:9', '1:1'] as const
export type HeroRatio = (typeof HERO_RATIOS)[number]

/** How many images the generator places inside an article, automatically. */
export const MAX_INLINE_IMAGES = 4
/** How many brand colours a project keeps. The first is the main one. */
export const MAX_BRAND_COLORS = 6

export type ArticleStyle = {
  /** Lower-case #rrggbb, at most MAX_BRAND_COLORS, the first one leads. */
  brandColors: string[]
  design: ArticleDesign
  imageStyle: ImageStyle
  heroRatio: HeroRatio
  /** 0 to MAX_INLINE_IMAGES. */
  inlineImages: number
  /** No AI images at all: the owner adds their own site's images. */
  ownImagesOnly: boolean
}

export const DEFAULT_ARTICLE_STYLE: ArticleStyle = Object.freeze({
  brandColors: [],
  design: 'minimal',
  imageStyle: 'realistic',
  heroRatio: '16:9',
  inlineImages: 0,
  ownImagesOnly: false,
}) as ArticleStyle

/** The main colour when the owner has none: a calm, readable blue. */
export const FALLBACK_BRAND_COLOR = '#2f5bd3'

const HEX6 = /^#[0-9a-f]{6}$/

/** `#abc`, `#AABBCC`, `aabbcc` → `#aabbcc`; anything else → null. Only these ever reach HTML or the database. */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let s = input.trim().toLowerCase()
  if (!s.startsWith('#')) s = `#${s}`
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`
  return HEX6.test(s) ? s : null
}

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && HEX6.test(v)

/** Valid, de-duplicated, at most MAX_BRAND_COLORS. Invalid entries are dropped, never repaired into something else. */
export function cleanBrandColors(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const c of input) {
    const hex = normalizeHex(c)
    if (hex && !out.includes(hex)) out.push(hex)
    if (out.length >= MAX_BRAND_COLORS) break
  }
  return out
}

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback

/** A stored row (or anything) → a complete, valid style. Unknown values fall back to the defaults. */
export function toArticleStyle(row: Record<string, unknown> | null | undefined): ArticleStyle {
  if (!row) return { ...DEFAULT_ARTICLE_STYLE, brandColors: [] }
  const n = Number(row.inline_images ?? row.inlineImages)
  return {
    brandColors: cleanBrandColors(row.brand_colors ?? row.brandColors),
    design: oneOf(ARTICLE_DESIGNS, row.design, DEFAULT_ARTICLE_STYLE.design),
    imageStyle: oneOf(IMAGE_STYLES, row.image_style ?? row.imageStyle, DEFAULT_ARTICLE_STYLE.imageStyle),
    heroRatio: oneOf(HERO_RATIOS, row.hero_ratio ?? row.heroRatio, DEFAULT_ARTICLE_STYLE.heroRatio),
    inlineImages: Number.isInteger(n) && n >= 0 && n <= MAX_INLINE_IMAGES ? n : DEFAULT_ARTICLE_STYLE.inlineImages,
    ownImagesOnly: (row.own_images_only ?? row.ownImagesOnly) === true,
  }
}

/**
 * A save request from the screen, checked strictly: a value outside its list,
 * a colour that is not a hex colour or a count out of range is a rejected
 * request, never silently changed into something the owner did not choose.
 */
export function parseArticleStyleInput(input: unknown): ArticleStyle | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const v = input as Record<string, unknown>
  if (!Array.isArray(v.brandColors) || v.brandColors.length > MAX_BRAND_COLORS) return null
  const colors: string[] = []
  for (const c of v.brandColors) {
    const hex = normalizeHex(c)
    if (!hex) return null
    if (!colors.includes(hex)) colors.push(hex)
  }
  if (!(ARTICLE_DESIGNS as readonly unknown[]).includes(v.design)) return null
  if (!(IMAGE_STYLES as readonly unknown[]).includes(v.imageStyle)) return null
  if (!(HERO_RATIOS as readonly unknown[]).includes(v.heroRatio)) return null
  if (!Number.isInteger(v.inlineImages) || (v.inlineImages as number) < 0 || (v.inlineImages as number) > MAX_INLINE_IMAGES) return null
  if (typeof v.ownImagesOnly !== 'boolean') return null
  return {
    brandColors: colors,
    design: v.design as ArticleDesign,
    imageStyle: v.imageStyle as ImageStyle,
    heroRatio: v.heroRatio as HeroRatio,
    inlineImages: v.inlineImages as number,
    ownImagesOnly: v.ownImagesOnly,
  }
}

export function sameArticleStyle(a: ArticleStyle, b: ArticleStyle): boolean {
  return a.design === b.design && a.imageStyle === b.imageStyle && a.heroRatio === b.heroRatio &&
    a.inlineImages === b.inlineImages && a.ownImagesOnly === b.ownImagesOnly &&
    a.brandColors.length === b.brandColors.length && a.brandColors.every((c, i) => c === b.brandColors[i])
}

/** The row the owner writes. user_id is set by the server from the session, never from the request. */
export function toRow(style: ArticleStyle): Record<string, unknown> {
  return {
    brand_colors: style.brandColors,
    design: style.design,
    image_style: style.imageStyle,
    hero_ratio: style.heroRatio,
    inline_images: style.inlineImages,
    own_images_only: style.ownImagesOnly,
  }
}

/**
 * Where the article goes decides what design reaches the site. Shopify's
 * publisher (lib/shopify/publish-article.ts, frozen for the app review) runs its
 * own sanitizer that keeps no inline style, so a Shopify store always receives
 * the minimal design; the article view says so rather than show a design the
 * store will not get. Wix converts HTML to its own rich content and would turn
 * styled boxes into embedded HTML blocks, so it stays minimal too.
 */
export type DesignPlatform = 'wordpress' | 'webhook' | 'shopify' | 'wix' | 'none'
export function effectiveDesign(style: Pick<ArticleStyle, 'design'>, platform: DesignPlatform): ArticleDesign {
  if (platform === 'shopify' || platform === 'wix') return 'minimal'
  return style.design
}
