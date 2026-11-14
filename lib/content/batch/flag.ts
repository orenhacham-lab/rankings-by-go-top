/**
 * The batch lane's switch, in a file of its own so the generation path can read
 * it without importing ./article-batch.ts — which imports the generation path
 * back (see ./take-draft.ts on the same cycle).
 *
 * OFF unless the value is exactly "true". It governs both halves: ordering
 * drafts and using them. Turned off, nothing is ordered and a draft already on
 * the shelf is left alone until it ages out.
 */
export function isArticleBatchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ARTICLE_BATCH_ENABLED === 'true'
}
