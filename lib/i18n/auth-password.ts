/**
 * Copy for the password-reset pages (/forgot-password, /reset-password and
 * their /en twins), both languages. Every outcome of lib/auth/password-reset.ts
 * has its own line here, so no provider text is ever shown.
 */
import type { Locale } from './locales'

export const PASSWORD_UI = {
  he: {
    subtitle: 'מעקב מיקומים בגוגל ונראות ב-AI',
    logoAlt: 'הלוגו של Go Top SEO',
    backToLogin: 'חזרה לכניסה',
    footer: {
      accessibility: 'נגישות',
      privacy: 'פרטיות',
      articles: 'מאמרים',
      accessibilityHref: '/accessibility',
      privacyHref: '/privacy',
      articlesHref: '/articles',
    },
    forgot: {
      heading: 'שכחתם את הסיסמה?',
      intro: 'הזינו את כתובת האימייל של החשבון, ונשלח אליה קישור לבחירת סיסמה חדשה.',
      emailLabel: 'כתובת אימייל',
      emailPlaceholder: 'you@example.com',
      submit: 'שליחת קישור לאיפוס',
      sentHeading: 'בדקו את תיבת הדואר',
      sent: (email: string) => `אם קיים חשבון עם הכתובת ${email}, שלחנו אליה קישור לבחירת סיסמה חדשה. הקישור תקף לזמן מוגבל. לא מוצאים? בדקו גם בתיקיית הספאם.`,
      sendAgain: 'שליחה לכתובת אחרת',
      invalidEmail: 'כתובת האימייל אינה תקינה',
      unavailable: 'לא הצלחנו לשלוח את הבקשה. בדקו את החיבור לאינטרנט ונסו שוב.',
      linkExpired: 'הקישור לאיפוס הסיסמה אינו תקין או שפג תוקפו. הזינו את כתובת האימייל כדי לקבל קישור חדש.',
    },
    reset: {
      heading: 'בחירת סיסמה חדשה',
      passwordLabel: 'סיסמה חדשה',
      confirmLabel: 'אימות הסיסמה החדשה',
      hint: 'לפחות 8 תווים',
      submit: 'שמירת הסיסמה',
      updated: 'הסיסמה עודכנה. מעבירים אתכם לחשבון…',
      requestNew: 'בקשת קישור חדש',
      err: {
        too_short: 'הסיסמה חייבת להכיל לפחות 8 תווים',
        mismatch: 'הסיסמאות אינן תואמות',
        same_password: 'הסיסמה החדשה זהה לקודמת. בחרו סיסמה אחרת.',
        weak_password: 'הסיסמה חלשה מדי. בחרו סיסמה ארוכה יותר, עם אותיות ומספרים.',
        link_expired: 'הקישור לאיפוס הסיסמה אינו תקין או שפג תוקפו. בקשו קישור חדש.',
        failed: 'לא הצלחנו לשמור את הסיסמה. נסו שוב.',
      },
    },
  },
  en: {
    subtitle: 'Google ranking & AI visibility tracking',
    logoAlt: 'Go Top SEO logo',
    backToLogin: 'Back to sign in',
    footer: {
      accessibility: 'Accessibility',
      privacy: 'Privacy',
      articles: 'Articles',
      accessibilityHref: '/en/accessibility',
      privacyHref: '/en/privacy',
      articlesHref: '/en/articles',
    },
    forgot: {
      heading: 'Forgot your password?',
      intro: "Enter your account's email address and we'll send you a link to choose a new password.",
      emailLabel: 'Email address',
      emailPlaceholder: 'you@example.com',
      submit: 'Send reset link',
      sentHeading: 'Check your inbox',
      sent: (email: string) => `If an account exists for ${email}, we've sent it a link to choose a new password. The link is valid for a limited time. Can't find it? Check your spam folder too.`,
      sendAgain: 'Use a different address',
      invalidEmail: 'Invalid email address',
      unavailable: "We couldn't send the request. Check your internet connection and try again.",
      linkExpired: 'This password reset link is invalid or has expired. Enter your email address to get a new one.',
    },
    reset: {
      heading: 'Choose a new password',
      passwordLabel: 'New password',
      confirmLabel: 'Confirm new password',
      hint: 'At least 8 characters',
      submit: 'Save password',
      updated: 'Your password has been updated. Taking you to your account…',
      requestNew: 'Request a new link',
      err: {
        too_short: 'Password must be at least 8 characters',
        mismatch: "The passwords don't match",
        same_password: 'The new password is the same as the old one. Choose a different one.',
        weak_password: 'This password is too weak. Choose a longer one with letters and numbers.',
        link_expired: 'This password reset link is invalid or has expired. Request a new one.',
        failed: "We couldn't save the password. Please try again.",
      },
    },
  },
} as const

export function passwordUi(locale: Locale) {
  return PASSWORD_UI[locale]
}
