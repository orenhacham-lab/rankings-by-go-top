/**
 * GET /api/projects/quota — whether the signed-in account can open another
 * project, for the switcher's "New project" entry (lib/projects/project-quota.ts).
 *
 * proxy.ts does not cover /api/*, so the handler authenticates the user itself.
 * It is a READ: it reserves, consumes and changes nothing. The entitlement is
 * read with the service-role client because billing_governance is REVOKEd from
 * `authenticated` (see lib/subscription.ts); it is read for THIS user's id only.
 * The project count uses the request-scoped client, owner-filtered and under RLS,
 * exactly as the create route counts.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserEntitlement, PLAN_LIMITS } from '@/lib/subscription'
import { projectQuota, type ProjectQuota } from '@/lib/projects/project-quota'

export const dynamic = 'force-dynamic'

const UNKNOWN: ProjectQuota = { state: 'unknown' }

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const entitlement = await getUserEntitlement(user.id, createAdminClient())
    const { count, error } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)
    return Response.json(projectQuota({
      isAdmin: entitlement.isAdmin,
      plan: entitlement.plan,
      maxProjects: PLAN_LIMITS[entitlement.plan].maxProjects,
      activeCount: error ? null : (count ?? 0),
    }))
  } catch {
    // Never a raw error, and never a false "limit reached": the entry stays on
    // and the create route decides, as before.
    return Response.json(UNKNOWN)
  }
}
