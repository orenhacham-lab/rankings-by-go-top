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
