'use client'

import { useId, useRef, useState } from 'react'
import { Globe, MapPin, Plus, Trash2, Users } from 'lucide-react'
import Button from '@/components/ui/Button'
import { saveProjectSettingsAction } from '@/app/(dashboard)/settings/actions'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { Locale } from '@/lib/i18n/locales'
import { MAX_AUDIENCES } from '@/lib/seed-scan/settings'
import {
  MAX_AUDIENCE_CHARS,
  MAX_NICHE_CHARS,
  type AudienceView,
  type ProfileValues,
  type ProfileView,
  type SaveResult,
  type SectionSaveInput,
  type SettingsData,
} from '@/lib/project-settings/types'
import { audienceSuggestionItems, fill, newAudienceSuggestions } from '@/lib/project-settings/view'
import { cn } from '@/lib/utils'
import { RedetectButton, RedetectNoticeView, SuggestionsPanel, type SuggestionRow } from './AiControls'
import SaveBar, { showSaveBar, type SaveState } from './SaveBar'
import SettingsCard, { FieldLabel, fieldClass } from './SettingsCard'
import SourceChip from './SourceChip'
import { bidiField } from './copy'
import { SECTION } from './anchors'
import { useDraft } from './useDraft'
import { useRedetect } from './useRedetect'

type Copy = DashboardDictionary['projectSettings']

/** One line of the list: a saved audience (by its id), or one added here and not saved yet. */
type Row = { key: string; id?: string; label: string; source: 'scan' | 'user' | 'ai' | 'new' }
type Draft = { niche: string; is_local: boolean | null; rows: Row[] }

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const toDraft = (profile: ProfileView | null, audiences: AudienceView[]): Draft => ({
  niche: profile?.niche ?? '',
  is_local: profile?.is_local ?? null,
  rows: audiences.map((a) => ({ key: a.id, id: a.id, label: a.label, source: a.source })),
})
/** The list as it would be saved: empty lines are not audiences. */
const listOf = (d: Draft) => d.rows.map((r) => ({ id: r.id, label: clean(r.label) })).filter((r) => r.label)
const sameList = (a: Draft, b: Draft) => {
  const x = listOf(a)
  const y = listOf(b)
  return x.length === y.length && x.every((r, i) => r.id === y[i].id && r.label === y[i].label)
}
const sameNiche = (a: Draft, b: Draft) => clean(a.niche) === clean(b.niche)
const sameDraft = (a: Draft, b: Draft) => sameNiche(a, b) && a.is_local === b.is_local && sameList(a, b)

/**
 * Row 3: the niche, whether the business is local, and up to five audiences,
 * each its own line to edit or delete. Its own save; once saved, the whole
 * list is the owner's (a deleted audience stays deleted after the next scan)
 * and so are the niche and "local" when they were changed.
 */
export default function AudienceCard({
  projectId,
  profile,
  audiences,
  seedFeatures,
  scanBusy,
  neverScanned,
  onRescan,
  onData,
  t,
  locale,
}: {
  projectId: string
  profile: ProfileView | null
  audiences: AudienceView[]
  seedFeatures: boolean
  scanBusy: boolean
  neverScanned: boolean
  onRescan: () => void
  onData: (data: SettingsData) => void
  t: Copy
  locale: Locale
}) {
  const ids = useId()
  const saved = toDraft(profile, audiences)
  const { draft, dirty, setDraft, discard, commit } = useDraft(saved, sameDraft)
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const [fromAi, setFromAi] = useState<('niche' | 'is_local')[]>([])
  const nextKey = useRef(0)
  const redetect = useRedetect(projectId, 'audience')
  const sources = profile?.sources ?? {}
  const savedLabel = new Map(saved.rows.map((r) => [r.id, clean(r.label)]))

  const edit = (update: (d: Draft) => Draft) => {
    setDraft(update)
    if (state.kind !== 'saving') setState({ kind: 'idle' })
  }
  const newKey = () => `new-${++nextKey.current}`

  const nicheChanged = !sameNiche(draft, saved)
  const localChanged = draft.is_local !== saved.is_local
  const fieldChip = (field: 'niche' | 'is_local', changed: boolean) => {
    if (fromAi.includes(field) && changed) return <SourceChip kind="ai" label={t.source.ai} title={t.source.aiTitle} />
    if (seedFeatures && sources[field] === 'scan' && !changed) return <SourceChip kind="scan" label={t.source.scan} title={t.source.scanTitle} />
    return null
  }
  const rowChip = (row: Row) => {
    if (row.source === 'ai') return <SourceChip compact kind="ai" label={t.source.ai} title={t.source.aiTitle} />
    if (seedFeatures && row.source === 'scan' && row.id && savedLabel.get(row.id) === clean(row.label)) {
      return <SourceChip compact kind="scan" label={t.source.scan} title={t.source.scanTitle} />
    }
    return null
  }

  async function save() {
    const patch: Partial<ProfileValues> = {}
    if (nicheChanged) patch.niche = clean(draft.niche) || null
    if (localChanged) patch.is_local = draft.is_local
    const input: SectionSaveInput = { profile: patch }
    if (!sameList(draft, saved)) input.audiences = listOf(draft).map((r) => (r.id ? { id: r.id, label: r.label } : { label: r.label }))
    setState({ kind: 'saving' })
    let res: SaveResult
    try {
      res = await saveProjectSettingsAction(projectId, input)
    } catch {
      res = { ok: false, code: 'save_failed' }
    }
    if (!res.ok) {
      setState({ kind: 'error', code: res.code })
      return
    }
    commit(
      toDraft(
        res.data.profile.state === 'ok' ? res.data.profile.value : null,
        res.data.audiences.state === 'ok' ? res.data.audiences.value : [],
      ),
    )
    onData(res.data)
    setFromAi([])
    setState({ kind: 'saved' })
  }

  function detect() {
    if (neverScanned) redetect.preempt({ kind: 'scan_required' })
    else void redetect.run(locale)
  }

  const filled = listOf(draft).length
  const room = Math.max(0, MAX_AUDIENCES - filled)
  const s = redetect.suggestions
  const localLabel = (v: boolean) => (v ? t.audience.localYes : t.audience.localNo)
  const fresh = s ? newAudienceSuggestions(listOf(draft), s.audiences) : []
  const rows: SuggestionRow[] = s
    ? [
        ...audienceSuggestionItems({ niche: clean(draft.niche) || null, is_local: draft.is_local }, s).map((item) => ({
          key: item.key,
          label: t.ai.fields[item.key],
          value: item.key === 'is_local' ? localLabel(item.suggested === true) : String(item.suggested),
          current: item.current === null ? null : item.key === 'is_local' ? localLabel(item.current === true) : String(item.current),
        })),
        ...fresh.map((label, i) => ({ key: `audience:${i}`, label: t.ai.fields.audiences, value: label, group: 'new' as const })),
      ]
    : []

  function apply(keys: string[]) {
    if (!s) return
    const picked: Row[] = fresh
      .filter((_, i) => keys.includes(`audience:${i}`))
      .slice(0, room)
      .map((label) => ({ key: newKey(), label, source: 'ai' }))
    const fields: ('niche' | 'is_local')[] = []
    if (keys.includes('niche') && s.niche) fields.push('niche')
    if (keys.includes('is_local') && typeof s.is_local === 'boolean') fields.push('is_local')
    edit((d) => ({
      niche: fields.includes('niche') && s.niche ? s.niche : d.niche,
      is_local: fields.includes('is_local') && typeof s.is_local === 'boolean' ? s.is_local : d.is_local,
      // New audiences take the empty lines' places first.
      rows: [...d.rows.filter((r) => clean(r.label)), ...picked],
    }))
    setFromAi((prev) => [...new Set([...prev, ...fields])])
    redetect.clear()
  }

  const aiDirty = (fromAi.includes('niche') && nicheChanged) || (fromAi.includes('is_local') && localChanged) || draft.rows.some((r) => r.source === 'ai')
  const localOptions: { value: boolean; label: string; icon: typeof MapPin }[] = [
    { value: true, label: t.audience.localYes, icon: MapPin },
    { value: false, label: t.audience.localNo, icon: Globe },
  ]

  return (
    <SettingsCard
      id={SECTION.audience}
      icon={Users}
      title={t.audience.title}
      description={t.audience.body}
      actions={seedFeatures ? <RedetectButton working={redetect.working} busyScan={scanBusy} onClick={detect} t={t} /> : undefined}
      footer={showSaveBar(dirty, state) ? (
        <SaveBar
          dirty={dirty}
          state={state}
          note={aiDirty ? t.ai.applied : null}
          onSave={() => void save()}
          onDiscard={() => {
            discard()
            setFromAi([])
            setState({ kind: 'idle' })
          }}
          t={t}
        />
      ) : undefined}
    >
      <div className="space-y-6">
        {seedFeatures && redetect.notice && (
          <RedetectNoticeView notice={redetect.notice} t={t} locale={locale} onRescan={onRescan} onDismiss={redetect.clear} />
        )}
        {seedFeatures && s && (
          <SuggestionsPanel
            key={redetect.answer}
            rows={rows}
            room={room}
            footnote={fresh.length > 0 ? (room > 0 ? fill(t.ai.roomLeft, { n: room }) : t.ai.noRoom) : null}
            onApply={apply}
            onDismiss={redetect.clear}
            t={t}
          />
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div>
            <FieldLabel htmlFor={`${ids}-niche`} aside={fieldChip('niche', nicheChanged)}>
              {t.audience.nicheLabel}
            </FieldLabel>
            <input
              {...bidiField(draft.niche)}
              id={`${ids}-niche`}
              value={draft.niche}
              onChange={(e) => {
                const niche = e.target.value
                edit((d) => ({ ...d, niche }))
              }}
              maxLength={MAX_NICHE_CHARS}
              placeholder={t.audience.nichePlaceholder}
              className={fieldClass}
            />
          </div>

          <div role="radiogroup" aria-labelledby={`${ids}-local-label`}>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span id={`${ids}-local-label`} className="text-copy font-semibold text-ink">{t.audience.localLabel}</span>
              {fieldChip('is_local', localChanged)}
            </div>
            <div className="grid grid-cols-1 gap-1 rounded-control border border-line bg-sunk p-1 sm:grid-cols-2">
              {localOptions.map((option) => {
                const on = draft.is_local === option.value
                const Icon = option.icon
                return (
                  <label
                    key={String(option.value)}
                    data-local={String(option.value)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-copy transition-[background-color,color,box-shadow] duration-150',
                      'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-action',
                      on ? 'bg-surface font-semibold text-ink shadow-card' : 'text-muted hover:text-body',
                    )}
                  >
                    <input
                      type="radio"
                      name={`${ids}-local`}
                      checked={on}
                      onChange={() => edit((d) => ({ ...d, is_local: option.value }))}
                      className="sr-only"
                    />
                    <Icon size={15} aria-hidden className={on ? 'text-action' : undefined} />
                    <span className="min-w-0">{option.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span id={`${ids}-audiences`} className="text-copy font-semibold text-ink">{t.audience.audiencesLabel}</span>
            <span className="text-caption tabular-nums text-muted">
              {fill(t.audience.audiencesCount, { n: draft.rows.length, max: MAX_AUDIENCES })}
            </span>
          </div>
          {draft.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong bg-sunk/40 px-4 py-6 text-center text-copy text-muted">{t.audience.empty}</p>
          ) : (
            <ol aria-labelledby={`${ids}-audiences`} className="space-y-2">
              {draft.rows.map((row, i) => {
                const chip = rowChip(row)
                return (
                  <li key={row.key} data-audience-row className="flex items-center gap-2 animate-pop-in">
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-pill bg-action-soft text-caption font-bold tabular-nums text-action">
                      {i + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        {...bidiField(row.label)}
                        value={row.label}
                        onChange={(e) => {
                          const label = e.target.value
                          edit((d) => ({ ...d, rows: d.rows.map((r) => (r.key === row.key ? { ...r, label } : r)) }))
                        }}
                        maxLength={MAX_AUDIENCE_CHARS}
                        // A line just added is where the owner types next.
                        autoFocus={row.source === 'new' && row.label === ''}
                        placeholder={t.audience.audiencePlaceholder}
                        aria-label={`${t.audience.audiencesLabel} ${i + 1}`}
                        className={cn(fieldClass, 'min-w-0 flex-1')}
                      />
                      {chip && <span className="shrink-0">{chip}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => edit((d) => ({ ...d, rows: d.rows.filter((r) => r.key !== row.key) }))}
                      aria-label={`${t.audience.remove} ${i + 1}`}
                      title={t.audience.remove}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-bad-soft hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
          <div className="mt-3">
            {draft.rows.length < MAX_AUDIENCES ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const row: Row = { key: newKey(), label: '', source: 'new' }
                  edit((d) => ({ ...d, rows: [...d.rows, row] }))
                }}
              >
                <Plus size={14} aria-hidden />
                {t.audience.add}
              </Button>
            ) : (
              <p className="text-caption text-muted">{t.audience.full}</p>
            )}
          </div>
        </div>
      </div>
    </SettingsCard>
  )
}
