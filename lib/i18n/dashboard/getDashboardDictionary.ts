import { dashboardHe } from './he'
import { dashboardEn } from './en'
import { dashboardEs } from './es'
import { dashboardPtBR } from './pt-BR'
import { deepMergeDictionary } from './merge'
import type { PublicLocale } from '../locales'
import type { DashboardDictionary } from './he'

/**
 * Spanish is ENGLISH with the translated sections laid over it, merged once here
 * rather than per render. Anything es.ts has not reached yet is therefore English
 * — see lib/i18n/dashboard/merge.ts for why that is the right fallback and
 * lib/i18n/dashboard/__qa__/spanish-dashboard.qa.ts for the coverage count.
 *
 * Brazilian Portuguese is the same arrangement, and it is now COMPLETE: pt-BR/
 * is a directory of parts, each owning whole sections, assembled by a flat
 * spread in pt-BR/index.ts. It answers every path the Spanish dictionary
 * answers, so the English underneath is a safety net rather than something a
 * Portuguese reader meets. lib/i18n/dashboard/__qa__/portuguese-dashboard.qa.ts
 * holds that claim, leaf for leaf.
 */
const dashboardEsMerged = deepMergeDictionary(dashboardEn as unknown as DashboardDictionary, dashboardEs)
const dashboardPtMerged = deepMergeDictionary(dashboardEn as unknown as DashboardDictionary, dashboardPtBR)

const DICTIONARIES = {
  he: dashboardHe,
  en: dashboardEn as unknown as DashboardDictionary,
  es: dashboardEsMerged,
  'pt-BR': dashboardPtMerged,
} satisfies Record<PublicLocale, DashboardDictionary>

/**
 * The dictionary of a dashboard surface.
 *
 * It takes a `PublicLocale`, not the bilingual `Locale`: the WORDS on a screen
 * are the one thing that can be Spanish while the logic around them
 * (lib/i18n/locales.ts) still speaks of Hebrew or English. An unknown value
 * falls back to Hebrew, as it always did.
 */
export function getDashboardDictionary(locale: PublicLocale): DashboardDictionary {
  return DICTIONARIES[locale] || dashboardHe
}
