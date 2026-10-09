/**
 * The project's publishing connections, as the three connection routes answer
 * them, decided once (./known): WordPress, Shopify, and the Wix / custom-site one.
 *
 * Loading until all three answered; an error when any of them failed (a failed
 * read says nothing about the connection, so no "choose a platform" is drawn on
 * it); ready with each connection, or null for "not connected", otherwise.
 *
 * Pure: no React, no I/O.
 */
import { allKnown, connectionAnswer, ready, type Known, type ReadResponse } from './known'

export function projectConnectionUrls(projectId: string): { wordpress: string; shopify: string; site: string } {
  const id = encodeURIComponent(projectId)
  return {
    wordpress: `/api/wordpress/connection?projectId=${id}`,
    shopify: `/api/shopify/connection?projectId=${id}`,
    site: `/api/site-platforms/connection?projectId=${id}`,
  }
}

export interface ProjectConnections<W = unknown, S = unknown, X = unknown> {
  wordpress: W | null
  shopify: S | null
  site: X | null
  /** A Shopify App Store merchant: the platform may not be switched. */
  switchLocked: boolean
  /** The Shopify route's per-type entity counts, when it sent them. */
  shopifyCounts: Record<string, number> | null
  /**
   * The GO TOP SEO Bridge plugin (>= 3.0.0) the WordPress route reports as publishing for this
   * project (its `publishingPlugin`), or null. A project can publish through it with no
   * application password (lib/content/wordpress-plugin-publish.ts).
   */
  wordpressPlugin: { siteUrl: string; version: string } | null
}

/** The WordPress route's `publishingPlugin`, when it is well formed. */
export function publishingPluginFrom(body: Record<string, unknown> | null | undefined): { siteUrl: string; version: string } | null {
  const p = body?.publishingPlugin as { siteUrl?: unknown; version?: unknown } | null | undefined
  if (!p || typeof p !== 'object' || typeof p.siteUrl !== 'string' || typeof p.version !== 'string' || !p.siteUrl || !p.version) return null
  return { siteUrl: p.siteUrl, version: p.version }
}

export function projectConnectionsFrom<W = unknown, S = unknown, X = unknown>(r: {
  wordpress: ReadResponse | null | undefined
  shopify: ReadResponse | null | undefined
  site: ReadResponse | null | undefined
}): Known<ProjectConnections<W, S, X>> {
  const all = allKnown(
    connectionAnswer<W>(r.wordpress ?? null),
    connectionAnswer<S>(r.shopify ?? null),
    connectionAnswer<X>(r.site ?? null),
  )
  if (all.state !== 'ready') return all
  const [wp, sh, st] = all.value
  const counts = sh.body.counts
  return ready({
    wordpress: wp.connection,
    shopify: sh.connection,
    site: st.connection,
    switchLocked: st.body.switchLocked === true,
    shopifyCounts: counts && typeof counts === 'object' ? (counts as Record<string, number>) : null,
    wordpressPlugin: publishingPluginFrom(wp.body),
  })
}
