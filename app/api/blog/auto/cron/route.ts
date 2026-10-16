/**
 * The public blog's daily article, called BY HAND — GET/POST /api/blog/auto/cron
 *
 * The scheduler uses the per-language route (`/api/blog/auto/cron/<locale>`);
 * this one is the manual door: `?locale=he|en|es` writes that language, and no
 * language at all covers every language within a time budget. Everything it
 * does lives in lib/blog/auto/cron-run.ts, which both routes share.
 */

import { handleBlogAutoCron, isBlogAutoPublishEnabled } from '@/lib/blog/auto/cron-run'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export { isBlogAutoPublishEnabled }

const handle = (request: Request) =>
  handleBlogAutoCron(request, new URL(request.url).searchParams.get('locale'))

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
