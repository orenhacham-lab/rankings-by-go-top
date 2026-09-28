/**
 * POST /api/site-health/fix
 *   { projectId, action: 'preview', field, url, kind, keyword? }   read-only
 *   { projectId, action: 'apply', approved: true, expected, … }    writes
 *
 * "Fix it for me" on a WordPress site, through the connection the merchant
 * already made (the application password), and nowhere else. The preview reads
 * and proposes; only the preview's approve button sends `approved: true` with the
 * value the preview read, and the write happens only when the page still holds
 * it. The contract, owner filters included: lib/site-health/api.ts.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential } from '@/lib/security/credentials-crypto'
import {
  detectSeoCapabilities, findItemByUrl, getItemForEdit, searchItems, updateItemFields, writeVerifiedSeoMeta,
} from '@/lib/wordpress/client'
import { handleFix, liveReader } from '@/lib/site-health/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const body = await request.json().catch(() => null)
  try {
    const answer = await handleFix(body, {
      userId: user?.id ?? null,
      admin: createAdminClient(),
      decrypt: decryptCredential,
      wp: {
        findItemByUrl, getItemForEdit, updateItemFields, searchItems, detectSeoCapabilities, writeVerifiedSeoMeta,
        readLivePage: liveReader(),
      },
    })
    return Response.json(answer.body, { status: answer.status, headers: { 'cache-control': 'no-store' } })
  } catch {
    console.error('[site-health] fix failed')
    return Response.json({ ok: false, code: 'wordpress_unreachable' }, { status: 502 })
  }
}
