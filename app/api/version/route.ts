/**
 * GET /api/version — safe deploy-identity endpoint (runtime verification).
 *
 * Returns ONLY non-secret Vercel build/runtime values so the exact commit a
 * Preview/prod URL is serving can be proven from the outside. Never hardcodes the
 * SHA and never exposes secrets.
 */

import { runtimeInfo } from '@/lib/runtime-info'

// Node runtime + never cached, so the values reflect this deployment/instance.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(runtimeInfo())
}
