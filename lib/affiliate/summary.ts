/**
 * What the two dashboards read: the partner's own, and the operator's.
 *
 * EVERYTHING HERE RUNS ON THE SERVER with the service-role client, filtered by
 * one affiliate id, because no browser role may reach these tables at all (the
 * migration grants none, and its header says why). So this module is also the
 * boundary that keeps the live agreement: `loadPartnerSummary` returns counts
 * and amounts, and there is deliberately no shape in it that could carry a
 * referred customer's email, site, plan or identity — not even for the partner's
 * own referrals. If a future screen wants "which customer", it has to change
 * this file, and that is the point.
 *
 * MONEY IS NEVER SUMMED ACROSS CURRENCIES. A partner may be paid in shekels by
 * Israeli customers and in dollars by everyone else; one number would be a
 * fiction. Every balance is a pair.
 */
import { AFFILIATE_TERMS } from './terms'
import { effectiveRate } from './rates'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export type Currency = 'ILS' | 'USD'
export type Money = Record<Currency, number>

export const ZERO_MONEY: Money = { ILS: 0, USD: 0 }

function addMoney(into: Money, currency: string, amount: unknown): void {
  const key = currency === 'USD' ? 'USD' : currency === 'ILS' ? 'ILS' : null
  if (!key) return
  const value = typeof amount === 'number' ? amount : Number.parseFloat(String(amount ?? ''))
  if (Number.isFinite(value)) into[key] = Math.round((into[key] + value) * 100) / 100
}

export interface PartnerSummary {
  affiliate: {
    id: string
    code: string
    status: 'approved' | 'suspended'
    name: string
    baseRate: number
    topRate: number
    topRateFrom: number
    /** The rate the next payment will earn, at today's count of paying referrals. */
    currentRate: number
    payoutMethod: string | null
  }
  clicks: { last30Days: number; total: number; byDay: { day: string; clicks: number }[] }
  referrals: { signedUp: number; paying: number; churned: number; total: number }
  /** Earned and still inside the hold. */
  pending: Money
  /** Out of the hold and approved: this is what a payout is made of. */
  payable: Money
  paid: Money
  reversed: Money
  minimums: { ILS: number; USD: number }
  payouts: { id: string; amount: number; currency: Currency; status: string; paidAt: string | null; createdAt: string; reference: string | null }[]
}

/** The partner behind a signed-in account, or null when they are not one. */
export async function loadPartnerSummary(admin: Admin, userId: string, now = new Date()): Promise<PartnerSummary | null> {
  const partner = await admin
    .from('affiliates')
    .select('id, code, status, name, base_rate, top_rate, top_rate_from, payout_method')
    .eq('user_id', userId)
    .in('status', ['approved', 'suspended'])
    .maybeSingle()
  if (partner.error || !partner.data?.code) return null
  const affiliateId = partner.data.id as string

  const [clicks, referrals, commissions, payouts] = await Promise.all([
    admin.from('affiliate_click_days').select('day, clicks').eq('affiliate_id', affiliateId).order('day', { ascending: false }).limit(90),
    admin.from('affiliate_referrals').select('status').eq('affiliate_id', affiliateId),
    admin.from('affiliate_commissions').select('amount, currency, status, releases_at').eq('affiliate_id', affiliateId),
    admin.from('affiliate_payouts').select('id, amount, currency, status, paid_at, created_at, reference').eq('affiliate_id', affiliateId).order('created_at', { ascending: false }).limit(24),
  ])

  const clickRows = (clicks.data ?? []) as { day: string; clicks: number }[]
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const referralRows = (referrals.data ?? []) as { status: string }[]
  const counts = { signedUp: 0, paying: 0, churned: 0, total: referralRows.length }
  for (const row of referralRows) {
    if (row.status === 'paying') counts.paying += 1
    else if (row.status === 'churned') counts.churned += 1
    else if (row.status === 'signed_up') counts.signedUp += 1
  }

  const pending: Money = { ...ZERO_MONEY }
  const payable: Money = { ...ZERO_MONEY }
  const paid: Money = { ...ZERO_MONEY }
  const reversed: Money = { ...ZERO_MONEY }
  for (const row of ((commissions.data ?? []) as { amount: unknown; currency: string; status: string; releases_at: string }[])) {
    if (row.status === 'reversed') addMoney(reversed, row.currency, row.amount)
    else if (row.status === 'paid') addMoney(paid, row.currency, row.amount)
    else if (row.status === 'approved') addMoney(payable, row.currency, row.amount)
    // `pending` is what is still inside the hold OR not yet approved: from the
    // partner's side both are "earned, not yours yet", and saying otherwise
    // would promise money an operator has not released.
    else addMoney(pending, row.currency, row.amount)
  }

  return {
    affiliate: {
      id: affiliateId,
      code: partner.data.code as string,
      status: partner.data.status as 'approved' | 'suspended',
      name: partner.data.name as string,
      baseRate: Number(partner.data.base_rate),
      topRate: Number(partner.data.top_rate),
      topRateFrom: Number(partner.data.top_rate_from),
      currentRate: effectiveRate(
        { baseRate: Number(partner.data.base_rate), topRate: Number(partner.data.top_rate), topRateFrom: Number(partner.data.top_rate_from) },
        counts.paying,
      ),
      payoutMethod: (partner.data.payout_method as string | null) ?? null,
    },
    clicks: {
      last30Days: clickRows.filter((row) => row.day >= cutoff).reduce((sum, row) => sum + (row.clicks ?? 0), 0),
      total: clickRows.reduce((sum, row) => sum + (row.clicks ?? 0), 0),
      byDay: clickRows.slice(0, 30),
    },
    referrals: counts,
    pending,
    payable,
    paid,
    reversed,
    minimums: { ILS: AFFILIATE_TERMS.minPayoutIls, USD: AFFILIATE_TERMS.minPayoutUsd },
    payouts: ((payouts.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      amount: Number(row.amount),
      currency: (row.currency === 'USD' ? 'USD' : 'ILS') as Currency,
      status: row.status as string,
      paidAt: (row.paid_at as string | null) ?? null,
      createdAt: row.created_at as string,
      reference: (row.reference as string | null) ?? null,
    })),
  }
}

export interface AdminApplication {
  id: string
  name: string
  email: string
  phone: string | null
  website: string | null
  country: string | null
  audience: string
  appliedAt: string
  suggestedCode: string
}

export interface AdminPartner {
  id: string
  code: string | null
  name: string
  email: string
  status: string
  payoutMethod: string | null
  baseRate: number
  topRate: number
  topRateFrom: number
  referrals: { signedUp: number; paying: number; churned: number; total: number }
  flaggedReferrals: number
  /** Referrals paying through Shopify: no per-charge event, so commissioned by hand. */
  shopifyReferrals: { id: string; createdAt: string; flags: string[] }[]
  clicks30: number
  pending: Money
  payable: Money
  paid: Money
}

export interface AdminCommission {
  id: string
  affiliateId: string
  affiliateName: string
  affiliateCode: string | null
  amount: number
  currency: Currency
  rate: number
  paymentAmount: number
  source: string
  status: string
  earnedAt: string
  releasesAt: string
  /** True once the hold has passed: only then may it be approved for payout. */
  released: boolean
  flags: string[]
}

export interface AdminOverview {
  applications: AdminApplication[]
  partners: AdminPartner[]
  /** Pending commissions, newest first — the queue an operator works through. */
  commissions: AdminCommission[]
  payouts: { id: string; affiliateId: string; affiliateName: string; amount: number; currency: Currency; status: string; createdAt: string; paidAt: string | null; reference: string | null }[]
}

/**
 * The operator's whole screen in one read.
 *
 * Deliberately a handful of unfiltered reads joined in memory rather than a view
 * or an RPC: the program has one operator and tens of partners, so the simple
 * shape is the right one, and every number on the screen can be traced to a row.
 */
export async function loadAdminOverview(admin: Admin, now = new Date()): Promise<AdminOverview> {
  const { suggestCode } = await import('./application')
  const [applications, partners, referrals, commissions, clicks, payouts] = await Promise.all([
    admin.from('affiliates').select('id, name, email, phone, website, country, audience, applied_at').eq('status', 'pending').order('applied_at', { ascending: true }),
    admin.from('affiliates').select('id, code, name, email, status, payout_method, base_rate, top_rate, top_rate_from').in('status', ['approved', 'suspended', 'rejected']).order('name', { ascending: true }),
    admin.from('affiliate_referrals').select('id, affiliate_id, status, review_flags, billing_source, created_at'),
    admin.from('affiliate_commissions').select('id, affiliate_id, referral_id, amount, currency, rate, payment_amount, source, status, earned_at, releases_at').order('earned_at', { ascending: false }).limit(500),
    admin.from('affiliate_click_days').select('affiliate_id, day, clicks').gte('day', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
    admin.from('affiliate_payouts').select('id, affiliate_id, amount, currency, status, created_at, paid_at, reference').order('created_at', { ascending: false }).limit(100),
  ])

  const referralRows = (referrals.data ?? []) as { id: string; affiliate_id: string; status: string; review_flags: string[] | null; billing_source: string | null; created_at: string }[]
  const commissionRows = (commissions.data ?? []) as Record<string, unknown>[]
  const clickRows = (clicks.data ?? []) as { affiliate_id: string; clicks: number }[]

  const partnerRows = (partners.data ?? []) as Record<string, unknown>[]
  const nameOf = new Map<string, string>()
  const codeOf = new Map<string, string | null>()
  for (const row of partnerRows) {
    nameOf.set(row.id as string, row.name as string)
    codeOf.set(row.id as string, (row.code as string | null) ?? null)
  }
  const flagsByReferral = new Map(referralRows.map((row) => [row.id, row.review_flags ?? []]))

  const builtPartners: AdminPartner[] = partnerRows.map((row) => {
    const id = row.id as string
    const mine = referralRows.filter((referral) => referral.affiliate_id === id)
    const counts = {
      signedUp: mine.filter((r) => r.status === 'signed_up').length,
      paying: mine.filter((r) => r.status === 'paying').length,
      churned: mine.filter((r) => r.status === 'churned').length,
      total: mine.length,
    }
    const pending: Money = { ...ZERO_MONEY }
    const payable: Money = { ...ZERO_MONEY }
    const paid: Money = { ...ZERO_MONEY }
    for (const commission of commissionRows.filter((c) => c.affiliate_id === id)) {
      if (commission.status === 'paid') addMoney(paid, commission.currency as string, commission.amount)
      else if (commission.status === 'approved') addMoney(payable, commission.currency as string, commission.amount)
      else if (commission.status === 'pending') addMoney(pending, commission.currency as string, commission.amount)
    }
    return {
      id,
      code: (row.code as string | null) ?? null,
      name: row.name as string,
      email: row.email as string,
      status: row.status as string,
      payoutMethod: (row.payout_method as string | null) ?? null,
      baseRate: Number(row.base_rate),
      topRate: Number(row.top_rate),
      topRateFrom: Number(row.top_rate_from),
      referrals: counts,
      flaggedReferrals: mine.filter((r) => (r.review_flags ?? []).length > 0).length,
      shopifyReferrals: mine
        .filter((r) => r.billing_source === 'shopify')
        .map((r) => ({ id: r.id, createdAt: r.created_at, flags: r.review_flags ?? [] })),
      clicks30: clickRows.filter((c) => c.affiliate_id === id).reduce((sum, c) => sum + (c.clicks ?? 0), 0),
      pending,
      payable,
      paid,
    }
  })

  return {
    applications: ((applications.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
      phone: (row.phone as string | null) ?? null,
      website: (row.website as string | null) ?? null,
      country: (row.country as string | null) ?? null,
      audience: (row.audience as string | null) ?? '',
      appliedAt: row.applied_at as string,
      suggestedCode: suggestCode({ name: row.name as string, website: row.website as string | null }),
    })),
    partners: builtPartners,
    commissions: commissionRows
      .filter((row) => row.status === 'pending' || row.status === 'approved')
      .map((row) => ({
        id: row.id as string,
        affiliateId: row.affiliate_id as string,
        affiliateName: nameOf.get(row.affiliate_id as string) ?? '',
        affiliateCode: codeOf.get(row.affiliate_id as string) ?? null,
        amount: Number(row.amount),
        currency: (row.currency === 'USD' ? 'USD' : 'ILS') as Currency,
        rate: Number(row.rate),
        paymentAmount: Number(row.payment_amount),
        source: row.source as string,
        status: row.status as string,
        earnedAt: row.earned_at as string,
        releasesAt: row.releases_at as string,
        released: new Date(row.releases_at as string).getTime() <= now.getTime(),
        flags: flagsByReferral.get(row.referral_id as string) ?? [],
      })),
    payouts: ((payouts.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      affiliateId: row.affiliate_id as string,
      affiliateName: nameOf.get(row.affiliate_id as string) ?? '',
      amount: Number(row.amount),
      currency: (row.currency === 'USD' ? 'USD' : 'ILS') as Currency,
      status: row.status as string,
      createdAt: row.created_at as string,
      paidAt: (row.paid_at as string | null) ?? null,
      reference: (row.reference as string | null) ?? null,
    })),
  }
}
