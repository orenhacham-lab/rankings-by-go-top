/**
 * THE RECORDED KOREAN OPT-IN, read. Separate from
 * lib/compliance/korea-promotional-email.ts so that the decision stays pure
 * and testable and only this file knows where a consent is kept.
 *
 * THERE IS EXACTLY ONE PLACE A MARKETING CONSENT IS RECORDED: the pre-signup
 * research screen writes `free_check_report_requests.consent_text` with the
 * words the visitor actually read and a version id per locale
 * (lib/presignup/copy.ts). The Korean one is `marketing-email-ko-v1`, and its
 * sentence is the 제50조 consent itself: it names the "(광고)" mark and the
 * withdrawal route, and says that declining costs the visitor nothing. A row
 * that records a REFUSAL carries `marketing-declined-v1` instead, so the
 * presence of the Korean marketing id is the whole test and an absence is
 * never read as agreement.
 *
 * The screen is off in Production, so today this returns false for everybody.
 * That is the correct answer, not a gap: it means no promotional email goes to
 * a reader placed in Korea, and the gate opens by itself on the day a Korean
 * visitor ticks the box.
 *
 * IT FAILS CLOSED. Any error, including the table not being installed, is
 * `null` — "could not be read" — which the gate treats as no consent.
 *
 * WHAT IT DOES NOT DO: 제8항 wants a consent re-confirmed periodically. Nothing
 * is re-confirmed here because nothing has been consented to yet; the day a
 * Korean consent exists, the age of the row it reads becomes the next
 * question.
 */
import { normalizeEmail } from '@/lib/email-suppression'
import { MARKETING_CONSENT_VERSION_KO } from '@/lib/presignup/copy'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { KoreanOptIn } from './korea-promotional-email'

/**
 * The table, repeated rather than imported: lib/presignup/http.ts is a route
 * handler, and a cron run has no business importing one. The QA suite asserts
 * this string is byte-identical to `REPORT_REQUESTS_TABLE` there.
 */
export const REPORT_REQUESTS_TABLE = 'free_check_report_requests'

/** The marker a Korean marketing consent leaves in `consent_text`. */
export const KOREA_MARKETING_MARKER = `[${MARKETING_CONSENT_VERSION_KO}]`

/**
 * Has this address a recorded Korean marketing consent? `null` means the
 * question could not be answered and nothing may be sent.
 */
export async function readKoreanMarketingOptIn(admin: ServiceRoleClient, email: string): Promise<KoreanOptIn> {
  const address = normalizeEmail(email)
  if (!address || address.indexOf('@') < 1) return false
  try {
    const { data, error } = await admin.from(REPORT_REQUESTS_TABLE)
      .select('consent_text')
      .eq('email', address)
      .eq('consent', true)
      .limit(50)
    if (error) return null
    const rows = (data ?? []) as { consent_text?: unknown }[]
    return rows.some((r) => typeof r.consent_text === 'string' && r.consent_text.includes(KOREA_MARKETING_MARKER))
  } catch {
    return null
  }
}
