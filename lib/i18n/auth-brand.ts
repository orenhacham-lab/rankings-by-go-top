/**
 * The words of the brand panel beside the sign-in, sign-up and password forms
 * (components/auth/AuthShell.tsx), in both languages. The headline and the
 * trust line are the landing page's own (lib/i18n/public/landing-*.ts), so the
 * step from the landing page to the form reads as one product (w7 P1-9); what
 * is here is only what differs per form. Every line is something the product
 * does: no invented customers, totals or press.
 */

import type { PublicLocale } from './locales'

export type AuthBrandVariant = 'login' | 'signup' | 'recover'

export interface AuthBrandCopy {
  /** The small pill above the headline. */
  eyebrow: string
  /** Three short lines with a check each: what the account does for the visitor. */
  points: [string, string, string]
}

export const AUTH_BRAND: Record<PublicLocale, Record<AuthBrandVariant, AuthBrandCopy> & { glimpse: string; mobileTrust: [string, string] }> = {
  he: {
    login: {
      eyebrow: 'ברוכים השבים',
      points: [
        'המיקומים שלכם בגוגל ובגוגל מפות, במקום אחד',
        'תוכנית התוכן והמאמרים שלכם, מוכנים להמשך',
        'מה ChatGPT ו-Gemini אומרים על העסק',
      ],
    },
    signup: {
      // The form's own badge already says the trial length; the panel says what the product is.
      eyebrow: 'קידום בגוגל ובמנועי AI, במערכת אחת',
      points: [
        'בדיקה מלאה של האתר תוך דקות',
        'תוכנית תוכן לחודש, בנויה על הנישה שלכם',
        'מעקב מיקומים בגוגל ונראות במנועי AI',
      ],
    },
    recover: {
      eyebrow: 'חזרה לחשבון',
      points: [
        'הקישור נשלח רק לכתובת הרשומה בחשבון',
        'הקישור תקף לזמן קצר ולשימוש אחד',
        'הנתונים והפרויקטים שלכם נשארים כמו שהם',
      ],
    },
    glimpse: 'מילות מפתח במעקב',
    mobileTrust: ['בלי כרטיס אשראי', 'ביטול בכל רגע'],
  },
  en: {
    login: {
      eyebrow: 'Welcome back',
      points: [
        'Your Google and Google Maps positions, in one place',
        'Your content plan and articles, ready to pick up',
        'What ChatGPT and Gemini say about your business',
      ],
    },
    signup: {
      eyebrow: 'Google and AI search, in one platform',
      points: [
        'A full check of your site in minutes',
        'A month of content, planned around your niche',
        'Google rankings and AI visibility, tracked for you',
      ],
    },
    recover: {
      eyebrow: 'Back to your account',
      points: [
        'The link goes only to the address on the account',
        'It works once, for a short time',
        'Your data and projects stay exactly as they are',
      ],
    },
    glimpse: 'Tracked keywords',
    mobileTrust: ['No credit card', 'Cancel anytime'],
  },
  es: {
    login: {
      eyebrow: 'Bienvenido de nuevo',
      points: [
        'Tus posiciones en Google y Google Maps, en un solo lugar',
        'Tu plan de contenidos y tus artículos, listos para continuar',
        'Lo que ChatGPT y Gemini dicen de tu negocio',
      ],
    },
    signup: {
      eyebrow: 'Google y los buscadores con IA, en una sola plataforma',
      points: [
        'Un análisis completo de tu web en minutos',
        'Un mes de contenidos, planificado para tu sector',
        'Posiciones en Google y visibilidad en IA, con seguimiento',
      ],
    },
    recover: {
      eyebrow: 'Vuelve a tu cuenta',
      points: [
        'El enlace va solo a la dirección de la cuenta',
        'Sirve una vez y durante poco tiempo',
        'Tus datos y tus proyectos se quedan como están',
      ],
    },
    glimpse: 'Palabras clave en seguimiento',
    mobileTrust: ['Sin tarjeta de crédito', 'Cancela cuando quieras'],
  },
}
