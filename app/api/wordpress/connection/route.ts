/**
 * Content module — /api/wordpress/connection
 *
 * GET    ?projectId=  → sanitized connection (no password, ever)
 * POST   { projectId, siteUrl, username, applicationPassword?, defaults? }
 *        → create/update the project's connection (password encrypted at rest).
 *          On update, applicationPassword may be omitted to keep the stored one.
 * DELETE ?projectId=  → disconnect (delete the row)
 *
 * Gated by ENABLE_CONTENT. Auth + project ownership on every method.
 */

import { after } from 'next/server'
import {
  isContentModuleEnabled,
  authContentProject,
  sanitizeConnection,
  isInternalLinkPlanningEnabled,
  type WordPressConnectionRow,
} from '@/lib/content/api-auth'
import { runProjectIndexRefresh } from '@/lib/content/wordpress-index-refresh'
import {
  encryptCredential,
  decryptCredential,
  CredentialsCryptoError,
  isCredentialsCryptoConfigured,
} from '@/lib/security/credentials-crypto'
import { assertSafeSiteUrl, testConnection, WordPressClientError } from '@/lib/wordpress/client'

// Phase 3H — allow the background auto index scan (after()) to finish.
export const maxDuration = 300

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.admin
    .from('wordpress_connections')
    .select('*')
    .eq('project_id', auth.project.id)
    .maybeSingle()

  if (error) {
    console.error('[Content WP] Connection load failed:', error.message)
    return Response.json({ error: 'Failed to load connection' }, { status: 500 })
  }

  return Response.json({
    connection: data ? sanitizeConnection(data as WordPressConnectionRow) : null,
  })
}

export async function POST(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  let body: {
    projectId?: string
    siteUrl?: string
    username?: string
    applicationPassword?: string
    defaultAuthorId?: number | null
    defaultCategoryId?: number | null
    defaultStatus?: 'draft' | 'publish' | 'future'
    defaultTimezone?: string
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const auth = await authContentProject(body.projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const siteUrl = (body.siteUrl || '').trim()
  const username = (body.username || '').trim()
  const applicationPassword = (body.applicationPassword || '').trim()

  if (!siteUrl || !username) {
    return Response.json({ error: 'siteUrl and username are required' }, { status: 400 })
  }

  // Validate the URL (https + SSRF guard) before anything is stored.
  let origin: string
  try {
    origin = await assertSafeSiteUrl(siteUrl)
  } catch (err) {
    const msg = err instanceof WordPressClientError ? err.message : 'Invalid site URL'
    return Response.json({ error: msg }, { status: 400 })
  }

  // Refuse to save credentials when the encryption key is not configured —
  // never fall back to storing a plaintext password.
  if (applicationPassword && !isCredentialsCryptoConfigured()) {
    console.error('[Content WP] CONTENT_CREDENTIALS_ENCRYPTION_KEY missing — refusing to save credentials')
    return Response.json(
      { error: 'Server encryption key is not configured. Contact the administrator.' },
      { status: 500 }
    )
  }

  const { data: existing } = await auth.admin
    .from('wordpress_connections')
    .select('id, wp_application_password_encrypted')
    .eq('project_id', auth.project.id)
    .maybeSingle()

  // Phase 4F.1 — one primary platform per project: refuse to CREATE a WordPress
  // connection when the project already has a Shopify connection. Updating an
  // existing WordPress connection stays allowed (so a conflicted project can be
  // fixed). Enforced server-side — never rely on hidden UI.
  if (!existing) {
    const { data: shopify } = await auth.admin
      .from('shopify_connections')
      .select('id')
      .eq('project_id', auth.project.id)
      .maybeSingle()
    if (shopify) {
      return Response.json({ error: 'platform_already_connected', reason: 'platform_already_connected', platform: 'shopify' }, { status: 409 })
    }
  }

  if (!existing && !applicationPassword) {
    return Response.json({ error: 'applicationPassword is required' }, { status: 400 })
  }

  // Resolve the ciphertext to store: encrypt the new password, or carry the
  // stored one forward on an update that leaves the password blank.
  let encrypted: string
  try {
    encrypted = applicationPassword
      ? encryptCredential(applicationPassword)
      : (existing!.wp_application_password_encrypted as string)
  } catch (err) {
    const msg = err instanceof CredentialsCryptoError ? err.message : 'Encryption failed'
    console.error('[Content WP] Encryption failed:', msg)
    return Response.json({ error: 'Failed to encrypt credentials' }, { status: 500 })
  }

  // Resolve the plaintext used to verify the connection. When the password was
  // omitted we decrypt the stored value — and we do this BEFORE any DB write so
  // a decryption failure (e.g. rotated key) cannot leave the row half-updated.
  let passwordForTest: string
  if (applicationPassword) {
    passwordForTest = applicationPassword
  } else {
    try {
      passwordForTest = decryptCredential(encrypted)
    } catch {
      return Response.json(
        { error: 'Stored WordPress credentials could not be decrypted. Re-enter the Application Password.' },
        { status: 500 }
      )
    }
  }

  const now = new Date().toISOString()
  // Only write default_* fields when the caller actually provided them, so an
  // edit that omits them preserves the previously stored defaults (insert falls
  // back to the column defaults defined in the migration).
  const rowValues = {
    user_id: auth.user.id,
    project_id: auth.project.id,
    site_url: origin,
    wp_username: username,
    wp_application_password_encrypted: encrypted,
    connection_status: 'untested' as const,
    updated_at: now,
    ...('defaultAuthorId' in body ? { default_author_id: body.defaultAuthorId ?? null } : {}),
    ...('defaultCategoryId' in body ? { default_category_id: body.defaultCategoryId ?? null } : {}),
    ...(body.defaultStatus ? { default_status: body.defaultStatus } : {}),
    ...(body.defaultTimezone ? { default_timezone: body.defaultTimezone } : {}),
  }

  // Atomic upsert keyed on the UNIQUE(project_id) constraint — avoids the
  // select-then-insert race where two concurrent first-time saves collide.
  const write = await auth.admin
    .from('wordpress_connections')
    .upsert(rowValues, { onConflict: 'project_id' })
    .select('*')
    .single()

  if (write.error || !write.data) {
    console.error('[Content WP] Connection save failed:', write.error?.message)
    return Response.json({ error: 'Failed to save connection' }, { status: 500 })
  }

  // Verify the saved credentials and persist the outcome.
  const test = await testConnection({
    siteUrl: origin,
    username,
    applicationPassword: passwordForTest,
  })

  const connectionStatus = test.ok ? 'connected' : 'failed'
  const { data: updated } = await auth.admin
    .from('wordpress_connections')
    .update({ connection_status: connectionStatus, last_tested_at: now, updated_at: now })
    .eq('id', (write.data as { id: string }).id)
    .select('*')
    .single()

  console.log('[Content WP] Connection saved', {
    projectId: auth.project.id,
    siteUrl: origin,
    hasPassword: !!applicationPassword,
    connectionStatus,
  })

  // Phase 3H — a VERIFIED connection triggers the site-index scan automatically
  // in the BACKGROUND (after the response is sent), so idea generation has an
  // index without the user remembering to scan first. Never blocks or fails the
  // save; the fresh-cache short-circuit + refresh claim inside make it
  // duplicate-safe, and the index-status card shows running/completed/failed.
  if (test.ok && isInternalLinkPlanningEnabled()) {
    const projectId = auth.project.id
    const userId = auth.user.id
    const admin = auth.admin
    after(async () => {
      try {
        const res = await runProjectIndexRefresh(admin, { projectId, userId, force: false })
        console.log('[Content WP] auto index scan after connection save', { projectId, outcome: res.outcome })
      } catch (e) {
        console.warn('[Content WP] auto index scan failed', { projectId, message: e instanceof Error ? e.message : String(e) })
      }
    })
  }

  return Response.json({
    connection: sanitizeConnection((updated || write.data) as WordPressConnectionRow),
    test: { ok: test.ok, error: test.ok ? null : test.error },
  })
}

export async function DELETE(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { error } = await auth.admin
    .from('wordpress_connections')
    .delete()
    .eq('project_id', auth.project.id)

  if (error) {
    console.error('[Content WP] Connection delete failed:', error.message)
    return Response.json({ error: 'Failed to delete connection' }, { status: 500 })
  }

  console.log('[Content WP] Connection deleted', { projectId: auth.project.id })
  return Response.json({ success: true })
}
