/**
 * Content automation — GET /api/content/automation/health
 *
 * Deploy/flags diagnostic. Intentionally NOT gated by the feature flags or
 * CRON_SECRET so it always returns 200 JSON when the code is deployed — a way to
 * distinguish "route not deployed" (generic Next 404 HTML) from "flags off"
 * (the cron route's JSON 404). Exposes no secrets.
 */

import { isContentModuleEnabled, isContentAutomationEnabled } from '@/lib/content/api-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({
    ok: true,
    contentEnabled: isContentModuleEnabled(),
    automationEnabled: isContentAutomationEnabled(),
    cronSecretConfigured: !!process.env.CRON_SECRET,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  })
}
