'use client'

import { useId, useState } from 'react'
import { FileText } from 'lucide-react'
import Segmented from '@/components/ui/Segmented'
import { saveProjectSettingsAction } from '@/app/(dashboard)/settings/actions'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { Locale } from '@/lib/i18n/locales'
import {
  COMMERCE_TYPES,
  MAX_DESCRIPTION_CHARS,
  type CommerceType,
  type ProfileValues,
  type ProfileView,
  type SaveResult,
  type SettingsData,
} from '@/lib/project-settings/types'
import { fill, profileSuggestionItems } from '@/lib/project-settings/view'
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
type Draft = { description: string; commerce_type: CommerceType | null }
type Field = keyof Draft

/** The description as the server stores it (lib/project-settings/data.ts), for comparing. */
export const normalizeDescription = (s: string) =>
  s.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()

const toDraft = (p: ProfileView | null): Draft => ({ description: p?.description ?? '', commerce_type: p?.commerce_type ?? null })
const sameField = (field: Field, a: Draft, b: Draft) =>
  field === 'description' ? normalizeDescription(a.description) === normalizeDescription(b.description) : a.commerce_type === b.commerce_type
const sameDraft = (a: Draft, b: Draft) => sameField('description', a, b) && sameField('commerce_type', a, b)

/**
 * Row 2: what the business does and what kind of business it is. Its own
 * save; a saved field becomes the owner's and a later scan never changes it.
 */
export default function ProfileCard({
  projectId,
  profile,
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
  seedFeatures: boolean
  scanBusy: boolean
  neverScanned: boolean
  onRescan: () => void
  onData: (data: SettingsData) => void
  t: Copy
  locale: Locale
}) {
  const ids = useId()
  const saved = toDraft(profile)
  const { draft, dirty, setDraft, discard, commit } = useDraft(saved, sameDraft)
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const [fromAi, setFromAi] = useState<Field[]>([])
  const redetect = useRedetect(projectId, 'profile')
  const sources = profile?.sources ?? {}

  const edit = (update: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...update }))
    if (state.kind !== 'saving') setState({ kind: 'idle' })
  }
  const changed = (field: Field) => !sameField(field, draft, saved)
  const chip = (field: Field) => {
    if (fromAi.includes(field) && changed(field)) return <SourceChip kind="ai" label={t.source.ai} title={t.source.aiTitle} />
    if (seedFeatures && sources[field] === 'scan' && !changed(field)) {
      return <SourceChip kind="scan" label={t.source.scan} title={t.source.scanTitle} />
    }
    return null
  }

  async function save() {
    const patch: Partial<ProfileValues> = {}
    if (changed('description')) patch.description = normalizeDescription(draft.description) || null
    if (changed('commerce_type')) patch.commerce_type = draft.commerce_type
    setState({ kind: 'saving' })
    let res: SaveResult
    try {
      res = await saveProjectSettingsAction(projectId, { profile: patch })
    } catch {
      res = { ok: false, code: 'save_failed' }
    }
    if (!res.ok) {
      setState({ kind: 'error', code: res.code })
      return
    }
    commit(toDraft(res.data.profile.state === 'ok' ? res.data.profile.value : null))
    onData(res.data)
    setFromAi([])
    setState({ kind: 'saved' })
  }

  function detect() {
    if (neverScanned) redetect.preempt({ kind: 'scan_required' })
    else void redetect.run(locale)
  }

  const s = redetect.suggestions
  const rows: SuggestionRow[] = s
    ? profileSuggestionItems({ description: draft.description.trim() || null, commerce_type: draft.commerce_type }, s).map((item) => ({
        key: item.key,
        label: t.ai.fields[item.key],
        value: item.key === 'commerce_type' ? t.profile.commerce[item.suggested as CommerceType].label : (
          <span className="whitespace-pre-line">{String(item.suggested)}</span>
        ),
        current:
          item.current === null
            ? null
            : item.key === 'commerce_type'
              ? t.profile.commerce[item.current as CommerceType].label
              : <span className="line-clamp-2">{String(item.current)}</span>,
      }))
    : []

  function apply(keys: string[]) {
    if (!s) return
    const update: Partial<Draft> = {}
    const fields: Field[] = []
    if (keys.includes('description') && s.description) {
      update.description = s.description
      fields.push('description')
    }
    if (keys.includes('commerce_type') && s.commerce_type) {
      update.commerce_type = s.commerce_type
      fields.push('commerce_type')
    }
    edit(update)
    setFromAi((prev) => [...new Set([...prev, ...fields])])
    redetect.clear()
  }

  const length = draft.description.length
  const aiDirty = fromAi.some(changed)
  return (
    <SettingsCard
      id={SECTION.profile}
      icon={FileText}
      title={t.profile.title}
      description={t.profile.body}
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
      <div className="space-y-5">
        {seedFeatures && redetect.notice && (
          <RedetectNoticeView notice={redetect.notice} t={t} locale={locale} onRescan={onRescan} onDismiss={redetect.clear} />
        )}
        {seedFeatures && s && <SuggestionsPanel key={redetect.answer} rows={rows} onApply={apply} onDismiss={redetect.clear} t={t} />}

        <div>
          <FieldLabel
            htmlFor={`${ids}-description`}
            aside={
              <>
                {chip('description')}
                <span
                  className={cn('text-caption tabular-nums', length > MAX_DESCRIPTION_CHARS * 0.9 ? 'text-warn' : 'text-muted')}
                  aria-hidden
                >
                  {fill(t.profile.count, { n: length, max: MAX_DESCRIPTION_CHARS })}
                </span>
              </>
            }
          >
            {t.profile.descriptionLabel}
          </FieldLabel>
          <textarea
            {...bidiField(draft.description)}
            id={`${ids}-description`}
            value={draft.description}
            onChange={(e) => edit({ description: e.target.value })}
            maxLength={MAX_DESCRIPTION_CHARS}
            rows={4}
            placeholder={t.profile.descriptionPlaceholder}
            className={cn(fieldClass, 'min-h-28 resize-y leading-relaxed')}
          />
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span id={`${ids}-commerce-label`} className="text-copy font-semibold text-ink">{t.profile.commerceLabel}</span>
            {chip('commerce_type')}
          </div>
          {/* The one segmented control (as "is the business local?" in the card below), with the
              chosen type's one-line hint under it, instead of four choice cards. */}
          <Segmented
            ariaLabel={t.profile.commerceLabel}
            fill
            value={draft.commerce_type ?? ''}
            onChange={(v) => edit({ commerce_type: v as CommerceType })}
            options={COMMERCE_TYPES.map((type) => ({
              value: type,
              label: <span data-commerce={type}>{t.profile.commerce[type].label}</span>,
            }))}
          />
          <p className="mt-1.5 min-h-[1.125rem] text-caption text-muted" data-commerce-hint={draft.commerce_type ?? ''}>
            {draft.commerce_type ? t.profile.commerce[draft.commerce_type].hint : ''}
          </p>
        </div>
      </div>
    </SettingsCard>
  )
}
