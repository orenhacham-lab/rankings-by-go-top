/**
 * Content module — POST /api/wordpress/test-connection
 *
 * Three modes:
 *   1. Pre-save test: body has siteUrl + username + applicationPassword —
 *      tests those credentials without storing anything.
 *   2. Edited-values test: body has siteUrl + username but NO password, and a
 *      stored connection exists — tests the provided siteUrl/username using the
 *      stored (decrypted) password. Nothing is persisted. This is what the edit
 *      form uses when the user changes the URL/username but keeps the password.
 *   3. Saved-connection test: only projectId — loads the stored connection,
 *      decrypts server-side, tests, and persists connection_status/last_tested_at.
 *
 * Never returns or logs credentials. Gated by ENABLE_CONTENT.
 */

import {
  isContentModuleEnabled,
  authContentProject,
  loadWordPressCredentials,
} from '@/lib/content/api-auth'
import { testConnection } from '@/lib/wordpress/client'

export async function POST(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  let body: {
    projectId?: string
    siteUrl?: string
    username?: string
    applicationPassword?: string
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

  // Mode 1: explicit credentials (pre-save check).
  if (siteUrl && username && applicationPassword) {
    const result = await testConnection({ siteUrl, username, applicationPassword })
    console.log('[Content WP] Pre-save test', {
      projectId: auth.project.id,
      ok: result.ok,
    })
    return Response.json({
      ok: result.ok,
      user: result.user ?? null,
      error: result.ok ? null : result.error,
    })
  }

  // Mode 2: edited siteUrl/username with the password left blank — test the
  // provided values against the STORED password. Nothing is persisted (these
  // are unsaved edits). Requires a stored connection to source the password.
  if (siteUrl && username && !applicationPassword) {
    const loaded = await loadWordPressCredentials(auth.admin, auth.project.id)
    if ('error' in loaded) {
      return Response.json({ ok: false, error: loaded.error }, { status: loaded.status })
    }
    const result = await testConnection({
      siteUrl,
      username,
      applicationPassword: loaded.creds.applicationPassword,
    })
    console.log('[Content WP] Edited-values test', {
      projectId: auth.project.id,
      ok: result.ok,
    })
    return Response.json({
      ok: result.ok,
      user: result.user ?? null,
      error: result.ok ? null : result.error,
    })
  }

  // Mode 3: test the stored connection as-is and persist the outcome.
  const loaded = await loadWordPressCredentials(auth.admin, auth.project.id)
  if ('error' in loaded) {
    return Response.json({ ok: false, error: loaded.error }, { status: loaded.status })
  }

  const result = await testConnection(loaded.creds)
  const now = new Date().toISOString()
  await auth.admin
    .from('wordpress_connections')
    .update({
      connection_status: result.ok ? 'connected' : 'failed',
      last_tested_at: now,
      updated_at: now,
    })
    .eq('id', loaded.connection.id)

  console.log('[Content WP] Saved-connection test', {
    projectId: auth.project.id,
    ok: result.ok,
  })

  return Response.json({
    ok: result.ok,
    user: result.user ?? null,
    error: result.ok ? null : result.error,
    lastTestedAt: now,
  })
}
