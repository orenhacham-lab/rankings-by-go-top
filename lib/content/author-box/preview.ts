/**
 * The settings card's author-box preview: the inputs the box is made from, read
 * by the very function publishing reads them with (store.ts readAuthorBoxInputs),
 * so the card can draw them with the very resolver publishing draws with
 * (box.ts authorBoxContent) — with the owner's unsaved name, link and image
 * choice in place of the saved ones.
 *
 * AS THE OWNER FIRST. The project must be the signed-in user's own (their RLS
 * client, the owner named: writing-guidance/data.ts owner). Only then is the
 * service-role client used, and every read through it names the project and
 * that owner.
 *
 * THE SITE'S USER is asked the way the WordPress publishers ask it for a new
 * post (site-user.ts, injected), and only for WordPress; the site icon likewise.
 * Both are time-capped; a slow or failing site answers null (the business name,
 * no image), never an error. Nothing the database or the site says reaches the
 * screen as an error: failures are codes. Framework-free, so it runs under test.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DesignPlatform } from '@/lib/content/article-style/types'
import { owner, type GuidanceDeps } from '@/lib/content/writing-guidance/data'
import type { AuthorBoxInputs } from './box'
import { readAuthorBoxInputs, readProject, type AuthorBoxPlatform } from './store'
import type { FetchText } from './site-icon'
import { authorPhotoPreviewUrl, readAuthorPhoto, type PhotoStorage } from '@/lib/content/author-box/photo'

export type AuthorBoxPreviewDeps = {
  session: GuidanceDeps['session']
  admin: () => SupabaseClient
  /** Where the project's articles go (load-active-platform.ts loadDesignPlatform). */
  platform: (admin: SupabaseClient, projectId: string) => Promise<DesignPlatform>
  /** The name a new post is published under on the WordPress site (site-user.ts). */
  siteUserName: (admin: SupabaseClient, projectId: string, ownerId: string) => Promise<string | null>
  fetchText?: FetchText
  timeoutMs?: number
  /** A copy of the uploaded photo can be made in this site (./photo-copy.ts canCopyAuthorPhoto). Absent = never. */
  photoCopyAvailable?: (admin: SupabaseClient, projectId: string) => Promise<boolean>
}

export type AuthorBoxPreview = {
  /** 'none' = no site connected yet; 'wix' = Wix gets no box. */
  platform: DesignPlatform
  inputs: AuthorBoxInputs
  /** The "site icon" choice is offered (WordPress only). */
  siteIconAvailable: boolean
  /**
   * The "upload a photo" choice is offered: WordPress with an application
   * password only (the photo is copied into its media library at publish time).
   * Never on a Shopify store, a custom site or Wix.
   */
  photoUploadAvailable: boolean
  /** Our stored photo, signed for a few minutes, for this preview only (never published). */
  photoPreviewUrl: string | null
}

export type AuthorBoxPreviewResult = { ok: true; data: AuthorBoxPreview } | { ok: false; code: 'unauthorized' | 'not_found' | 'invalid_request' | 'unavailable' | 'save_failed' }

const PREVIEW_TIMEOUT_MS = 8000

function capped<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    p.then((v) => { clearTimeout(timer); resolve(v) }, () => { clearTimeout(timer); resolve(fallback) })
  })
}

export async function previewAuthorBox(deps: AuthorBoxPreviewDeps, projectId: unknown): Promise<AuthorBoxPreviewResult> {
  const o = await owner(deps, projectId)
  if (!o.ok) return o
  try {
    const admin = deps.admin()
    const project = await readProject(admin, o.projectId)
    if (!project || project.owner !== o.userId) return { ok: false, code: 'not_found' }
    const ms = deps.timeoutMs ?? PREVIEW_TIMEOUT_MS
    const platform = await capped(deps.platform(admin, o.projectId), ms, 'none' as DesignPlatform)
    // A site with no connection (or Wix) is read like a custom site: no user to ask, no icon.
    const boxPlatform: AuthorBoxPlatform = platform === 'wordpress' || platform === 'shopify' ? platform : 'webhook'
    const inputs = await capped(readAuthorBoxInputs(admin, {
      project,
      projectId: o.projectId,
      articleId: null,
      platform: boxPlatform,
      authorName: boxPlatform === 'wordpress' ? () => capped(deps.siteUserName(admin, o.projectId, o.userId), ms, null) : undefined,
      preview: true,
      fetchText: deps.fetchText,
    }), ms * 2, null)
    if (!inputs) return { ok: false, code: 'unavailable' }
    const photoUploadAvailable = boxPlatform === 'wordpress' && !!deps.photoCopyAvailable
      && await capped(deps.photoCopyAvailable(admin, o.projectId), ms, false)
    const photo = await readAuthorPhoto(admin, o.projectId, o.userId)
    const photoPreviewUrl = await capped(authorPhotoPreviewUrl(admin as PhotoStorage, o.projectId, photo.path), ms, null)
    return { ok: true, data: { platform, inputs, siteIconAvailable: boxPlatform === 'wordpress', photoUploadAvailable, photoPreviewUrl } }
  } catch {
    return { ok: false, code: 'unavailable' }
  }
}
