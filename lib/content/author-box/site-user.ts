/**
 * The name a NEW post is published under on the project's WordPress site, asked
 * exactly as the publishers ask it: over the GO TOP SEO Bridge plugin, the
 * plugin's default author from its signed /authors list
 * (pluginPublishingUserName, the function wordpress-plugin-publish.ts calls);
 * over the application password, the password's own user (getPublishingUserName,
 * the function wordpress-publish.ts calls). Used by the settings preview
 * (./preview.ts). Server only. Null on any failure; never throws.
 *
 * SERVICE ROLE: called only after the project was proven the signed-in owner's;
 * the plugin link is read by the project AND that owner.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPublishingUserName } from '@/lib/wordpress/client'
import { loadWordPressPublisher, pluginPublishingUserName } from '@/lib/content/wordpress-plugin-publish'

type Admin = Parameters<typeof loadWordPressPublisher>[0]

export async function siteUserNameForNewPost(admin: SupabaseClient, projectId: string, ownerId: string): Promise<string | null> {
  try {
    const publisher = await loadWordPressPublisher(admin as unknown as Admin, projectId, { ownerId })
    if ('error' in publisher) return null
    if (publisher.via === 'plugin') return await pluginPublishingUserName(publisher.plugin.link, publisher.plugin.version, null)
    return await getPublishingUserName(publisher.creds, null)
  } catch {
    return null
  }
}
