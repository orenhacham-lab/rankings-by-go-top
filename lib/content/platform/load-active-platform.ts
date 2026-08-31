/**
 * Server helper: load both connection rows for a project and resolve the active publishing
 * platform via the shared pure resolver. Reads connection_status (validity) — NOT mere row
 * existence — plus Shopify granted_scopes/can_publish. Never returns credentials.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { hasWriteContent } from '@/lib/shopify/constants'
import { resolveActivePlatform, type ActivePlatformResult } from './active-platform'

type Admin = ReturnType<typeof createAdminClient>

export async function loadActivePlatform(admin: Admin, projectId: string): Promise<ActivePlatformResult> {
  const [{ data: wp }, { data: sh }] = await Promise.all([
    admin.from('wordpress_connections').select('connection_status').eq('project_id', projectId).maybeSingle(),
    admin.from('shopify_connections').select('connection_status, granted_scopes').eq('project_id', projectId).is('archived_at', null).maybeSingle(),
  ])
  const wpRow = wp as { connection_status?: string | null } | null
  const shRow = sh as { connection_status?: string | null; granted_scopes?: string[] | null } | null
  return resolveActivePlatform({
    wordpress: { present: !!wpRow, connectionStatus: wpRow?.connection_status ?? null },
    shopify: { present: !!shRow, connectionStatus: shRow?.connection_status ?? null, canPublish: hasWriteContent(shRow?.granted_scopes) },
  })
}
