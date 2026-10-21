/**
 * The comparison table on a "Go Top SEO vs X" page.
 *
 * WHY EVERY ROW CARRIES A DATE AND A LINK. A statement about a named company's
 * product is a statement about something we do not control and cannot freeze:
 * Semrush repackaged its plan names, Surfer repackaged its tiers and Rank Math
 * moved Content AI from credits to monthly limits, all within the month these
 * pages were written. An undated claim about a competitor becomes a false claim
 * about a competitor the day they change the page, with nothing in the markup
 * to tell a reader — or us — that it ever was true. A dated claim with its
 * source beside it stays an honest, correctable record of what their own page
 * said on the day we read it. So `checkedOn` and `source` are required, not
 * optional, and the footnote under the table says so in the reader's language.
 *
 * The right-hand column quotes or restates what the competitor's OWN page says.
 * Where their page simply does not mention something, the copy says that it is
 * not described there — never that they cannot do it. We cannot prove an
 * absence from a marketing page, and a flat denial about a named company is the
 * one kind of error here that is worth more than the page.
 */
import { ExternalLink } from 'lucide-react'
import type { PublicLocale } from '@/lib/i18n/locales'
import { COMPARE_COMMON } from '@/lib/i18n/public/compare-common'

export type ComparisonRow = {
  /** What the row is about, in the reader's words ("Writes the articles"). */
  label: string
  /** What Go Top SEO does. Ours, so no source is needed. */
  ours: string
  /** What their own page says, or that it does not say it. */
  theirs: string
}

export type ComparisonTableProps = {
  locale: PublicLocale
  /** The competitor's name, exactly as they write it. */
  competitor: string
  rows: ComparisonRow[]
  /** ISO date the competitor's pages were read. */
  checkedOn: string
  /** The vendor-owned pages the right-hand column comes from. */
  sources: { label: string; href: string }[]
}

export function ComparisonTable({ locale, competitor, rows, checkedOn, sources }: ComparisonTableProps) {
  const c = COMPARE_COMMON[locale]
  return (
    <div className="mx-auto max-w-4xl">
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full border-collapse text-start text-copy">
          <caption className="sr-only">{c.tableCaption(competitor)}</caption>
          <thead>
            <tr className="border-b border-line bg-sunk/40">
              <th scope="col" className="px-4 py-3 text-start text-caption font-semibold uppercase tracking-wide text-muted sm:px-5">
                {c.column}
              </th>
              <th scope="col" className="px-4 py-3 text-start text-caption font-semibold uppercase tracking-wide text-action sm:px-5">
                {c.ours}
              </th>
              <th scope="col" className="px-4 py-3 text-start text-caption font-semibold uppercase tracking-wide text-muted sm:px-5">
                {competitor}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-b-0 align-top">
                <th scope="row" className="px-4 py-4 text-start font-semibold text-ink sm:px-5">{row.label}</th>
                <td className="px-4 py-4 text-body sm:px-5">{row.ours}</td>
                <td className="px-4 py-4 text-body sm:px-5">{row.theirs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-caption text-muted">{c.checkedOn(competitor, checkedOn)}</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {sources.map((s) => (
          <li key={s.href}>
            <a
              href={s.href}
              rel="nofollow noopener noreferrer"
              target="_blank"
              className="inline-flex items-center gap-1 text-caption text-action underline underline-offset-2 hover:text-action-hover"
            >
              {s.label}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
