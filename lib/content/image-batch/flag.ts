/**
 * The image batch lane's switch, in a file of its own so the generation path
 * and the cron can read it without pulling in the lane itself.
 *
 * OFF unless the value is exactly "true". Turned off, nothing new is ordered
 * and the collect pass still finishes whatever is already in flight — so
 * flipping it off never abandons an image a merchant is waiting for.
 */
export function isInlineImageBatchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.IMAGE_BATCH_ENABLED === 'true'
}
