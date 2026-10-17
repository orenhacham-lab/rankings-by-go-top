/**
 * The prospect list of the US outbound channel, and the unsubscribe path that
 * does not need a signature.
 *
 * WHY THIS EXISTS. The signed link (unsubscribe-token.ts) is keyed with
 * CRON_SECRET, so only code running on the server can build one. The channel
 * sends from a mailbox, not from the app, and the published privacy text
 * promises a working unsubscribe link in every message. A per-prospect secret
 * stored on the row is a credential the sender can read and this module can
 * verify: 64 hex characters of randomness naming exactly one row, so a stranger
 * cannot suppress an address they do not already hold the link for.
 *
 * The signed link stays the better one and nothing about it changes. Where both
 * are possible, the signed link is what goes in the message.
 *
 * Fails closed in the direction that matters: anything this module cannot
 * confirm, it reports as not done, so no one is told they were removed when
 * they were not.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { suppress } from '@/lib/email-suppression'

export const PROSPECTS_TABLE = 'outreach_prospects'

/** Mirrors the CHECK in the migration. */
export type ProspectStatus = 'new' | 'sent_first' | 'sent_second' | 'replied' | 'opted_out' | 'disqualified'

export type ProspectUnsubscribeOutcome = 'done' | 'invalid' | 'unavailable'

/** The shape the column's CHECK allows, so a malformed link never reaches the database. */
function isTokenShaped(token: unknown): token is string {
  return typeof token === 'string' && /^[0-9a-f]{32,128}$/.test(token)
}

/**
 * Suppress the address a prospect token names, and mark the row.
 *
 * The suppression is the part that must hold: once the address is on the one
 * list, every sender in the product is blocked, whatever happens to the
 * prospect row afterwards. Marking the row is bookkeeping, so a failure there
 * does not turn a completed removal into an error the recipient sees.
 */
export async function suppressByProspectToken(
  admin: ServiceRoleClient,
  token: unknown,
): Promise<ProspectUnsubscribeOutcome> {
  if (!isTokenShaped(token)) return 'invalid'
  let row: { id: string; email: string | null } | null = null
  try {
    const { data, error } = await admin.from(PROSPECTS_TABLE)
      .select('id, email').eq('unsub_token', token).limit(1).maybeSingle()
    // Includes the table not being installed yet: not a reason to claim success.
    if (error) return 'unavailable'
    row = (data as { id: string; email: string | null } | null) ?? null
  } catch {
    return 'unavailable'
  }
  if (!row) return 'invalid'
  // A redacted row is one whose address was already deleted on request, which
  // only happens after it was suppressed. Saying "removed" is the truth.
  if (row.email === null) return 'done'

  try {
    const result = await suppress(admin, {
      email: row.email,
      source: 'unsubscribe_link',
      channel: 'outbound_prospect',
    })
    if (result.status !== 'ok') return 'unavailable'
  } catch {
    return 'unavailable'
  }

  try {
    await admin.from(PROSPECTS_TABLE).update({ status: 'opted_out' as ProspectStatus }).eq('id', row.id)
  } catch {
    // The address is already on the list, which is what stops the next send.
  }
  return 'done'
}
