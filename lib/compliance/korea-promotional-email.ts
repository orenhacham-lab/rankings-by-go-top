/**
 * WHICH CUSTOMER EMAIL MAY REACH A READER IN KOREA.
 *
 * 정보통신망법 제50조 제1항 requires EXPLICIT PRIOR CONSENT before 영리목적의
 * 광고성 정보 is sent to a reader by an electronic transmission medium. The
 * 제1호 exception covers a sender who got the address 재화등의 거래관계를 통하여,
 * and we do not lean on it: our trial takes no card and no payment, so whether
 * it is a 거래관계 at all is a question we would be answering in our own
 * favour. 제4항 wants the sender's name, a contact and an easy refusal INSIDE
 * the message, and the subject line of an advertisement marked. 제3항 bars a
 * promotional send between 21:00 and 08:00 Korean time.
 *
 * WHAT IS ALREADY TRUE, so that this module does not re-do it:
 *   - the ko privacy policy discloses 제50조, the "(광고)" mark and the
 *     withdrawal route; the opt-in sentence itself is written, per locale,
 *     in lib/presignup/copy.ts (`marketing-email-ko-v1`);
 *   - all three customer emails already carry the company's registered name
 *     and number, its address, contact@gotopseo.com and an RFC 8058 one-click
 *     unsubscribe, which is what 제4항 asks for;
 *   - they go out at 09:00 Asia/Jerusalem, which is 16:00 or 17:00 in Seoul,
 *     so 제3항's night window is not in play. lib/reminders/cadence.ts owns
 *     that hour; if it ever moves, 제3항 has to be read again.
 * WHAT IS NOT TRUE is that any Korean opt-in has ever been RECORDED: the
 * pre-signup screen that offers it is off in Production, so the only honest
 * answer today is that nobody in Korea has consented.
 *
 * THE CLASSIFICATION (`CUSTOMER_EMAIL_KINDS`) is the decision this module
 * exists to hold. 광고성 정보 is judged by what the message does, not by what
 * we file it under:
 *   - `approval_reminder` is SERVICE. Articles the customer ordered are
 *     written and nothing publishes until they say yes; the email asks them to
 *     do the one thing the service cannot do for them. It sells nothing.
 *   - `weekly_summary` is SERVICE. It reports what was measured on the
 *     customer's own site over their own week, and only to an owner who turned
 *     the switch on.
 *   - `setup_connect` and `setup_publish` are PROMOTIONAL, and that is the
 *     cautious reading rather than the obvious one. Their subject is the
 *     customer's unfinished setup, which is service, but their body lists what
 *     the product will do for them once they finish, and they are sent to
 *     someone who has not yet paid, to get them using the product before the
 *     trial ends. We would rather argue that we treated a service email as an
 *     advertisement than the other way round: the first costs us a setup email
 *     to a market with no customers in it, and the second is a 제50조 제1항
 *     breach, which is penalised. (The size of the penalty is deliberately not
 *     stated here: nobody has read the penalty provisions off the statute, and
 *     the decision does not turn on the figure.)
 *
 * HOW A READER IS PLACED IN KOREA. There is no request at cron time, so the
 * CDN header every other territory module reads does not exist here. What we
 * have is what the account and the project recorded:
 *   - `signupCountry`, the country of the request that opened the account
 *     (lib/compliance/signup-country.ts). This is the one signal that is about
 *     the PERSON rather than about their language or their market, so it is
 *     the strongest, and it was added on 2026-11-13 to close the residual the
 *     other three leave;
 *   - the language the account registered in, the project's country and the
 *     project's content language.
 * Any one of them being Korean is enough — this is a block, so a broad test
 * costs a Korean-speaking customer elsewhere one setup email they can get by
 * consenting, while a narrow one would let an unlawful send out.
 *
 * THE RESIDUAL THAT REMAINS, stated rather than hidden: the CDN sets no header
 * for a local or preview sign-up and cannot place every address, and every
 * account opened before 2026-11-13 has no country recorded at all. Such a
 * reader is placed in Korea only if their language or their project says so.
 * NULL is "not known" and never a country, the same direction
 * lib/compliance/gdpr-territory.ts fails in, because treating every
 * unplaceable sign-up as Korean would withhold setup emails from the markets
 * we actually sell to.
 *
 * IT FAILS CLOSED. A placed reader whose opt-in cannot be read is not mailed.
 */

export type CustomerEmailKind = 'approval_reminder' | 'setup_connect' | 'setup_publish' | 'weekly_summary'

/** Every recurring customer email, and whether it is 광고성 정보. The reasons are above. */
export const CUSTOMER_EMAIL_KINDS: Readonly<Record<CustomerEmailKind, 'service' | 'promotional'>> = Object.freeze({
  approval_reminder: 'service',
  setup_connect: 'promotional',
  setup_publish: 'promotional',
  weekly_summary: 'service',
})

export function isPromotional(kind: CustomerEmailKind): boolean {
  return CUSTOMER_EMAIL_KINDS[kind] === 'promotional'
}

/** The country code Korea is, upper case, as every other module spells it. */
export const KOREA_COUNTRY_CODE = 'KR'
/** The locale the Korean site is published under. */
export const KOREA_LOCALE = 'ko'

/**
 * What the account and the project recorded. Every field may be null: nothing
 * here is guessed, and a null is simply one signal that says nothing.
 */
export interface KoreaPlacementFacts {
  /**
   * `signup_attribution.signup_country`: where the request that opened this
   * account came from, alpha-2. The strongest signal, and null for every
   * account that predates it or that the CDN could not place.
   */
  signupCountry?: string | null
  /** The language recorded on the account at signup. */
  accountLocale?: string | null
  /** `projects.country`, alpha-2 as the scan or the owner left it. */
  projectCountry?: string | null
  /** `projects.language`, the language the project's content is written in. */
  projectLanguage?: string | null
}

/** Is this reader placed in Korea for 제50조? Any one Korean signal is enough. */
export function placedInKorea(facts: KoreaPlacementFacts): boolean {
  const locale = (facts.accountLocale ?? '').trim().toLowerCase()
  const language = (facts.projectLanguage ?? '').trim().toLowerCase()
  const country = (facts.projectCountry ?? '').trim().toUpperCase()
  const signup = (facts.signupCountry ?? '').trim().toUpperCase()
  if (signup === KOREA_COUNTRY_CODE) return true
  if (country === KOREA_COUNTRY_CODE) return true
  // 'ko', and 'ko-KR' or 'ko_KR' as a stored locale may spell it.
  return locale === KOREA_LOCALE || locale.startsWith(`${KOREA_LOCALE}-`) || locale.startsWith(`${KOREA_LOCALE}_`)
    || language === KOREA_LOCALE || language.startsWith(`${KOREA_LOCALE}-`) || language.startsWith(`${KOREA_LOCALE}_`)
}

/**
 * The recorded Korean opt-in, as a three-valued answer. `null` is "could not
 * be read", which this module treats as "no".
 */
export type KoreanOptIn = boolean | null

export type KoreaEmailDecision =
  | { send: true; markAsAd: boolean }
  | { send: false; reason: 'no_korean_opt_in' | 'opt_in_unreadable' }

/**
 * The gate. Service mail always goes. Promotional mail goes everywhere but to
 * a reader placed in Korea without a recorded opt-in; one who HAS consented is
 * sent to, and `markAsAd` says the subject line owes the 제4항 mark.
 */
export function koreaEmailDecision(input: {
  kind: CustomerEmailKind
  facts: KoreaPlacementFacts
  optIn: KoreanOptIn
}): KoreaEmailDecision {
  if (!isPromotional(input.kind)) return { send: true, markAsAd: false }
  if (!placedInKorea(input.facts)) return { send: true, markAsAd: false }
  if (input.optIn === null) return { send: false, reason: 'opt_in_unreadable' }
  if (!input.optIn) return { send: false, reason: 'no_korean_opt_in' }
  return { send: true, markAsAd: true }
}

/**
 * The 제50조 제4항 제1호 subject mark. It is added once: a subject that already
 * carries it is returned untouched, so a repeat pass cannot stack it.
 */
export const KOREA_AD_SUBJECT_MARK = '(광고)'

export function koreaAdSubject(subject: string): string {
  const trimmed = subject.trim()
  return trimmed.startsWith(KOREA_AD_SUBJECT_MARK) ? trimmed : `${KOREA_AD_SUBJECT_MARK} ${trimmed}`
}
