'use client'

/**
 * The placement log of both sides: every network link this project received
 * (where it appeared, on which words, to which page, when) and every link it
 * gave. A link it gave that is still in an unpublished draft can be taken out
 * here ("הסרה"), after a confirmation; the words stay, the link goes.
 *
 * A received link shows the giving site's address and, once that article is
 * live, the published page and the sentence around the link. Nothing of another
 * customer's draft is shown.
 */
import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, FileText, Inbox, Send } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import SectionHeading from '@/components/ui/SectionHeading'
import Segmented from '@/components/ui/Segmented'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { ToastHost, useToasts } from '@/components/ui/Toast'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { GivenItem, PlacementState, ReceivedItem } from '@/lib/link-network/http'
import ExternalLink from '../ExternalLink'
import LinkButton from '../LinkButton'
import { formatDay, networkUrl, type AvailableNetwork } from './shared'

type Side = 'received' | 'given'

const STATE_BADGE: Record<PlacementState, 'success' | 'info' | 'neutral' | 'warning'> = {
  published: 'success',
  waiting: 'info',
  rejected: 'neutral',
  removed: 'neutral',
}

/** The sentence, with the anchor's words marked. */
function Context({ text, anchor }: { text: string; anchor: string }) {
  const at = text.toLowerCase().indexOf(anchor.toLowerCase())
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-action-soft px-0.5 font-medium text-ink">{text.slice(at, at + anchor.length)}</mark>
      {text.slice(at + anchor.length)}
    </>
  )
}

export default function PlacementLog({ projectId, data, onChanged }: { projectId: string; data: AvailableNetwork; onChanged: () => void }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language).siteLinks
  const copy = dict.network.log
  const newTab = dict.opportunities.opensNewTab
  const { confirm, dialog } = useConfirm()
  const { toasts, dismiss, success, error } = useToasts()
  const [side, setSide] = useState<Side>(data.received.length === 0 && data.given.length > 0 ? 'given' : 'received')
  const [removing, setRemoving] = useState<string | null>(null)
  const [removedHere, setRemovedHere] = useState<Set<string>>(new Set())

  const given = useMemo(() => data.given.map((g) => (removedHere.has(g.id) ? { ...g, state: 'rejected' as const, canReject: false, context: null } : g)), [data.given, removedHere])

  async function remove(item: GivenItem) {
    const yes = await confirm({ title: copy.removeConfirm.title, body: copy.removeConfirm.body, confirmLabel: copy.removeConfirm.confirm, tone: 'danger' })
    if (!yes) return
    setRemoving(item.id)
    let status = 0
    try {
      const res = await fetch(networkUrl(projectId, `/placements/${encodeURIComponent(item.id)}/reject`), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      })
      status = res.status
    } catch { /* network error: status 0 */ }
    setRemoving(null)
    if (status === 200) {
      setRemovedHere((s) => new Set(s).add(item.id))
      success(copy.removed)
      onChanged()
    } else {
      error(status === 409 ? copy.removePublished : copy.removeError)
    }
  }

  const list = side === 'received' ? data.received : given
  const empty = side === 'received' ? copy.emptyReceived : copy.emptyGiven

  return (
    <section aria-label={copy.title} data-link-network="log">
      <SectionHeading
        title={copy.title}
        description={copy.description}
        action={
          <Segmented<Side>
            ariaLabel={copy.segmentLabel}
            value={side}
            onChange={setSide}
            options={[
              { value: 'received', label: copy.received, icon: ArrowDownLeft, count: data.received.length },
              { value: 'given', label: copy.given, icon: ArrowUpRight, count: data.given.length },
            ]}
          />
        }
      />
      {list.length === 0 ? (
        <div className="rounded-card border border-line bg-surface shadow-card" data-link-network-empty={side}>
          <EmptyState
            icon={side === 'received' ? <Inbox /> : <Send />}
            title={empty.title}
            body={data.membership.active ? empty.body : copy.notJoined}
          />
        </div>
      ) : (
        <ul className="list-enter divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card" data-link-network-list={side}>
          {side === 'received'
            ? data.received.map((item) => <ReceivedRow key={item.id} item={item} copy={copy} language={language} newTab={newTab} />)
            : given.map((item) => (
              <GivenRow key={item.id} item={item} copy={copy} language={language} newTab={newTab}
                busy={removing === item.id} onRemove={() => void remove(item)} />
            ))}
        </ul>
      )}
      {dialog}
      <ToastHost toasts={toasts} dismiss={dismiss} dir={language === 'he' ? 'rtl' : 'ltr'} />
    </section>
  )
}

type LogCopy = ReturnType<typeof getDashboardDictionary>['siteLinks']['network']['log']

function Meta({ item, copy, language, newTab }: { item: GivenItem | ReceivedItem; copy: LogCopy; language: string; newTab: string }) {
  return (
    <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted">
      <div className="flex min-w-0 items-center gap-1">
        <dt>{copy.anchor}</dt>
        <dd className="font-medium text-body">&ldquo;{item.anchor}&rdquo;</dd>
      </div>
      <div className="flex min-w-0 max-w-full items-center gap-1">
        <dt className="shrink-0">{copy.toPage}</dt>
        <dd className="min-w-0 max-w-64"><ExternalLink href={item.targetUrl} newTabLabel={newTab} className="text-caption">{item.targetUrl.replace(/^https?:\/\/(www\.)?/, '')}</ExternalLink></dd>
      </div>
      <div><dd>{copy.placedOn(formatDay(item.placedAt, language))}</dd></div>
    </dl>
  )
}

function ReceivedRow({ item, copy, language, newTab }: { item: ReceivedItem; copy: LogCopy; language: string; newTab: string }) {
  return (
    <li className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-4" data-placement-state={item.state}>
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-inset bg-action-soft text-action">
        <ArrowDownLeft size={18} strokeWidth={1.75} className="rtl:-scale-x-100" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-copy font-semibold text-ink">{copy.fromSite(item.sourceDomain)}</p>
          <Badge variant={STATE_BADGE[item.state]}>{copy.states[item.state]}</Badge>
        </div>
        {item.context && <p className="mt-1.5 max-w-prose text-copy text-body text-pretty"><Context text={item.context} anchor={item.anchor} /></p>}
        <Meta item={item} copy={copy} language={language} newTab={newTab} />
      </div>
      {item.liveUrl && (
        <div className="shrink-0 sm:pt-1">
          <ExternalLink href={item.liveUrl} newTabLabel={newTab} className="text-caption font-semibold">{copy.openLive}</ExternalLink>
        </div>
      )}
    </li>
  )
}

function GivenRow({ item, copy, language, newTab, busy, onRemove }: {
  item: GivenItem; copy: LogCopy; language: string; newTab: string; busy: boolean; onRemove: () => void
}) {
  return (
    <li className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-4" data-placement-state={item.state}>
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-inset bg-sunk text-muted">
        <FileText size={18} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 truncate text-copy font-semibold text-ink" title={item.articleTitle ?? undefined}>
            {item.articleTitle ? copy.inArticle(item.articleTitle) : copy.articleGone}
          </p>
          <Badge variant={STATE_BADGE[item.state]}>{copy.states[item.state]}</Badge>
        </div>
        {item.context && <p className="mt-1.5 max-w-prose text-copy text-body text-pretty"><Context text={item.context} anchor={item.anchor} /></p>}
        <Meta item={item} copy={copy} language={language} newTab={newTab} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
        {item.liveUrl && <ExternalLink href={item.liveUrl} newTabLabel={newTab} className="text-caption font-semibold">{copy.openLive}</ExternalLink>}
        {item.articleId && !item.liveUrl && (
          <LinkButton href={`/content/articles/${encodeURIComponent(item.articleId)}`} variant="secondary" size="sm">{copy.openArticle}</LinkButton>
        )}
        {item.canReject && (
          <Button variant="ghost" size="sm" onClick={onRemove} loading={busy} data-link-network-remove={item.id}
            className="text-bad hover:bg-bad-soft">
            {copy.remove}
          </Button>
        )}
      </div>
    </li>
  )
}
