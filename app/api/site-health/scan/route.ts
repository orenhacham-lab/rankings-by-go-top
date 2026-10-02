/**
 * POST /api/site-health/scan  { projectId }
 *
 * Reads the project's own site (bounded: lib/site-health/scan.ts) and answers
 * with an NDJSON stream: progress lines while pages are read, then the report.
 * Writes nothing, stores nothing, calls no paid provider.
 *
 * proxy.ts does not cover /api/*: handleScan authenticates, and every read it
 * makes with the service role is filtered by the project AND its owner
 * (lib/site-health/sources.ts). The contract: lib/site-health/api.ts.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleScan } from '@/lib/site-health/api'
import type { ScanStreamLine } from '@/lib/site-health/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const body = await request.json().catch(() => null)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (line: ScanStreamLine) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
      try {
        await handleScan(body, { userId: user?.id ?? null, admin: createAdminClient() }, emit)
      } catch {
        console.error('[site-health] scan failed')
        emit({ type: 'error', code: 'scan_failed' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    status: user ? 200 : 401,
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  })
}
