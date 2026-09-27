'use client'

import { useState, type ReactNode } from 'react'
import { Building2, Check } from 'lucide-react'
import ProjectForm, { type SavedBusinessValues } from '@/components/projects/ProjectForm'
import { markBusinessFieldsAction } from '@/app/(dashboard)/settings/actions'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { Locale } from '@/lib/i18n/locales'
import {
  BUSINESS_FIELDS,
  type BusinessField,
  type BusinessSuggestion,
  type SettingsData,
} from '@/lib/project-settings/types'
import { businessSuggestionItems, languageName, regionName } from '@/lib/project-settings/view'
import type { Client, Project } from '@/lib/supabase/types'
import { RedetectButton, RedetectNoticeView, SuggestionsPanel, type SuggestionRow } from './AiControls'
import SettingsCard from './SettingsCard'
import SourceChip from './SourceChip'
import { SECTION } from './anchors'
import { useRedetect } from './useRedetect'

type Copy = DashboardDictionary['projectSettings']

const value = (v: string | null | undefined) => (v ?? '').trim()

/**
 * Row 1: the business details, the same form as ever (ProjectForm, with its
 * own save). Around it, only what the scan added: where each value came from,
 * "detect again with AI" for the name, country and language, and on save the
 * fields the owner CHANGED become theirs, so a later scan leaves them alone.
 */
export default function BusinessCard({
  project,
  clients,
  data,
  seedFeatures,
  scanBusy,
  neverScanned,
  onRescan,
  onData,
  onSaved,
  t,
  locale,
}: {
  project: Project
  clients: Client[]
  data: SettingsData | null
  seedFeatures: boolean
  scanBusy: boolean
  neverScanned: boolean
  onRescan: () => void
  onData: (data: SettingsData) => void
  onSaved: () => void
  t: Copy
  locale: Locale
}) {
  const redetect = useRedetect(project.id, 'business')
  const [applied, setApplied] = useState<{ values: BusinessSuggestion; fields: BusinessField[] } | null>(null)
  const [formNonce, setFormNonce] = useState(0)
  const [saved, setSaved] = useState(false)

  const profile = data?.profile.state === 'ok' ? data.profile.value : null
  const sources = profile?.sources ?? {}
  const canMark = data?.profile.state === 'ok'

  // The form reads its values once. It starts again when the saved values
  // change (a scan filled an empty field) and when suggestions go into it.
  const formKey = [project.business_name, project.country, project.language, project.city, formNonce].join('|')

  const chip = (field: BusinessField): ReactNode => {
    if (applied?.fields.includes(field)) {
      return <SourceChip kind="ai" label={t.source.ai} title={t.source.aiTitle} />
    }
    if (seedFeatures && sources[field] === 'scan') {
      return <SourceChip kind="scan" label={t.source.scan} title={t.source.scanTitle} />
    }
    return null
  }
  const note = (field: BusinessField) => {
    const c = chip(field)
    return c ? <div className="mt-1.5 flex">{c}</div> : null
  }

  async function markChanged(next: SavedBusinessValues) {
    setSaved(false)
    const changed = BUSINESS_FIELDS.filter((f) => value(next[f]) !== value(project[f]))
    if (changed.length > 0 && canMark) {
      const res = await markBusinessFieldsAction(project.id, changed)
      if (res.ok) onData(res.data)
    }
  }

  function detect() {
    setSaved(false)
    if (neverScanned) redetect.preempt({ kind: 'scan_required' })
    else void redetect.run(locale)
  }

  const s = redetect.suggestions
  const rows: SuggestionRow[] = s
    ? businessSuggestionItems(project, s).map((item) => ({
        key: item.key,
        label: t.ai.fields[item.key],
        value: display(item.key, String(item.suggested), locale),
        current: item.current ? display(item.key, String(item.current), locale) : null,
      }))
    : []

  function apply(keys: string[]) {
    if (!s) return
    const values: BusinessSuggestion = {}
    const fields: BusinessField[] = []
    for (const key of keys) {
      if (key === 'business_name' && s.business_name) values.business_name = s.business_name
      else if (key === 'country' && s.country) values.country = s.country.toUpperCase()
      else if (key === 'language' && s.language) values.language = s.language.toLowerCase()
      else continue
      fields.push(key)
    }
    setApplied(fields.length > 0 ? { values, fields } : null)
    setFormNonce((n) => n + 1)
    redetect.clear()
  }

  return (
    <SettingsCard
      id={SECTION.business}
      icon={Building2}
      title={t.businessTitle}
      description={t.businessBody}
      actions={
        <>
          {saved && (
            <span className="inline-flex items-center gap-1 text-caption font-medium text-ok animate-pop-in">
              <Check size={14} aria-hidden />
              {t.saved}
            </span>
          )}
          {seedFeatures && (
            <RedetectButton working={redetect.working} busyScan={scanBusy} onClick={detect} t={t} />
          )}
        </>
      }
    >
      <div className="space-y-4">
        {seedFeatures && redetect.notice && (
          <RedetectNoticeView notice={redetect.notice} t={t} locale={locale} onRescan={onRescan} onDismiss={redetect.clear} />
        )}
        {seedFeatures && s && (
          <SuggestionsPanel key={redetect.answer} rows={rows} onApply={apply} onDismiss={redetect.clear} t={t} />
        )}
        {applied && <p className="text-caption font-medium text-action">{t.ai.applied}</p>}
        <p className="text-caption text-muted">{t.businessHint}</p>
        <ProjectForm
          key={formKey}
          project={project}
          clients={clients}
          initialValues={applied?.values}
          fieldNotes={{
            business_name: note('business_name'),
            country: note('country'),
            language: note('language'),
            city: note('city'),
          }}
          onUpdated={markChanged}
          onSuccess={() => {
            setApplied(null)
            setSaved(true)
            onSaved()
          }}
          onCancel={() => {
            setApplied(null)
            setFormNonce((n) => n + 1)
          }}
        />
      </div>
    </SettingsCard>
  )
}

/** A business value as the owner reads it: "Israel" for IL, "Hebrew" for he. */
function display(key: 'business_name' | 'country' | 'language', v: string, locale: Locale): string {
  if (key === 'country') return regionName(v, locale)
  if (key === 'language') return languageName(v, locale)
  return v
}
