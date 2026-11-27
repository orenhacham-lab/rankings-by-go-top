/** The real collaborators for lib/video-studio/http.ts. Server-only. */
import { authContentProject } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { VIDEO_BUCKET, VIDEO_RETENTION_DAYS } from './config'
import { callVideoModel } from './generate'
import type { VideoDeps } from './http'

const admin = () => createAdminClient()
const dayStartUtc = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString() }

export const realVideoDeps: VideoDeps = {
  auth: (projectId) => authContentProject(projectId),
  async usageToday(userId) {
    const db = admin()
    const since = dayStartUtc()
    const [mine, all] = await Promise.all([
      db.from('video_jobs').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
      db.from('video_jobs').select('cost_usd, seconds, status').gte('created_at', since).limit(2000),
    ])
    if (mine.error || all.error) throw new Error('usage_failed')
    // A running job has no cost yet and counts as 0 here; the per-user cap (10 a day) bounds what is in flight.
    const globalCostUsd = ((all.data ?? []) as { cost_usd: number | null }[]).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)
    return { userJobs: mine.count ?? 0, globalCostUsd }
  },
  async startJob(j) {
    const { error } = await admin().from('video_jobs').insert({ id: j.id, user_id: j.userId, project_id: j.projectId, status: 'running', seconds: j.seconds, credits: j.credits })
    return !error
  },
  async spend(userId, credits, jobId) {
    const { data, error } = await admin().rpc('video_credit_spend', { p_user: userId, p_amount: credits, p_job: jobId })
    return !error && data === true
  },
  async refund(userId, credits, jobId, costUsd) {
    await admin().rpc('video_credit_refund', { p_user: userId, p_amount: credits, p_job: jobId, p_cost: costUsd })
  },
  callModel: (body) => {
    const key = process.env.GEMINI_API_KEY
    if (!key) return Promise.resolve({ ok: false, error: 'provider_failed' as const })
    return callVideoModel(key, body, (url, init) => fetch(url, init))
  },
  async store(projectId, jobId, mp4) {
    const db = admin()
    const path = `${projectId}/${jobId}.mp4`
    const up = await db.storage.from(VIDEO_BUCKET).upload(path, mp4, { contentType: 'video/mp4', upsert: false })
    if (up.error) return null
    const signed = await db.storage.from(VIDEO_BUCKET).createSignedUrl(path, VIDEO_RETENTION_DAYS * 86400)
    if (signed.error || !signed.data?.signedUrl) return null
    return { path, url: signed.data.signedUrl }
  },
  async finishJob(jobId, p) {
    const expires = p.status === 'done' ? new Date(Date.now() + VIDEO_RETENTION_DAYS * 86400_000).toISOString() : null
    await admin().from('video_jobs').update({ status: p.status, cost_usd: p.costUsd, storage_path: p.path ?? null, expires_at: expires }).eq('id', jobId)
  },
  /** Lazy 7-day expiry: each request removes up to 20 expired clips. No cron needed. */
  async purgeExpired() {
    const db = admin()
    const { data } = await db.from('video_jobs').select('id, storage_path').not('storage_path', 'is', null).lt('expires_at', new Date().toISOString()).limit(20)
    const rows = (data ?? []) as { id: string; storage_path: string }[]
    if (!rows.length) return
    const rm = await db.storage.from(VIDEO_BUCKET).remove(rows.map((r) => r.storage_path))
    if (rm.error) return
    await db.from('video_jobs').update({ storage_path: null }).in('id', rows.map((r) => r.id))
  },
}
