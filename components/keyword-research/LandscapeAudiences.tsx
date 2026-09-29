'use client'

/**
 * "Who searches for you": the project's audiences (as the owner keeps them, or as the
 * scan found them), each with the keywords of the research that speak to it, and next
 * to them how the research's demand splits by what people are looking for.
 *
 * The matching is lib/content/strategy/insights.ts: a keyword belongs to an audience
 * only when it uses a word no other audience uses, and the screen says so in one line,
 * so an empty audience reads as "nothing names it yet", never as "nobody searches".
 */
import Link from 'next/link'
import { Briefcase, Compass, GraduationCap, HeartHandshake, Home, Store, UserRound, Users, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCount } from '@/components/gsc/format'
import type { AudienceKeywords, IntentShare, SearchIntent } from '@/lib/content/strategy/insights'

/** One token colour per search need (the app's state and brand tokens only). */
export const INTENT_TONE: Record<SearchIntent, { bar: string; dot: string }> = {
  cost: { bar: 'bg-contrast', dot: 'bg-contrast' },
  compare: { bar: 'bg-action/60', dot: 'bg-action/60' },
  selection: { bar: 'bg-action', dot: 'bg-action' },
  local: { bar: 'bg-action/80', dot: 'bg-action/80' },
  howto: { bar: 'bg-action/35', dot: 'bg-action/35' },
  info: { bar: 'bg-line-strong', dot: 'bg-line-strong' },
}

/** One icon per audience card, so the cards read as different people, not one repeated avatar. */
export const AUDIENCE_ICONS: readonly LucideIcon[] = [UserRound, Users, Home, Briefcase, Store, HeartHandshake, GraduationCap]

/** Keywords shown per audience. */
export const AUDIENCE_KEYWORDS_SHOWN = 4

/**
 * The audiences the research speaks to (with their original index, which keeps each
 * one's icon), and the labels of those it does not name yet.
 */
export function splitAudiences(audiences: readonly AudienceKeywords[]): { matched: { a: AudienceKeywords; i: number }[]; missing: string[] } {
  const matched: { a: AudienceKeywords; i: number }[] = []
  const missing: string[] = []
  audiences.forEach((a, i) => { if (a.keywords.length > 0) matched.push({ a, i }); else missing.push(a.label) })
  return { matched, missing }
}

export function IntentBar({ mix, label }: { mix: readonly IntentShare[]; label: string }) {
  const total = mix.reduce((s, m) => s + m.searches, 0)
  return (
    <span role="img" aria-label={label} className="flex h-3 w-full overflow-hidden rounded-pill bg-sunk">
      {total > 0 && mix.map((m) => (
        <span key={m.intent} className={cn('grow-x h-full transition-[width] duration-700 ease-snappy motion-reduce:transition-none', INTENT_TONE[m.intent].bar)} style={{ width: `${(m.searches / total) * 100}%` }} />
      ))}
    </span>
  )
}

export default function LandscapeAudiences({ id, audiences, mix, niche }: {
  id: string
  audiences: readonly AudienceKeywords[]
  mix: readonly IntentShare[]
  niche: string | null
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).researchInsights.audiences
  const n = (v: number) => formatCount(v, language)
  // "What people look for" shows once the research splits by need. A mix of one grey
  // "general information" bar is an empty panel, not data (final review R18).
  const showMix = mix.some((m) => m.intent !== 'info' && m.searches > 0)
  const mixLabel = mix.map((m) => `${t.intents[m.intent]}: ${t.intentLine(n(m.keywords), n(m.searches))}`).join(' · ')
  // A card per audience the research speaks to. An audience no keyword names yet is
  // not a card of its own (three empty cards read as "nobody searches for you"): the
  // ones still missing are named once, in one line under the cards.
  const { matched, missing } = splitAudiences(audiences)

  return (
    <section id={id} data-landscape-audiences="" className="mb-6 scroll-mt-20">
      <Card padding={false}>
        <header className="flex items-start gap-3.5 border-b border-line px-4 py-5 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-inset bg-action-soft text-action" aria-hidden="true">
            <Compass size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section font-semibold text-ink">{t.title}</h2>
            <p className="mt-1 max-w-3xl text-copy text-muted text-pretty">{t.subtitle}</p>
          </div>
          {niche && <span className="hidden shrink-0 rounded-pill border border-line bg-surface px-2.5 py-1 text-caption font-semibold text-body sm:inline-flex">{niche}</span>}
        </header>

        <div className={cn('grid gap-6 p-4 sm:p-6', showMix && 'lg:grid-cols-[minmax(0,1fr)_18rem]')}>
          <div className="min-w-0">
            {audiences.length === 0 ? (
              <p className="text-copy text-muted">{t.empty}</p>
            ) : (
              <>
              {matched.length > 0 && (
              <ol className={cn('grid gap-3', matched.length > 1 && 'md:grid-cols-2')}>
                {matched.map(({ a, i }) => (
                  <li
                    key={a.label}
                    data-audience={i}
                    className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-4 motion-safe:animate-pop-in [animation-fill-mode:backwards]"
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                  >
                    <div className="flex items-start gap-3">
                      {(() => {
                        const Icon = AUDIENCE_ICONS[i % AUDIENCE_ICONS.length]
                        return (
                          <span className="grid size-10 shrink-0 place-items-center rounded-inset bg-action-soft text-action" aria-hidden="true">
                            <Icon className="size-5" strokeWidth={2} />
                          </span>
                        )
                      })()}
                      <div className="min-w-0">
                        <p className="text-copy font-semibold leading-snug text-ink text-pretty [overflow-wrap:anywhere]">{a.label}</p>
                        {a.keywords.length > 0 && <p className="mt-0.5 text-caption text-muted tabular-nums">{t.matched(n(a.keywords.length), n(a.searches))}</p>}
                      </div>
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {a.keywords.slice(0, AUDIENCE_KEYWORDS_SHOWN).map((k) => (
                        <li key={k.keyword} className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-line bg-sunk px-2 py-0.5 text-caption text-body">
                          <span className="truncate">{k.keyword}</span>
                          {k.volume !== null && <span className="shrink-0 font-semibold tabular-nums text-ink">{n(k.volume)}</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
              )}
              {missing.length > 0 && (
                <p data-audiences-missing={missing.length} className={cn('text-copy text-body text-pretty', matched.length > 0 && 'mt-3')}>
                  {matched.length > 0 ? t.missingSome(missing.join(', ')) : t.missingAll(missing.join(', '))}
                </p>
              )}
              </>
            )}
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
              <span>{t.how}</span>
              <Link href="/settings#audiences" className="font-semibold text-action transition-colors hover:text-action-hover">{t.edit}</Link>
            </p>
          </div>

          {showMix && (
            <aside data-intent-mix="" className="min-w-0 rounded-card border border-line bg-sunk/50 p-4">
              <h3 className="text-copy font-semibold text-ink">{t.intentTitle}</h3>
              <p className="mt-0.5 text-caption text-muted">{t.intentSubtitle}</p>
              <div className="mt-3"><IntentBar mix={mix} label={mixLabel} /></div>
              <ul className="mt-3 space-y-2" aria-hidden="true">
                {mix.map((m) => (
                  <li key={m.intent} className="flex items-center justify-between gap-2 text-caption">
                    <span className="inline-flex min-w-0 items-center gap-2 text-body"><span className={cn('size-2.5 shrink-0 rounded-pill', INTENT_TONE[m.intent].dot)} />{t.intents[m.intent]}</span>
                    <span className="shrink-0 text-muted tabular-nums">{t.intentLine(n(m.keywords), n(m.searches))}</span>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </Card>
    </section>
  )
}
