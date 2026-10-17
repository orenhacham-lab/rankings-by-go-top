'use server'

/**
 * The writing guidance's server actions: the settings card's read and save,
 * and the article page's "keep this for the next articles". The contract
 * (ownership, validation, the read-only mode while the column is missing)
 * lives in lib/content/writing-guidance/data.ts and runs under test there;
 * this file only wires the real session in. Every action answers a stable
 * code and never throws.
 */
import {
  addRuleFromArticle,
  loadWritingGuidance,
  saveWritingGuidance,
  type AddRuleResult,
  type GuidanceDeps,
  type LoadGuidanceResult,
  type SaveGuidanceResult,
} from '@/lib/content/writing-guidance/data'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { previewAuthorBox, type AuthorBoxPreviewResult } from '@/lib/content/author-box/preview'
import { siteUserNameForNewPost } from '@/lib/content/author-box/site-user'
import { loadDesignPlatform } from '@/lib/content/platform/load-active-platform'
import { canCopyAuthorPhoto } from '@/lib/content/author-box/photo-copy'
import { deleteAuthorPhoto, uploadAuthorPhoto, type AuthorPhotoErrorCode, type AuthorPhotoResult } from '@/lib/content/author-box/photo'

export type AuthorPhotoActionResult = LoadGuidanceResult | { ok: false; code: AuthorPhotoErrorCode }

function liveDeps(): GuidanceDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
    // The service role for the author photo's storage object only, after the owner check (author-photo.ts).
    storage: () => createAdminClient(),
  }
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)

export async function loadWritingGuidanceAction(projectId: string): Promise<LoadGuidanceResult> {
  try {
    return await loadWritingGuidance(liveDeps(), projectId)
  } catch (err) {
    console.error('[writing-guidance] load failed', { error: errorName(err) })
    return { ok: false, code: 'unavailable' }
  }
}

export async function saveWritingGuidanceAction(projectId: string, input: unknown): Promise<SaveGuidanceResult> {
  try {
    return await saveWritingGuidance(liveDeps(), projectId, input)
  } catch (err) {
    console.error('[writing-guidance] save failed', { error: errorName(err) })
    return { ok: false, code: 'save_failed' }
  }
}

export async function addWritingRuleAction(articleId: string, text: string): Promise<AddRuleResult> {
  try {
    return await addRuleFromArticle(liveDeps(), articleId, text)
  } catch (err) {
    console.error('[writing-guidance] add rule failed', { error: errorName(err) })
    return { ok: false, code: 'save_failed' }
  }
}

/**
 * The author box as it will be published: the inputs read by the publisher's
 * own reader (lib/content/author-box/preview.ts), after the project was proven
 * the signed-in owner's. The service role only after that check.
 */
export async function previewAuthorBoxAction(projectId: string): Promise<AuthorBoxPreviewResult> {
  try {
    return await previewAuthorBox({
      session: liveDeps().session,
      admin: () => createAdminClient(),
      platform: (admin, id) => loadDesignPlatform(admin as ReturnType<typeof createAdminClient>, id),
      siteUserName: siteUserNameForNewPost,
      photoCopyAvailable: canCopyAuthorPhoto,
    }, projectId)
  } catch (err) {
    console.error('[writing-guidance] author box preview failed', { error: errorName(err) })
    return { ok: false, code: 'unavailable' }
  }
}

/**
 * The author photo: upload (one per project; replaces the earlier one) and
 * delete. The owner check, the file checks and the storage rules live in
 * lib/content/author-box/photo.ts. Both answer the card's whole view again, so the
 * card shows what is stored now.
 */
async function photoThenView(run: (deps: ReturnType<typeof liveDeps> & { storage: () => ReturnType<typeof createAdminClient> }) => Promise<AuthorPhotoResult>, projectId: string): Promise<AuthorPhotoActionResult> {
  const deps = { ...liveDeps(), storage: () => createAdminClient() }
  const r = await run(deps)
  if (!r.ok) return r
  return loadWritingGuidance(deps, projectId)
}

export async function uploadAuthorPhotoAction(projectId: string, form: FormData): Promise<AuthorPhotoActionResult> {
  try {
    return await photoThenView((deps) => uploadAuthorPhoto(deps, projectId, form.get('photo')), projectId)
  } catch (err) {
    console.error('[author-photo] upload failed', { error: errorName(err) })
    return { ok: false, code: 'save_failed' }
  }
}

export async function deleteAuthorPhotoAction(projectId: string): Promise<AuthorPhotoActionResult> {
  try {
    return await photoThenView((deps) => deleteAuthorPhoto(deps, projectId), projectId)
  } catch (err) {
    console.error('[author-photo] delete failed', { error: errorName(err) })
    return { ok: false, code: 'delete_failed' }
  }
}
