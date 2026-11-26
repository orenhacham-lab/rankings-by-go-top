'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import EmptyState from '@/components/ui/EmptyState'
import Notice from '@/components/ui/Notice'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Textarea from '@/components/ui/Textarea'
import Input from '@/components/ui/Input'
import { FIELD_CLASSES, FIELD_LABEL_CLASSES } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { ScreenSkeleton } from '@/components/ui/Skeleton'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { metaPostsText, type MetaPostsText } from '@/lib/i18n/meta-posts'
import { normalizeMetaLanguage } from '@/lib/meta-posts/validate'

interface PostView {
  id: string; groupId: string; target: 'facebook' | 'instagram'; body: string; linkUrl: string | null; imageUrl: string | null
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled'
  scheduledAt: string; publishedAt: string | null; permalink: string | null; errorCode: string | null
}
interface ReadyStatus {
  ok: true; state: 'ready'; appName: string; configured: boolean
  connection: { status: 'connected' | 'reauth_required' | 'revoked'; errorCode: string | null } | null
  page: { name: string; pageId: string; instagramUsername: string | null; hasInstagram: boolean } | null
  posts: PostView[]; siteUrl: string | null
  articles: Array<{ id: string; title: string; url: string | null; imageUrl: string | null }>
}
type Status = ReadyStatus | { ok: true; state: 'unavailable' }
interface PageOption { pageId: string; name: string; instagramUsername: string | null; hasInstagram: boolean }

const ERR: Record<string, keyof MetaPostsText> = {
  reauth_required: 'errReauth', not_connected: 'errReauth', permission_denied: 'errPermission', rate_limited: 'errLater',
  meta_unavailable: 'errLater', post_rejected: 'errRejected', image_rejected: 'errImage', invalid_post: 'errInvalid',
  no_instagram: 'errNoInstagram', no_page: 'errNoPage', draft_unavailable: 'errDraft',
}
const FLD: Record<string, keyof MetaPostsText> = {
  body_empty: 'fldBody', body_too_long: 'fldBody', target_required: 'fldTarget', target_invalid: 'fldTarget',
  instagram_needs_image: 'fldInstagramPhoto', instagram_unavailable: 'fldInstagramNone',
  link_invalid: 'fldLink', link_not_https: 'fldLink', link_other_site: 'fldLink', link_too_long: 'fldLink',
  schedule_invalid: 'fldSchedule', schedule_in_past: 'fldSchedule', schedule_too_far: 'fldSchedule',
}
const errText = (t: MetaPostsText, code: unknown) => t[ERR[String(code)] ?? 'errGeneric']
function failText(t: MetaPostsText, body: { error?: unknown; fields?: unknown }): string {
  if (body.error === 'invalid_post' && Array.isArray(body.fields) && body.fields.length > 0) return t[FLD[String(body.fields[0])] ?? 'errInvalid']
  return errText(t, body.error)
}
const NOTICE: Record<string, { tone: 'ok' | 'bad'; key: keyof MetaPostsText }> = {
  connected: { tone: 'ok', key: 'noticeConnected' }, access_denied: { tone: 'bad', key: 'noticeDenied' },
  scope_missing: { tone: 'bad', key: 'noticeScope' }, meta_unavailable: { tone: 'bad', key: 'noticeUnavailable' },
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }).catch(() => null)
  const json = res ? await res.json().catch(() => ({})) : {}
  return { ok: !!res && res.ok && json?.ok !== false, json: json as Record<string, unknown> }
}

function Screen({ projectId }: { projectId: string }) {
  const { uiLocale } = useDashboardLanguage()
  const t = metaPostsText(uiLocale)
  const [status, setStatus] = useState<Status | null>(null)
  const [failed, setFailed] = useState(false)
  const [flash, setFlash] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [pages, setPages] = useState<PageOption[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/meta/status?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' }).catch(() => null)
    const body = res ? await res.json().catch(() => null) : null
    if (!res || !res.ok || !body?.ok) { setFailed(true); return }
    setFailed(false); setStatus(body as Status)
  }, [projectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the server state once on mount
    void load()
    const url = new URL(window.location.href)
    const code = url.searchParams.get('meta')
    if (code) {
      const n = NOTICE[code]
      setFlash({ tone: n?.tone ?? 'bad', text: t[n?.key ?? 'noticeFailed'] })
      url.searchParams.delete('meta')
      window.history.replaceState(null, '', url.toString())
    }
  }, [load, t])

  if (failed) return <Notice tone="bad" action={{ label: t.retry, onClick: () => void load() }}>{t.loadFailed}</Notice>
  if (!status) return <ScreenSkeleton label={t.loading} />
  if (status.state === 'unavailable') return <EmptyState title={t.unavailable} body="" />
  const s = status
  const connected = s.connection?.status === 'connected'

  const connect = async () => {
    setBusy(true)
    const r = await api('/api/meta/connect', 'POST', { projectId })
    const url = r.json.authUrl
    if (r.ok && typeof url === 'string' && url.startsWith('https://www.facebook.com/')) { window.location.assign(url); return }
    setFlash({ tone: 'bad', text: r.json.reason === 'not_configured' ? t.notConfigured : errText(t, r.json.error) })
    setBusy(false)
  }
  const disconnect = async () => {
    setBusy(true)
    const r = await fetch(`/api/meta/connection?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (!r || !r.ok) { setFlash({ tone: 'bad', text: t.errGeneric }); return }
    setPages(null); void load()
  }
  const loadPages = async () => {
    setBusy(true)
    const res = await fetch(`/api/meta/pages?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' }).catch(() => null)
    const body = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (res?.ok && Array.isArray(body.pages)) setPages(body.pages as PageOption[])
    else { setFlash({ tone: 'bad', text: errText(t, body.error) }); void load() }
  }
  const choose = async (pageId: string) => {
    setBusy(true)
    const r = await api('/api/meta/pages', 'POST', { projectId, pageId })
    setBusy(false)
    if (!r.ok) { setFlash({ tone: 'bad', text: errText(t, r.json.error) }); return }
    setPages(null); void load()
  }

  return (
    <div className="space-y-8">
      {flash && <Notice tone={flash.tone} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="text-section font-semibold text-ink">{t.connectTitle}</h2>
          <p className="mt-2 text-copy text-body">{t.connectBody}</p>
          {!s.configured && <Notice tone="warn" className="mt-3">{t.notConfigured}</Notice>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {connected
              ? <><Badge variant="success" dot>{t.connectedState}</Badge><Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>{t.disconnectBtn}</Button></>
              : <Button onClick={connect} disabled={busy || !s.configured}>{s.connection ? t.reconnectBtn : t.connectBtn}</Button>}
          </div>
          {s.connection && !connected && <p className="mt-2 text-caption text-muted">{t.reconnectState}</p>}
          {connected && <p className="mt-3 text-caption text-muted">{t.disconnectHelp}</p>}
        </Card>
        <Card className="p-5 sm:p-6">
          <h2 className="text-section font-semibold text-ink">{t.pageTitle}</h2>
          <p className="mt-2 text-copy text-body">{t.pageBody}</p>
          {s.page && (
            <p className="mt-3 text-copy text-ink">
              {t.pageSelected}: <strong>{s.page.name}</strong>
              <span className="block text-caption text-muted">{s.page.instagramUsername ? `${t.igLinked}: @${s.page.instagramUsername}` : t.igNone}</span>
            </p>
          )}
          <div className="mt-4">
            <Button variant="secondary" onClick={loadPages} disabled={busy || !connected}>{t.pageChoose}</Button>
          </div>
          {pages && (pages.length === 0 ? <p className="mt-3 text-caption text-muted">{t.pageNone}</p> : (
            <ul className="mt-3 space-y-2">
              {pages.map((p) => (
                <li key={p.pageId} className="flex items-center justify-between gap-3 rounded-inset border border-line p-3">
                  <span className="min-w-0 text-copy text-ink">{p.name}
                    <span className="block text-caption text-muted">{p.instagramUsername ? `${t.igLinked}: @${p.instagramUsername}` : t.igNone}</span>
                  </span>
                  <Button size="sm" onClick={() => choose(p.pageId)} disabled={busy}>{t.pageChoose}</Button>
                </li>
              ))}
            </ul>
          ))}
        </Card>
      </div>
      {connected && s.page && <Composer projectId={projectId} status={s} t={t} onChanged={load} setFlash={setFlash} />}
      <Queue projectId={projectId} status={s} t={t} onChanged={load} setFlash={setFlash} />
      <p className="text-caption text-muted">{t.trademark}</p>
    </div>
  )
}

type FlashSetter = (f: { tone: 'ok' | 'bad'; text: string } | null) => void

function Composer({ projectId, status, t, onChanged, setFlash }: { projectId: string; status: ReadyStatus; t: MetaPostsText; onChanged: () => void; setFlash: FlashSetter }) {
  const { uiLocale } = useDashboardLanguage()
  const [articleId, setArticleId] = useState('')
  const [topic, setTopic] = useState('')
  const [text, setText] = useState('')
  const [fb, setFb] = useState(true)
  const [ig, setIg] = useState(false)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const article = useMemo(() => status.articles.find((a) => a.id === articleId) ?? null, [status.articles, articleId])
  const language = normalizeMetaLanguage(uiLocale) ?? 'en'

  const draft = async () => {
    setBusy(true)
    const r = await api('/api/meta/draft', 'POST', { projectId, articleId: articleId || undefined, topic: articleId ? undefined : topic, language })
    setBusy(false)
    if (r.ok && typeof r.json.body === 'string') setText(r.json.body)
    else setFlash({ tone: 'bad', text: errText(t, r.json.error ?? 'draft_unavailable') })
  }
  const save = async () => {
    const targets = [fb && 'facebook', ig && 'instagram'].filter(Boolean)
    setBusy(true)
    const r = await api('/api/meta/posts', 'POST', { projectId, body: text, targets, articleId: articleId || undefined, link: link || undefined, language })
    setBusy(false)
    if (!r.ok) { setFlash({ tone: 'bad', text: failText(t, r.json) }); return }
    setText(''); setLink(''); onChanged()
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-section font-semibold text-ink">{t.composeTitle}</h2>
      <p className="mt-2 text-copy text-body">{t.composeBody}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASSES}>{t.articleLabel}</span>
          <select className={FIELD_CLASSES} value={articleId} onChange={(e) => setArticleId(e.target.value)}>
            <option value="">{t.articleNone}</option>
            {status.articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </label>
        <Input label={t.topicLabel} value={topic} maxLength={300} disabled={!!articleId} onChange={(e) => setTopic(e.target.value)} />
      </div>
      {article?.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.imageUrl} alt="" className="mt-3 h-28 w-auto rounded-inset border border-line object-cover" />
      )}
      <div className="mt-3"><Button variant="secondary" size="sm" onClick={draft} disabled={busy || (!articleId && !topic.trim())}>{busy ? t.drafting : t.draftBtn}</Button></div>
      <div className="mt-4"><Textarea label={t.bodyLabel} rows={8} value={text} maxLength={2200} onChange={(e) => setText(e.target.value)} /><p className="mt-1 text-caption text-muted">{Array.from(text).length} / 2200</p></div>
      <fieldset className="mt-4 flex flex-wrap items-center gap-5">
        <legend className={FIELD_LABEL_CLASSES}>{t.targetsLabel}</legend>
        <label className="flex items-center gap-2 text-copy text-ink"><input type="checkbox" checked={fb} onChange={(e) => setFb(e.target.checked)} />{t.facebook}</label>
        <label className="flex items-center gap-2 text-copy text-ink">
          <input type="checkbox" checked={ig} disabled={!status.page?.hasInstagram} onChange={(e) => setIg(e.target.checked)} />{t.instagram}
        </label>
      </fieldset>
      <div className="mt-4 max-w-md"><Input label={t.linkLabel} value={link} placeholder={status.siteUrl ?? ''} onChange={(e) => setLink(e.target.value)} /></div>
      <div className="mt-5"><Button onClick={save} disabled={busy || !text.trim() || (!fb && !ig)}>{t.saveDraftBtn}</Button></div>
    </Card>
  )
}

function Queue({ projectId, status, t, onChanged, setFlash }: { projectId: string; status: ReadyStatus; t: MetaPostsText; onChanged: () => void; setFlash: FlashSetter }) {
  // One card per group: the same text going to Facebook and to Instagram is one decision.
  const groups = useMemo(() => {
    const m = new Map<string, PostView[]>()
    for (const p of status.posts) m.set(p.groupId, [...(m.get(p.groupId) ?? []), p])
    return [...m.values()]
  }, [status.posts])
  return (
    <section>
      <h2 className="mb-3 text-section font-semibold text-ink">{t.queueTitle}</h2>
      {groups.length === 0 ? <p className="text-copy text-muted">{t.queueEmpty}</p>
        : <div className="space-y-4">{groups.map((g) => <GroupCard key={g[0].groupId} posts={g} projectId={projectId} t={t} onChanged={onChanged} setFlash={setFlash} />)}</div>}
    </section>
  )
}

const BADGE: Record<PostView['status'], { v: 'default' | 'success' | 'warning' | 'danger' | 'info'; k: keyof MetaPostsText }> = {
  draft: { v: 'warning', k: 'stDraft' }, scheduled: { v: 'info', k: 'stScheduled' }, publishing: { v: 'info', k: 'stPublishing' },
  published: { v: 'success', k: 'stPublished' }, failed: { v: 'danger', k: 'stFailed' }, cancelled: { v: 'default', k: 'stCancelled' },
}

function GroupCard({ posts, projectId, t, onChanged, setFlash }: { posts: PostView[]; projectId: string; t: MetaPostsText; onChanged: () => void; setFlash: FlashSetter }) {
  const first = posts[0]
  const isDraft = posts.every((p) => p.status === 'draft')
  const cancellable = posts.some((p) => p.status === 'draft' || p.status === 'scheduled')
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(first.body)
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState(false)

  const saveEdit = async () => {
    setBusy(true)
    const r = await api('/api/meta/posts', 'PATCH', { projectId, groupId: first.groupId, body: text })
    setBusy(false)
    if (!r.ok) { setFlash({ tone: 'bad', text: failText(t, r.json) }); return }
    setEditing(false); onChanged()
  }
  const approve = async () => {
    setBusy(true)
    const r = await api('/api/meta/approve', 'POST', { projectId, groupId: first.groupId, ...(when ? { scheduledAt: new Date(when).toISOString() } : {}) })
    setBusy(false)
    if (!r.ok) setFlash({ tone: 'bad', text: failText(t, r.json) })
    onChanged()
  }
  const cancel = async () => {
    setBusy(true)
    await fetch(`/api/meta/posts?projectId=${encodeURIComponent(projectId)}&groupId=${encodeURIComponent(first.groupId)}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false); onChanged()
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap gap-2">
        {posts.map((p) => (
          <Badge key={p.id} variant={BADGE[p.status].v}>{p.target === 'facebook' ? t.facebook : t.instagram}: {t[BADGE[p.status].k]}</Badge>
        ))}
      </div>
      {editing
        ? <div className="mt-3"><Textarea label={t.bodyLabel} rows={8} value={text} maxLength={2200} onChange={(e) => setText(e.target.value)} /></div>
        : <p className="mt-3 whitespace-pre-wrap text-copy text-ink">{first.body}</p>}
      {first.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={first.imageUrl} alt="" className="mt-3 h-24 w-auto rounded-inset border border-line object-cover" />
      )}
      {posts.map((p) => p.errorCode && p.status !== 'published' && (
        <p key={p.id} className="mt-2 text-caption text-bad">{errText(t, p.errorCode)}</p>
      ))}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {posts.filter((p) => p.permalink).map((p) => (
          <a key={p.id} href={p.permalink as string} target="_blank" rel="noopener noreferrer" className="text-caption font-semibold text-action underline">{t.viewPost} ({p.target === 'facebook' ? t.facebook : t.instagram})</a>
        ))}
      </div>
      {isDraft && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <p className="text-caption text-muted">{t.approveNote}</p>
          {editing
            ? <div className="flex gap-2"><Button size="sm" onClick={saveEdit} disabled={busy || !text.trim()}>{t.saveBtn}</Button></div>
            : <>
                <div className="max-w-xs"><Input label={t.scheduleLabel} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={approve} disabled={busy}>{when ? t.approveScheduleBtn : t.approveNowBtn}</Button>
                  <Button variant="secondary" onClick={() => { setText(first.body); setEditing(true) }} disabled={busy}>{t.editBtn}</Button>
                </div>
              </>}
        </div>
      )}
      {cancellable && !editing && <div className="mt-3"><Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>{t.cancelBtn}</Button></div>}
    </Card>
  )
}

export default function MetaPostsView() {
  const { uiLocale } = useDashboardLanguage()
  const t = metaPostsText(uiLocale)
  return (
    <div>
      <Header title={t.title} subtitle={t.subtitle} />
      <WorkspaceGate>{(project) => <Screen key={project.id} projectId={project.id} />}</WorkspaceGate>
    </div>
  )
}
