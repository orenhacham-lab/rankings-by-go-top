'use client'

import { useId, useState } from 'react'
import { BadgeCheck, Check, ChevronDown, Plus, Search } from 'lucide-react'
import Button from '@/components/ui/Button'
import Notice from '@/components/ui/Notice'
import { saveOfficialProfilesAction } from '@/app/(dashboard)/settings/article-style-actions'
import type { ArticleStyleView } from '@/lib/content/article-style/data'
import {
  PROFILE_NETWORKS,
  PROFILE_URL_MAX,
  normalizeProfileUrl,
  type OfficialProfiles,
  type ProfileNetwork,
} from '@/lib/content/article-style/profiles'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { fill } from '@/lib/project-settings/view'
import { cn } from '@/lib/utils'
import SaveBar, { showSaveBar, type SaveState } from './SaveBar'
import SettingsCard, { fieldClass } from './SettingsCard'
import ProfileGlyph from './ProfileGlyph'
import { SECTION } from './anchors'
import { useDraft } from './useDraft'
import type { SiteSignals } from './useArticleSettings'

type Copy = DashboardDictionary['projectSettings']
type Draft = Record<ProfileNetwork, string>

const toDraft = (p: OfficialProfiles): Draft =>
  Object.fromEntries(PROFILE_NETWORKS.map((n) => [n, p[n] ?? ''])) as Draft
const sameDraft = (a: Draft, b: Draft) => PROFILE_NETWORKS.every((n) => a[n].trim() === b[n].trim())

/**
 * The business's official profiles, written into every article's structured
 * data as the publisher's sameAs. Each field is checked for its own network
 * as it is typed (https, the network's host, a profile path), the home page's
 * own profile links are offered to put in, and the save is the card's own.
 */
export default function OfficialProfilesCard({
  view,
  signals,
  onReadSite,
  onData,
  t,
  projectId,
}: {
  view: ArticleStyleView
  signals: SiteSignals
  onReadSite: () => void
  onData: (data: ArticleStyleView) => void
  t: Copy
  projectId: string
}) {
  const p = t.officialProfiles
  const ids = useId()
  const saved = toDraft(view.profiles)
  const { draft, dirty, setDraft, discard, commit } = useDraft<Draft>(saved, sameDraft)
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const [serverInvalid, setServerInvalid] = useState<ProfileNetwork[]>([])
  const [whyOpen, setWhyOpen] = useState(false)
  const locked = !view.editable

  const edit = (n: ProfileNetwork, value: string) => {
    setDraft((d) => ({ ...d, [n]: value }))
    setServerInvalid((list) => list.filter((x) => x !== n))
    if (state.kind !== 'saving') setState({ kind: 'idle' })
  }
  const invalid = (n: ProfileNetwork) =>
    serverInvalid.includes(n) || (!!draft[n].trim() && !normalizeProfileUrl(n, draft[n]))
  const anyInvalid = PROFILE_NETWORKS.some(invalid)

  const found: OfficialProfiles = signals.status === 'ready' ? signals.profiles : {}
  const offers = PROFILE_NETWORKS.filter((n) => found[n])
  const isIn = (n: ProfileNetwork) => normalizeProfileUrl(n, draft[n]) === found[n]
  const takeFound = (list: ProfileNetwork[]) => {
    setDraft((d) => ({ ...d, ...Object.fromEntries(list.map((n) => [n, found[n] ?? d[n]])) }))
    if (state.kind !== 'saving') setState({ kind: 'idle' })
  }

  async function save() {
    if (anyInvalid) return
    const input = Object.fromEntries(PROFILE_NETWORKS.map((n) => [n, draft[n].trim()]))
    setState({ kind: 'saving' })
    const res = await saveOfficialProfilesAction(projectId, input).catch(() => null)
    if (!res || !res.ok) {
      if (res && res.code === 'invalid_profiles') {
        setServerInvalid(res.invalid)
        setState({ kind: 'idle' })
        return
      }
      setState({ kind: 'error', code: res ? res.code : 'save_failed' })
      return
    }
    commit(toDraft(res.data.profiles))
    onData(res.data)
    setState({ kind: 'saved' })
  }

  // Filled in, not "connected": a typed address is not a connection to the network.
  const filled = PROFILE_NETWORKS.filter((n) => !!view.profiles[n]).length

  return (
    <SettingsCard
      id={SECTION.officialProfiles}
      icon={BadgeCheck}
      title={p.title}
      description={p.body}
      actions={view.domain && !locked ? (
        <Button type="button" variant="secondary" size="sm" onClick={onReadSite} loading={signals.status === 'reading'}>
          <Search aria-hidden className="size-4" /> {signals.status === 'reading' ? p.detecting : p.detect}
        </Button>
      ) : undefined}
      footer={!locked && showSaveBar(dirty, state) ? (
        <SaveBar
          dirty={dirty}
          state={state}
          note={anyInvalid ? p.errors.invalid_profiles : null}
          onSave={() => void save()}
          onDiscard={() => { discard(); setServerInvalid([]); setState({ kind: 'idle' }) }}
          t={t}
        />
      ) : undefined}
    >
      <div className="space-y-5">
        {locked && <Notice tone="info">{p.readOnly}</Notice>}

        <div className="rounded-inset border border-line bg-sunk/50">
          <button
            type="button"
            aria-expanded={whyOpen}
            aria-controls={`${ids}-why`}
            onClick={() => setWhyOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start text-copy font-semibold text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 rounded-inset"
          >
            {p.whyTitle}
            <ChevronDown aria-hidden className={cn('size-4 text-muted transition-transform duration-150 ease-snappy', whyOpen && 'rotate-180')} />
          </button>
          {whyOpen && <p id={`${ids}-why`} className="max-w-prose px-4 pb-4 text-copy text-body animate-pop-in">{p.why}</p>}
        </div>

        {offers.length > 0 && !locked && (
          <section aria-labelledby={`${ids}-found`} className="rounded-inset border border-line p-4" data-found-profiles={offers.length}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 id={`${ids}-found`} className="text-copy font-semibold text-ink">{p.found}</h3>
                <p className="text-caption text-muted">{p.foundHint}</p>
              </div>
              {offers.some((n) => !isIn(n)) && (
                <Button type="button" variant="secondary" size="sm" onClick={() => takeFound(offers.filter((n) => !isIn(n)))}>
                  <Plus aria-hidden className="size-4" /> {p.useAll}
                </Button>
              )}
            </div>
            <ul className="mt-3 divide-y divide-line">
              {offers.map((n) => (
                <li key={n} className="flex items-center gap-3 py-2.5">
                  <ProfileGlyph network={n} />
                  <div className="min-w-0 flex-1">
                    <p className="text-caption font-semibold text-ink">{p.networks[n].label}</p>
                    <p dir="ltr" className="truncate text-start text-caption text-muted" title={found[n]}>{found[n]}</p>
                  </div>
                  {isIn(n) ? (
                    <span className="inline-flex items-center gap-1 text-caption font-semibold text-ok"><Check aria-hidden className="size-4" /> {p.inForm}</span>
                  ) : (
                    <Button type="button" variant="ghost" size="sm" onClick={() => takeFound([n])}>{p.use}</Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {signals.status === 'ready' && offers.length === 0 && !locked && <p className="text-caption text-muted">{p.detectNone}</p>}
        {signals.status === 'failed' && !locked && <p className="text-caption text-muted">{p.detectFailed}</p>}

        <fieldset disabled={locked} className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <legend className="sr-only">{p.title}</legend>
          {PROFILE_NETWORKS.map((n) => {
            const bad = invalid(n)
            const fieldId = `${ids}-${n}`
            return (
              <div key={n} className="min-w-0" data-profile-field={n}>
                <label htmlFor={fieldId} className="mb-1.5 flex items-center gap-2 text-copy font-semibold text-ink">
                  <ProfileGlyph network={n} />
                  {p.networks[n].label}
                </label>
                <input
                  id={fieldId}
                  type="url"
                  inputMode="url"
                  dir="ltr"
                  value={draft[n]}
                  onChange={(e) => edit(n, e.target.value)}
                  placeholder={p.networks[n].example}
                  maxLength={PROFILE_URL_MAX}
                  aria-invalid={bad}
                  aria-describedby={bad ? `${fieldId}-error` : undefined}
                  className={cn(fieldClass, 'h-10 text-left! [direction:ltr]!', bad && 'border-bad focus:border-bad focus:ring-bad/20')}
                />
                {bad && (
                  <p id={`${fieldId}-error`} className="mt-1 text-caption text-bad">
                    {fill(p.invalid, { network: p.networks[n].label })}
                    <span dir="ltr" className="mt-0.5 block break-all text-start">{p.networks[n].example}</span>
                  </p>
                )}
              </div>
            )
          })}
        </fieldset>
        <p className="text-caption text-muted tabular-nums">{fill(p.count, { n: filled, max: PROFILE_NETWORKS.length })}</p>
      </div>
    </SettingsCard>
  )
}
