/**
 * What the connected GO TOP SEO Bridge plugin can do, beyond site-health fixes. Server-side only.
 *
 * 3.1.0 (includes/read.php) does everything that needed a WordPress application password before:
 * the content list and one item's HTML (content index, internal-link scan, site map), the authors,
 * the Media Library alt text, and on /publish scheduling, a second post, an author and taking over
 * the post the app recorded for an article. 3.0.0 does none of these: callers keep the application
 * password path (when the project has one) or the typed refusal they had before.
 *
 * GATE. `/status` answers `capabilities` from 3.1.0; the stored link keeps only the version, so the
 * gate is the version (every 3.1 capability needs >= 3.1.0) or, when a fresh /status is at hand, its
 * list. A site that updated the plugin since its last check reads as older until one signed /status
 * (refreshedPlugin) stores the new version; nothing else changes on that read.
 *
 * The service role bypasses RLS: the plugin link is read by project AND owner.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential } from '@/lib/security/credentials-crypto'
import { markPluginLink, readPluginLink, type Scope } from './store'
import { pluginStatus, type PluginLink, type PluginPost } from './plugin-client'
import { READ_PLUGIN_MIN_VERSION, versionAtLeast } from './types'

type Admin = ReturnType<typeof createAdminClient>

/** The first plugin version that needs no application password for anything. */
export { READ_PLUGIN_MIN_VERSION } from './types'

/** includes/read.php gotop_seo_bridge_capabilities(), in the same order. */
export const PLUGIN_CAPABILITIES = ['content', 'content_item', 'authors', 'media_alt', 'terms_links', 'schedule', 'new_post', 'author', 'adopt'] as const
export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number]

const MIN_VERSION: Record<PluginCapability, string> = {
  content: '3.1.0', content_item: '3.1.0', authors: '3.1.0', media_alt: '3.1.0', terms_links: '3.1.0',
  schedule: '3.1.0', new_post: '3.1.0', author: '3.1.0', adopt: '3.1.0',
}

/** The plugin can do this: its own list when known, otherwise its version. */
export function pluginCan(version: string | null | undefined, cap: PluginCapability, capabilities?: readonly string[] | null): boolean {
  if (Array.isArray(capabilities)) return capabilities.includes(cap)
  return versionAtLeast(version, MIN_VERSION[cap])
}

export interface ConnectedPlugin {
  link: PluginLink
  version: string
  seoPlugin: 'yoast' | 'rankmath' | 'none' | null
  scope: Scope
}

export interface ConnectedPluginDeps { decrypt?: (s: string) => string; post?: PluginPost }

/**
 * The project's connected plugin link (key readable), whatever its version, or null.
 * `ownerId`, when given, must be the project's owner.
 */
export async function loadConnectedPlugin(
  admin: Admin, projectId: string, opts: { ownerId?: string | null } & ConnectedPluginDeps = {},
): Promise<ConnectedPlugin | null> {
  try {
    const { data: proj } = await admin.from('projects').select('id, user_id').eq('id', projectId).maybeSingle()
    const owner = (proj as { user_id?: string | null } | null)?.user_id ?? null
    if (!owner) return null
    if (opts.ownerId !== undefined && opts.ownerId !== owner) return null
    const scope = { projectId, userId: owner }
    const row = await readPluginLink(admin, scope)
    if (!row || row.status !== 'connected' || !row.plugin_version) return null
    const secret = (opts.decrypt ?? decryptCredential)(row.secret_encrypted)
    return { link: { siteUrl: row.site_url, keyId: row.key_id, secret }, version: row.plugin_version, seoPlugin: row.seo_plugin ?? null, scope }
  } catch {
    return null
  }
}

/**
 * The plugin when it can do `cap`: at once when the stored version says so; otherwise after ONE
 * signed /status (the merchant may have updated it), whose version is then stored. Null when it
 * cannot (or does not answer): the caller keeps its pre-3.1 behaviour.
 */
export async function refreshedPlugin(
  admin: Admin, plugin: ConnectedPlugin, cap: PluginCapability, deps: ConnectedPluginDeps = {},
): Promise<ConnectedPlugin | null> {
  if (pluginCan(plugin.version, cap)) return plugin
  const r = await pluginStatus(plugin.link, deps.post)
  if (!r.ok) return null
  const version = /^[0-9]{1,3}(\.[0-9]{1,3}){0,3}$/.test(String(r.body.version)) ? String(r.body.version) : null
  if (!version || !pluginCan(version, cap, r.body.capabilities ?? null)) return null
  const seo = r.body.seo_plugin === 'yoast' || r.body.seo_plugin === 'rankmath' ? r.body.seo_plugin : 'none'
  try {
    await markPluginLink(admin, plugin.scope, { status: 'connected', version, seoPlugin: seo, errorCode: null, seen: true })
  } catch {
    // The stored version stays older; this call still goes on with the answer it has.
  }
  return { ...plugin, version, seoPlugin: seo }
}

/**
 * The project's plugin link is connected (and at least `minVersion`; 3.1.0 = it reads the site's
 * content, so the project counts as a connected WordPress site for the content index, the site map
 * and site health). Read by project AND owner; a failed read is false. No secret is decrypted.
 */
export async function pluginLinkConnected(admin: Admin, scope: Scope, minVersion: string = READ_PLUGIN_MIN_VERSION): Promise<boolean> {
  try {
    const row = await readPluginLink(admin, scope)
    return !!row && row.status === 'connected' && !!row.plugin_version && versionAtLeast(row.plugin_version, minVersion)
  } catch {
    return false
  }
}

/** loadConnectedPlugin + refreshedPlugin: the plugin when it can do `cap`, else null. */
export async function loadPluginFor(
  admin: Admin, projectId: string, cap: PluginCapability, opts: { ownerId?: string | null } & ConnectedPluginDeps = {},
): Promise<ConnectedPlugin | null> {
  const plugin = await loadConnectedPlugin(admin, projectId, opts)
  return plugin ? refreshedPlugin(admin, plugin, cap, opts) : null
}
