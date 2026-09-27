/**
 * Whether the seeding scan is on for this merchant: the same rule the seed
 * route's own gate applies (lib/seed-scan/http.ts, step 3), so a screen never
 * offers what the API would refuse. ENABLE_SEED_SCAN=true turns it on for
 * everyone; with it off, only administrators get it. Production has it off.
 *
 * "Off" means today's product exactly: the new-project form, no summary route,
 * no start route. Nothing is asked of the database when the flag is on, and an
 * administrator lookup that fails counts as "not an administrator".
 */
export function seedScanFlagOn(env: Record<string, string | undefined>): boolean {
  return env.ENABLE_SEED_SCAN === 'true'
}

/**
 * Whether the free check runs the whole research (seed stage A) for a visitor
 * before sign-up (lib/presignup). It needs the seeding scan on, because a
 * claimed research becomes a project's seed run, AND its own switch,
 * ENABLE_PRESIGNUP_RESEARCH=true, so a preview can keep the short check while
 * the research's tables are not migrated. Production has both off: the free
 * check is exactly today's, and the research API answers 404.
 */
export function presignupResearchOn(env: Record<string, string | undefined>): boolean {
  return seedScanFlagOn(env) && env.ENABLE_PRESIGNUP_RESEARCH === 'true'
}

export async function seedScanAvailable(args: {
  env: Record<string, string | undefined>
  isAdmin: () => Promise<boolean>
}): Promise<boolean> {
  if (seedScanFlagOn(args.env)) return true
  try {
    return (await args.isAdmin()) === true
  } catch {
    return false
  }
}
