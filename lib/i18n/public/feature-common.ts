/**
 * What every feature page shares: the calls to action (the free site check
 * first, the trial second) and the reassurances under the hero, per language.
 * The trial length is read from the trial catalog, so no page can drift from it.
 */
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { authHref } from '@/lib/i18n/auth-href'
import type { PublicLocale } from '@/lib/i18n/locales'

const DAYS = TRIAL_CATALOG.days

export type FeatureCommon = {
  check: { label: string; href: string }
  trial: { label: string; href: string }
  pricing: { label: string; href: string }
  trust: string[]
  /** The closing band's line under its title. */
  closeBody: string
}

export const FEATURE_COMMON: Record<PublicLocale, FeatureCommon> = {
  he: {
    check: { label: 'בדקו את האתר בחינם', href: '/free-check' },
    trial: { label: `${DAYS} ימי ניסיון חינם`, href: authHref('signup', 'he') },
    pricing: { label: 'למחירים', href: '/pricing' },
    trust: [`${DAYS} ימי ניסיון חינם`, 'בלי כרטיס אשראי', 'ביטול בכל זמן'],
    closeBody: `הבדיקה החינמית מראה איפה האתר עומד, בלי הרשמה. או פתחו ${DAYS} ימי ניסיון, בלי כרטיס אשראי.`,
  },
  en: {
    check: { label: 'Check my site for free', href: '/en/free-check' },
    trial: { label: `Start a ${DAYS}-day free trial`, href: '/en/signup' },
    pricing: { label: 'See pricing', href: '/en/pricing' },
    trust: [`${DAYS}-day free trial`, 'No credit card', 'Cancel anytime'],
    closeBody: `The free check shows where your site stands, no signup needed. Or open a ${DAYS}-day trial, no credit card.`,
  },
  es: {
    check: { label: 'Analiza tu sitio gratis', href: '/es/free-check' },
    // Sign-up is a BILINGUAL surface: a Spanish reader is sent to its English
    // form, which is the one they can read, until the dashboard is translated.
    trial: { label: `Prueba gratis ${DAYS} días`, href: '/en/signup' },
    pricing: { label: 'Ver precios', href: '/es/pricing' },
    trust: [`${DAYS} días de prueba gratis`, 'Sin tarjeta de crédito', 'Cancela cuando quieras'],
    closeBody: `El análisis gratuito muestra cómo está tu sitio, sin registrarte. O abre una prueba de ${DAYS} días, sin tarjeta de crédito.`,
  },
}
