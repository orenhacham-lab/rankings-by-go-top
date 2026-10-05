'use client'

/**
 * "Writing guidelines": the owner's word on how the business's articles are
 * written (lib/content/writing-guidance). Standing instructions, what the
 * business does not offer, and the rules kept from notes left on articles.
 * Its own load and its own save; nothing here touches the article design.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { NotebookPen, Plus, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Switch from '@/components/ui/Switch'
import { Skeleton } from '@/components/ui/Skeleton'
import SettingsCard, { FieldLabel, fieldClass } from './SettingsCard'
import SaveBar, { showSaveBar, type SaveState } from './SaveBar'
import Notice from './Notice'
import { bidiField } from './copy'
import { SECTION } from './anchors'
import { loadWritingGuidanceAction, saveWritingGuidanceAction } from '@/app/(dashboard)/settings/writing-guidance-actions'
import { readArticleSettings } from './article-settings-load'
import { cleanLine, GUIDANCE_LIMITS, sameGuidance, type WritingGuidance } from '@/lib/content/writing-guidance/guidance'
import type { GuidanceView } from '@/lib/content/writing-guidance/data'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

type Props = { projectId: string; t: DashboardDictionary['projectSettings'] }

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))

export function useWritingGuidance(projectId: string) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; data: GuidanceView } | { status: 'failed' }>({ status: 'loading' })
  const latest = useRef(0)
  const load = useCallback(() => {
    const mine = ++latest.current
    return readArticleSettings(() => loadWritingGuidanceAction(projectId), { stale: () => mine !== latest.current }).then((res) => {
      if (mine !== latest.current) return
      setState((prev) => (res?.ok ? { status: 'ready', data: res.data } : prev.status === 'ready' ? prev : { status: 'failed' }))
    })
  }, [projectId])
  useEffect(() => { void load() }, [load])
  const setData = useCallback((data: GuidanceView) => { latest.current++; setState({ status: 'ready', data }) }, [])
  return { state, reload: () => { setState({ status: 'loading' }); return load() }, setData }
}

export default function WritingGuidanceCard({ projectId, t }: Props) {
  const w = t.writingGuidance
  const { state, reload, setData } = useWritingGuidance(projectId)

  if (state.status === 'failed') {
    return (
      <section id={SECTION.writingGuidance} className="scroll-mt-20">
        <Notice tone="bad" action={{ label: w.retry, onClick: () => void reload() }}>{w.loadFailed}</Notice>
      </section>
    )
  }
  if (state.status === 'loading') {
    return (
      <div id={SECTION.writingGuidance} aria-busy="true" data-writing-guidance="loading" className="scroll-mt-20 rounded-card border border-line bg-surface p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-4 w-full max-w-lg" />
        <Skeleton className="mt-5 h-24 w-full" />
      </div>
    )
  }
  return <GuidanceForm key={projectId} projectId={projectId} view={state.data} onData={setData} t={t} />
}

function GuidanceForm({ projectId, view, onData, t }: { projectId: string; view: GuidanceView; onData: (v: GuidanceView) => void; t: Props['t'] }) {
  const w = t.writingGuidance
  const saved = view.guidance
  const [draft, setDraft] = useState<WritingGuidance>(saved)
  const [pending, setPending] = useState('')
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [tooLong, setTooLong] = useState(false)
  const dirty = !sameGuidance(draft, saved)
  const disabled = !view.editable

  const addExclusion = () => {
    const item = cleanLine(pending, GUIDANCE_LIMITS.exclusion)
    if (!item) return
    if (!draft.exclusions.some((x) => x.toLocaleLowerCase() === item.toLocaleLowerCase()) && draft.exclusions.length < GUIDANCE_LIMITS.exclusions) {
      setDraft({ ...draft, exclusions: [...draft.exclusions, item] })
    }
    setPending('')
  }

  const onSave = async () => {
    setSave({ kind: 'saving' })
    setTooLong(false)
    const res = await saveWritingGuidanceAction(projectId, {
      mentionBusiness: draft.mentionBusiness,
      instructions: draft.instructions,
      exclusions: draft.exclusions,
      rules: draft.rules.map((r) => ({ text: r.text })),
    })
    if (res.ok) {
      setSave({ kind: 'saved' })
      setDraft(res.data.guidance)
      onData(res.data)
      return
    }
    if (res.code === 'invalid_guidance') {
      setTooLong(true)
      setSave({ kind: 'error', code: 'invalid_request' })
      return
    }
    setSave({ kind: 'error', code: res.code })
  }

  return (
    <SettingsCard
      id={SECTION.writingGuidance}
      icon={NotebookPen}
      title={w.title}
      description={w.body}
      footer={showSaveBar(dirty, save) ? (
        <SaveBar
          dirty={dirty}
          state={save}
          note={tooLong ? w.errors.invalid_guidance : null}
          onSave={() => void onSave()}
          onDiscard={() => { setDraft(saved); setSave({ kind: 'idle' }); setTooLong(false) }}
          t={t}
        />
      ) : undefined}
    >
      <div className="space-y-6" data-writing-guidance="">
        {disabled && <Notice tone="info">{w.readOnly}</Notice>}

        <div data-writing-mention="">
          <Switch
            checked={draft.mentionBusiness}
            disabled={disabled}
            onChange={(next) => setDraft({ ...draft, mentionBusiness: next })}
            label={w.mentionLabel}
            description={w.mentionHint}
          />
        </div>

        <div>
          <FieldLabel htmlFor="writing-instructions" aside={<span className="text-caption text-muted tabular-nums">{fill(w.count, { n: draft.instructions.length, max: GUIDANCE_LIMITS.instructions })}</span>}>
            {w.instructionsLabel}
          </FieldLabel>
          <p id="writing-instructions-hint" className="mb-2 text-caption text-muted">{w.instructionsHint}</p>
          <textarea
            id="writing-instructions"
            aria-describedby="writing-instructions-hint"
            className={fieldClass}
            rows={5}
            maxLength={GUIDANCE_LIMITS.instructions}
            disabled={disabled}
            value={draft.instructions}
            placeholder={w.instructionsPlaceholder}
            onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
            {...bidiField(draft.instructions)}
          />
        </div>

        <div>
          <FieldLabel htmlFor="writing-exclusion" aside={<span className="text-caption text-muted tabular-nums">{fill(w.count, { n: draft.exclusions.length, max: GUIDANCE_LIMITS.exclusions })}</span>}>
            {w.exclusionsLabel}
          </FieldLabel>
          <p id="writing-exclusion-hint" className="mb-2 text-caption text-muted">{w.exclusionsHint}</p>
          {draft.exclusions.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2" data-writing-exclusions="">
              {draft.exclusions.map((item) => (
                <li key={item} className="inline-flex items-center gap-1 rounded-pill border border-line bg-sunk py-1 ps-3 pe-1 text-copy text-ink">
                  <bdi>{item}</bdi>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={fill(w.remove, { item })}
                    onClick={() => setDraft({ ...draft, exclusions: draft.exclusions.filter((x) => x !== item) })}
                    className="grid size-6 place-items-center rounded-pill text-muted hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              id="writing-exclusion"
              aria-describedby="writing-exclusion-hint"
              className={fieldClass}
              maxLength={GUIDANCE_LIMITS.exclusion}
              disabled={disabled || draft.exclusions.length >= GUIDANCE_LIMITS.exclusions}
              value={pending}
              placeholder={w.exclusionsPlaceholder}
              onChange={(e) => setPending(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExclusion() } }}
              {...bidiField(pending)}
            />
            <Button type="button" variant="secondary" disabled={disabled || !pending.trim()} onClick={addExclusion}>
              <Plus aria-hidden className="size-4" />
              {w.add}
            </Button>
          </div>
        </div>

        <div>
          <FieldLabel aside={<span className="text-caption text-muted tabular-nums">{fill(w.count, { n: draft.rules.length, max: GUIDANCE_LIMITS.rules })}</span>}>
            {w.rulesLabel}
          </FieldLabel>
          <p className="mb-2 text-caption text-muted">{w.rulesHint}</p>
          {draft.rules.length === 0 ? (
            <p className="rounded-inset border border-dashed border-line px-4 py-3 text-copy text-muted" data-writing-rules="empty">{w.rulesEmpty}</p>
          ) : (
            <ul className="divide-y divide-line rounded-inset border border-line" data-writing-rules="">
              {draft.rules.map((r) => (
                <li key={r.text} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-copy text-ink" {...bidiField(r.text)}>{r.text}</p>
                    {r.articleId && <p className="mt-0.5 text-caption text-muted">{w.ruleFromArticle}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={fill(w.remove, { item: r.text })}
                    onClick={() => setDraft({ ...draft, rules: draft.rules.filter((x) => x.text !== r.text) })}
                    className="grid size-8 shrink-0 place-items-center rounded-control text-muted hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-caption text-muted">{w.appliesNext}</p>
      </div>
    </SettingsCard>
  )
}
