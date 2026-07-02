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

import {
  isContentModuleEnabled,
  authContentProject,
  sanitizeConnection,
  type WordPressConnectionRow,
} from '@/lib/content/api-auth'
import {
  encryptCredential,
  decryptCredential,
  CredentialsCryptoError,
  isCredentialsCryptoConfigured,
} from '@/lib/security/credentials-crypto'
import { assertSafeSiteUrl, testConnection, WordPressClientError } from '@/lib/wordpress/client'

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

  if (!existing && !applicationPassword) {
    return Response.json({ error: 'applicationPassword is required' }, { status: 400 })
  }

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

  const now = new Date().toISOString()
  const rowValues = {
    user_id: auth.user.id,
    project_id: auth.project.id,
    site_url: origin,
    wp_username: username,
    wp_application_password_encrypted: encrypted,
    default_author_id: body.defaultAuthorId ?? null,
    default_category_id: body.defaultCategoryId ?? null,
    default_status: body.defaultStatus ?? 'draft',
    default_timezone: body.defaultTimezone || 'Asia/Jerusalem',
    connection_status: 'untested' as const,
    updated_at: now,
  }

  const write = existing
    ? await auth.admin
        .from('wordpress_connections')
        .update(rowValues)
        .eq('id', existing.id)
        .select('*')
        .single()
    : await auth.admin
        .from('wordpress_connections')
        .insert(rowValues)
        .select('*')
        .single()

  if (write.error || !write.data) {
    console.error('[Content WP] Connection save failed:', write.error?.message)
    return Response.json({ error: 'Failed to save connection' }, { status: 500 })
  }

  // Immediately verify the saved credentials and persist the outcome.
  // When the password was omitted (update keeping the stored one), decrypt the
  // stored value transiently for the test — it never leaves the server.
  let passwordForTest = applicationPassword
  if (!passwordForTest) {
    try {
      passwordForTest = decryptCredential(encrypted)
    } catch {
      return Response.json(
        { error: 'Stored WordPress credentials could not be decrypted' },
        { status: 500 }
      )
    }
  }
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
