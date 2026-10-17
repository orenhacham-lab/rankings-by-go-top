/**
 * The one gate every sender passes before handing an address to an email provider.
 *
 * A removal request has to hold across channels, so there is a single list
 * (table email_suppressions) keyed by the SHA-256 of the normalized address.
 * `isSuppressed` FAILS CLOSED: if the table is missing, unreadable, or the query
 * errors for any reason, the answer is "suppressed" and nothing is sent. A list
 * we cannot read is not permission to email someone who asked us to stop.
 *
 * Written only by service-role server code. A suppression is never lifted here;
 * re-consent is a new consent record elsewhere.
 */
import { createHash } from 'crypto'
import type { ServiceRoleClient } from '@/lib/supabase/admin'

export const SUPPRESSION_TABLE = 'email_suppressions'

/** How a suppression arrived. Mirrors the CHECK in the migration. */
export type SuppressionSource =
  | 'unsubscribe_link' | 'reply_optout' | 'manual' | 'hard_bounce' | 'spam_complaint' | 'deletion_request'
/** Which channel it came from. It never narrows the effect: a row blocks every sender. */
export type SuppressionChannel = 'outbound_prospect' | 'marketing' | 'system'

/** Trimmed and lower-cased, the form the hash and the stored plaintext both use. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** SHA-256 of the normalized address, lower-case hex: the list's key. */
export function hashEmail(email: string): string {
  return createHash('sha256').update(normalizeEmail(email), 'utf8').digest('hex')
}

/** An address we would never send to whatever the list says. */
function isUnsendable(email: string): boolean {
  const normalized = normalizeEmail(email)
  return normalized.length === 0 || normalized.length > 320 || normalized.indexOf('@') < 1
}

export type SuppressionCheck =
  /** Send. */
  | { suppressed: false }
  /** Do not send. `reason` is for our logs, never for a recipient. */
  | { suppressed: true; reason: 'listed' | 'unreadable' | 'invalid_address' }

/**
 * The last gate before a send. Fails closed on every error path.
 */
export async function isSuppressed(admin: ServiceRoleClient, email: string): Promise<SuppressionCheck> {
  if (isUnsendable(email)) return { suppressed: true, reason: 'invalid_address' }
  try {
    const { data, error } = await admin.from(SUPPRESSION_TABLE)
      .select('email_hash').eq('email_hash', hashEmail(email)).limit(1).maybeSingle()
    // Includes the table not being installed yet (42P01 / PGRST205): still no send.
    if (error) return { suppressed: true, reason: 'unreadable' }
    return data ? { suppressed: true, reason: 'listed' } : { suppressed: false }
  } catch {
    return { suppressed: true, reason: 'unreadable' }
  }
}

/**
 * The gate for a batch: the addresses that may be sent to, in the order given.
 * Anything the gate cannot clear is dropped, never passed through.
 */
export async function filterSendable(admin: ServiceRoleClient, emails: readonly string[]): Promise<string[]> {
  const sendable: string[] = []
  for (const email of emails) {
    const check = await isSuppressed(admin, email)
    if (!check.suppressed) sendable.push(email)
  }
  return sendable
}

export type SuppressResult = { status: 'ok' } | { status: 'failed' }

/**
 * Add an address to the list, or leave the existing row alone if it is already
 * there — the first suppression is the one that counts, so this never overwrites
 * an earlier source, time or note.
 */
export async function suppress(
  admin: ServiceRoleClient,
  input: { email: string; source: SuppressionSource; channel: SuppressionChannel; note?: string },
): Promise<SuppressResult> {
  if (isUnsendable(input.email)) return { status: 'failed' }
  const row = {
    email_hash: hashEmail(input.email),
    email: normalizeEmail(input.email),
    source: input.source,
    channel: input.channel,
    note: input.note ?? null,
  }
  try {
    const { error } = await admin.from(SUPPRESSION_TABLE)
      .upsert(row, { onConflict: 'email_hash', ignoreDuplicates: true })
    return error ? { status: 'failed' } : { status: 'ok' }
  } catch {
    return { status: 'failed' }
  }
}

/**
 * A deletion request (California's right to delete, among others): drop the
 * readable address and keep the hash, so the opt-out still holds while we no
 * longer store the personal data. Already-redacted rows are left as they are.
 */
export async function redact(admin: ServiceRoleClient, email: string): Promise<SuppressResult> {
  if (isUnsendable(email)) return { status: 'failed' }
  try {
    const { error } = await admin.from(SUPPRESSION_TABLE)
      .update({ email: null, redacted_at: new Date().toISOString() })
      .eq('email_hash', hashEmail(email)).is('redacted_at', null)
    return error ? { status: 'failed' } : { status: 'ok' }
  } catch {
    return { status: 'failed' }
  }
}
