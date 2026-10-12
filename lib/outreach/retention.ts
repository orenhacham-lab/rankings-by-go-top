/**
 * FORGETTING a prospect: how long the outbound channel keeps what it holds.
 *
 * WHY THERE IS A RULE AT ALL. CPRA §1798.100(a)(3) makes us disclose, per
 * category, how long we keep it or the criterion that decides — and "as long as
 * necessary" is the phrasing a regulator rejects. The published privacy text
 * therefore states these two periods, and this module is what makes the text
 * true. If you change a number here, the text changes with it, in all four
 * languages, or the policy becomes a false statement.
 *
 * THE TWO RULES.
 *
 *   A row we wrote to          `email` and `contact_name` are nulled and
 *                              `redacted_at` stamped 30 days after the last
 *                              thing that happened to it: the second message,
 *                              the first if there was no second, or a reply or
 *                              an opt-out if that came later.
 *
 *   A row we never wrote to    deleted outright 90 days after it was added. At
 *                              that point we are holding a business's details
 *                              for a message we never sent, and there is nothing
 *                              to weigh against letting them go.
 *
 * WHY 30 DAYS, AND NOT LESS. CAN-SPAM requires the unsubscribe link to keep
 * working for at least 30 days after a message, and that link resolves against
 * this row (lib/outreach/prospects.ts). Emptying the row sooner would break the
 * promise the message makes. It is the shortest period that keeps both.
 *
 * WHAT SURVIVES A REDACTION, deliberately: `email_hash`, the token, company,
 * site host, platform, country, status and the dates. That is what proves we
 * already wrote to this business twice — the unique index on `email_hash` is
 * what stops it being added to a later list — while holding no address and no
 * person's name. The link still works and still answers truthfully, because
 * what it reads after a redaction is the suppression row, not this one.
 *
 * `postal_address` is kept: it is the business's own published address, and the
 * privacy text discloses it. It is not a person's name.
 *
 * Run daily by /api/outreach/retention/cron. Deliberately dull: it returns
 * counts, never throws, and nothing about any prospect reaches a log line.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

import { PROSPECTS_TABLE } from './prospects'

/** Days after the last message before the address and the contact name go. */
export const PROSPECT_REDACTION_DAYS = 30
/** Days we keep a prospect we never wrote to, after which the row is deleted. */
export const UNUSED_PROSPECT_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/** A row added or last touched before this is past the given retention. */
export function retentionCutoff(now: Date, days: number): string {
  return new Date(now.getTime() - Math.max(0, days) * DAY_MS).toISOString()
}

/** The columns the rule reads. */
export interface ProspectRetentionRow {
  id: string
  email: string | null
  first_sent_at: string | null
  second_sent_at: string | null
  replied_at: string | null
  redacted_at: string | null
}

const at = (value: string | null): number => {
  if (!value) return Number.NaN
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? Number.NaN : ms
}

/**
 * The last thing that happened to a prospect, as a timestamp, or NaN when
 * nothing did. A date we cannot parse counts as nothing rather than as now:
 * the consequence is keeping the row one more pass, not emptying it early.
 */
export function lastTouched(row: ProspectRetentionRow): number {
  const times = [at(row.first_sent_at), at(row.second_sent_at), at(row.replied_at)]
    .filter((ms) => !Number.isNaN(ms))
  return times.length === 0 ? Number.NaN : Math.max(...times)
}

/**
 * Whether this row's address and contact name are due to go.
 *
 * A row already redacted is never due again, and a row nothing ever happened to
 * is not this rule's business — it belongs to the 90-day deletion instead.
 */
export function isDueForRedaction(row: ProspectRetentionRow, now: Date, days = PROSPECT_REDACTION_DAYS): boolean {
  if (row.redacted_at !== null) return false
  if (row.email === null) return false
  const last = lastTouched(row)
  if (Number.isNaN(last)) return false
  return last <= now.getTime() - Math.max(0, days) * DAY_MS
}

export interface ProspectRetentionSummary {
  /** Rows whose address and contact name were nulled. */
  redacted: number
  /** Rows we never wrote to, deleted whole. */
  unusedDeleted: number
  failed: string[]
}

/**
 * One retention pass. Returns counts; never throws, because this runs
 * unattended and a pass that crashes is a pass nobody notices has stopped.
 */
export async function applyProspectRetention(admin: Admin, now = new Date()): Promise<ProspectRetentionSummary> {
  const summary: ProspectRetentionSummary = { redacted: 0, unusedDeleted: 0, failed: [] }

  // Rule 1. The candidates are read and judged here rather than filtered in the
  // query, because the cutoff is the LATEST of three columns and that is not a
  // filter — writing it as one is how a row gets emptied a month early.
  try {
    const { data, error } = await admin.from(PROSPECTS_TABLE)
      .select('id, email, first_sent_at, second_sent_at, replied_at, redacted_at')
      .is('redacted_at', null)
      .not('first_sent_at', 'is', null)
    if (error) {
      summary.failed.push('redaction_read_failed')
    } else {
      const due = (data ?? []).filter((row: ProspectRetentionRow) => isDueForRedaction(row, now))
      for (const row of due) {
        try {
          const { error: updateError } = await admin.from(PROSPECTS_TABLE)
            .update({ email: null, contact_name: null, redacted_at: now.toISOString() })
            .eq('id', row.id)
          if (updateError) summary.failed.push('redaction_write_failed')
          else summary.redacted += 1
        } catch {
          summary.failed.push('redaction_write_threw')
        }
      }
    }
  } catch {
    summary.failed.push('redaction_read_threw')
  }

  // Rule 2. Never written to: `first_sent_at IS NULL` is the whole test, so a
  // row that was written to can never fall into this branch by accident.
  try {
    const { data, error } = await admin.from(PROSPECTS_TABLE)
      .delete()
      .is('first_sent_at', null)
      .lt('created_at', retentionCutoff(now, UNUSED_PROSPECT_DAYS))
      .select('id')
    if (error) summary.failed.push('unused_delete_failed')
    else summary.unusedDeleted = (data ?? []).length
  } catch {
    summary.failed.push('unused_delete_threw')
  }

  return summary
}
