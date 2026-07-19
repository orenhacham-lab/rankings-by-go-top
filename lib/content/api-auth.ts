/**
 * Shared auth/ownership helpers for the content module API routes.
 *
 * Every /api/wordpress/* and /api/content/* route must:
 *   1. Be gated by ENABLE_CONTENT (404 when off — same pattern as AI Visibility).
 *   2. Authenticate the user (Supabase session).
 *   3. Verify the user owns the project (projects.user_id).
 *
 * The service-role (admin) client is used only AFTER ownership is verified.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential, CredentialsCryptoError } from '@/lib/security/credentials-crypto'
import type { WordPressCredentials } from '@/lib/wordpress/types'

export function isContentModuleEnabled(): boolean {
  return process.env.ENABLE_CONTENT === 'true'
}

/**
 * Content-automation flag (recommendation engine + auto-generate/publish queue).
 * Gated independently of the base content module so it can ship dark and be
 * enabled per environment. Automation requires the content module too.
 */
export function isContentAutomationEnabled(): boolean {
  return isContentModuleEnabled() && process.env.ENABLE_CONTENT_AUTOMATION === 'true'
}

/**
 * Stage-D global Pro-first controller flag. Missing/invalid → false. Preview → true,
 * Production → false (set per environment). When false the existing recommendation flow
 * is byte-for-byte unchanged; when true the Pro-first production controller fully owns
 * the normal recommendation route. Requires the automation module.
 */
export function isProFirstControllerEnabled(): boolean {
  return isContentAutomationEnabled() && process.env.RECO_PRO_FIRST_CONTROLLER === 'true'
}

/**
 * Internal-link planning flag (Phase 1 = dry-run only). Independent + default
 * off so the read-only diagnostic can ship dark. Requires the automation module.
 * NOTE: this flag currently gates ONLY the read-only dry-run — it never causes
 * any insertion, persistence, or generation/publishing change.
 */
export function isInternalLinkPlanningEnabled(): boolean {
  return isContentAutomationEnabled() && process.env.ENABLE_INTERNAL_LINK_PLANNING === 'true'
}

/**
 * Phase 2J — auto-insert approved internal links into a NEWLY GENERATED DRAFT,
 * once, right after the MANUAL "generate now" flow. Requires the planning flag;
 * default ON for manual generate (same insertion engine + safety rules as manual
 * apply). Draft-only; never publishes / touches WordPress / cron / queue.
 * Emergency kill-switch only: set DISABLE_INTERNAL_LINK_AUTO_INSERT_AFTER_MANUAL_GENERATION=true.
 * NOTE: the generation core still gates this behind an explicit opt-in option so
 * that scheduled/cron generation (which does not opt in) is never auto-inserted.
 */
export function isInternalLinkAutoInsertAfterManualGenerationEnabled(): boolean {
  return isInternalLinkPlanningEnabled() && process.env.DISABLE_INTERNAL_LINK_AUTO_INSERT_AFTER_MANUAL_GENERATION !== 'true'
}

export type ContentAuthResult =
  | { error: string; status: 401 | 403 | 404 | 400 }
  | {
      user: { id: string }
      admin: ReturnType<typeof createAdminClient>
      project: { id: string; user_id: string }
    }

/**
 * Authenticate the caller and verify ownership of the project.
 * Mirrors the authAndProject pattern used by the AI Visibility routes.
 */
export async function authContentProject(projectId: string | null | undefined): Promise<ContentAuthResult> {
  if (!projectId) {
    return { error: 'projectId is required', status: 400 }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }

  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single()

  if (projectError || !project) return { error: 'Project not found', status: 404 }
  if ((project as { user_id?: string }).user_id !== user.id) {
    return { error: 'Forbidden', status: 403 }
  }

  return { user: { id: user.id }, admin, project: project as { id: string; user_id: string } }
}

export type WordPressConnectionRow = {
  id: string
  project_id: string
  site_url: string
  wp_username: string
  wp_application_password_encrypted: string
  default_author_id: number | null
  default_category_id: number | null
  default_status: 'draft' | 'publish' | 'future'
  default_timezone: string
  connection_status: 'untested' | 'connected' | 'failed'
  last_tested_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Load the project's saved WordPress connection and decrypt its credentials.
 * Returns a clear error string (no secrets) when missing or undecryptable.
 */
export async function loadWordPressCredentials(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string
): Promise<
  | { error: string; status: 404 | 500 }
  | { connection: WordPressConnectionRow; creds: WordPressCredentials }
> {
  const { data, error } = await admin
    .from('wordpress_connections')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    console.error('[Content WP] Failed to load connection:', error.message)
    return { error: 'Failed to load WordPress connection', status: 500 }
  }
  if (!data) {
    return { error: 'No WordPress connection for this project', status: 404 }
  }

  const connection = data as WordPressConnectionRow
  try {
    const applicationPassword = decryptCredential(connection.wp_application_password_encrypted)
    return {
      connection,
      creds: {
        siteUrl: connection.site_url,
        username: connection.wp_username,
        applicationPassword,
      },
    }
  } catch (err) {
    const reason = err instanceof CredentialsCryptoError ? err.message : 'decryption failed'
    // Log the reason only — never the encrypted value or the key.
    console.error('[Content WP] Credential decryption failed:', reason)
    return { error: 'Stored WordPress credentials could not be decrypted', status: 500 }
  }
}

/**
 * Strip secrets from a connection row before returning it to the client.
 * The Application Password (even encrypted) must never leave the server.
 */
export function sanitizeConnection(connection: WordPressConnectionRow) {
  return {
    id: connection.id,
    project_id: connection.project_id,
    site_url: connection.site_url,
    wp_username: connection.wp_username,
    default_author_id: connection.default_author_id,
    default_category_id: connection.default_category_id,
    default_status: connection.default_status,
    default_timezone: connection.default_timezone,
    connection_status: connection.connection_status,
    last_tested_at: connection.last_tested_at,
    created_at: connection.created_at,
    updated_at: connection.updated_at,
  }
}
