/**
 * The batch lane as a passenger on the 15-minute cron.
 *
 * Collect what finished, order what the queue will need next (./article-batch.ts).
 * Production only, because Preview shares the Production database and a preview
 * deployment must not spend money ordering drafts on its own schedule. Off
 * unless ARTICLE_BATCH_ENABLED is exactly "true".
 *
 * Isolated like the cron's other passengers: its own try/catch, it never throws,
 * and it holds no deadline of its own because neither pass waits on a model —
 * one job create and one get per job in flight. It cannot change, delay or fail
 * the runner.
 */
import { isArticleBatchEnabled } from './flag'
import type { BatchPassResult } from './article-batch'

export type IsolatedArticleBatchOutcome =
  | { status: 'ran'; ordered: number; ready: number; failed: number; stillRunning: number }
  | { status: 'not_production' | 'feature_off' | 'error' }

export async function runIsolatedArticleBatch(
  run: () => Promise<BatchPassResult> = async () => {
    const [{ createAdminClient }, { runArticleBatchPass }] = await Promise.all([
      import('@/lib/supabase/admin'), import('./article-batch'),
    ])
    return runArticleBatchPass(createAdminClient())
  },
  opts: { env?: Record<string, string | undefined>; enabled?: (env: NodeJS.ProcessEnv) => boolean } = {},
): Promise<IsolatedArticleBatchOutcome> {
  const env = opts.env ?? process.env
  if (env.VERCEL_ENV !== 'production') return { status: 'not_production' }
  if (!(opts.enabled ?? isArticleBatchEnabled)(env as NodeJS.ProcessEnv)) return { status: 'feature_off' }
  try {
    const out = await run()
    if (!out.enabled) return { status: 'feature_off' }
    const ordered = out.submitted?.ordered ?? 0
    const ready = out.collected?.ready ?? 0
    const failed = out.collected?.failed ?? 0
    const stillRunning = out.collected?.stillRunning ?? 0
    return { status: 'ran', ordered, ready, failed, stillRunning }
  } catch (e) {
    console.error('[article-batch] isolated pass failed', { message: e instanceof Error ? e.message : String(e) })
    return { status: 'error' }
  }
}
