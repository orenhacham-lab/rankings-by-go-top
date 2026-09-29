/**
 * The auto-fix API, framework-free so its whole contract runs under test. The routes
 * (app/api/site-health/fixes, app/api/site-health/plugin, app/api/site-health/plugin-zip) only wire
 * the real dependencies in.
 *
 * ORDER OF CHECKS (proxy.ts does not cover /api/*, so this does it all):
 *   1. signed in                                              401 unauthorized
 *   2. a well-formed request                                  400 invalid_request
 *   3. the project is theirs: service role, filtered by id AND owner      404 not_found
 *   4. the queue tables exist (the migration is applied)      409 queue_unavailable
 *   5. Shopify projects are read-only                         409 shopify_readonly
 *   6. approve: the fix passes the whitelist (./whitelist.ts) and every
 *      address is on THIS project's site                      400 not_allowed / value_invalid / off_site
 *   7. approve: `approved: true` (only the approval button sends it)      400 invalid_request
 *   8. approve: a channel exists for this type                409 needs_plugin / no_channel
 *   9. approve / retry: no other job already holds the same place (applied, sent, pending or
 *      waiting for a manual update; ./job-match.ts)             409 already_fixed
 *
 * One approval = one job = one element of one page. The approval is recorded (who, when, IP, the
 * previous and the new value) BEFORE anything is sent; every outcome is recorded after. Answers are
 * { ok, … } or { ok: false, code } with stable codes; nothing a site, WordPress or the database said
 * is ever part of an answer or a log line.
 */
import crypto from 'crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { FindingKind } from '@/lib/site-health/types'
import type { WpFixDeps } from '@/lib/site-health/wordpress-fix'
import { loadFixContext, resolveCapabilities, type FixContext } from './channel'
import { generatePluginKey, pairingCode } from './plugin-auth'
import { pairOverAppPassword, pluginFix, pluginStatus, pluginUndo, type PluginPost } from './plugin-client'
import { previewFixJob, type LivePage, type PreviewRequest } from './preview'
import { applyViaRest, revertViaRest, type RestUndo } from './rest-apply'
import {
  appendAudit, deletePluginLink, FixStoreError, getJob, insertJob, listHoldingJobs, listJobs, markPluginLink, queueAvailable,
  savePluginKey, updateJob, type Scope,
} from './store'
import { HOLDING_STATUSES, sameTarget, subjectOf, type FixTarget } from './job-match'
import { FIX_TYPES, type FixCapabilities, type FixChannel, type FixErrorCode, type FixJobRow, type FixJobView, type FixType } from './types'
import { buildFixPayload, sendFixWebhook, type FixWebhookDeps } from './webhook-fix'
import { payloadFromJob, siteKeyOf, summaryOf, validateFix, valueOf } from './whitelist'

type Admin = ReturnType<typeof createAdminClient>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const FIX_HTTP_STATUS: Partial<Record<FixErrorCode, number>> = {
  unauthorized: 401, not_found: 404, invalid_request: 400, not_allowed: 400, value_invalid: 400, off_site: 400,
  queue_unavailable: 409, shopify_readonly: 409, needs_plugin: 409, no_channel: 409, wrong_state: 409,
  changed_since_preview: 409, already_fixed: 409, store_failed: 500,
}
export const fixStatusFor = (code: FixErrorCode) => FIX_HTTP_STATUS[code] ?? 422

export interface FixesDeps {
  userId: string | null
  ip: string | null
  admin: Admin
  decrypt: (encrypted: string) => string
  encrypt: (plain: string) => string
  wp: WpFixDeps
  readLive: (url: string) => Promise<LivePage | null>
  pluginPost?: PluginPost
  webhook?: FixWebhookDeps
  newId?: () => string
  random?: (n: number) => Buffer
}

export type Answer = { status: number; body: Record<string, unknown> }
const refuse = (code: FixErrorCode): Answer => ({ status: fixStatusFor(code), body: { ok: false, code } })

/** The finding kinds a fix may be approved for (a label on the job; the whitelist is the fix type). */
const KINDS: readonly FindingKind[] = [
  'title_missing', 'title_long', 'title_short', 'title_duplicate', 'description_missing', 'description_length',
  'description_duplicate', 'images_alt', 'orphan_page', 'broken_links', 'canonical_missing', 'schema_missing', 'faq_missing',
]

interface Loaded { scope: Scope; project: { target_domain: string | null; business_name: string | null; name: string | null }; ctx: FixContext; caps: FixCapabilities; siteKeys: Set<string> }

async function load(projectId: unknown, deps: FixesDeps): Promise<Loaded | Answer> {
  if (!deps.userId) return refuse('unauthorized')
  if (typeof projectId !== 'string' || !UUID.test(projectId)) return refuse('invalid_request')
  const scope = { projectId, userId: deps.userId }
  const { data, error } = await deps.admin.from('projects').select('id, target_domain, business_name, name')
    .eq('id', projectId).eq('user_id', deps.userId).maybeSingle()
  if (error) return refuse('store_failed')
  if (!data) return refuse('not_found')
  const project = data as Loaded['project']
  const available = await queueAvailable(deps.admin, scope)
  const ctx = await loadFixContext(deps.admin, scope, deps.decrypt, project.target_domain)
  const caps = resolveCapabilities(ctx, available)
  const siteKeys = new Set(ctx.siteUrls.map((u) => siteKeyOf(u)).filter((k): k is string => !!k))
  return { scope, project, ctx, caps, siteKeys }
}
const isAnswer = (x: Loaded | Answer): x is Answer => 'status' in x && 'body' in x

export function jobView(row: FixJobRow, caps: FixCapabilities): FixJobView {
  const now = caps.channelFor[row.fix_type]
  const liveChannel = now === 'plugin' || now === 'app_password' || now === 'webhook'
  return {
    id: row.id, type: row.fix_type, findingKind: row.finding_kind, pageUrl: row.page_url, status: row.status, channel: row.channel,
    before: row.before_value, after: row.after_summary, errorCode: row.error_code, approvedAt: row.approved_at,
    appliedAt: row.applied_at, revertedAt: row.reverted_at, subject: subjectOf(row.fix_type, row.payload),
    canUndo: (row.status === 'applied' && (row.channel === 'plugin' || row.channel === 'app_password') && !!row.undo)
      || (row.status === 'sent' && row.channel === 'webhook' && !!caps.webhook),
    canCancel: row.status === 'pending' || row.status === 'manual' || row.status === 'failed',
    canRetry: (row.status === 'failed' || row.status === 'manual') && liveChannel,
  }
}

// ── GET: capabilities and the queue ─────────────────────────────────────────

export async function handleFixesGet(projectId: unknown, deps: FixesDeps): Promise<Answer> {
  try {
    const l = await load(projectId, deps)
    if (isAnswer(l)) return l
    if (!l.caps.available) return { status: 200, body: { ok: true, capabilities: l.caps, jobs: [] } }
    const rows = await listJobs(deps.admin, l.scope)
    return { status: 200, body: { ok: true, capabilities: l.caps, jobs: rows.map((r) => jobView(r, l.caps)) } }
  } catch (e) {
    if (e instanceof FixStoreError) console.error('[site-fix] queue read failed')
    return refuse('store_failed')
  }
}

// ── POST: preview, approve, undo, cancel, retry ─────────────────────────────

export async function handleFixesPost(body: unknown, deps: FixesDeps): Promise<Answer> {
  const b = (body ?? {}) as Record<string, unknown>
  try {
    const l = await load(b.projectId, deps)
    if (isAnswer(l)) return l
    if (!l.caps.available) return refuse('queue_unavailable')
    if (l.caps.readOnly) return refuse('shopify_readonly')
    switch (b.action) {
      case 'preview': return await preview(b, l, deps)
      case 'approve': return await approve(b, l, deps)
      case 'undo': return await undo(b, l, deps)
      case 'cancel': return await cancel(b, l, deps)
      case 'retry': return await retry(b, l, deps)
      default: return refuse('invalid_request')
    }
  } catch (e) {
    if (e instanceof FixStoreError) console.error('[site-fix] queue write failed')
    else console.error('[site-fix] request failed')
    return refuse('store_failed')
  }
}

function channelOf(l: Loaded, type: FixType): FixChannel | FixErrorCode {
  const c = l.caps.channelFor[type]
  if (c === 'needs_plugin') return 'needs_plugin'
  if (!c) return 'no_channel'
  return c
}

async function preview(b: Record<string, unknown>, l: Loaded, deps: FixesDeps): Promise<Answer> {
  const type = b.type as FixType
  if (!(FIX_TYPES as readonly string[]).includes(String(type))) return refuse('not_allowed')
  const kind = b.kind as FindingKind
  if (!KINDS.includes(kind)) return refuse('invalid_request')
  const onSite = (u: unknown) => { const k = siteKeyOf(u); return !!k && l.siteKeys.has(k) }
  if (!onSite(b.url) || (type === 'broken_link' && !onSite(b.from))) return refuse('off_site')
  const channel = channelOf(l, type)
  if (channel === 'needs_plugin' || channel === 'no_channel') return refuse(channel)
  if (channel !== 'plugin' && channel !== 'app_password' && channel !== 'webhook' && channel !== 'manual') return refuse('no_channel')
  const req: PreviewRequest = {
    type, url: String(b.url), kind, from: typeof b.from === 'string' ? b.from : undefined,
    keyword: typeof b.keyword === 'string' ? b.keyword.slice(0, 120) : undefined,
  }
  const p = await previewFixJob(req, {
    channel, creds: l.ctx.creds, link: l.ctx.pluginLink, siteName: (l.project.business_name || l.project.name || '').trim() || null,
  }, { wp: deps.wp, readLive: deps.readLive, pluginPost: deps.pluginPost })
  if (!p.ok) return { status: fixStatusFor(p.code), body: p }
  return { status: 200, body: { ...p, channel } }
}

async function audit(deps: FixesDeps, l: Loaded, job: FixJobRow, action: Parameters<typeof appendAudit>[2]['action'], extra: { previous?: string | null; next?: string | null; result?: string | null; channel?: FixChannel } = {}) {
  await appendAudit(deps.admin, l.scope, {
    jobId: job.id, action, actorId: deps.userId, actorIp: deps.ip, channel: extra.channel ?? job.channel,
    previous: extra.previous !== undefined ? extra.previous : job.before_value,
    next: extra.next !== undefined ? extra.next : JSON.stringify(job.payload),
    result: extra.result ?? null,
  })
}

async function approve(b: Record<string, unknown>, l: Loaded, deps: FixesDeps): Promise<Answer> {
  if (b.approved !== true) return refuse('invalid_request')
  const kind = b.kind as FindingKind
  if (!KINDS.includes(kind)) return refuse('invalid_request')
  const checked = validateFix(b.fix, b.pageUrl, l.siteKeys)
  if (!checked.ok) return refuse(checked.code)
  const payload = checked.payload
  const channel = channelOf(l, payload.type)
  if (channel === 'needs_plugin' || channel === 'no_channel') return refuse(channel)
  const expected = typeof b.expected === 'string' && b.expected.length <= 200_000 ? b.expected : null
  const via = typeof b.via === 'string' && /^[a-z_]{1,20}$/.test(b.via) ? b.via : null
  const before = typeof b.before === 'string' ? b.before.slice(0, 60_000) : null
  // One fix, one place: a fix already applied, sent or waiting in the queue is never approved twice.
  const stored = valueOf(payload)
  if (await heldElsewhere(deps, l, { type: payload.type, pageUrl: String(b.pageUrl).trim(), subject: subjectOf(payload.type, stored) }, null)) {
    return refuse('already_fixed')
  }

  const job = await insertJob(deps.admin, l.scope, {
    id: (deps.newId ?? crypto.randomUUID)(),
    fixType: payload.type, findingKind: kind, pageUrl: String(b.pageUrl).trim(), payload: stored,
    before, after: summaryOf(payload).slice(0, 4000), channel: channel as FixChannel,
    undo: { expected, via }, approvedBy: deps.userId as string, approvedIp: deps.ip,
  })
  // The approval is on record before anything leaves.
  await audit(deps, l, job, 'approved')
  const done = await execute(job, l, deps, { expected, via })
  return { status: 200, body: { ok: true, job: jobView(done, l.caps) } }
}

/** Another job (not `self`) already holds this place: done, sent, queued or waiting for a manual update. */
async function heldElsewhere(deps: FixesDeps, l: Loaded, target: FixTarget, self: string | null): Promise<boolean> {
  const held = await listHoldingJobs(deps.admin, l.scope, target.type, HOLDING_STATUSES)
  return held.some((r) => r.id !== self && sameTarget({ type: r.fix_type, pageUrl: r.page_url, subject: subjectOf(r.fix_type, r.payload) }, target))
}

/** Apply one job through its channel; record the outcome on the job and in the trail. */
async function execute(job: FixJobRow, l: Loaded, deps: FixesDeps, ctx: { expected: string | null; via: string | null }): Promise<FixJobRow> {
  const payload = payloadFromJob(job.fix_type, job.payload)
  const now = new Date().toISOString()
  const set = async (patch: Parameters<typeof updateJob>[3]) => {
    await updateJob(deps.admin, l.scope, job.id, patch)
    return { ...job, ...(patch.status ? { status: patch.status } : {}), ...(patch.errorCode !== undefined ? { error_code: patch.errorCode } : {}),
      ...(patch.undo !== undefined ? { undo: patch.undo } : {}), ...(patch.appliedAt !== undefined ? { applied_at: patch.appliedAt } : {}),
      ...(patch.channel ? { channel: patch.channel } : {}) } as FixJobRow
  }
  const manual = async (code: string) => {
    const next = await set({ status: 'manual', errorCode: code })
    await audit(deps, l, next, 'marked_manual', { result: code })
    return next
  }

  if (job.channel === 'manual') return manual('plugin_not_connected')

  if (job.channel === 'plugin') {
    if (!l.ctx.pluginLink) return manual('plugin_not_connected')
    const r = await pluginFix(l.ctx.pluginLink, { jobId: job.id, type: job.fix_type, url: job.page_url, value: job.payload, expected: ctx.expected }, deps.pluginPost)
    if (!r.ok) {
      if (r.connectionLost) {
        await markPluginLink(deps.admin, l.scope, { status: 'disconnected', errorCode: r.code })
        return manual(r.code)
      }
      const next = await set({ status: 'failed', errorCode: r.code })
      await audit(deps, l, next, 'failed', { result: r.code })
      return next
    }
    await markPluginLink(deps.admin, l.scope, { status: 'connected', seen: true })
    const next = await set({ status: 'applied', errorCode: null, appliedAt: now, remoteRef: r.body.fix_id, undo: { ...ctx, revert: { kind: 'plugin' } } })
    await audit(deps, l, next, 'applied', { previous: r.body.previous ?? job.before_value, next: summaryOf(payload), result: r.body.status })
    return next
  }

  if (job.channel === 'app_password') {
    if (!l.ctx.creds) return manual('no_channel')
    const r = await applyViaRest(l.ctx.creds, { id: job.id, pageUrl: job.page_url, payload, expected: ctx.expected, via: ctx.via }, deps.wp)
    if (!r.ok) {
      if (r.code === 'wordpress_permission') return manual(r.code)
      const next = await set({ status: 'failed', errorCode: r.code })
      await audit(deps, l, next, 'failed', { result: r.code })
      return next
    }
    const next = await set({ status: 'applied', errorCode: null, appliedAt: now, undo: { ...ctx, revert: r.undo } })
    await audit(deps, l, next, 'applied', {
      previous: r.undo && r.undo.kind === 'content' ? r.undo.previous : job.before_value, next: summaryOf(payload), result: r.status,
    })
    return next
  }

  // webhook: sent to the developer, who applies it.
  if (!l.ctx.webhook) return manual('no_channel')
  const sent = await sendFixWebhook(l.ctx.webhook, buildFixPayload({
    id: job.id, type: job.fix_type, pageUrl: job.page_url, value: job.payload, previous: job.before_value, approvedAt: job.approved_at,
  }, 'site_fix.approved', new Date()), deps.webhook)
  if (!sent.ok) {
    const next = await set({ status: 'failed', errorCode: 'webhook_failed' })
    await audit(deps, l, next, 'failed', { result: 'webhook_failed' })
    return next
  }
  const next = await set({ status: 'sent', errorCode: null, appliedAt: now })
  await audit(deps, l, next, 'sent', { next: summaryOf(payload) })
  return next
}

async function ownJob(b: Record<string, unknown>, l: Loaded, deps: FixesDeps): Promise<FixJobRow | Answer> {
  if (typeof b.jobId !== 'string' || !UUID.test(b.jobId)) return refuse('invalid_request')
  const job = await getJob(deps.admin, l.scope, b.jobId)
  return job ?? refuse('not_found')
}

async function undo(b: Record<string, unknown>, l: Loaded, deps: FixesDeps): Promise<Answer> {
  const job = await ownJob(b, l, deps)
  if ('status' in job && 'body' in job) return job
  const view = jobView(job, l.caps)
  if (!view.canUndo) return refuse('wrong_state')
  const revert = (job.undo as { revert?: unknown } | null)?.revert as ({ kind: 'plugin' } | RestUndo | null | undefined)
  const payload = payloadFromJob(job.fix_type, job.payload)
  let result: { ok: true } | { ok: false; code: FixErrorCode }
  if (job.channel === 'plugin') {
    if (!l.ctx.pluginLink) return refuse('plugin_not_connected')
    const r = await pluginUndo(l.ctx.pluginLink, { jobId: job.id, url: job.page_url }, deps.pluginPost)
    if (!r.ok && r.connectionLost) await markPluginLink(deps.admin, l.scope, { status: 'disconnected', errorCode: r.code })
    result = r.ok ? { ok: true } : { ok: false, code: r.code }
  } else if (job.channel === 'app_password') {
    if (!l.ctx.creds || !revert || revert.kind === 'plugin') return refuse('nothing_to_undo')
    result = await revertViaRest(l.ctx.creds, revert, deps.wp)
  } else {
    if (!l.ctx.webhook) return refuse('no_channel')
    const sent = await sendFixWebhook(l.ctx.webhook, buildFixPayload({
      id: job.id, type: job.fix_type, pageUrl: job.page_url, value: job.payload, previous: job.before_value, approvedAt: job.approved_at,
    }, 'site_fix.reverted', new Date()), deps.webhook)
    result = sent.ok ? { ok: true } : { ok: false, code: 'webhook_failed' }
  }
  if (!result.ok) {
    await audit(deps, l, job, 'revert_failed', { previous: summaryOf(payload), next: job.before_value, result: result.code })
    return refuse(result.code)
  }
  await updateJob(deps.admin, l.scope, job.id, { status: 'reverted', revertedAt: new Date().toISOString() })
  await audit(deps, l, job, 'reverted', { previous: summaryOf(payload), next: job.before_value })
  const fresh = await getJob(deps.admin, l.scope, job.id)
  return { status: 200, body: { ok: true, job: fresh ? jobView(fresh, l.caps) : null } }
}

async function cancel(b: Record<string, unknown>, l: Loaded, deps: FixesDeps): Promise<Answer> {
  const job = await ownJob(b, l, deps)
  if ('status' in job && 'body' in job) return job
  if (!jobView(job, l.caps).canCancel) return refuse('wrong_state')
  await updateJob(deps.admin, l.scope, job.id, { status: 'cancelled' })
  await audit(deps, l, job, 'cancelled', { next: null })
  const fresh = await getJob(deps.admin, l.scope, job.id)
  return { status: 200, body: { ok: true, job: fresh ? jobView(fresh, l.caps) : null } }
}

async function retry(b: Record<string, unknown>, l: Loaded, deps: FixesDeps): Promise<Answer> {
  const job = await ownJob(b, l, deps)
  if ('status' in job && 'body' in job) return job
  if (!jobView(job, l.caps).canRetry) return refuse('wrong_state')
  if (await heldElsewhere(deps, l, { type: job.fix_type, pageUrl: job.page_url, subject: subjectOf(job.fix_type, job.payload) }, job.id)) {
    return refuse('already_fixed')
  }
  const channel = channelOf(l, job.fix_type) as FixChannel
  const stored = (job.undo ?? {}) as { expected?: string | null; via?: string | null }
  // The preview's compare value belongs to the channel it was read through; another channel writes without it.
  const ctx = channel === job.channel ? { expected: stored.expected ?? null, via: stored.via ?? null } : { expected: null, via: null }
  await updateJob(deps.admin, l.scope, job.id, { status: 'pending', channel, errorCode: null })
  const pending = { ...job, status: 'pending' as const, channel }
  await audit(deps, l, pending, 'retried', { next: null })
  const done = await execute(pending, l, deps, ctx)
  return { status: 200, body: { ok: true, job: jobView(done, l.caps) } }
}

// ── The plugin connection ───────────────────────────────────────────────────

export async function handlePlugin(body: unknown, deps: FixesDeps): Promise<Answer> {
  const b = (body ?? {}) as Record<string, unknown>
  try {
    const l = await load(b.projectId, deps)
    if (isAnswer(l)) return l
    if (!l.caps.available) return refuse('queue_unavailable')
    if (l.caps.readOnly) return refuse('shopify_readonly')
    switch (b.action) {
      case 'issue': {
        // A new key for this project's site; its code is shown once and replaces any earlier key.
        const siteUrl = l.ctx.creds?.siteUrl ?? l.ctx.siteUrls[0]
        if (!siteUrl || !/^https:\/\//i.test(siteUrl)) return refuse('off_site')
        const key = generatePluginKey(deps.random)
        await savePluginKey(deps.admin, l.scope, {
          siteUrl: new URL(siteUrl).origin, keyId: key.keyId, secretEncrypted: deps.encrypt(key.secret), secretHint: `••••${key.secret.slice(-4)}`,
        })
        return { status: 200, body: { ok: true, code: pairingCode(key), canAutoPair: !!l.ctx.creds } }
      }
      case 'pair': {
        // Push the pending key to the plugin over the application password (administrators only, WordPress decides).
        if (!l.ctx.creds || !l.ctx.plugin || !l.ctx.pluginLink) return refuse('no_channel')
        const pushed = await pairOverAppPassword(l.ctx.creds, pairingCode({ keyId: l.ctx.pluginLink.keyId, secret: l.ctx.pluginLink.secret }), deps.pluginPost)
        if (!pushed.ok) return refuse(pushed.code === 'wordpress_permission' ? 'wordpress_permission' : pushed.code)
        return check(l, deps)
      }
      case 'check':
        return await check(l, deps)
      case 'disconnect':
        await deletePluginLink(deps.admin, l.scope)
        return { status: 200, body: { ok: true } }
      default:
        return refuse('invalid_request')
    }
  } catch (e) {
    if (e instanceof FixStoreError) console.error('[site-fix] plugin link write failed')
    else console.error('[site-fix] plugin request failed')
    return refuse('store_failed')
  }
}

async function check(l: Loaded, deps: FixesDeps): Promise<Answer> {
  if (!l.ctx.pluginLink) return refuse('plugin_not_connected')
  const r = await pluginStatus(l.ctx.pluginLink, deps.pluginPost)
  if (!r.ok) {
    await markPluginLink(deps.admin, l.scope, { status: l.ctx.plugin?.status === 'pending' ? 'pending' : 'disconnected', errorCode: r.code })
    return refuse(r.code)
  }
  const version = /^[0-9]{1,3}(\.[0-9]{1,3}){0,3}$/.test(String(r.body.version)) ? String(r.body.version) : null
  const seo = r.body.seo_plugin === 'yoast' || r.body.seo_plugin === 'rankmath' ? r.body.seo_plugin : 'none'
  await markPluginLink(deps.admin, l.scope, { status: 'connected', version, seoPlugin: seo, errorCode: null, seen: true })
  return { status: 200, body: { ok: true, plugin: { state: 'connected', version, seoPlugin: seo } } }
}
