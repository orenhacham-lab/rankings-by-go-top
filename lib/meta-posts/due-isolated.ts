/**
 * The Facebook/Instagram queue, drained beside the 15-minute article runner, the
 * same arrangement as lib/gbp/due-isolated.ts and for the same reason: a post
 * must go out within minutes of its time, and nothing here may ever be able to
 * delay or fail an article. Production only (Preview shares the Production
 * database), only while META_POSTS_ENABLED, and it never throws.
 */
import { isMetaPostsEnabled } from './config'

export type IsolatedMetaDueOutcome =
  | { status: 'ran'; attempted: number; published: number; failed: number }
  | { status: 'not_production' | 'feature_off' | 'no_schema' | 'error' }

export async function runIsolatedMetaDue(
  run: () => Promise<{ ok: false } | { ok: true; attempted: number; published: number; failed: number }> = async () => {
    const [{ createAdminClient }, { metaTablesPresent }, { publishDuePosts }] = await Promise.all([
      import('@/lib/supabase/admin'), import('./store'), import('./publish'),
    ])
    const admin = createAdminClient()
    if (!(await metaTablesPresent(admin))) return { ok: false }
    return { ok: true, ...(await publishDuePosts(admin)) }
  },
  opts: { env?: Record<string, string | undefined>; enabled?: () => boolean } = {},
): Promise<IsolatedMetaDueOutcome> {
  const env = opts.env ?? process.env
  if (env.VERCEL_ENV !== 'production') return { status: 'not_production' }
  if (!(opts.enabled ?? isMetaPostsEnabled)()) return { status: 'feature_off' }
  try {
    const out = await run()
    if (!out.ok) return { status: 'no_schema' }
    if (out.attempted > 0) console.log('[meta-due] pass complete', { attempted: out.attempted, published: out.published, failed: out.failed })
    return { status: 'ran', attempted: out.attempted, published: out.published, failed: out.failed }
  } catch {
    console.error('[meta-due] pass failed', { reason: 'threw' })
    return { status: 'error' }
  }
}
