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

/**
 * The hero image's own switch, fully independent of the body images'.
 *
 * Separate because the hero is the riskier half of the lane — it is what a
 * merchant sees first on opening a draft — so it can be turned off alone
 * without stopping the body images, and turned on alone to try it.
 *
 * Independent in both directions: the cron's collect pass runs when EITHER
 * switch is on (./isolated.ts), so a hero already in flight is still stored
 * after the body images' ordering is turned off.
 */
export function isHeroImageBatchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HERO_IMAGE_BATCH_ENABLED === 'true'
}
