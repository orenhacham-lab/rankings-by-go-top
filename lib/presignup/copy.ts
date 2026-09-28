/**
 * The words of the research before sign-up that are not the research summary's
 * own (those are in the dashboard dictionary, seedOnboarding.preview, next to
 * the summary they extend).
 *
 * The consent sentence lives HERE, in one place, because the server stores the
 * exact words the visitor agreed to (Israeli Communications Law s.30A and the
 * Privacy Protection Law require proof of explicit consent): the screen shows
 * reportConsentText(locale) and the API stores the same string, never text
 * sent by the browser. Changing it changes what future consents record, so
 * give it a new version rather than editing it in place.
 */
import type { Locale } from '@/lib/i18n/locales'
import type { ResearchErrorCode } from './types'

export const REPORT_CONSENT_VERSION = 'report-email-v1'

const CONSENT: Record<Locale, string> = {
  he: 'אני מסכים/ה לקבל מ-Go Top בדוא״ל את דוח המחקר של האתר, וגם עדכונים ותוכן שיווקי. אפשר להסיר את ההסכמה בכל עת בקישור שבכל הודעה.',
  en: 'I agree to receive this site research report from Go Top by email, as well as updates and marketing content. I can withdraw consent at any time using the link in every email.',
}

export function reportConsentText(locale: Locale): string {
  return `${CONSENT[locale]} [${REPORT_CONSENT_VERSION}]`
}

export type ResearchScreenCopy = {
  errors: Record<ResearchErrorCode, string>
  unavailableTitle: string
  unavailableBody: string
  report: {
    link: string
    title: string
    body: string
    emailLabel: string
    emailPlaceholder: string
    consent: string
    privacy: string
    submit: string
    sending: string
    saved: string
    errors: Record<'consent_required' | 'invalid_email' | 'invalid_claim' | 'rate_limited' | 'unavailable' | 'internal', string>
  }
}

const he: ResearchScreenCopy = {
  errors: {
    not_found: 'המחקר המלא לא זמין כאן.',
    invalid_url: 'הכתובת לא נראית תקינה. נסו שוב, לדוגמה example.co.il',
    blocked_url: 'אפשר לחקור רק אתרים ציבוריים. כתובת פנימית, כתובת IP או הפניה לאתר אחר לא נתמכות.',
    unreachable: 'לא הצלחנו להגיע לאתר. בדקו את הכתובת ונסו שוב.',
    not_html: 'הכתובת הזאת לא מחזירה עמוד אינטרנט שאפשר לקרוא.',
    forbidden: 'האתר חוסם קוראים אוטומטיים, וגם בגוגל לא מצאנו ממנו עמודים. נסו כתובת אחרת של האתר.',
    rate_limited: 'הרצתם כמה מחקרים ברצף. נסו שוב בעוד כמה דקות.',
    daily_cap: 'המחקר החינמי עמוס היום. נסו שוב מאוחר יותר, או פתחו חשבון והמחקר ירוץ בפרויקט שלכם.',
    unavailable: 'המחקר המלא לא זמין כרגע.',
    internal: 'משהו נתקע אצלנו. נסו שוב בעוד רגע.',
  },
  unavailableTitle: 'המחקר המלא לא זמין כרגע',
  unavailableBody: 'בינתיים הרצנו בשבילכם את הבדיקה המהירה של האתר.',
  report: {
    link: 'שלחו לי את הדוח במייל',
    title: 'לקבל את הדוח במייל',
    body: 'השאירו כתובת, ונשלח אליה את דוח המחקר של האתר.',
    emailLabel: 'כתובת אימייל',
    emailPlaceholder: 'you@example.com',
    consent: CONSENT.he,
    privacy: 'מדיניות הפרטיות',
    submit: 'שמרו את הבקשה',
    sending: 'שומרים…',
    saved: 'קיבלנו. דוח המחקר יישלח לכתובת הזו.',
    errors: {
      consent_required: 'כדי שנשלח את הדוח צריך לסמן את תיבת ההסכמה.',
      invalid_email: 'כתובת האימייל לא נראית תקינה.',
      invalid_claim: 'המחקר הזה כבר לא זמין לשליחה. הריצו אותו שוב.',
      rate_limited: 'שלחתם כמה בקשות ברצף. נסו שוב מאוחר יותר.',
      unavailable: 'לא הצלחנו לשמור את הבקשה כרגע. נסו שוב מאוחר יותר.',
      internal: 'משהו נתקע אצלנו. נסו שוב בעוד רגע.',
    },
  },
}

const en: ResearchScreenCopy = {
  errors: {
    not_found: 'The full research is not available here.',
    invalid_url: "That address doesn't look right. Try again, e.g. example.com",
    blocked_url: 'Only public websites can be researched. Internal addresses, IP addresses and redirects to another site are not supported.',
    unreachable: "We couldn't reach the site. Check the address and try again.",
    not_html: "This address doesn't return a web page we can read.",
    forbidden: "The site blocks automated readers, and Google shows none of its pages either. Try another address of the site.",
    rate_limited: "You've run several researches in a row. Try again in a few minutes.",
    daily_cap: 'The free research is busy today. Try again later, or open an account and the research runs in your project.',
    unavailable: 'The full research is not available right now.',
    internal: 'Something got stuck on our side. Try again in a moment.',
  },
  unavailableTitle: 'The full research is not available right now',
  unavailableBody: "Meanwhile, we've run the quick check of your site.",
  report: {
    link: 'Email me the report',
    title: 'Get the report by email',
    body: "Leave an address and we'll send the site research report to it.",
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    consent: CONSENT.en,
    privacy: 'Privacy policy',
    submit: 'Save my request',
    sending: 'Saving…',
    saved: 'Got it. The research report will be sent to this address.',
    errors: {
      consent_required: 'To send you the report, please tick the consent box.',
      invalid_email: "That email address doesn't look right.",
      invalid_claim: 'This research can no longer be sent. Run it again.',
      rate_limited: "You've sent several requests in a row. Try again later.",
      unavailable: "We couldn't save your request right now. Try again later.",
      internal: 'Something got stuck on our side. Try again in a moment.',
    },
  },
}

export function researchScreenCopy(locale: Locale): ResearchScreenCopy {
  return locale === 'en' ? en : he
}
