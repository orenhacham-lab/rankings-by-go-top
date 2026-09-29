'use server'

/**
 * The "article design" card's server actions (and the article view's read of
 * the same settings). The contract (ownership, validation, the read-only mode
 * while the table is missing) lives in lib/content/article-style/data.ts and
 * runs under test there; this file only wires the real session, the platform
 * resolver and the SSRF-guarded site fetcher in. Every action answers a stable
 * code and never throws.
 */
import {
  loadArticleStyle,
  readSiteSignals,
  saveArticleStyle,
  saveOfficialProfiles,
  type ArticleStyleDeps,
  type LoadStyleResult,
  type SaveProfilesResult,
  type SaveStyleResult,
  type SiteSignalsResult,
} from '@/lib/content/article-style/data'
import type { DesignPlatform } from '@/lib/content/article-style/types'
import { loadActivePlatform } from '@/lib/content/platform/load-active-platform'
import { fetchSiteHtml } from '@/lib/free-check/site-fetch'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function liveDeps(): ArticleStyleDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
    // Called only after the project was proven the signed-in owner's.
    platform: async (projectId): Promise<DesignPlatform> => {
      const r = await loadActivePlatform(createAdminClient(), projectId)
      if (r.platform === 'shopify' || r.shopifyPresent) return 'shopify'
      if (r.platform === 'wordpress' || r.platform === 'wix' || r.platform === 'webhook') return r.platform
      return 'none'
    },
    fetchHome: async (domain) => {
      const host = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
      let url: URL
      try {
        url = new URL(`https://${host}/`)
      } catch {
        return null
      }
      const page = await fetchSiteHtml(url)
      return page.ok ? page.html : null
    },
  }
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)

export async function loadArticleStyleAction(projectId: string): Promise<LoadStyleResult> {
  try {
    return await loadArticleStyle(liveDeps(), projectId)
  } catch (err) {
    console.error('[article-style] load failed', { error: errorName(err) })
    return { ok: false, code: 'unavailable' }
  }
}

export async function saveArticleStyleAction(projectId: string, input: unknown): Promise<SaveStyleResult> {
  try {
    return await saveArticleStyle(liveDeps(), projectId, input)
  } catch (err) {
    console.error('[article-style] save failed', { error: errorName(err) })
    return { ok: false, code: 'save_failed' }
  }
}

export async function saveOfficialProfilesAction(projectId: string, input: unknown): Promise<SaveProfilesResult> {
  try {
    return await saveOfficialProfiles(liveDeps(), projectId, input)
  } catch (err) {
    console.error('[article-style] profiles save failed', { error: errorName(err) })
    return { ok: false, code: 'save_failed' }
  }
}

/** The home page's colours and profile links, read live for the owner to pick from. */
export async function readSiteSignalsAction(projectId: string): Promise<SiteSignalsResult> {
  try {
    return await readSiteSignals(liveDeps(), projectId)
  } catch (err) {
    console.error('[article-style] site read failed', { error: errorName(err) })
    return { ok: false, code: 'site_unreachable' }
  }
}
