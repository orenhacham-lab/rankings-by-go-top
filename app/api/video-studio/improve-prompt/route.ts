/** POST — turn a rough idea plus chips into a video prompt. Free, flag-gated, authenticated. 404 unless the studio is on. */
import { authContentProject } from '@/lib/content/api-auth'
import { isVideoStudioEnabled } from '@/lib/video-studio/config'
import { allowImprove, fallbackFor, improvePrompt, parsePlanInput } from '@/lib/video-studio/improve'
import { realImproveDeps } from '@/lib/video-studio/improve-deps'
import { PUBLIC_LOCALES, type PublicLocale } from '@/lib/i18n/locales'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  if (!isVideoStudioEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw || JSON.stringify(raw).length > 4096) return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  const projectId = typeof raw.projectId === 'string' ? raw.projectId : ''
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ ok: false, error: auth.status === 401 ? 'unauthorized' : auth.status === 403 ? 'forbidden' : 'not_found' }, { status: auth.status })
  const input = parsePlanInput(raw)
  if (!input) return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  const locale = (PUBLIC_LOCALES as readonly string[]).includes(String(raw.locale)) ? (raw.locale as PublicLocale) : 'en'
  // Over the hourly brake the answer is still useful: the plan is built locally and generation goes on.
  if (!allowImprove(auth.user.id)) return Response.json({ ok: true, ...fallbackFor(input) })
  const r = await improvePrompt(realImproveDeps, input, locale)
  return Response.json({ ok: true, ...r })
}
