/**
 * POST /api/projects/[id]/link-network/placements/[placementId]/reject
 * The giving side takes a network link out of a draft before it is published.
 * Owner-checked in lib/link-network/http.ts.
 */
import { handleRejectPost } from '@/lib/link-network/http'
import { liveNetworkDeps } from '../../../deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string; placementId: string }> }) {
  const { id, placementId } = await params
  return handleRejectPost(request, id, placementId, liveNetworkDeps())
}
