/**
 * The image batch lane's collect pass as a passenger on the 15-minute cron.
 *
 * Collect only: images are ORDERED at generation time, where their prompts are
 * known (./inline-image-batch.ts, submitInlineImageBatch). This pass asks Google
 * which jobs finished and stores what came back.
 *
 * Production only, because Preview shares the Production database and a preview
 * deployment must not collect (and store) images on its own schedule. Off unless
 * IMAGE_BATCH_ENABLED is exactly "true" — and note that turning it off still
 * lets nothing be abandoned: ordering stops, while whatever is already in flight
 * is no longer collected, so flip it off only together with the deploy that
 * turns ordering off, or leave it on until the open jobs have drained.
 *
 * Isolated like the cron's other passengers: its own try/catch, it never throws,
 * and it cannot change, delay or fail the runner.
 */
import { isInlineImageBatchEnabled } from './flag'
import type { CollectImagesResult } from './inline-image-batch'

export type IsolatedImageBatchOutcome =
  | ({ status: 'ran' } & CollectImagesResult)
  | { status: 'not_production' | 'feature_off' | 'error' }

export async function runIsolatedInlineImageBatch(
  run: () => Promise<CollectImagesResult> = async () => {
    const [{ createAdminClient }, { runInlineImageBatchPass }] = await Promise.all([
      import('@/lib/supabase/admin'), import('./inline-image-batch'),
    ])
    return runInlineImageBatchPass(createAdminClient())
  },
  opts: { env?: Record<string, string | undefined>; enabled?: (env: NodeJS.ProcessEnv) => boolean } = {},
): Promise<IsolatedImageBatchOutcome> {
  const env = opts.env ?? process.env
  if (env.VERCEL_ENV !== 'production') return { status: 'not_production' }
  if (!(opts.enabled ?? isInlineImageBatchEnabled)(env as NodeJS.ProcessEnv)) return { status: 'feature_off' }
  try {
    return { status: 'ran', ...(await run()) }
  } catch (e) {
    console.error('[image-batch] isolated pass failed', { message: e instanceof Error ? e.message : String(e) })
    return { status: 'error' }
  }
}
