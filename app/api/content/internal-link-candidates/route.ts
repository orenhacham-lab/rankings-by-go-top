/**
 * Content module — GET /api/content/internal-link-candidates?projectId=…
 *
 * Project-level list of internal-link candidates for the PRE-GENERATION planning
 * UI (the "תכנון קישורים פנימיים" section in the brief modal). Returns published
 * articles in the project with their keyword / secondary keywords / historical +
 * manual anchor bank. Read-only, ownership-gated, no WordPress, no migration.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { loadInternalLinkCandidates } from '@/lib/content/internal-link-candidates'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  try {
    const candidates = await loadInternalLinkCandidates(auth.admin, auth.project.id)
    return Response.json({ candidates })
  } catch (e) {
    // Table missing (migration not run) → empty, not a 500.
    if ((e as { code?: string })?.code === '42P01') return Response.json({ candidates: [] })
    console.error('[internal-link-candidates] load failed', { message: (e as Error)?.message })
    return Response.json({ error: 'Failed to load candidates' }, { status: 500 })
  }
}
