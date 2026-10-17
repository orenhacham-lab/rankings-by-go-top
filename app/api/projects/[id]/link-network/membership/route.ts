/**
 * POST /api/projects/[id]/link-network/membership { join, consent, consentVersion }
 * Join the link network (only with explicit consent to the current text) or
 * leave it. Owner-checked in lib/link-network/http.ts.
 */
import { handleMembershipPost } from '@/lib/link-network/http'
import { liveNetworkDeps } from '../deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleMembershipPost(request, id, liveNetworkDeps())
}
