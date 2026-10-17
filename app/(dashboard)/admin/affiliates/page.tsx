/**
 * /admin/affiliates — the whole partner program on one operator screen.
 *
 * FOUR THINGS IN THE ORDER THEY NEED DOING: applications waiting for a person
 * (nobody has a link until one is read), the partners themselves, the commission
 * queue, and the payouts. An operator who opens this page once a week should be
 * able to work top to bottom and be finished.
 *
 * Read with the service role, like every other admin screen — no browser role
 * reaches the affiliate tables at all. The admin layout proves the role before
 * this renders, and every action posts to /api/admin/affiliates, which proves it
 * again because an API route is not covered by proxy.ts.
 *
 * THIS IS THE ONE SCREEN THAT SEES A REFERRAL'S SIGNALS. A partner is promised
 * counts and amounts and never a referred customer's identity; the operator
 * deciding a commission is the person who has to see "the application's email is
 * the new account's email". So the flags are shown here, as the signals they
 * are, next to the commission they are about.
 */
import Link from 'next/link'
import { AlertTriangle, BadgePercent, FileText, Handshake, Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { NoticeBox } from '@/components/ui/Notice'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import {
  ApplicationDecision,
  CommissionDecision,
  CreatePayoutControl,
  ManualCommissionControl,
  PartnerStatusControl,
  PayoutDecision,
  PayoutDetailsControl,
} from '@/components/admin/AdminAffiliateControls'
import { loadAdminOverview, type Money } from '@/lib/affiliate/summary'
import { REVIEW_FLAGS } from '@/lib/affiliate/attribution'
import { formatDate } from '@/lib/i18n/format-date'

export const dynamic = 'force-dynamic'

const FLAG_LABEL: Record<string, string> = {
  [REVIEW_FLAGS.emailMatch]: 'האימייל בבקשה זהה לאימייל של החשבון שנרשם',
  [REVIEW_FLAGS.domainMatch]: 'החשבון שנרשם הוא על הדומיין של השותף',
}

const STATUS_LABEL: Record<string, string> = {
  approved: 'מאושר',
  suspended: 'מושהה',
  rejected: 'נדחה',
  pending: 'ממתין',
}

const SOURCE_LABEL: Record<string, string> = { paypal: 'פייפאל', shopify: 'שופיפיי', manual: 'ידני' }

function money(amounts: Money): string {
  const parts: string[] = []
  if (amounts.ILS) parts.push(`₪${amounts.ILS.toLocaleString()}`)
  if (amounts.USD) parts.push(`$${amounts.USD.toLocaleString()}`)
  return parts.length ? parts.join(' · ') : '—'
}

export default async function AdminAffiliatesPage() {
  const dates = formatDate('he')
  let overview: Awaited<ReturnType<typeof loadAdminOverview>> | null = null
  try {
    overview = await loadAdminOverview(createAdminClient())
  } catch (err) {
    console.error('[admin-affiliates] load failed:', err instanceof Error ? err.name : 'unknown')
  }

  if (!overview) {
    return (
      <div dir="rtl" className="space-y-6">
        <h1 className="text-title font-bold tracking-tight text-ink">תוכנית השותפים</h1>
        <NoticeBox tone="bad" language="he">לא הצלחנו לטעון את המסך. כדאי לרענן בעוד רגע.</NoticeBox>
      </div>
    )
  }

  const heldCommissions = overview.commissions.filter((commission) => commission.status === 'pending')
  const flaggedCommissions = heldCommissions.filter((commission) => commission.flags.length > 0)

  return (
    <div dir="rtl" className="space-y-10">
      <div>
        <h1 className="text-title font-bold tracking-tight text-ink">תוכנית השותפים</h1>
        <p className="mt-1.5 text-caption text-muted tabular-nums">
          {overview.applications.length} בקשות ממתינות · {overview.partners.filter((partner) => partner.status === 'approved').length} שותפים פעילים · {heldCommissions.length} עמלות ממתינות לאישור
        </p>
      </div>

      {flaggedCommissions.length > 0 && (
        <NoticeBox tone="warn" language="he" items={flaggedCommissions.slice(0, 3).map((commission) => `${commission.affiliateName}: ${commission.flags.map((flag) => FLAG_LABEL[flag] ?? flag).join(', ')}`)}>
          יש עמלות עם סימן שדורש בדיקה לפני אישור.
        </NoticeBox>
      )}

      {/* 1. Applications: nobody has a link until one of these is read. */}
      <section className="space-y-4">
        <h2 className="text-headline font-bold text-ink">בקשות להצטרפות</h2>
        {overview.applications.length === 0 ? (
          <EmptyState icon={<Handshake aria-hidden className="size-5" />} title="אין בקשות ממתינות" body="בקשות חדשות מהעמוד הציבורי יופיעו כאן, והאישור הוא מה שמנפיק לשותף קוד וקישור." />
        ) : (
          overview.applications.map((application) => (
            <Card key={application.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-copy font-semibold text-ink">{application.name}</p>
                  <p className="mt-1 text-caption text-muted" dir="ltr">{application.email}{application.phone ? ` · ${application.phone}` : ''}</p>
                  {application.website && (
                    <p className="mt-1 text-caption" dir="ltr">
                      {/* An applicant's own link, never followed by us for ranking
                          purposes and never trusted: nofollow + noopener. */}
                      <a href={application.website} target="_blank" rel="nofollow noopener noreferrer" className="text-action underline">{application.website}</a>
                    </p>
                  )}
                  {application.country && <p className="mt-1 text-caption text-muted">{application.country}</p>}
                </div>
                <span className="text-caption text-muted tabular-nums">{dates.date(application.appliedAt)}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap rounded-inset border border-line bg-sunk p-3 text-caption text-body">{application.audience}</p>
              <ApplicationDecision affiliateId={application.id} suggestedCode={application.suggestedCode} />
            </Card>
          ))
        )}
      </section>

      {/* 2. The partners themselves. */}
      <section className="space-y-4">
        <h2 className="text-headline font-bold text-ink">שותפים</h2>
        {overview.partners.length === 0 ? (
          <EmptyState icon={<Users aria-hidden className="size-5" />} title="אין עדיין שותפים" body="שותף נוצר מאישור של בקשה." />
        ) : (
          overview.partners.map((partner) => (
            <Card key={partner.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-copy font-semibold text-ink">
                    {partner.name}
                    {partner.code && <code dir="ltr" className="ms-2 rounded-inset bg-sunk px-2 py-0.5 text-caption text-body">/r/{partner.code}</code>}
                  </p>
                  <p className="mt-1 text-caption text-muted" dir="ltr">{partner.email}</p>
                  <p className="mt-1 text-caption text-muted">
                    {partner.baseRate}% · {partner.topRate}% מ-{partner.topRateFrom} לקוחות משלמים
                    {partner.payoutMethod ? ` · ${partner.payoutMethod}` : ' · לא הוגדר אמצעי תשלום'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={partner.status === 'approved' ? 'success' : partner.status === 'suspended' ? 'warning' : 'neutral'}>
                    {STATUS_LABEL[partner.status] ?? partner.status}
                  </Badge>
                  {partner.flaggedReferrals > 0 && (
                    <Badge variant="warning">
                      <AlertTriangle aria-hidden className="size-3.5" />
                      {partner.flaggedReferrals} לבדיקה
                    </Badge>
                  )}
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-caption sm:grid-cols-4">
                <div><dt className="text-muted">קליקים ב-30 יום</dt><dd className="font-semibold text-ink tabular-nums">{partner.clicks30.toLocaleString()}</dd></div>
                <div><dt className="text-muted">הרשמות</dt><dd className="font-semibold text-ink tabular-nums">{partner.referrals.total}</dd></div>
                <div><dt className="text-muted">משלמים</dt><dd className="font-semibold text-ink tabular-nums">{partner.referrals.paying}</dd></div>
                <div><dt className="text-muted">ממתין / מאושר / שולם</dt><dd className="font-semibold text-ink">{money(partner.pending)} / {money(partner.payable)} / {money(partner.paid)}</dd></div>
              </dl>

              <div className="mt-4 flex flex-wrap items-end gap-6">
                <PartnerStatusControl affiliateId={partner.id} status={partner.status} />
                <CreatePayoutControl affiliateId={partner.id} />
              </div>
              <div className="mt-4">
                <PayoutDetailsControl affiliateId={partner.id} method={partner.payoutMethod} />
              </div>

              {partner.shopifyReferrals.length > 0 && (
                <div className="mt-5 space-y-3">
                  {/* Shopify tells us a plan is active, never that a charge was
                      taken, so there is no payment event to earn on. These are
                      commissioned by hand, which is the honest answer rather
                      than a figure we invented. */}
                  <p className="text-caption text-muted">
                    {partner.shopifyReferrals.length} הרשמות שמשלמות דרך שופיפיי. שופיפיי לא שולח לנו הודעה על כל חיוב, ולכן העמלה עליהן נרשמת כאן ידנית.
                  </p>
                  {partner.shopifyReferrals.map((referral) => (
                    <ManualCommissionControl key={referral.id} affiliateId={partner.id} referralId={referral.id} defaultRate={partner.baseRate} />
                  ))}
                </div>
              )}
            </Card>
          ))
        )}
      </section>

      {/* 3. The commission queue. */}
      <section className="space-y-4">
        <h2 className="text-headline font-bold text-ink">עמלות</h2>
        {overview.commissions.length === 0 ? (
          <EmptyState icon={<BadgePercent aria-hidden className="size-5" />} title="אין עמלות" body="עמלה נרשמת אוטומטית על כל תשלום של לקוח שהגיע דרך שותף." />
        ) : (
          <Card padding={false}>
            <Table>
              <TableHead>
                <TableRow>
                  <Th>שותף</Th>
                  <Th>תשלום</Th>
                  <Th>עמלה</Th>
                  <Th>מקור</Th>
                  <Th>נצברה</Th>
                  <Th>משתחררת</Th>
                  <Th>מצב</Th>
                  <Th>פעולה</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {overview.commissions.map((commission) => (
                  <TableRow key={commission.id}>
                    <Td>
                      {commission.affiliateName}
                      {commission.flags.length > 0 && (
                        <span className="mt-1 block text-caption text-warn">{commission.flags.map((flag) => FLAG_LABEL[flag] ?? flag).join(' · ')}</span>
                      )}
                    </Td>
                    <Td className="tabular-nums">{commission.currency === 'ILS' ? `₪${commission.paymentAmount}` : `$${commission.paymentAmount}`}</Td>
                    <Td className="tabular-nums">{commission.currency === 'ILS' ? `₪${commission.amount}` : `$${commission.amount}`} ({commission.rate}%)</Td>
                    <Td>{SOURCE_LABEL[commission.source] ?? commission.source}</Td>
                    <Td className="tabular-nums">{dates.date(commission.earnedAt)}</Td>
                    <Td className="tabular-nums">{dates.date(commission.releasesAt)}</Td>
                    <Td>
                      <Badge variant={commission.status === 'approved' ? 'success' : commission.released ? 'info' : 'neutral'}>
                        {commission.status === 'approved' ? 'מאושרת' : commission.released ? 'משוחררת' : 'בהחזקה'}
                      </Badge>
                    </Td>
                    <Td>{commission.status === 'pending' ? <CommissionDecision commissionId={commission.id} released={commission.released} /> : '—'}</Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      {/* 4. Payouts. Money moves by hand, outside the app. */}
      <section className="space-y-4">
        <h2 className="text-headline font-bold text-ink">תשלומים</h2>
        <p className="text-caption text-muted">הכסף יוצא ידנית בפייפאל, ב-Wise או בהעברה בנקאית, כמו שכתוב בהסכם. הדוח כאן הוא מה שמשלמים לפיו, ומסמנים אותו כשולם עם אסמכתא.</p>
        {overview.payouts.length === 0 ? (
          <EmptyState icon={<FileText aria-hidden className="size-5" />} title="אין דוחות תשלום" body="דוח נבנה מכל העמלות המאושרות שטרם שולמו, במטבע אחד." />
        ) : (
          overview.payouts.map((payout) => (
            <Card key={payout.id}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-copy font-semibold text-ink">
                    {payout.affiliateName} — {payout.currency === 'ILS' ? `₪${payout.amount.toLocaleString()}` : `$${payout.amount.toLocaleString()}`}
                  </p>
                  <p className="mt-1 text-caption text-muted tabular-nums">
                    {dates.date(payout.createdAt)}
                    {payout.paidAt ? ` · שולם ${dates.date(payout.paidAt)}` : ''}
                    {payout.reference ? ` · ${payout.reference}` : ''}
                  </p>
                </div>
                <Badge variant={payout.status === 'paid' ? 'success' : payout.status === 'cancelled' ? 'neutral' : 'info'}>
                  {payout.status === 'paid' ? 'שולם' : payout.status === 'cancelled' ? 'בוטל' : 'בהכנה'}
                </Badge>
              </div>
              <div className="mt-4">
                <PayoutDecision payoutId={payout.id} status={payout.status} />
              </div>
            </Card>
          ))
        )}
      </section>

      <p className="text-caption text-muted">
        <Link href="/affiliates" className="underline">העמוד הציבורי של התוכנית</Link>
        {' · '}
        <Link href="/affiliate-terms" className="underline">ההסכם</Link>
      </p>
    </div>
  )
}
