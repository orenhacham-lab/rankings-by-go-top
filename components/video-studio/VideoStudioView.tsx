'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Download, Loader2, Pencil, RotateCcw, Sparkles, Wallet } from 'lucide-react'
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Notice from '@/components/ui/Notice'
import Textarea from '@/components/ui/Textarea'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { VIDEO_STUDIO_COPY } from '@/lib/video-studio/copy'
import { VIDEO_UI_COPY } from '@/lib/video-studio/copy-ui'
import { creditsFor } from '@/lib/video-studio/cost'
import { MAX_PROMPT_CHARS, MAX_REFERENCE_IMAGES } from '@/lib/video-studio/config'
import { fallbackPrompt } from '@/lib/video-studio/fallback-prompt'
import {
  CAMERA_IDS, GOAL_IDS, GOALS, MOOD_IDS, SECONDS_OPTIONS, STYLE_IDS,
  type CameraId, type GoalId, type MoodId, type PlanInput, type StyleId,
} from '@/lib/video-studio/presets'
import CreditPacks from './CreditPacks'
import { Chips, ChoiceCard, PhotoDrop, Step, type Photo } from './StudioParts'

type Aspect = '9:16' | '16:9'
interface Plan { key: string; prompt: string; summary: string | null; notes: string[]; fellBack: boolean }
type View = { kind: 'form' } | { kind: 'working'; startedAt: number } | { kind: 'done'; url: string }

/** Shrinks a photo to at most 1280 px on its long side, as JPEG, so six of them fit in one request. */
async function shrink(file: File): Promise<{ data: string; preview: string } | null> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
    const url = c.toDataURL('image/jpeg', 0.82)
    return { data: url.split(',')[1] ?? '', preview: url }
  } catch { return null }
}

function Waiting({ photo, startedAt, aspect, held }: { photo: string | null; startedAt: number; aspect: Aspect; held: number }) {
  const { uiLocale } = useDashboardLanguage()
  const u = VIDEO_UI_COPY[uiLocale]
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [startedAt])
  const active = Math.min(3, Math.floor(elapsed / 25))
  return (
    <Card className="mx-auto max-w-xl space-y-6 text-center" padding>
      <div className={cn('relative mx-auto overflow-hidden rounded-card bg-contrast', aspect === '9:16' ? 'aspect-[9/16] max-h-80' : 'aspect-video w-full max-w-md')}>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-full scale-105 object-cover opacity-60 blur-[2px]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-contrast/80 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-contrast-ink/5 motion-safe:animate-pulse" />
        <Loader2 className="absolute start-1/2 top-1/2 size-8 -translate-y-1/2 text-contrast-ink motion-safe:animate-spin" style={{ marginInlineStart: '-1rem' }} aria-hidden="true" />
      </div>
      <ol className="mx-auto max-w-xs space-y-2 text-start" aria-live="polite">
        {u.phases.map((p, i) => (
          <li key={p} className={cn('flex items-center gap-2.5 text-copy transition-colors duration-300', i < active ? 'text-ink' : i === active ? 'font-semibold text-ink' : 'text-muted/70')}>
            <span className={cn('inline-flex size-5 items-center justify-center rounded-pill', i < active ? 'bg-ok text-white' : i === active ? 'bg-action-soft text-action' : 'bg-sunk')}>
              {i < active ? <Check className="size-3" aria-hidden="true" /> : i === active ? <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden="true" /> : null}
            </span>
            {p}
          </li>
        ))}
      </ol>
      {elapsed > 150 && <p className="text-copy text-ink">{u.almost}</p>}
      <div className="space-y-1 text-caption text-muted">
        <p>{u.timeNote}</p>
        <p>{u.heldNote(held)}</p>
      </div>
    </Card>
  )
}

function Screen({ projectId }: { projectId: string }) {
  const { uiLocale } = useDashboardLanguage()
  const t = VIDEO_STUDIO_COPY[uiLocale]
  const u = VIDEO_UI_COPY[uiLocale]
  const [photos, setPhotos] = useState<Photo[]>([])
  const [unreadable, setUnreadable] = useState(false)
  const [goal, setGoal] = useState<GoalId | null>(null)
  const [idea, setIdea] = useState('')
  const [style, setStyle] = useState<StyleId | null>(null)
  const [mood, setMood] = useState<MoodId | null>(null)
  const [camera, setCamera] = useState<CameraId | null>(null)
  const [seconds, setSeconds] = useState<number>(5)
  const [aspect, setAspect] = useState<Aspect>('9:16')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [editing, setEditing] = useState(false)
  const [view, setView] = useState<View>({ kind: 'form' })
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const next = useRef(1)

  const cost = creditsFor(seconds)
  const input: PlanInput = { idea: idea.trim(), goal, style, mood, camera, seconds, aspect, photoCount: photos.length }
  const key = JSON.stringify(input)
  const fresh = plan !== null && plan.key === key
  const short = balance !== null && balance < cost
  const canPlan = photos.length > 0 || idea.trim().length > 0
  const onBalance = useCallback((n: number | null) => setBalance(n), [])

  async function onFiles(files: FileList | File[]) {
    const room = MAX_REFERENCE_IMAGES - photos.length
    const added: Photo[] = []
    let bad = false
    for (const f of Array.from(files).slice(0, Math.max(0, room))) {
      const s = await shrink(f)
      if (s) added.push({ id: next.current++, data: s.data, mimeType: 'image/jpeg', preview: s.preview })
      else bad = true
    }
    setUnreadable(bad)
    setPhotos((p) => [...p, ...added])
  }
  const makeCover = (id: number) => setPhotos((l) => { const p = l.find((x) => x.id === id); return p ? [p, ...l.filter((x) => x.id !== id)] : l })

  function pickGoal(g: GoalId) {
    const p = GOALS[g]
    setGoal(g); setStyle(p.style); setMood(p.mood); setCamera(p.camera); setSeconds(p.seconds)
  }

  async function prepare() {
    setPlanning(true); setError(null); setEditing(false)
    const snapshot = key
    let result: Plan | null = null
    try {
      const r = await fetch('/api/video-studio/improve-prompt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, locale: uiLocale, ...input }),
      })
      const b = await r.json().catch(() => null)
      if (r.ok && b?.ok && typeof b.prompt === 'string' && b.prompt.trim()) {
        result = { key: snapshot, prompt: b.prompt, summary: typeof b.summary === 'string' ? b.summary : null, notes: Array.isArray(b.notes) ? b.notes.filter((n: unknown): n is string => typeof n === 'string') : [], fellBack: b.source !== 'ai' }
      }
    } catch { /* the local plan below keeps the flow going */ }
    setPlan(result ?? { key: snapshot, prompt: fallbackPrompt(input), summary: null, notes: [], fellBack: true })
    setPlanning(false)
  }

  async function create(prompt: string) {
    setError(null)
    setView({ kind: 'working', startedAt: Date.now() })
    const res = await fetch('/api/video-studio/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, prompt, seconds, aspect, images: photos.map((p) => ({ data: p.data, mimeType: p.mimeType })) }),
    }).catch(() => null)
    const body = res ? await res.json().catch(() => null) : null
    setRefreshKey((k) => k + 1)
    if (res?.ok && body?.ok && typeof body.url === 'string') { setView({ kind: 'done', url: body.url }); return }
    setView({ kind: 'form' })
    if (!res) { setError(u.errNetwork); return }
    const code = typeof body?.error === 'string' ? body.error : ''
    const known = ['insufficient_credits', 'daily_limit', 'too_many_images', 'images_too_large', 'invalid_request'] as const
    const k = (known as readonly string[]).includes(code) ? (code as (typeof known)[number]) : (['invalid_prompt', 'invalid_seconds', 'invalid_aspect'].includes(code) ? 'invalid_request' : 'failed')
    setError(t.errors[k])
  }

  function reset() {
    setView({ kind: 'form' }); setPlan(null); setError(null); setPhotos([]); setIdea(''); setGoal(null); setStyle(null); setMood(null); setCamera(null); setSeconds(5); setAspect('9:16')
  }

  const toPacks = () => document.getElementById('vs-packs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  if (view.kind === 'working') {
    return <Waiting photo={photos[0]?.preview ?? null} startedAt={view.startedAt} aspect={aspect} held={cost} />
  }

  if (view.kind === 'done') {
    return (
      <div className="space-y-6">
        <Card className="mx-auto max-w-xl space-y-5" padding>
          <div className="flex items-center gap-2"><span className="inline-flex size-7 items-center justify-center rounded-pill bg-ok text-white"><Check className="size-4" aria-hidden="true" /></span><h2 className="text-lead font-bold text-ink">{u.resultReady}</h2></div>
          <video src={view.url} controls playsInline className={cn('mx-auto w-full rounded-card bg-contrast', aspect === '9:16' ? 'max-h-[70vh] max-w-xs' : 'max-w-xl')} />
          <div className="flex flex-wrap gap-2">
            <a href={`${view.url}${view.url.includes('?') ? '&' : '?'}download=clip.mp4`} download="clip.mp4" className="inline-flex h-10 items-center gap-2 rounded-control bg-action px-4 text-copy font-semibold text-action-ink shadow-control transition-colors hover:bg-action-hover"><Download className="size-4" aria-hidden="true" />{t.download}</a>
            <Button variant="secondary" disabled={short || !plan} onClick={() => plan && void create(plan.prompt)}><RotateCcw className="size-4" aria-hidden="true" />{u.makeAnother(cost)}</Button>
            <Button variant="ghost" onClick={reset}>{u.startNew}</Button>
          </div>
          <p className="text-caption text-muted">{u.iosHint}</p>
          <p className="text-caption font-semibold text-ink">{u.keepNote}</p>
        </Card>
        <CreditPacks onBalance={onBalance} refreshKey={refreshKey} needed={cost} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <a href="#vs-packs" onClick={(e) => { e.preventDefault(); toPacks() }}
        className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3.5 py-1.5 text-copy text-ink shadow-control transition-colors hover:border-line-strong">
        <Wallet className="size-4 text-action" aria-hidden="true" />
        {balance === null ? <span className="inline-block h-4 w-20 rounded bg-sunk motion-safe:animate-pulse" /> : (
          <><span className="font-bold tabular-nums">{u.balanceChip(balance)}</span><span className="text-muted">{u.balanceHint(Math.floor(balance / creditsFor(8)))}</span></>
        )}
      </a>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-10">
          <Step n={1} title={u.stepPhotos}>
            <PhotoDrop photos={photos} max={MAX_REFERENCE_IMAGES} copy={u} unreadable={unreadable} onFiles={(f) => void onFiles(f)} onRemove={(id) => setPhotos((l) => l.filter((x) => x.id !== id))} onCover={makeCover} />
          </Step>

          <Step n={2} title={u.stepGoal}>
            <div role="radiogroup" aria-label={u.stepGoal} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {GOAL_IDS.map((g) => (
                <ChoiceCard key={g} on={goal === g} onClick={() => pickGoal(g)} className="py-3.5">
                  <span className="text-copy font-semibold text-ink">{u.goals[g].label}</span>
                </ChoiceCard>
              ))}
            </div>
            <div className="mt-4">
              <Textarea label={u.ideaLabel} value={idea} maxLength={500} rows={3} placeholder={goal ? u.goals[goal].example : u.goals.showcase.example} onChange={(e) => setIdea(e.target.value)} />
              <p className="mt-1.5 text-caption text-muted">{u.ideaHint}</p>
            </div>
          </Step>

          <Step n={3} title={u.stepLook}>
            <div className="space-y-5">
              <Chips label={u.styleLabel} value={style} onChange={setStyle} auto={u.auto} options={STYLE_IDS.map((v) => ({ value: v, label: u.styles[v] }))} />
              <Chips label={u.moodLabel} value={mood} onChange={setMood} auto={u.auto} options={MOOD_IDS.map((v) => ({ value: v, label: u.moods[v] }))} />
              <Chips label={u.cameraLabel} value={camera} onChange={setCamera} auto={u.auto} options={CAMERA_IDS.map((v) => ({ value: v, label: u.cameras[v] }))} />
            </div>
          </Step>

          <Step n={4} title={u.stepFormat}>
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-caption font-semibold text-muted">{u.lengthLabel}</p>
                <div role="radiogroup" aria-label={u.lengthLabel} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {SECONDS_OPTIONS.map((s) => (
                    <ChoiceCard key={s} on={seconds === s} onClick={() => setSeconds(s)}>
                      <span className="block text-lead font-bold text-ink tabular-nums">{u.secs(s)}</span>
                      <span className="block text-caption text-muted tabular-nums">{u.credits(creditsFor(s))}</span>
                    </ChoiceCard>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-caption font-semibold text-muted">{u.formatLabel}</p>
                <div role="radiogroup" aria-label={u.formatLabel} className="grid grid-cols-2 gap-2.5">
                  {([['9:16', u.verticalHint], ['16:9', u.horizontalHint]] as const).map(([a, hint]) => (
                    <ChoiceCard key={a} on={aspect === a} onClick={() => setAspect(a)} className="flex items-center gap-3">
                      <span aria-hidden="true" className={cn('shrink-0 rounded-[4px] border-2', aspect === a ? 'border-action bg-action/15' : 'border-line-strong bg-sunk', a === '9:16' ? 'h-9 w-5' : 'h-5 w-9')} />
                      <span className="min-w-0"><span className="block text-copy font-semibold text-ink" dir="ltr">{a}</span><span className="block text-caption text-muted">{hint}</span></span>
                    </ChoiceCard>
                  ))}
                </div>
              </div>
            </div>
          </Step>

          {plan && (
            <Card className={cn('space-y-4 border-action/40', !fresh && 'opacity-70')} padding>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lead font-bold text-ink"><Sparkles className="size-4 text-action" aria-hidden="true" />{u.planTitle}</h2>
                {!fresh && <span className="rounded-pill bg-warn-soft px-2.5 py-0.5 text-caption font-semibold text-warn">{u.planStale}</span>}
              </div>
              {plan.summary && <p className="text-copy leading-relaxed text-ink">{plan.summary}</p>}
              {plan.notes.length > 0 && (
                <ul className="space-y-1 text-copy text-body">
                  {plan.notes.map((n) => <li key={n} className="flex gap-2"><Check className="mt-1 size-3.5 shrink-0 text-ok" aria-hidden="true" />{n}</li>)}
                </ul>
              )}
              {plan.fellBack && <p className="text-caption text-muted">{u.enhanceFailed}</p>}
              {editing && <Textarea label={u.englishBrief} dir="ltr" rows={6} maxLength={MAX_PROMPT_CHARS} value={plan.prompt} onChange={(e) => setPlan({ ...plan, prompt: e.target.value })} />}
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}><Pencil className="size-3.5" aria-hidden="true" />{u.editDetails}</Button>
                {idea.trim() && <Button variant="ghost" size="sm" onClick={() => { setPlan({ ...plan, prompt: idea.trim().slice(0, MAX_PROMPT_CHARS), key }); setEditing(false) }}>{u.useMyWords}</Button>}
                <Button variant="ghost" size="sm" loading={planning} onClick={() => void prepare()}>{u.rewrite}</Button>
              </div>
            </Card>
          )}
        </div>

        <aside className="lg:sticky lg:top-6">
          <Card tone="ink" className="space-y-5" padding>
            <dl className="space-y-2 text-copy">
              <div className="flex items-baseline justify-between gap-3"><dt className="text-contrast-ink/70">{u.summaryThis}</dt><dd className="font-bold tabular-nums">{u.credits(cost)}</dd></div>
              {balance !== null && (
                <>
                  <div className="flex items-baseline justify-between gap-3"><dt className="text-contrast-ink/70">{u.summaryBalance}</dt><dd className="tabular-nums">{u.credits(balance)}</dd></div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-contrast-ink/15 pt-2"><dt className="text-contrast-ink/70">{u.summaryAfter}</dt><dd className={cn('font-bold tabular-nums', short && 'text-commit')}>{u.credits(Math.max(0, balance - cost))}</dd></div>
                </>
              )}
            </dl>
            {short ? (
              <Button variant="commit" size="lg" className="w-full" onClick={toPacks}><Wallet className="size-4" aria-hidden="true" />{u.getCredits}</Button>
            ) : fresh && plan ? (
              <Button variant="commit" size="lg" className="w-full" onClick={() => void create(plan.prompt)}>{u.createNow(cost)}</Button>
            ) : (
              <Button variant="commit" size="lg" className="w-full" loading={planning} disabled={!canPlan} onClick={() => void prepare()}><Sparkles className="size-4" aria-hidden="true" />{planning ? u.preparing : u.prepare}</Button>
            )}
            {!canPlan && <p className="text-caption text-contrast-ink/70">{u.needInput}</p>}
            <p className="text-caption text-contrast-ink/70">{u.refundNote}</p>
          </Card>
        </aside>
      </div>

      {error && <Notice tone="bad" onDismiss={() => setError(null)}>{error}</Notice>}
      <CreditPacks onBalance={onBalance} refreshKey={refreshKey} needed={cost} />
    </div>
  )
}

export default function VideoStudioView() {
  const { uiLocale } = useDashboardLanguage()
  const t = VIDEO_STUDIO_COPY[uiLocale]
  return (
    <div>
      <Header title={t.title} subtitle={t.subtitle} />
      <WorkspaceGate>{(project) => <Screen key={project.id} projectId={project.id} />}</WorkspaceGate>
    </div>
  )
}
