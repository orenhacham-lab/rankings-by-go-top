/**
 * Phase 4E — WordPress taxonomy + SEO-meta PURE helpers (no network, no deps).
 *
 * Split out so the resolution rules (primary-in-list, dedupe, invalid-term
 * filtering) and the SEO plugin/meta key selection + status mapping are unit-
 * testable without a live WordPress site. The client + publish core call these.
 */

export type SeoPlugin = 'yoast' | 'rankmath' | 'none' | 'unknown' | 'permission_error'
export type SeoMetaStatus =
  | 'verified'
  | 'written_not_verifiable'
  | 'plugin_unavailable'
  | 'permission_error'
  | 'exact_failure'
  // Core REST could not persist the protected SEO meta and the connected site does NOT expose
  // the GO TOP SEO companion endpoint — the values were NOT applied (never a success).
  | 'seo_bridge_required'

export interface TaxonomySelection {
  primaryCategoryId: number | null
  categoryIds: number[]
  tagIds: number[]
}

export interface ResolvedTaxonomy {
  /** Final category IDs to send (primary first, additional next, deduped). */
  categories: number[]
  /** Final tag IDs to send (deduped). */
  tags: number[]
  /** Selected IDs that don't exist on the site (dropped as a safe fallback). */
  invalidCategoryIds: number[]
  invalidTagIds: number[]
  /** True when anything was selected. */
  hasSelection: boolean
  /** True when a selected term was invalid/deleted (surface a warning). */
  warning: boolean
}

function uniquePositiveInts(ids: unknown): number[] {
  if (!Array.isArray(ids)) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const raw of ids) {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

/**
 * Resolve the final category/tag ID lists to send to WordPress.
 * Rules: the primary category is always included FIRST; additional categories
 * follow; duplicates removed; IDs not present in `existing*` are dropped and
 * reported (safe fallback — a deleted term must never fail the whole export).
 * `existingCategoryIds`/`existingTagIds` are the site's current term IDs; pass
 * null to skip validation (used only when the site terms couldn't be fetched).
 */
export function resolveTaxonomy(
  sel: TaxonomySelection,
  existingCategoryIds: number[] | null,
  existingTagIds: number[] | null,
): ResolvedTaxonomy {
  const primary = Number.isInteger(sel.primaryCategoryId) && (sel.primaryCategoryId as number) > 0 ? (sel.primaryCategoryId as number) : null
  // Primary first, then the rest — dedupe preserves first occurrence.
  const requestedCats = uniquePositiveInts([...(primary !== null ? [primary] : []), ...(sel.categoryIds || [])])
  const requestedTags = uniquePositiveInts(sel.tagIds)
  const hasSelection = requestedCats.length > 0 || requestedTags.length > 0

  const catSet = existingCategoryIds === null ? null : new Set(existingCategoryIds)
  const tagSet = existingTagIds === null ? null : new Set(existingTagIds)

  const categories = catSet ? requestedCats.filter((id) => catSet.has(id)) : requestedCats
  const tags = tagSet ? requestedTags.filter((id) => tagSet.has(id)) : requestedTags
  const invalidCategoryIds = catSet ? requestedCats.filter((id) => !catSet.has(id)) : []
  const invalidTagIds = tagSet ? requestedTags.filter((id) => !tagSet.has(id)) : []

  return {
    categories,
    tags,
    invalidCategoryIds,
    invalidTagIds,
    hasSelection,
    warning: invalidCategoryIds.length > 0 || invalidTagIds.length > 0,
  }
}

/** REST namespaces (from /wp-json?_fields=namespaces) → the detected SEO plugin. */
export function seoPluginFromNamespaces(namespaces: unknown): SeoPlugin {
  if (!Array.isArray(namespaces)) return 'unknown'
  const set = new Set(namespaces.map((n) => String(n).toLowerCase()))
  // Yoast exposes yoast/v1; Rank Math exposes rankmath/v1. Prefer an explicit
  // match; if both somehow appear, Yoast wins deterministically.
  if (set.has('yoast/v1')) return 'yoast'
  if (set.has('rankmath/v1')) return 'rankmath'
  return 'none'
}

/** The post-meta keys to write for a plugin (ONLY that plugin's keys). */
export function seoMetaKeys(
  plugin: SeoPlugin,
  seo: { metaTitle?: string | null; metaDescription?: string | null; focusKeyword?: string | null },
): Record<string, string> {
  const t = (seo.metaTitle || '').trim()
  const d = (seo.metaDescription || '').trim()
  const k = (seo.focusKeyword || '').trim()
  const meta: Record<string, string> = {}
  if (plugin === 'yoast') {
    if (t) meta._yoast_wpseo_title = t
    if (d) meta._yoast_wpseo_metadesc = d
    if (k) meta._yoast_wpseo_focuskw = k
  } else if (plugin === 'rankmath') {
    if (t) meta.rank_math_title = t
    if (d) meta.rank_math_description = d
    if (k) meta.rank_math_focus_keyword = k
  }
  return meta
}

/**
 * Given what we wrote and what the site read back, decide the verification
 * status. `readback` is the post's meta object after the write (or null when the
 * site doesn't expose it via REST — common for protected meta). A value counts
 * as verified when every written key is present with the same trimmed value.
 */
export function verifySeoMeta(written: Record<string, string>, readback: Record<string, unknown> | null): SeoMetaStatus {
  const keys = Object.keys(written)
  if (keys.length === 0) return 'plugin_unavailable' // nothing to write (no plugin / empty)
  if (!readback || typeof readback !== 'object') return 'written_not_verifiable'
  for (const key of keys) {
    const got = readback[key]
    const val = typeof got === 'string' ? got : Array.isArray(got) && typeof got[0] === 'string' ? got[0] : ''
    if (String(val).trim() !== written[key]) return 'written_not_verifiable'
  }
  return 'verified'
}

/** Per-field verification (SAFE for diagnostics — reports key names + present/matches only,
 *  never the values). Used by the companion-bridge readback and Preview logging. */
export function verifySeoMetaPerField(written: Record<string, string>, readback: Record<string, unknown> | null): { key: string; present: boolean; verified: boolean }[] {
  return Object.keys(written).map((key) => {
    const got = readback && typeof readback === 'object' ? readback[key] : undefined
    const val = typeof got === 'string' ? got : Array.isArray(got) && typeof got[0] === 'string' ? got[0] : ''
    const present = got !== undefined && got !== null && String(val).length > 0
    return { key, present, verified: present && String(val).trim() === written[key] }
  })
}

/** Whether the detected site exposes the GO TOP SEO companion bridge namespace. */
export function hasSeoBridgeNamespace(namespaces: unknown): boolean {
  return Array.isArray(namespaces) && namespaces.map((n) => String(n).toLowerCase()).includes('gotop/v1')
}

/**
 * TRUTHFUL classification of an SEO-meta outcome for the UI. success ONLY when the values
 * were confirmed applied (verified). Everything else is a warning/setup/error — never a
 * silent success.
 */
export function classifySeoStatus(status: SeoMetaStatus): { success: boolean; severity: 'success' | 'warning' | 'setup' | 'error' } {
  switch (status) {
    case 'verified': return { success: true, severity: 'success' }
    case 'plugin_unavailable': return { success: false, severity: 'setup' }
    case 'seo_bridge_required': return { success: false, severity: 'setup' }
    case 'permission_error': return { success: false, severity: 'error' }
    case 'written_not_verifiable': return { success: false, severity: 'warning' }
    case 'exact_failure': return { success: false, severity: 'error' }
    default: return { success: false, severity: 'error' }
  }
}
