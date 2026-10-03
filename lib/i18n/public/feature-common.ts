/**
 * What every feature page shares: the calls to action (the free site check
 * first, the trial second) and the reassurances under the hero, per language.
 * The trial length is read from the trial catalog, so no page can drift from it.
 */
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { authHref } from '@/lib/i18n/auth-href'
import type { Locale } from '@/lib/i18n/locales'

const DAYS = TRIAL_CATALOG.days

export type FeatureCommon = {
  check: { label: string; href: string }
  trial: { label: string; href: string }
  pricing: { label: string; href: string }
  trust: string[]
  /** The closing band's line under its title. */
  closeBody: string
}

export const FEATURE_COMMON: Record<Locale, FeatureCommon> = {
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
}
