/**
 * The Shopify search-engine-listing backfill as a passenger on the hourly cron.
 *
 * WHY IT RUNS ITSELF rather than waiting behind an operator's click: the fix is
 * for articles already on merchants' live blogs, and a backfill left as a button
 * in an admin panel is a backfill nobody runs. Measured 21 Nov 2026: 22
 * published Shopify articles across one store have no recorded listing, and the
 * whole backlog is three passes' work. The pass then costs one small query an
 * hour, for ever, and that is the price of not having to remember.
 *
 * Production only, because Preview shares the Production database: a preview
 * deployment must not start writing to a merchant's store on its own.
 *
 * Isolated like the cron's other passengers: a small page, its own budget inside
 * what is left of maxDuration, its own try/catch, and it never throws, so it
 * cannot change, delay or fail the runner above it.
 *
 * WHAT IT CAN DO TO A STORE, exactly: send `{ metafields: [...] }` for
 * `global.title_tag` and `global.description_tag` on an article we published,
 * and only where the merchant's own value is empty (lib/shopify/seo-backfill.ts).
 * It cannot touch a body, a title, a handle or a publication date, and it cannot
 * replace anything a merchant typed.
 */
import type { ShopifyBackfillReport } from './seo-backfill'

/** How many articles one pass will start. The backlog is small; the caution is not. */
export const SHOPIFY_SEO_BACKFILL_PAGE = 10
/** What is left for the pass after the work above it, at most 30 seconds. */
export const SHOPIFY_SEO_BACKFILL_BUDGET_MS = 30_000

export interface IsolatedShopifyBackfillResult {
  scanned: number
  written: number
  keptMerchantValue: number
  skipped: number
}

export type IsolatedShopifyBackfillOutcome =
  | ({ status: 'ran' } & IsolatedShopifyBackfillResult)
  | { status: 'not_production' | 'no_time' | 'error' }

/** A field this pass actually wrote, counted once per article. */
const wrote = (r: ShopifyBackfillReport): boolean => r.title === 'written' || r.description === 'written'
/** The merchant already had everything worth having — the rule doing its job. */
const kept = (r: ShopifyBackfillReport): boolean => r.skip === 'nothing_to_write'

export async function runIsolatedShopifySeoBackfill(
  run: (limit: number) => Promise<{ reports: ShopifyBackfillReport[]; scanned: number }> = async (limit) => {
    const [{ createAdminClient }, { runShopifySeoBackfillPage }] = await Promise.all([
      import('@/lib/supabase/admin'), import('./seo-backfill'),
    ])
    return runShopifySeoBackfillPage(createAdminClient(), { apply: true, limit })
  },
  opts: { env?: Record<string, string | undefined>; startedAtMs?: number; maxDurationMs?: number } = {},
): Promise<IsolatedShopifyBackfillOutcome> {
  const env = opts.env ?? process.env
  if (env.VERCEL_ENV !== 'production') return { status: 'not_production' }

  const now = Date.now()
  const endOfRun = (opts.startedAtMs ?? now) + (opts.maxDurationMs ?? 0)
  const left = Math.min(SHOPIFY_SEO_BACKFILL_BUDGET_MS, endOfRun - now)
  // Two Shopify calls per article. Under five seconds is not enough for one.
  if (left < 5_000) return { status: 'no_time' }

  try {
    const page = await run(SHOPIFY_SEO_BACKFILL_PAGE)
    const result: IsolatedShopifyBackfillResult = {
      scanned: page.scanned,
      written: page.reports.filter(wrote).length,
      keptMerchantValue: page.reports.filter(kept).length,
      skipped: page.reports.filter((r) => r.skip !== null && !kept(r)).length,
    }
    // Silent once the backlog is empty, so the pass leaves no line behind it.
    if (result.scanned > 0) console.log('[shopify-seo-backfill] pass complete', result)
    return { status: 'ran', ...result }
  } catch (e) {
    console.error('[shopify-seo-backfill] pass failed', { message: e instanceof Error ? e.message : String(e) })
    return { status: 'error' }
  }
}
