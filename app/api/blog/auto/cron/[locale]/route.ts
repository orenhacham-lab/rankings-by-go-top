/**
 * ONE LANGUAGE'S DAILY ARTICLE — GET/POST /api/blog/auto/cron/<locale>
 *
 * The route the scheduler calls, once per language (vercel.json). It exists
 * because Vercel's cron configuration is keyed by PATH: three jobs that differed
 * only by `?locale=` left just one of them running (12 Oct 2026, Spanish), and
 * Vercel's own documentation parameterizes a job through a path segment. The
 * work itself is lib/blog/auto/cron-run.ts, shared with the manual route.
 */

import { handleBlogAutoCron } from '@/lib/blog/auto/cron-run'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const handle = async (request: Request, ctx: { params: Promise<{ locale: string }> }) => {
  const { locale } = await ctx.params
  return handleBlogAutoCron(request, locale)
}

export async function GET(request: Request, ctx: { params: Promise<{ locale: string }> }) {
  return handle(request, ctx)
}
export async function POST(request: Request, ctx: { params: Promise<{ locale: string }> }) {
  return handle(request, ctx)
}
