import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/auth/admin-role'

/**
 * Gate for operator-only API routes (setup diagnostics, logs, provider debug).
 *
 * API routes are NOT covered by proxy.ts (its matcher excludes /api/), so each
 * operator route must check for itself. The user comes from the verified
 * session; the role from profiles via the service-role client (isAdminUser).
 * Returns a ready 401/403 Response when the caller is not an administrator.
 */
export async function requireAdminApi(): Promise<
  { ok: true; userId: string } | { ok: false; response: Response }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  let admin = false
  try {
    admin = await isAdminUser(createAdminClient(), user.id)
  } catch {
    admin = false
  }
  if (!admin) return { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true, userId: user.id }
}

/**
 * True only while Supabase itself is not configured (first-run setup wizard).
 * In that state there is no session to check and no tenant data to expose.
 */
export function isSupabaseUnconfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return !url || !key || url.includes('your_') || key.includes('your_')
}
