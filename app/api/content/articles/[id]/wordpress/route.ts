/**
 * Content module — POST /api/content/articles/:id/wordpress
 *
 * Exports the article to the project's connected WordPress site as a DRAFT or a
 * PUBLISHED post (status chosen by the caller — never defaults to publish):
 *   1. Duplicate protection: if the article was already exported (wp_post_id),
 *      require force=true to create a NEW post.
 *   2. If a featured image exists, upload it to the WP Media Library and set it
 *      as featured_media. If the upload FAILS: draft proceeds without the image
 *      (with a warning); publish is BLOCKED (no silent image-less publish).
 *   3. Create the post with the requested status; best-effort SEO meta.
 * Saves wp_post_id, wp_post_url, wp_featured_media_id, wp_connection_id (and
 * local status='published' on a successful publish).
 *
 * No scheduling/cron/pools. Gated by ENABLE_CONTENT + ownership. Credentials are
 * decrypted server-side and never logged or returned.
 */

import { randomUUID } from 'crypto'
import { authContentProject, isContentModuleEnabled, loadWordPressCredentials } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeVerifiedSeoMeta, WordPressClientError, type WordPressPostStatus, type WordPressErrorMeta } from '@/lib/wordpress/client'
import { wpCreatePost } from '@/lib/content/wordpress-publish'
import { ensureProjectKeywordFromPublishedArticle } from '@/lib/content/keyword-from-article'
import { classifyWordPressError, hebrewMessageFor, httpStatusFor, safeRemoteDiagnostics, type WpFailureStage, type WpPublishErrorCode } from '@/lib/content/wordpress-error'
import { currentGitSha, isPreviewEnv } from '@/lib/runtime-info'

// This route uses Node-only APIs (node:https / node:dns / node:crypto via the
// WordPress client + credential decryption). Pin the Node runtime EXPLICITLY so a
// runtime mismatch can never make the module fail to import (which would surface
// as an opaque Next.js 500 the in-POST try/catch cannot catch).
export const runtime = 'nodejs'

/**
 * Sanitize an error message for the trace log: strip HTML tags, collapse
 * whitespace, redact anything token/secret-shaped, and bound the length. NEVER
 * emits credentials, Authorization values, cookies, application passwords, tokens,
 * article HTML, raw remote bodies or complete prompts.
 */
export function sanitizeTrace(raw: unknown): string | null {
  let s = typeof raw === 'string' ? raw : ''
  if (!s) return null
  s = s.replace(/<[^>]*>/g, ' ')
  // Redact secret-shaped substrings (bearer tokens, long base64/hex runs, kv secrets).
  s = s.replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]')
  s = s.replace(/\b[A-Fa-f0-9]{32,}\b/g, '[redacted]')
  s = s.replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[redacted]')
  s = s.replace(/((?:password|authorization|api[_-]?key|secret|token|cookie)\s*[:=]\s*)\S+/gi, '$1[redacted]')
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > 300 ? `${s.slice(0, 300)}…` : s
}

/** The FIRST stack frame only (never the full stack), sanitized + bounded. */
export function safeTopStackFrame(stack: unknown): string | null {
  if (typeof stack !== 'string' || !stack) return null
  const frame = stack.split('\n').map((l) => l.trim()).find((l) => l.startsWith('at '))
  if (!frame) return null
  const clean = sanitizeTrace(frame)
  return clean && clean.length > 200 ? `${clean.slice(0, 200)}…` : clean
}

/** Safe route-execution stages (server log only; distinct from failureStage). */
type RouteStage =
  | 'route_entered' | 'auth_started' | 'auth_completed'
  | 'article_load_started' | 'article_load_completed' | 'ownership_validated'
  | 'connection_load_started' | 'connection_load_completed'
  | 'credential_decryption_started' | 'credential_decryption_completed'
  | 'wp_create_post_started' | 'wp_create_post_completed'
  | 'local_status_update_started' | 'local_status_update_completed'
  | 'response_returned' | 'top_level_catch_entered'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Only NON-throwing initializers may appear before the try. Everything that can
  // throw (param await, uuid, supabase client, auth, WP calls, serialization) is
  // INSIDE the boundary so no unexpected error escapes as a bare Next.js 500.
  const startedAt = Date.now()
  const gitSha = currentGitSha()
  const vercelEnv = process.env.VERCEL_ENV ?? null
  let diagnosticId = ''
  let id = ''
  let stage: WpFailureStage = 'article_load'
  let projectId: string | null = null
  let connId: string | number | null = null
  let remoteHost: string | null = null
  let postStatusForLog: string | null = null
  let categoryIdForLog: number | null = null
  let featuredMediaForLog: number | null = null
  let payloadByteLength = 0

  /** Safe per-stage runtime log — proves how far the deployed route executed. */
  const logStage = (s: RouteStage): void => {
    console.log('[content-wp-export] route stage', {
      diagnosticId, articleId: id, projectId, connectionId: connId, gitSha, vercelEnv, stage: s, elapsedMs: Date.now() - startedAt,
    })
  }

  /** Structured server log + typed, safe response for a publish failure. */
  const fail = (
    code: WpPublishErrorCode,
    opts?: { stage?: WpFailureStage; meta?: WordPressErrorMeta; httpStatus?: number; previewDiagnostics?: Record<string, unknown> },
  ): Response => {
    const st = opts?.stage ?? stage
    const diag = safeRemoteDiagnostics(opts?.meta)
    console.error('[content-wp-export] publish failed', {
      diagnosticId,
      articleId: id,
      projectId,
      connectionId: connId,
      remoteHost,
      gitSha,
      vercelEnv,
      endpointPath: st === 'media_upload' ? '/wp-json/wp/v2/media' : '/wp-json/wp/v2/posts',
      failureStage: st,
      localErrorType: code,
      ...diag,
      payloadByteLength,
      durationMs: Date.now() - startedAt,
      postStatus: postStatusForLog,
      categoryId: categoryIdForLog,
      authorId: null,
      featuredMediaId: featuredMediaForLog,
    })
    // Part 5 — in PREVIEW ONLY, attach the SAFE diagnostics to the response body so
    // the real cause is visible from one Network response (no Vercel log access
    // needed). Production returns only the public fields. Fields are pre-sanitized.
    const previewDiag = isPreviewEnv() && opts?.previewDiagnostics ? { diagnostics: opts.previewDiagnostics } : {}
    return Response.json(
      { ok: false, error: code, reason: code, message: hebrewMessageFor(code, diagnosticId), diagnosticId, ...previewDiag },
      { status: opts?.httpStatus ?? httpStatusFor(code) },
    )
  }

  /** Typed article-load failure (Part F/12) — never unexpected_publish_error. In
   *  Preview, attaches SANITIZED Supabase code/message/details/hint AND (for a
   *  THROWN error) the error name + one stack frame, so the exact cause is visible
   *  in one response. Production returns only the public typed fields. */
  const failArticle = (
    code: 'article_not_found' | 'article_load_failed' | 'article_access_denied' | 'article_project_missing',
    httpStatus: number,
    opts?: {
      supabaseError?: { code?: string; message?: string; details?: string; hint?: string } | null
      thrown?: unknown
      dataWasNull?: boolean
    },
  ): Response => {
    const HE: Record<typeof code, string> = {
      article_not_found: 'המאמר לא נמצא.',
      article_load_failed: 'טעינת המאמר נכשלה.',
      article_access_denied: 'אין הרשאה לגשת למאמר זה.',
      article_project_missing: 'המאמר אינו משויך לפרויקט תקין.',
    }
    const se = opts?.supabaseError ?? null
    const th = opts?.thrown as { name?: unknown; message?: unknown; stack?: unknown } | undefined
    const diagnostics = {
      articleId: id,
      queryTable: 'generated_articles',
      queryMode: 'maybeSingle' as const,
      dataWasNull: opts?.dataWasNull ?? null,
      errorWasPresent: !!se,
      supabaseCode: se?.code ?? null,
      sanitizedSupabaseMessage: sanitizeTrace(se?.message),
      sanitizedSupabaseDetails: sanitizeTrace(se?.details),
      sanitizedSupabaseHint: sanitizeTrace(se?.hint),
      errorName: th ? (typeof th.name === 'string' ? th.name : (opts?.thrown instanceof Error ? opts.thrown.constructor.name : typeof opts?.thrown)) : null,
      sanitizedErrorMessage: th ? sanitizeTrace(th.message) : null,
      safeTopStackFrame: th ? safeTopStackFrame(th.stack) : null,
      gitSha,
    }
    console.error('[content-wp-export] article load failed', { diagnosticId, vercelEnv, failureStage: stage, localErrorType: code, ...diagnostics })
    const previewDiag = isPreviewEnv() ? { diagnostics } : {}
    return Response.json({ ok: false, error: code, reason: code, message: HE[code], diagnosticId, ...previewDiag }, { status: httpStatus })
  }

  try {
    diagnosticId = randomUUID()
    logStage('route_entered')
    if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
    const resolvedParams = await params
    id = resolvedParams.id
    // Part 15 — never let an empty/whitespace id reach the query's eq() filter.
    if (!id || !id.trim()) return failArticle('article_not_found', 404, { dataWasNull: true })

    // Preview-ONLY forced-throw diagnostic: proves the deployed route actually runs
    // the top-level boundary. Production never honors it.
    if (isPreviewEnv() && new URL(request.url).searchParams.get('diagnosticTest') === 'throw') {
      throw new Error('forced diagnostic throw (preview)')
    }

    let body: { status?: string; force?: boolean; update?: boolean }
    try {
      body = await request.json()
    } catch {
      body = {}
    }
    // Explicit status only; reject anything else server-side. Default is the safe 'draft'.
    const raw = body.status === undefined ? 'draft' : body.status
    if (raw !== 'draft' && raw !== 'publish') {
      return Response.json({ error: 'invalid_status', reason: 'invalid_status' }, { status: 400 })
    }
    const status: WordPressPostStatus = raw
    const force = body.force === true
    const wantUpdate = body.update === true
    postStatusForLog = status

    stage = 'article_load'
    logStage('article_load_started')
    // NARROW article-load boundary (Part 12): the prior code assumed the query
    // RETURNS { error }, but on ac7339d it still failed here as
    // unexpected_publish_error — i.e. a statement THREW (client creation or the
    // awaited query rejecting), bypassing the `if (error)` mapping. This dedicated
    // try/catch converts ANY throw here into a typed article_load_failed with safe
    // Preview diagnostics. select('*') matches the working editor loader.
    type SbError = { code?: string; message?: string; details?: string; hint?: string }
    let article: unknown = null
    let loadError: SbError | null = null
    try {
      const admin = createAdminClient()
      const res = await admin.from('generated_articles').select('*').eq('id', id).maybeSingle()
      article = res.data
      loadError = (res.error as SbError | null) ?? null
    } catch (err) {
      return failArticle('article_load_failed', 502, { thrown: err })
    }
    if (loadError) {
      if (loadError.code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
      return failArticle('article_load_failed', 502, { supabaseError: loadError })
    }
    if (!article) return failArticle('article_not_found', 404, { dataWasNull: true })

    const a = article as Record<string, unknown>
    logStage('article_load_completed')
    payloadByteLength = Buffer.byteLength(String(a.content_html || ''), 'utf8')
    categoryIdForLog = typeof a.wp_primary_category_id === 'number' ? (a.wp_primary_category_id as number) : null
    if (!a.project_id || typeof a.project_id !== 'string') return failArticle('article_project_missing', 422)
    stage = 'project_load'
    logStage('auth_started')
    const auth = await authContentProject(a.project_id as string)
    if ('error' in auth) return failArticle('article_access_denied', auth.status === 404 ? 404 : 403)
    projectId = auth.project.id
    logStage('auth_completed')
    logStage('ownership_validated')

    // Duplicate protection. Once exported (wp_post_id present) a plain re-export is
    // ambiguous, so require an explicit intent:
    //   - update:true → UPDATE the same post in place (idempotent; no new post),
    //   - force:true  → create a NEW separate post (legacy escape hatch),
    //   - neither     → 409 already_exported (unchanged).
    if (a.wp_post_id && !force && !wantUpdate) {
      return Response.json(
        { error: 'already_exported', reason: 'already_exported', wp_post_id: a.wp_post_id, wp_post_url: a.wp_post_url ?? null },
        { status: 409 },
      )
    }
    // Update-in-place applies only when a post already exists and force wasn't asked.
    const existing = a.wp_post_id && !force
      ? { postId: Number(a.wp_post_id), featuredMediaId: typeof a.wp_featured_media_id === 'number' ? (a.wp_featured_media_id as number) : null }
      : undefined

    // WordPress connection (decrypted server-side).
    stage = 'connection_load'
    logStage('connection_load_started')
    logStage('credential_decryption_started')
    const loaded = await loadWordPressCredentials(auth.admin, auth.project.id)
    if ('error' in loaded) {
      if (loaded.status === 404) return fail('wordpress_connection_missing', { stage: 'connection_load' })
      // loadWordPressCredentials returns status 500 for a credential DECRYPTION
      // failure (never throws, never logs the secret) — surface it typed.
      return fail('wordpress_credentials_decryption_failed', { stage: 'credential_decryption' })
    }
    const connIdLocal = loaded.connection.id
    connId = connIdLocal
    logStage('connection_load_completed')
    logStage('credential_decryption_completed')
    try { remoteHost = new URL(loaded.creds.siteUrl).hostname } catch { remoteHost = null }
    const title = String(a.title || 'article')
    const logBase = { articleId: id, projectId: auth.project.id, connId: connIdLocal, status }

    // Featured image + inline images + taxonomy + createPost/updatePost via the
    // shared WordPress core (same behavior: publish blocks on image-upload failure;
    // draft proceeds with a warning; taxonomy is a safe SET that never fails the
    // post). `existing` → update the same post in place (idempotent re-export).
    stage = 'post_creation'
    logStage('wp_create_post_started')
    const created = await wpCreatePost(auth.admin, loaded.creds, a as never, { status, existing })
    if (!created.ok) {
      // Preserve the safe upstream signal (remote status / WP code / response
      // format / timeout) instead of flattening every failure to one code.
      const createdStage: WpFailureStage = created.stage === 'media_upload' ? 'media_upload'
        : created.stage === 'taxonomy_resolution' ? 'taxonomy_resolution'
        : created.stage === 'inline_image_reconciliation' ? 'inline_image_reconciliation'
        : 'post_creation'
      const synthetic = new WordPressClientError(created.detail || 'wordpress publish failed', created.wpErrorMeta || {})
      const code = classifyWordPressError(synthetic, { stage: createdStage, meta: created.wpErrorMeta })
      return fail(code, { stage: createdStage, meta: created.wpErrorMeta })
    }
    logStage('wp_create_post_completed')
    const featuredMedia = created.featuredMediaId ?? undefined
    featuredMediaForLog = created.featuredMediaId ?? null

  // Phase 4E — SEO meta: detect the site's SEO plugin and write ONLY its keys,
  // then verify. Never fatal to the post; the exact status is surfaced so the UI
  // can warn (never a silent success). The article's focus keyword is the linked
  // topic's primary keyword (best-effort lookup).
  let focusKeyword: string | null = null
  if (a.topic_id && typeof a.topic_id === 'string') {
    try {
      const { data: t } = await auth.admin.from('article_topics').select('primary_keyword').eq('id', a.topic_id).maybeSingle()
      const kw = (t as { primary_keyword?: string } | null)?.primary_keyword
      focusKeyword = kw ? String(kw) : null
    } catch { /* focus keyword is optional */ }
  }
  let seoPlugin: string = 'unknown'
  let seoStatus: string = 'plugin_unavailable'
  let seoDetail: string | undefined
  try {
    const seo = await writeVerifiedSeoMeta(loaded.creds, created.wpPostId, {
      metaTitle: (a.meta_title as string) || title,
      metaDescription: (a.meta_description as string) || null,
      focusKeyword,
    })
    seoPlugin = seo.plugin
    seoStatus = seo.status
    seoDetail = seo.detail
  } catch (err) {
    seoStatus = 'exact_failure'
    seoDetail = err instanceof WordPressClientError ? err.message : 'seo meta rejected'
    console.warn('[content-wp-export] seo meta failed', { ...logBase, step: 'seo_meta', message: seoDetail })
  }

  // Save WordPress references. Only a successful PUBLISH marks the local row
  // 'published'; draft leaves the local status unchanged.
  const update: Record<string, unknown> = {
    wp_post_id: created.wpPostId,
    wp_post_url: created.wpPostUrl,
    wp_connection_id: connId,
    last_error: null,
    updated_at: new Date().toISOString(),
  }
  if (typeof featuredMedia === 'number') update.wp_featured_media_id = featuredMedia
  if (status === 'publish') { update.status = 'published'; update.published_at = new Date().toISOString() }
  stage = 'local_status_update'
  logStage('local_status_update_started')
  await auth.admin.from('generated_articles').update(update).eq('id', id)
  logStage('local_status_update_completed')

  // Phase 3G.4 — when an article that ORIGINATED from a queue item is PUBLISHED here,
  // mark that queue item published so it leaves the actionable queue. Matched EXACTLY
  // by article_id (each pool item points at one article), so unrelated/future items
  // for the same topic are never touched. Best-effort; never fails the export.
  if (status === 'publish') {
    try {
      await auth.admin.from('article_pool_items')
        .update({ status: 'published', published_at: new Date().toISOString(), last_error: null, locked_at: null, updated_at: new Date().toISOString() })
        .eq('project_id', auth.project.id)
        .eq('article_id', id)
        .neq('status', 'published')
    } catch (err) {
      console.warn('[content-wp-export] pool item sync skipped', { ...logBase, message: err instanceof Error ? err.message : 'pool sync failed' })
    }
  }

  // Phase 3E — on a successful PUBLISH only (never draft), add the topic's
  // primary keyword to the project's tracked keywords. Best-effort: never fails
  // or blocks the publish.
  let keywordAdded = false
  let keywordAddedText: string | null = null
  if (status === 'publish') {
    const kw = await ensureProjectKeywordFromPublishedArticle(auth.admin, id)
    keywordAdded = kw.added
    keywordAddedText = kw.added ? (kw.keyword ?? null) : null
    if (!kw.ok) console.warn('[content-wp-export] keyword add failed', { ...logBase, reason: kw.reason })
  }

  console.log('[content-wp-export] done', { ...logBase, step: 'post_create', wpPostId: created.wpPostId, updated: created.updated, imageWarning: created.imageWarning, taxonomyWarning: created.taxonomyWarning, seoPlugin, seoStatus, keywordAdded })
  logStage('response_returned')
  return Response.json({
    wp_post_id: created.wpPostId,
    wp_post_url: created.wpPostUrl,
    wp_featured_media_id: featuredMedia ?? null,
    wp_status: status,
    updated: created.updated ?? false,
    imageWarning: created.imageWarning,
    // Phase 4E — taxonomy + SEO outcome (never a silent partial success).
    taxonomy: created.taxonomy
      ? {
          categories: created.taxonomy.categories,
          tags: created.taxonomy.tags,
          invalidCategoryIds: created.taxonomy.invalidCategoryIds,
          invalidTagIds: created.taxonomy.invalidTagIds,
          warning: created.taxonomy.warning,
        }
      : null,
    taxonomyWarning: created.taxonomyWarning ?? false,
    seoPlugin,
    seoStatus,
    ...(seoDetail ? { seoDetail } : {}),
    keywordAdded,
    keyword: keywordAddedText,
  })
  } catch (err) {
    // Top-level safe boundary — NO unexpected error becomes a bare Next.js 500.
    logStage('top_level_catch_entered')
    // Part 11 — the ORIGINAL exception was previously discarded (bare catch), which
    // is why Buy Buy stayed opaque. Capture it SAFELY (no secrets / HTML / body /
    // prompt / stack dump — just name, sanitized message, cause, one stack frame)
    // so the next publish attempt reveals the real cause + the exact last stage.
    const e = err as { name?: unknown; message?: unknown; stack?: unknown; cause?: unknown }
    const cause = (e && typeof e === 'object' ? e.cause : null) as { name?: unknown; message?: unknown } | null
    // Compute the SAFE (pre-sanitized) diagnostic fields ONCE — used both for the
    // server log and the Preview-only response body (Part 5). No secrets/HTML/body.
    const safeDiagnostics = {
      lastStage: stage,
      errorName: typeof e?.name === 'string' ? e.name : (err instanceof Error ? err.constructor.name : typeof err),
      sanitizedErrorMessage: sanitizeTrace(e?.message),
      safeCauseName: cause && typeof cause.name === 'string' ? cause.name : null,
      safeCauseMessage: cause ? sanitizeTrace(cause.message) : null,
      safeTopStackFrame: safeTopStackFrame(e?.stack),
      gitSha,
    }
    console.error('[content-wp-export] unexpected exception', { diagnosticId, vercelEnv, ...safeDiagnostics })
    // Public response is unchanged (code + safe Hebrew + id); Preview additionally
    // returns `diagnostics` so the real cause is visible in one Network response.
    return fail('unexpected_publish_error', { stage: 'unexpected', previewDiagnostics: safeDiagnostics })
  }
}
