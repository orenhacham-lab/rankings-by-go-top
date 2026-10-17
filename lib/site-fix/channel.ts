/**
 * Which way an approved fix reaches the site, per project. Server-side only.
 *
 *   Shopify            the store's own articles and pages, through the store's existing connection
 *                      when it may edit content (write_content, the scope publishing already uses):
 *                      SHOPIFY_FIX_TYPES (./shopify-admin.ts). Products, collections and every other
 *                      type keep their instructions. A connection without that scope: read-only.
 *   plugin connected   every fix type the installed plugin knows, through the Go Top plugin (signed).
 *                      A type newer than the plugin (PLUGIN_MIN_VERSION: h1_demote and llms_txt need
 *                      2.1.0) reads `needs_update`: it is never sent to an older plugin, and the
 *                      screen offers the update. A 2.0.0 install keeps every 2.0.0 type as before.
 *   plugin dropped     every approval is recorded and marked for manual update, and the screen
 *                      says so; "retry" applies them once the plugin answers again. A pairing whose
 *                      key cannot be read counts as dropped too ("connect again"), never connected.
 *   app password only  what the WordPress REST API allows today: the post title, image alt
 *                      text, an internal link, a broken link, an FAQ block (content) and, with an
 *                      SEO plugin and the 1.x bridge, the meta description. Canonical, focus
 *                      keyphrase and schema need the plugin ("install the plugin to fix the rest").
 *   webhook            every fix type is SENT to the developer's endpoint.
 *   nothing            WordPress: install the plugin; other platforms: instructions only.
 *   plugin-only types  h1_demote and llms_txt have no application-password or webhook path: without
 *                      the plugin they are "install the plugin" (WordPress) or instructions.
 *
 * Every read carries the project AND owner filter (the service role bypasses RLS).
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import type { PluginLink } from './plugin-client'
import { canWriteContent, SHOPIFY_FIX_TYPES } from './shopify-admin'
import { readPluginLink, type PluginLinkRow, type Scope } from './store'
import {
  FIX_TYPES, PLUGIN_LATEST_VERSION, PLUGIN_ONLY_TYPES, READ_PLUGIN_MIN_VERSION, pluginSupports, versionAtLeast, type FixCapabilities, type FixChannel, type FixType,
  type PluginState,
} from './types'

type Admin = ReturnType<typeof createAdminClient>

/** What the WordPress REST API can write without the plugin. */
export const APP_PASSWORD_TYPES: readonly FixType[] = ['seo_title', 'meta_description', 'image_alt', 'internal_link', 'broken_link', 'faq_block']

export interface FixContext {
  shopify: boolean
  /** The Shopify connection may edit articles and pages. */
  shopifyWrite?: boolean
  wordpressDetected: boolean
  creds: WordPressCredentials | null
  plugin: PluginLinkRow | null
  pluginLink: PluginLink | null
  webhook: { endpointUrl: string; secret: string } | null
  siteUrls: string[]
}

const missing = (e: unknown) => ['42P01', 'PGRST205'].includes(String((e as { code?: unknown } | null)?.code ?? ''))

export async function loadFixContext(admin: Admin, scope: Scope, decrypt: (s: string) => string, targetDomain: string | null): Promise<FixContext> {
  const { projectId, userId } = scope
  const [shop, wp, site, profile, plugin] = await Promise.all([
    admin.from('shopify_connections').select('connection_status, archived_at, granted_scopes')
      .eq('project_id', projectId).eq('user_id', userId).is('archived_at', null).maybeSingle(),
    admin.from('wordpress_connections').select('site_url, wp_username, wp_application_password_encrypted, connection_status')
      .eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
    admin.from('site_platform_connections').select('platform, endpoint_url, secret_encrypted, connection_status')
      .eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
    admin.from('project_profiles').select('detected_platform')
      .eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
    // Independent of the four above: read with them, not after them.
    readPluginLink(admin, scope),
  ])
  const shopRow = (shop.error ? null : shop.data) as { connection_status?: string; granted_scopes?: unknown } | null
  const wpRow = (wp.error ? null : wp.data) as { site_url: string; wp_username: string; wp_application_password_encrypted: string; connection_status: string | null } | null
  const siteRow = (site.error && missing(site.error) ? null : site.data) as { platform?: string; endpoint_url?: string | null; secret_encrypted?: string; connection_status?: string } | null
  const detected = String((profile.data as { detected_platform?: string | null } | null)?.detected_platform ?? '').toLowerCase()

  let creds: WordPressCredentials | null = null
  if (wpRow && wpRow.connection_status !== 'failed') {
    try { creds = { siteUrl: wpRow.site_url, username: wpRow.wp_username, applicationPassword: decrypt(wpRow.wp_application_password_encrypted) } }
    catch { console.error('[site-fix] wordpress credentials unreadable') }
  }
  let webhook: FixContext['webhook'] = null
  if (siteRow && siteRow.platform === 'webhook' && siteRow.connection_status === 'connected' && siteRow.endpoint_url && siteRow.secret_encrypted) {
    try { webhook = { endpointUrl: siteRow.endpoint_url, secret: decrypt(siteRow.secret_encrypted) } }
    catch { console.error('[site-fix] webhook secret unreadable') }
  }
  let pluginLink: PluginLink | null = null
  if (plugin) {
    try { pluginLink = { siteUrl: plugin.site_url, keyId: plugin.key_id, secret: decrypt(plugin.secret_encrypted) } }
    catch { console.error('[site-fix] plugin secret unreadable') }
  }
  const domain = String(targetDomain ?? '').trim()
  return {
    shopify: !!shopRow && shopRow.connection_status === 'connected',
    shopifyWrite: !!shopRow && shopRow.connection_status === 'connected' && canWriteContent(shopRow.granted_scopes),
    wordpressDetected: !!wpRow || detected.includes('wordpress') || detected.includes('woocommerce') || !!plugin,
    creds,
    plugin,
    pluginLink,
    webhook,
    siteUrls: [domain ? (/^https?:\/\//i.test(domain) ? domain : `https://${domain}`) : '', wpRow?.site_url ?? '', plugin?.site_url ?? ''].filter(Boolean),
  }
}

/**
 * The pairing as the screen sees it. `keyReadable` false (the stored key cannot be decrypted) never
 * reads as connected: nothing can be signed with it and "check again" cannot help, so the screen
 * gets one state, "connect again" (`rekey`), and every approval waits for a manual update.
 */
export function pluginStateOf(row: PluginLinkRow | null, keyReadable = true): PluginState {
  if (!row) return { state: 'none' }
  if (row.status === 'pending') return { state: 'pending', hint: row.secret_hint }
  if (!keyReadable) return { state: 'disconnected', lastSeenAt: row.last_seen_at, rekey: true }
  if (row.status === 'connected') return { state: 'connected', version: row.plugin_version, seoPlugin: row.seo_plugin, lastSeenAt: row.last_seen_at }
  return { state: 'disconnected', lastSeenAt: row.last_seen_at }
}

/** Pure: the channel each fix type would take right now. */
export function resolveCapabilities(ctx: FixContext, available: boolean): FixCapabilities {
  const plugin = pluginStateOf(ctx.plugin, !ctx.plugin || !!ctx.pluginLink)
  const mediaAlt = !ctx.shopify && ((plugin.state === 'connected' && !!ctx.pluginLink && versionAtLeast(plugin.version, READ_PLUGIN_MIN_VERSION)) || !!ctx.creds)
  const base = { available, plugin, appPassword: !!ctx.creds, mediaAlt, webhook: !!ctx.webhook, wordpress: ctx.wordpressDetected, pluginLatest: PLUGIN_LATEST_VERSION }
  if (ctx.shopify) {
    if (!ctx.shopifyWrite) return { ...base, shopify: true, readOnly: true, channelFor: {} }
    const shopFor: FixCapabilities['channelFor'] = {}
    for (const type of SHOPIFY_FIX_TYPES) shopFor[type] = 'shopify'
    return { ...base, shopify: true, readOnly: false, channelFor: shopFor }
  }
  const channelFor: FixCapabilities['channelFor'] = {}
  const version = plugin.state === 'connected' ? plugin.version : ctx.plugin?.plugin_version ?? null
  for (const type of FIX_TYPES) {
    let c: FixChannel | 'needs_plugin' | 'needs_update' | undefined
    const pluginOnly = PLUGIN_ONLY_TYPES.includes(type)
    if (plugin.state === 'connected' && ctx.pluginLink) c = pluginSupports(version, type) ? 'plugin' : 'needs_update'
    else if (plugin.state === 'disconnected') c = 'manual'
    else if (!pluginOnly && ctx.creds && APP_PASSWORD_TYPES.includes(type)) c = 'app_password'
    else if (!pluginOnly && ctx.webhook) c = 'webhook'
    else if (ctx.wordpressDetected) c = 'needs_plugin'
    if (c) channelFor[type] = c
  }
  return { ...base, readOnly: false, channelFor }
}

/**
 * An application-password site writes a meta description only through an SEO plugin (Yoast or Rank
 * Math) AND the 1.x bridge: WordPress itself has no such field. Where the site's own answer (its REST
 * namespaces, read once with the queue) shows either is missing, the row offers "install the plugin"
 * (the Go Top plugin writes the description itself) instead of a button whose preview can only refuse.
 * Pure. `seo` null (not read, no answer, a permission error): nothing is changed.
 */
export function withAppPasswordSeo(
  caps: FixCapabilities,
  seo: { plugin: string; hasBridge: boolean } | null,
): FixCapabilities {
  if (caps.channelFor.meta_description !== 'app_password' || !seo) return caps
  const known = seo.plugin === 'none' || seo.plugin === 'yoast' || seo.plugin === 'rankmath'
  const canWrite = (seo.plugin === 'yoast' || seo.plugin === 'rankmath') && seo.hasBridge
  if (!known || canWrite) return caps
  return { ...caps, channelFor: { ...caps.channelFor, meta_description: 'needs_plugin' } }
}
