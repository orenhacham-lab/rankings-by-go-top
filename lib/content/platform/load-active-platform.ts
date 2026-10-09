/**
 * Server helper: load the connection rows (WordPress, Shopify, Wix/webhook) for a project and resolve the active publishing
 * platform via the shared pure resolver. A project with no application-password row but a connected
 * GO TOP SEO Bridge plugin >= 3.0.0 is a connected WordPress (it publishes through the plugin). Reads connection_status (validity) — NOT mere row
 * existence — plus Shopify granted_scopes/can_publish. Never returns credentials.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { hasWriteContent } from '@/lib/shopify/constants'
import { resolveActivePlatform, siteConnectionState, type ActivePlatformResult } from './active-platform'
import { isMissingRelation, SITE_TABLE } from '@/lib/site-platforms/store'
import { hasPublishPlugin } from '@/lib/content/wordpress-plugin-publish'

type Admin = ReturnType<typeof createAdminClient>

export async function loadActivePlatform(admin: Admin, projectId: string): Promise<ActivePlatformResult> {
  const [{ data: wp }, { data: sh }, siteRes] = await Promise.all([
    admin.from('wordpress_connections').select('connection_status').eq('project_id', projectId).maybeSingle(),
    admin.from('shopify_connections').select('connection_status, granted_scopes').eq('project_id', projectId).is('archived_at', null).maybeSingle(),
    admin.from(SITE_TABLE).select('platform, connection_status').eq('project_id', projectId).maybeSingle(),
  ])
  // Wix / webhook: a missing table (migration not applied yet) is "none"; any
  // other read failure is logged by code and also read as "none", which leaves
  // WordPress and Shopify resolution exactly as it was.
  if (siteRes.error && !isMissingRelation(siteRes.error)) {
    console.warn('[active-platform] site connection read failed', { code: (siteRes.error as { code?: string }).code ?? 'unknown' })
  }
  const site = siteConnectionState(siteRes.error ? null : siteRes.data as { platform?: unknown; connection_status?: unknown } | null)
  // No application-password row: a GO TOP SEO Bridge plugin >= 3.0.0 that is connected publishes on
  // its own (lib/content/wordpress-plugin-publish.ts), so it counts as a connected WordPress. Read
  // by the project and its owner. With a row, everything resolves exactly as before.
  const wpRow = (wp as { connection_status?: string | null } | null)
    ?? (await hasPublishPlugin(admin, projectId) ? { connection_status: 'connected' } : null)
  const shRow = sh as { connection_status?: string | null; granted_scopes?: string[] | null } | null
  return resolveActivePlatform({
    wordpress: { present: !!wpRow, connectionStatus: wpRow?.connection_status ?? null },
    shopify: { present: !!shRow, connectionStatus: shRow?.connection_status ?? null, canPublish: hasWriteContent(shRow?.granted_scopes) },
    site,
  })
}
