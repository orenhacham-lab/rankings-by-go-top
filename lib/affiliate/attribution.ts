/**
 * Crediting a NEW account to a partner — the one place that decides it.
 *
 * Two doors lead here and they must not disagree:
 *   - /api/affiliate/attach, called by the signup form the moment the account
 *     exists (email + password, where the session is created in the browser);
 *   - the auth callback (app/api/auth/callback/route.ts), which every other door
 *     comes through — Google, and the email-confirmation link.
 *
 * WHAT IT REFUSES, and why each refusal is a rule in the published agreement:
 *   - an account that is not new. A customer of two years clicking their own
 *     link must not earn on the subscription they were already paying for, and
 *     this route is callable by any signed-in user, so "new" is checked here
 *     against the account's own creation time and never taken from the caller.
 *   - an account that is ALREADY credited. One account belongs to one partner
 *     for ever; the database says so too (referred_user_id is unique), and this
 *     check is what turns that into a quiet success rather than an error.
 *   - a code that is not an approved partner's. A pending applicant has no code
 *     at all, so nothing can be credited before a person has read their
 *     application.
 *   - THE PARTNER'S OWN ACCOUNT. No commission on yourself: the cheap version of
 *     self-referral is a partner clicking their own link, and this stops it
 *     outright.
 *
 * WHAT IT ONLY FLAGS. Signals that LOOK like self-referral but are also exactly
 * what our best partner does: an agency signs up a real client and the contact
 * email is the agency's own. A hard block there would refuse the audience we
 * most want, so the referral is created and the signal is recorded on it for an
 * operator to read before approving any commission. gotop-affiliate-self-referral
 * has the reasoning; nobody in this industry prevents self-referral, they review
 * it.
 */
import { attachableAtSignup, withinNewAccountWindow } from './referral'

// `any` deliberately, matching lib/paypal/webhook-processing.ts's convention:
// this is called with both the real service-role client and FakeAdmin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export interface ReferredAccount {
  id: string
  email?: string | null
  created_at?: string | null
}

export type AttachOutcome =
  /** No code on the link — the ordinary case for almost every signup. */
  | { kind: 'no_code' }
  | { kind: 'not_new_account' }
  /** Already credited to a partner (possibly this one): nothing to do, not an error. */
  | { kind: 'already_referred' }
  | { kind: 'unknown_code'; code: string }
  | { kind: 'self_referral'; code: string }
  | { kind: 'attached'; code: string; affiliateId: string; referralId: string; flags: string[] }
  | { kind: 'failed'; reason: string }

/** The signals that ask a person to look. They never block a referral. */
export const REVIEW_FLAGS = {
  /** The application's own email is the email of the account that signed up. */
  emailMatch: 'email_match',
  /** The new account's email is on the partner's own website domain. */
  domainMatch: 'domain_match',
} as const

/** The host of a website as the applicant typed it, or null. Lowercase, no `www.`. */
export function websiteHost(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
  try {
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** The domain of an email address, lowercase, or null. */
export function emailDomain(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const at = raw.lastIndexOf('@')
  if (at <= 0 || at === raw.length - 1) return null
  return raw.slice(at + 1).trim().toLowerCase() || null
}

/**
 * The flags for one referral, from the partner's application and the new
 * account. PURE, so the rules are readable and the QA suite can state them.
 *
 * A free-mail provider needs no special case: `gmail.com` is never the host of a
 * partner's website, so the domain signal cannot fire on one.
 */
export function reviewFlagsFor(
  affiliate: { email?: string | null; website?: string | null },
  account: { email?: string | null },
): string[] {
  const flags: string[] = []
  const accountEmail = (account.email ?? '').trim().toLowerCase()
  if (accountEmail && accountEmail === (affiliate.email ?? '').trim().toLowerCase()) flags.push(REVIEW_FLAGS.emailMatch)
  const host = websiteHost(affiliate.website)
  const domain = emailDomain(accountEmail)
  if (host && domain && host === domain) flags.push(REVIEW_FLAGS.domainMatch)
  return flags
}

/**
 * Credit `account` to the partner whose code it arrived with.
 *
 * Returns an outcome rather than throwing: every caller is a signup in progress,
 * and a referral that cannot be created must never be the reason an account
 * fails to be created. The caller logs and carries on.
 */
export async function attachReferral(
  admin: Admin,
  { account, code, now = new Date() }: { account: ReferredAccount; code: string | null | undefined; now?: Date },
): Promise<AttachOutcome> {
  const isNew = withinNewAccountWindow(account.created_at, now.getTime())
  const normalized = attachableAtSignup(code, isNew)
  if (!normalized) {
    // Told apart on purpose: "no code" is the ordinary signup, "not new" is a
    // signed-in account that tried to claim one and is worth seeing in a log.
    if (!code) return { kind: 'no_code' }
    return isNew ? { kind: 'no_code' } : { kind: 'not_new_account' }
  }

  const existing = await admin
    .from('affiliate_referrals')
    .select('id')
    .eq('referred_user_id', account.id)
    .maybeSingle()
  if (existing.error) return { kind: 'failed', reason: 'referral_read_failed' }
  if (existing.data) return { kind: 'already_referred' }

  const partner = await admin
    .from('affiliates')
    .select('id, user_id, email, website, status')
    .eq('code', normalized)
    .eq('status', 'approved')
    .maybeSingle()
  if (partner.error) return { kind: 'failed', reason: 'affiliate_read_failed' }
  if (!partner.data) return { kind: 'unknown_code', code: normalized }
  if (partner.data.user_id && partner.data.user_id === account.id) return { kind: 'self_referral', code: normalized }

  const flags = reviewFlagsFor(partner.data, account)
  const inserted = await admin
    .from('affiliate_referrals')
    .insert({
      affiliate_id: partner.data.id,
      referred_user_id: account.id,
      code: normalized,
      status: 'signed_up',
      review_flags: flags,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .select('id')
    .single()
  // 23505: the other door credited the same account a moment ago. The database
  // enforcing "one account, one partner" is the answer, not a failure.
  if (inserted.error) {
    return (inserted.error as { code?: string }).code === '23505'
      ? { kind: 'already_referred' }
      : { kind: 'failed', reason: 'referral_insert_failed' }
  }
  return { kind: 'attached', code: normalized, affiliateId: partner.data.id, referralId: inserted.data.id, flags }
}
