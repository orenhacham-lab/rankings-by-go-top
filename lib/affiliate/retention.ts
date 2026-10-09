/**
 * FORGETTING an application: the only deletion in the whole program.
 *
 * `applied_ip` is the raw address an application arrived from. It exists for one
 * purpose — recognising a flood of applications at the moment they are made, and
 * holding the three-an-hour limit in lib/affiliate/application.ts — and that
 * purpose is spent within hours. Keeping it for ever would be a record we could
 * not justify, so after a year it is cleared, and an application a person
 * refused is deleted outright: it never had a code, so nothing in the books
 * points at it.
 *
 * WHAT IS NOT TOUCHED, and never will be. A referral, a commission and a payout
 * are the books: they are what a partner is owed and what we paid, and both
 * sides may need to read them years later. An approved partner's row stays too —
 * only its IP is forgotten. The database agrees: `service_role` holds DELETE on
 * `affiliates` alone, and the guard trigger lets `applied_ip` be set to NULL and
 * to nothing else, so this module can forget an address and cannot rewrite one.
 *
 * Run daily by /api/affiliate/retention/cron. It is deliberately dull: two
 * statements, counts in the log, nothing about any applicant.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** A year, which is how long the application's own record is kept. */
export const APPLICATION_RETENTION_DAYS = 365

export interface RetentionSummary {
  /** Applications a person refused, deleted whole. */
  rejectedDeleted: number
  /** Rows whose applicant IP was cleared (approved, suspended or still pending). */
  ipsForgotten: number
  failed: string[]
}

/** The cutoff: an application made before this is past its retention. */
export function retentionCutoff(now: Date, days = APPLICATION_RETENTION_DAYS): string {
  return new Date(now.getTime() - Math.max(0, days) * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Clear what is past its retention. Returns counts; never throws, because this
 * runs unattended and a retention pass that crashes is a retention pass nobody
 * notices has stopped.
 */
export async function purgeAffiliateApplications(admin: Admin, now = new Date()): Promise<RetentionSummary> {
  const cutoff = retentionCutoff(now)
  const summary: RetentionSummary = { rejectedDeleted: 0, ipsForgotten: 0, failed: [] }

  // A refused application: deleted whole. It never held a code, so no link, no
  // referral and no commission can point at it.
  try {
    const deleted = await admin
      .from('affiliates')
      .delete()
      .eq('status', 'rejected')
      .lt('applied_at', cutoff)
      .select('id')
    if (deleted.error) summary.failed.push('rejected_delete_failed')
    else summary.rejectedDeleted = (deleted.data ?? []).length
  } catch {
    summary.failed.push('rejected_delete_threw')
  }

  // Everyone else keeps their row and loses the address. `.not('applied_ip',
  // 'is', null)` keeps the pass from rewriting rows that were already forgotten,
  // so the count in the log is the work actually done.
  try {
    const cleared = await admin
      .from('affiliates')
      .update({ applied_ip: null, updated_at: now.toISOString() })
      .lt('applied_at', cutoff)
      .not('applied_ip', 'is', null)
      .select('id')
    if (cleared.error) summary.failed.push('ip_clear_failed')
    else summary.ipsForgotten = (cleared.data ?? []).length
  } catch {
    summary.failed.push('ip_clear_threw')
  }

  return summary
}
