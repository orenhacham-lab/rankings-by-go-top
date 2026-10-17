/**
 * /affiliate — the partner's own screen: their link, what it brought in, what
 * they are owed, and words to post.
 *
 * WHY IT IS NOT BEHIND THE SUBSCRIPTION WALL. A partner is usually not a
 * customer, and a partner whose own trial ran out is still owed money. The route
 * is deliberately absent from proxy.ts's protected list, so the trial/plan
 * redirect never catches it; the sign-in itself is the dashboard layout's job.
 *
 * EVERY NUMBER IS READ WITH THE SERVICE ROLE, filtered by this user's own
 * affiliate id, because no browser role may reach the affiliate tables at all —
 * the migration grants none. lib/affiliate/summary.ts is also the boundary that
 * keeps the live agreement: it returns counts and amounts, and there is no shape
 * in it that could carry a referred customer's identity onto this page.
 *
 * SOMEONE WHO IS NOT A PARTNER gets the one-paragraph pitch and a link to the
 * public page, rather than a 404: this URL is reachable from the app's own
 * "refer and earn" card, and a dead end there would be our own doing.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BadgePercent, FileText, MousePointerClick, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card } from '@/components/ui/Card'
import StatTile from '@/components/ui/StatTile'
import Badge from '@/components/ui/Badge'
import { NoticeBox } from '@/components/ui/Notice'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { PartnerCreatives, PartnerLinkPanel } from '@/components/affiliate/PartnerPanels'
import { loadPartnerSummary, type Money } from '@/lib/affiliate/summary'
import { affiliateLinkUrl } from '@/lib/affiliate/link'
import { AFFILIATE_TERMS } from '@/lib/affiliate/terms'
import { AFFILIATE_DASHBOARD_COPY } from '@/lib/i18n/public/affiliate-dashboard'
import { getServerPublicLocale } from '@/lib/i18n/server-locale'
import { getLocaleConfig, LOCALE_PREFIX, toBilingualLocale } from '@/lib/i18n/locales'
import { formatDate } from '@/lib/i18n/format-date'

export const dynamic = 'force-dynamic'

/** Money is a pair, never a sum: one number across two currencies is a fiction. */
function money(amounts: Money): string {
  const parts: string[] = []
  if (amounts.ILS) parts.push(`₪${amounts.ILS.toLocaleString()}`)
  if (amounts.USD) parts.push(`$${amounts.USD.toLocaleString()}`)
  return parts.length ? parts.join(' · ') : '—'
}

export default async function AffiliateDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const locale = await getServerPublicLocale()
  const c = AFFILIATE_DASHBOARD_COPY[locale]
  const dir = getLocaleConfig(locale).dir

  let summary: Awaited<ReturnType<typeof loadPartnerSummary>> = null
  try {
    summary = await loadPartnerSummary(createAdminClient(), user.id)
  } catch (err) {
    console.error('[affiliate-dashboard] load failed:', err instanceof Error ? err.name : 'unknown')
  }

  if (!summary) {
    return (
      <div dir={dir} className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-title font-bold tracking-tight text-ink">{c.notPartnerTitle}</h1>
        <p className="text-copy text-body">{c.notPartnerBody}</p>
        <Link href={`${LOCALE_PREFIX[locale]}/affiliates`} className="text-copy font-semibold text-action underline">
          {c.notPartnerCta}
        </Link>
      </div>
    )
  }

  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.gotopseo.com').replace(/\/+$/, '')
  const code = summary.affiliate.code
  const links = [
    { label: c.linkToHome, url: affiliateLinkUrl(origin, code) },
    { label: c.linkToSignup, url: affiliateLinkUrl(origin, code, 'signup') },
    { label: c.linkToPricing, url: affiliateLinkUrl(origin, code, 'pricing') },
    { label: c.linkToFreeCheck, url: affiliateLinkUrl(origin, code, 'free-check') },
  ]
  const atTop = summary.affiliate.currentRate >= summary.affiliate.topRate
  // Dates in the bilingual pair the formatter speaks: a Spanish or Portuguese
  // partner reads the Latin-script form, which is the right one for both.
  const dates = formatDate(toBilingualLocale(locale))
  const payoutLabel: Record<string, string> = { draft: c.payoutDraft, paid: c.payoutPaid, cancelled: c.payoutCancelled }

  return (
    <div dir={dir} className="space-y-8">
      <div>
        <h1 className="text-title font-bold tracking-tight text-ink">{c.title}</h1>
        <p className="mt-1.5 text-caption text-muted">{c.subtitle}</p>
      </div>

      {summary.affiliate.status === 'suspended' && (
        <NoticeBox tone="warn" language={locale}>{c.suspendedNotice}</NoticeBox>
      )}

      <Card tone="sunk">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-caption text-muted">{c.rateTitle}</p>
            <p className="mt-1 text-headline font-bold text-ink">{c.rateNow(summary.affiliate.currentRate)}</p>
          </div>
          <Badge variant={atTop ? 'success' : 'neutral'}>
            <BadgePercent aria-hidden className="size-4" />
            {atTop ? c.rateTop(summary.affiliate.topRate) : c.rateNext(summary.affiliate.topRateFrom, summary.affiliate.topRate)}
          </Badge>
        </div>
      </Card>

      <PartnerLinkPanel locale={locale} links={links} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={c.clicks30} value={summary.clicks.last30Days.toLocaleString()} source={`${c.clicksTotal}: ${summary.clicks.total.toLocaleString()}`} icon={<MousePointerClick aria-hidden className="size-4" />} />
        <StatTile label={c.signedUp} value={summary.referrals.total.toLocaleString()} icon={<Users aria-hidden className="size-4" />} />
        <StatTile label={c.paying} value={summary.referrals.paying.toLocaleString()} source={summary.referrals.churned ? `${c.churned}: ${summary.referrals.churned}` : undefined} />
        <StatTile label={c.payable} value={money(summary.payable)} source={c.payableHint(summary.minimums.ILS, summary.minimums.USD)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label={c.pending} value={money(summary.pending)} source={c.pendingHint(AFFILIATE_TERMS.holdDays)} />
        <StatTile label={c.paid} value={money(summary.paid)} />
        <StatTile label={c.reversed} value={money(summary.reversed)} source={c.reversedHint} />
      </div>

      <Card>
        <h2 className="text-copy font-semibold text-ink">{c.payoutsTitle}</h2>
        {summary.payouts.length === 0 ? (
          <p className="mt-2 text-caption text-muted">{c.payoutsEmpty}</p>
        ) : (
          <div className="mt-4">
            <Table>
              <TableHead>
                <TableRow>
                  <Th>{c.payoutDate}</Th>
                  <Th>{c.payoutAmount}</Th>
                  <Th>{c.payoutStatus}</Th>
                  <Th>{c.payoutReference}</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {summary.payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <Td>{dates.date(payout.paidAt ?? payout.createdAt)}</Td>
                    <Td className="tabular-nums">{payout.currency === 'ILS' ? `₪${payout.amount.toLocaleString()}` : `$${payout.amount.toLocaleString()}`}</Td>
                    <Td>{payoutLabel[payout.status] ?? payout.status}</Td>
                    <Td>{payout.reference ?? '—'}</Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <PartnerCreatives locale={locale} link={affiliateLinkUrl(origin, code)} />

      <p className="text-caption text-muted">
        <Link href={`${LOCALE_PREFIX[locale]}/affiliate-terms`} className="inline-flex items-center gap-1.5 underline">
          <FileText aria-hidden className="size-4" />
          {c.termsLink}
        </Link>
      </p>
    </div>
  )
}
