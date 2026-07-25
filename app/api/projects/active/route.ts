/**
 * Area D — GET /api/projects/active
 *
 * The authoritative list the global active-project selector validates against:
 * the caller's OWNED + ACTIVE projects, with updated_at for the most-recently-
 * updated fallback. Ownership is enforced server-side (user_id = auth.uid(), also
 * backed by RLS). This is a read-only list; every data route still runs its own
 * ownership check — the client-side active projectId is never trusted for auth.
 */
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, updated_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[projects/active] list failed', { code: (error as { code?: string }).code })
    return Response.json({ error: 'Failed to load projects' }, { status: 500 })
  }
  return Response.json({ projects: data ?? [] })
}
