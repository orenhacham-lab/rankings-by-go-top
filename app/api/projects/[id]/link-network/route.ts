/**
 * GET /api/projects/[id]/link-network — the link network for one project: its
 * size, the switch, the link type in force, the caps and both sides' placement
 * log. proxy.ts does not cover /api/*: the handler authenticates and checks
 * ownership itself (lib/link-network/http.ts, guarded by
 * lib/link-network/__qa__/link-network.qa.ts). A read: no provider, no cost.
 */
import { handleNetworkGet } from '@/lib/link-network/http'
import { liveNetworkDeps } from './deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleNetworkGet(id, liveNetworkDeps())
}
