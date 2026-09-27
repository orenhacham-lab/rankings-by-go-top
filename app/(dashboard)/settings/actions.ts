'use server'

/**
 * The settings screen's server actions: its reads and writes of the business
 * profile and the audiences, as the signed-in owner. The contract (ownership,
 * validation, the source marks, the compare-and-set) lives in
 * lib/project-settings/data.ts and runs under test there; this file only wires
 * the real session in. Every action answers a result with a stable code and
 * never throws, so nothing the database says reaches the screen.
 */
import { isAdminUser } from '@/lib/auth/admin-role'
import {
  loadSettings,
  markBusinessFieldsAsUser,
  prepareFirstScan,
  saveSection,
  type LoadResult,
  type SettingsDeps,
} from '@/lib/project-settings/data'
import type { BusinessField, SaveErrorCode, SaveResult, SectionSaveInput } from '@/lib/project-settings/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function liveDeps(): SettingsDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
    // Fails closed: an unreadable role is not an administrator.
    isAdmin: async (userId) => {
      try {
        return await isAdminUser(createAdminClient(), userId)
      } catch {
        return false
      }
    },
    env: process.env,
    now: () => new Date(),
  }
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)

/** Everything the screen shows beyond the project row. */
export async function loadProjectSettingsAction(projectId: string): Promise<LoadResult> {
  try {
    return await loadSettings(liveDeps(), projectId)
  } catch (err) {
    console.error('[settings] load failed', { error: errorName(err) })
    return { ok: false, code: 'unavailable' }
  }
}

/** Save one card: the profile fields it changed, and the audience list when it sends one. */
export async function saveProjectSettingsAction(projectId: string, input: SectionSaveInput): Promise<SaveResult> {
  try {
    return await saveSection(liveDeps(), projectId, input)
  } catch (err) {
    console.error('[settings] save failed', { error: errorName(err) })
    return { ok: false, code: 'save_failed' }
  }
}

/** After the business card saved: the fields it changed become the owner's. */
export async function markBusinessFieldsAction(projectId: string, fields: BusinessField[]): Promise<SaveResult> {
  try {
    return await markBusinessFieldsAsUser(liveDeps(), projectId, fields)
  } catch (err) {
    console.error('[settings] mark failed', { error: errorName(err) })
    return { ok: false, code: 'save_failed' }
  }
}

/** Before a project's first scan: the business values it holds become the owner's. */
export async function prepareSiteScanAction(projectId: string): Promise<{ ok: true } | { ok: false; code: SaveErrorCode }> {
  try {
    return await prepareFirstScan(liveDeps(), projectId)
  } catch (err) {
    console.error('[settings] scan preparation failed', { error: errorName(err) })
    return { ok: false, code: 'unavailable' }
  }
}
