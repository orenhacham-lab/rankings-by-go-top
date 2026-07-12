/**
 * Phase 4F.1 — provider-neutral mapping of stored Shopify entities into the
 * app's EXISTING source-agnostic target models. PURE (no network/DB) so the
 * mapping is unit-testable and so shared recommendation/link-planning logic
 * never becomes Shopify-specific.
 *
 * Two shared consumers:
 *   - InternalLinkCandidate  (loadInternalLinkCandidates → planner/candidate layer)
 *   - ScannedTarget          (wordpress_content_index.targets → indexed targets)
 *
 * Only ACTIVE (published + still-present) entities are emitted as valid targets.
 */

import type { InternalLinkCandidate } from '@/lib/content/internal-link-candidates'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import type { ShopifyEntityType } from './types'

/** The stored shopify_entities row shape this module consumes. */
export interface ShopifyEntityRow {
  shopify_gid: string
  entity_type: ShopifyEntityType
  title: string | null
  handle: string | null
  canonical_url: string | null
  status: string | null
  is_active: boolean
  body_excerpt: string | null
  metadata: Record<string, unknown> | null
}

/** A Shopify entity is a usable internal-link target only when active + has a URL. */
function isUsableTarget(row: ShopifyEntityRow): boolean {
  return !!row.is_active && !!row.canonical_url && /^https:\/\//i.test(row.canonical_url)
}

function labelFor(row: ShopifyEntityRow): string {
  const t = (row.title || '').trim()
  if (t) return t
  const h = (row.handle || '').trim()
  return h ? h.replace(/[-_]+/g, ' ') : row.entity_type
}

/**
 * Secondary keyword signals from type-specific metadata (product_type, vendor,
 * tags, blog title). Best-effort — empty when unavailable. Never invents data.
 */
function secondaryKeywords(row: ShopifyEntityRow): string[] {
  const md = row.metadata || {}
  const out: string[] = []
  const push = (v: unknown) => { if (typeof v === 'string' && v.trim()) out.push(v.trim()) }
  push(md.product_type)
  push(md.vendor)
  push(md.blog_title)
  if (Array.isArray(md.tags)) for (const tag of md.tags) push(tag)
  // Dedupe case-insensitively, cap to a small, relevant set.
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const k of out) {
    const key = k.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(k)
    if (deduped.length >= 6) break
  }
  return deduped
}

/**
 * Map active Shopify entities → InternalLinkCandidate[] (kind 'internal_url'),
 * the exact shape loadInternalLinkCandidates returns. Stable id per entity so
 * repeated loads dedupe naturally. No historical anchors (no prior on-site use).
 */
export function toInternalLinkCandidates(rows: ShopifyEntityRow[]): InternalLinkCandidate[] {
  const out: InternalLinkCandidate[] = []
  for (const row of rows) {
    if (!isUsableTarget(row)) continue
    out.push({
      id: `shopify:${row.shopify_gid}`,
      kind: 'internal_url',
      title: labelFor(row),
      url: row.canonical_url as string,
      keyword: null,
      secondaryKeywords: secondaryKeywords(row),
      historicalAnchors: [],
    })
  }
  return out
}

const ROLE_BY_TYPE: Record<ShopifyEntityType, ScannedTarget['targetRole']> = {
  product: 'product_or_specific_offer',
  collection: 'commercial_category_or_service_hub',
  page: 'strategic_content_page',
  blog: 'content_hub',
  article: 'post_or_article',
}
const PRIORITY_BY_TYPE: Record<ShopifyEntityType, ScannedTarget['targetPriority']> = {
  product: 'product_or_specific_offer',
  collection: 'commercial_category_or_service_hub',
  page: 'strategic_content_page',
  blog: 'strategic_content_page',
  article: 'post_or_article',
}
const SCAN_TYPE_BY_ENTITY: Record<ShopifyEntityType, ScannedTarget['targetType']> = {
  product: 'product',
  collection: 'category',
  page: 'page',
  blog: 'page',
  article: 'post',
}

/**
 * Map active Shopify entities → ScannedTarget[] (the indexed-content-target
 * model). Anchor analysis is empty (Shopify bodies aren't crawled for inbound
 * anchors in this phase); the target is keyword-available via its title so it
 * can serve as a planning destination.
 */
export function toScannedTargets(rows: ShopifyEntityRow[]): ScannedTarget[] {
  const out: ScannedTarget[] = []
  for (const row of rows) {
    if (!isUsableTarget(row)) continue
    const title = labelFor(row)
    out.push({
      targetUrl: row.canonical_url as string,
      targetType: SCAN_TYPE_BY_ENTITY[row.entity_type],
      targetTitle: title,
      inboundLinkCount: 0,
      eligibility: 'yes',
      eligibilityReason: 'shopify_entity',
      targetRole: ROLE_BY_TYPE[row.entity_type],
      targetPriority: PRIORITY_BY_TYPE[row.entity_type],
      keywordSource: 'title',
      primaryKeywordCandidate: title,
      keywordAvailable: !!title,
      usableAnchorsCount: 0,
      cautionAnchorsCount: 0,
      rejectedAnchorsCount: 0,
      onlyGenericAnchors: false,
      usableAnchors: [],
      cautionAnchors: [],
      rejectedAnchors: [],
      exampleSources: [],
      matchedGeneratedArticleId: null,
      matchedGeneratedArticleTitle: null,
      contentSkipped: false,
    })
  }
  return out
}
