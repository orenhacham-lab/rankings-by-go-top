'use client'

/**
 * How the link network works, and the rules that protect the site (UX A1-6).
 * Open while the site is not in the network (it is what the owner decides on);
 * once it is in, folded into one line the owner can open ("how it works and the
 * rules that protect you"), so the screen leads with what happened, not the manual.
 */
import { Check, ChevronDown, ShieldCheck } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

function Cards({ copy }: { copy: ReturnType<typeof getDashboardDictionary>['siteLinks']['network'] }) {
  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
      <section aria-labelledby="link-network-how" className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <h2 id="link-network-how" className="text-section font-semibold text-ink">{copy.how.title}</h2>
        <ol className="mt-4 space-y-4">
          {copy.how.steps.map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-pill bg-action-soft text-caption font-bold text-action tabular-nums">{i + 1}</span>
              <span className="text-copy text-body text-pretty">{step}</span>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="link-network-rules" className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <h2 id="link-network-rules" className="flex items-center gap-2 text-section font-semibold text-ink">
          <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" className="text-ok" />
          {copy.rules.title}
        </h2>
        <ul className="mt-4 space-y-2.5">
          {copy.rules.items.map((rule) => (
            <li key={rule} className="flex items-start gap-2.5 text-copy text-body">
              <Check size={16} strokeWidth={2.2} aria-hidden="true" className="mt-1 shrink-0 text-ok" />
              <span className="text-pretty">{rule}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default function NetworkHow({ member }: { member: boolean }) {
  const { uiLocale } = useDashboardLanguage()
  const copy = getDashboardDictionary(uiLocale).siteLinks.network
  if (!member) return <div data-link-network="how" data-folded="no"><Cards copy={copy} /></div>
  return (
    <details className="group" data-link-network="how" data-folded="yes">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-card border border-line bg-surface px-5 py-4 text-copy font-semibold text-ink shadow-card transition-colors duration-150 hover:border-line-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" className="text-ok" />
          {copy.how.toggle}
        </span>
        <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-muted motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180" />
      </summary>
      <div className="mt-4 motion-safe:animate-pop-in"><Cards copy={copy} /></div>
    </details>
  )
}
