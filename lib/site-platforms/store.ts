/**
 * Reading and writing `site_platform_connections`. Server-side only.
 *
 * Every function takes the service-role client and filters by the project id
 * the caller already proved the user owns (authContentProject) — the admin
 * client bypasses RLS, so the filter here is the isolation.
 *
 * The table arrives with a migration the owner applies to Production. Until
 * then every read treats a missing table as "no Wix or webhook connection", so
 * WordPress and Shopify projects behave exactly as before.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential } from '@/lib/security/credentials-crypto'
import { loadBillingGovernance, type GovernanceLookup } from '@/lib/billing/governance'
import type { SiteConnectionRow, SitePlatform, SiteErrorCode } from './types'

type Admin = ReturnType<typeof createAdminClient>
export const SITE_TABLE = 'site_platform_connections'

/** PostgREST / Postgres "that relation does not exist (yet)". */
export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703' || /does not exist|schema cache/i.test(error.message ?? '')
}

/** The project's row, or null. A read failure other than a missing table is `error`. */
export async function readSiteConnection(admin: Admin, projectId: string):
  Promise<{ ok: true; row: SiteConnectionRow | null } | { ok: false }> {
  const { data, error } = await admin.from(SITE_TABLE).select('*').eq('project_id', projectId).maybeSingle()
  if (error) {
    if (isMissingRelation(error)) return { ok: true, row: null }
    console.error('[site-platform] connection read failed', { code: (error as { code?: string }).code ?? 'unknown' })
    return { ok: false }
  }
  return { ok: true, row: (data as SiteConnectionRow | null) ?? null }
}

export type LoadedSiteConnection =
  | { platform: 'wix'; row: SiteConnectionRow; siteId: string; apiKey: string; memberId: string | null }
  | { platform: 'webhook'; row: SiteConnectionRow; endpointUrl: string; secret: string }

/**
 * The row plus its decrypted secret, for the moment of use. Refuses a
 * connection that is not 'connected' (the Wix pair failed its test, or was never
 * tested), like loadShopifyConnection does.
 */
export async function loadSiteConnection(admin: Admin, projectId: string, opts: { allowInactive?: boolean } = {}):
  Promise<{ ok: true; conn: LoadedSiteConnection } | { ok: false; code: SiteErrorCode }> {
  const read = await readSiteConnection(admin, projectId)
  if (!read.ok) return { ok: false, code: 'unexpected' }
  const row = read.row
  if (!row) return { ok: false, code: 'no_site_connection' }
  if (row.connection_status !== 'connected' && !opts.allowInactive) return { ok: false, code: 'site_connection_inactive' }
  let secret: string
  try {
    secret = decryptCredential(row.secret_encrypted)
  } catch {
    console.error('[site-platform] credential decryption failed', { platform: row.platform })
    return { ok: false, code: 'credentials_unreadable' }
  }
  if (row.platform === 'wix') {
    if (!row.wix_site_id) return { ok: false, code: 'no_site_connection' }
    return { ok: true, conn: { platform: 'wix', row, siteId: row.wix_site_id, apiKey: secret, memberId: row.wix_member_id } }
  }
  if (!row.endpoint_url) return { ok: false, code: 'no_site_connection' }
  return { ok: true, conn: { platform: 'webhook', row, endpointUrl: row.endpoint_url, secret } }
}

/** Record a test/publish outcome on the row (a code, never provider text). */
export async function markSiteConnection(admin: Admin, projectId: string, patch: { status: 'connected' | 'failed'; code: SiteErrorCode | null }): Promise<void> {
  const now = new Date().toISOString()
  await admin.from(SITE_TABLE)
    .update({ connection_status: patch.status, last_error_code: patch.code, last_tested_at: now, updated_at: now })
    .eq('project_id', projectId)
}

/**
 * Whether this project's platform may be switched from the web app.
 *
 * A merchant who installed from the Shopify App Store is governed by Shopify
 * (lib/billing/governance.ts): their store IS their site, and that flow must not
 * change. So the "change platform" action is not offered to them, and the
 * site-platform routes refuse to connect or disconnect for them.
 *
 * When governance cannot be read, it fails closed exactly where it matters: a
 * project with a Shopify store keeps it.
 */
export function isPlatformSwitchLocked(governance: GovernanceLookup, shopifyPresent: boolean): boolean {
  if (governance.status === 'loaded') {
    return governance.governance.billingAuthority === 'shopify' || governance.governance.signupOrigin === 'shopify_app_store'
  }
  if (governance.status === 'missing') return false
  return shopifyPresent
}

/** Which of the two existing platforms has a row (connected or not) — used by the exclusivity check. */
export async function existingPlatformRows(admin: Admin, projectId: string): Promise<{ wordpress: boolean; shopify: boolean }> {
  const [{ data: wp }, { data: sh }] = await Promise.all([
    admin.from('wordpress_connections').select('id').eq('project_id', projectId).maybeSingle(),
    admin.from('shopify_connections').select('id').eq('project_id', projectId).is('archived_at', null).maybeSingle(),
  ])
  return { wordpress: !!wp, shopify: !!sh }
}

/** The owner's governance + the project's Shopify row, read once for a route. */
export async function loadSwitchLock(admin: Admin, userId: string, projectId: string): Promise<{ locked: boolean; rows: { wordpress: boolean; shopify: boolean } }> {
  const [governance, rows] = await Promise.all([loadBillingGovernance(admin, userId), existingPlatformRows(admin, projectId)])
  return { locked: isPlatformSwitchLocked(governance, rows.shopify), rows }
}

export type { SitePlatform }
