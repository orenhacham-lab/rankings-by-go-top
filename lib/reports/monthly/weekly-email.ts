/**
 * ============================================================================
 *  UNUSED SENDER HOOK — THE WEEKLY EMAIL SUMMARY. NOT WIRED. SENDS NOTHING.
 * ============================================================================
 *
 * The settings screen stores one switch per project,
 * project_report_preferences.weekly_email_summary (OFF by default). Nothing reads
 * it to send mail: no route, cron or component imports this file, and
 * lib/reports/monthly/__qa__/monthly-report.qa.ts fails if one does, or if this
 * file starts reaching an email provider.
 *
 * What turning sending on would take, and must not happen before a merge and the
 * owner's approval:
 *   1. Provider: Resend is already a dependency (lib/notifications/signup-email.ts,
 *      RESEND_API_KEY). A marketing-grade sender would use its own API key.
 *   2. Domain: a verified sending domain (e.g. mail.gotopseo.com) with SPF, DKIM
 *      and a DMARC policy, and RESEND_FROM_EMAIL on it — not onboarding@resend.dev.
 *   3. Unsubscribe: a signed, per-recipient one-click link (RFC 8058,
 *      `List-Unsubscribe` + `List-Unsubscribe-Post`) served by a route that flips
 *      this same switch off without a login, plus a footer link.
 *   4. A weekly cron (Sunday, authorizeCronRequest) that selects projects with
 *      the switch ON, builds the body from stored data only, records each send
 *      (idempotency per project and week) and handles bounces/complaints.
 *   5. Hebrew RTL and English templates, the project owner's language.
 */

export const WEEKLY_EMAIL_SENDING_ENABLED = false as const

export interface WeeklySummaryInput {
  projectId: string
  ownerUserId: string
}

/** Always refuses. Replace only as part of the work listed above. */
export async function sendWeeklySummary(input: WeeklySummaryInput): Promise<{ sent: false; reason: 'sending_not_enabled' }> {
  void input
  return { sent: false, reason: 'sending_not_enabled' }
}
