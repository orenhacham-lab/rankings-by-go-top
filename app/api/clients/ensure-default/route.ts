/**
 * Area C — POST /api/clients/ensure-default
 *
 * Ensures the authenticated user has a default client (see ensureDefaultClient).
 * Body is IGNORED: every field is derived server-side from the session + auth
 * metadata, so a caller can never influence what is written. Best-effort — the
 * signup flow calls this but never blocks on its outcome.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { ensureDefaultClient } from '@/lib/clients/ensure-default-client'

export async function POST() {
  const supabase = await createClient()
  const result = await ensureDefaultClient(supabase)
  if (result.status === 'skipped' && result.reason === 'no_user') {
    return NextResponse.json(result, { status: 401 })
  }
  if (result.status === 'created') revalidatePath('/clients')
  return NextResponse.json(result, { status: 200 })
}
