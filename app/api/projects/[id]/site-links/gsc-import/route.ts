/**
 * GET / POST /api/projects/[id]/site-links/gsc-import — the Search Console Links
 * file the owner imported for the project (a snapshot; it never updates by itself).
 *
 * proxy.ts does not cover /api/*, so the handlers authenticate the user and check
 * project ownership themselves; the whole contract lives in
 * lib/site-links/gsc-import/http.ts and is exercised by its __qa__ guard. This
 * file only wires the real dependencies in. It calls no provider and spends nothing.
 */
import { handleGscImportGet, handleGscImportPost, type GscImportDeps } from '@/lib/site-links/gsc-import/http'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function liveDeps(): GscImportDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null }
    },
    admin: () => createAdminClient(),
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleGscImportGet(id, liveDeps())
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleGscImportPost(id, request, liveDeps())
}
