/**
 * The daily retry for PayPal→Shopify migrations that need a PayPal call, and
 * the operator alert when one keeps failing.
 *
 * WHY. A failed PayPal cancellation used to be written to the migration row as
 * 'paypal_cancel_failed' and then wait for the merchant to come back through a
 * Shopify billing return or an app load. Nobody was told, and until then the
 * account could be billed by PayPal and Shopify at once. Now, once a day (from
 * the existing /api/schedule cron, 06:00 UTC):
 *
 *   * 'pending' migrations: PayPal auto-renewal is stopped if it is still on
 *     (stopPayPalRenewalForMigration — keeps the paid period, idempotent);
 *   * 'paypal_cancel_failed' migrations: the cancellation is retried and, on
 *     success, the migration completes atomically
 *     (cancelPayPalAndCompleteMigration — the same code the confirmation uses);
 *   * every row that still fails is listed in ONE email to the operator
 *     (deliverOperatorEmail: ADMIN_NOTIFICATION_EMAIL, the same channel as the
 *     sign-up and partner notices). The alert repeats daily while the problem
 *     lasts, so it cannot go quiet.
 *
 * The email carries internal ids and machine codes only: no customer name,
 * email or PayPal/Shopify response text. Never throws.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { deliverOperatorEmail, type AlertDeps } from '@/lib/notifications/operator-alerts'
import { escapeEmailHtml } from '@/lib/notifications/email-escape'
import { verifyPayPalActivation } from '@/lib/paypal/client'
import { cancelPayPalAndCompleteMigration, type MigrationRow } from './paypal-migration'
import { stopPayPalRenewalForMigration, type StopRenewalOutcome } from './paypal-paid-period'

type Admin = ReturnType<typeof createAdminClient>

/** Rows handled per run. There are only ever a handful; this bounds a bad day. */
export const MIGRATION_RETRY_BATCH = 100

export interface MigrationRetryProblem {
  migrationId: string
  userId: string
  status: string
  outcome: string
  attempts: number
}

export interface MigrationRetrySummary {
  ok: boolean
  examined: number
  renewalStopped: number
  completed: number
  problems: MigrationRetryProblem[]
  alert: 'none' | 'sent' | 'not_sent'
}

const RENEWAL_PROBLEMS: ReadonlySet<StopRenewalOutcome> = new Set(['failed', 'period_unknown', 'lookup_failed'])

export function buildMigrationAlertHtml(problems: MigrationRetryProblem[]): string {
  const rows = problems.map((p) =>
    `<tr><td>${escapeEmailHtml(p.migrationId)}</td><td>${escapeEmailHtml(p.userId)}</td><td>${escapeEmailHtml(p.status)}</td><td>${escapeEmailHtml(p.outcome)}</td><td>${escapeEmailHtml(p.attempts)}</td></tr>`,
  ).join('')
  return [
    '<div dir="rtl" style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px">',
    '<h2 style="color:#b91c1c">חיוב PayPal של חשבונות שעוברים ל-Shopify דורש טיפול</h2>',
    '<p>הניסיון היומי לעצור או לבטל את מנוי ה-PayPal נכשל בחשבונות הבאים. עד שזה נפתר, PayPal עלול לחייב שוב. בדקו את המנוי ב-PayPal ואת השורה בטבלה shopify_billing_migrations.</p>',
    '<table dir="ltr" style="border-collapse:collapse;font-size:13px" border="1" cellpadding="4">',
    '<tr><th>migration</th><th>user</th><th>status</th><th>outcome</th><th>attempts</th></tr>',
    rows,
    '</table>',
    '<p style="color:#64748b;font-size:12px">הודעה אוטומטית מ-Go Top SEO. היא נשלחת כל יום עד שהבעיה נפתרת.</p>',
    '</div>',
  ].join('')
}

export async function retryPayPalMigrations(
  admin: Admin,
  deps: { fetchImpl?: typeof fetch; now?: () => Date; alert?: AlertDeps } = {},
): Promise<MigrationRetrySummary> {
  const summary: MigrationRetrySummary = { ok: true, examined: 0, renewalStopped: 0, completed: 0, problems: [], alert: 'none' }
  const fetchImpl = deps.fetchImpl ?? fetch
  try {
    const { data, error } = await admin
      .from('shopify_billing_migrations')
      .select('*')
      .in('status', ['pending', 'paypal_cancel_failed'])
      .order('updated_at', { ascending: true })
      .limit(MIGRATION_RETRY_BATCH)
    if (error) {
      summary.ok = false
      summary.problems.push({ migrationId: '-', userId: '-', status: '-', outcome: 'migration_query_failed', attempts: 0 })
    } else {
      for (const row of (data ?? []) as MigrationRow[]) {
        summary.examined++
        if (row.status === 'pending') {
          const outcome = await stopPayPalRenewalForMigration(admin, row.user_id, { fetchImpl, now: deps.now })
          if (outcome === 'stopped') summary.renewalStopped++
          if (RENEWAL_PROBLEMS.has(outcome)) {
            summary.problems.push({ migrationId: row.id, userId: row.user_id, status: row.status, outcome: `renewal_${outcome}`, attempts: (row.paypal_cancel_attempts ?? 0) + (outcome === 'lookup_failed' ? 0 : 1) })
          }
          continue
        }
        // 'paypal_cancel_failed': Shopify was confirmed when the row got here.
        const result = await cancelPayPalAndCompleteMigration(admin, row.user_id, row, fetchImpl)
        if (result.status === 'completed' && !result.cancelFailed && !result.dbWriteUnconfirmed) {
          summary.completed++
        } else {
          summary.problems.push({
            migrationId: row.id, userId: row.user_id, status: row.status,
            outcome: result.cancelFailed ? 'paypal_cancel_failed' : 'completion_unconfirmed',
            attempts: (row.paypal_cancel_attempts ?? 0) + (result.cancelFailed ? 1 : 0),
          })
        }
      }
    }
  } catch (err) {
    summary.ok = false
    summary.problems.push({ migrationId: '-', userId: '-', status: '-', outcome: err instanceof Error ? `threw_${err.name}`.slice(0, 60) : 'threw', attempts: 0 })
  }

  if (summary.problems.length > 0) {
    summary.ok = false
    const sent = await deliverOperatorEmail({
      subject: `PayPal→Shopify: ${summary.problems.length} חשבונות דורשים טיפול`,
      html: buildMigrationAlertHtml(summary.problems),
    }, deps.alert ?? {})
    summary.alert = sent.sent ? 'sent' : 'not_sent'
    console.error('[shopify-migration-retry] migrations need attention', { count: summary.problems.length, alert: summary.alert })
  }
  return summary
}

/**
 * Tell the operator that /api/paypal/activate refused a subscription PayPal had
 * already approved, because the account is billed through Shopify. The payer may
 * have been charged with no plan behind it, so it needs a manual cancel and
 * refund. Ids only; the subscription id is the client's and is escaped and cut.
 *
 * Sent ONLY when PayPal itself confirms that subscription id exists, was
 * approved and matches the submitted plan (the same verifyPayPalActivation the
 * route uses), so a made-up id cannot flood the operator's inbox. Nothing is
 * written either way. Never throws.
 */
export async function notifyRefusedPayPalActivation(
  args: { userId: string; subscriptionId: string; plan: string; reason: string },
  deps: AlertDeps & { verify?: typeof verifyPayPalActivation } = {},
): Promise<'sent' | 'not_sent' | 'unverified'> {
  try {
    const real = await (deps.verify ?? verifyPayPalActivation)({ submittedSubscriptionId: args.subscriptionId, submittedPlanCode: args.plan })
    if (!real.ok) return 'unverified'
    const out = await deliverOperatorEmail({
      subject: 'PayPal אישר מנוי לחשבון שמחויב דרך Shopify: נדרשים ביטול והחזר',
      html: [
        '<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">',
        '<h2 style="color:#b91c1c">מנוי PayPal נדחה אחרי אישור</h2>',
        '<p>PayPal אישר מנוי, אבל החשבון מחובר ל-Shopify ולכן התוכנית לא הופעלה. ייתכן שהלקוח חויב: בטלו את המנוי ב-PayPal והחזירו את התשלום.</p>',
        `<p dir="ltr">user: ${escapeEmailHtml(args.userId.slice(0, 64))}<br>subscription: ${escapeEmailHtml(args.subscriptionId.slice(0, 64))}<br>reason: ${escapeEmailHtml(args.reason.slice(0, 64))}</p>`,
        '</div>',
      ].join(''),
    }, deps)
    return out.sent ? 'sent' : 'not_sent'
  } catch {
    return 'not_sent'
  }
}
