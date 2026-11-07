import { dashboardHe } from './he'
import { dashboardEn } from './en'
import { dashboardEs } from './es'
import { dashboardPtBR } from './pt-BR'
import { dashboardFr } from './fr'
import { dashboardIt } from './it'
import { dashboardJa } from './ja'
import { dashboardDe } from './de'
import { dashboardNl } from './nl'
import { dashboardPl } from './pl'
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
 *
 * French is the same arrangement again, assembled the same way from fr/ and
 * held to the same leaf-for-leaf claim by
 * lib/i18n/dashboard/__qa__/french-dashboard.qa.ts. Deriving each language from
 * English rather than from the language beside it is what keeps a translation
 * from being a translation of a translation.
 *
 * Italian and JAPANESE are that same arrangement once more, from it/ and ja/,
 * each held leaf for leaf by its own suite. Japanese is the first locale here
 * whose script has no spaces, so the words are read from the dictionary and the
 * measuring is done by lib/text/segment.ts, never by splitting on a space.
 *
 * GERMAN is the eighth locale and the same arrangement again, from de/, held
 * leaf for leaf by lib/i18n/dashboard/__qa__/german-dashboard.qa.ts. Its script
 * is Latin, so nothing in lib/text/segment.ts changes for it; what is specific
 * to German lives in the words themselves (formal Sie throughout, and prices
 * named in dollars rather than euros, because outside Israel this product
 * charges in USD and a euro figure on screen would be a price it does not
 * charge).
 *
 * DUTCH is the ninth locale and the same arrangement once more, from nl/, held
 * leaf for leaf by lib/i18n/dashboard/__qa__/dutch-dashboard.qa.ts. The USD
 * rule is the same as German's and matters as much: a Dutch consumer price has
 * to be the total payable, so a euro figure here would be a price this product
 * does not charge. What is specific to Dutch is in the words: formal "u"
 * throughout, common nouns in lower case (the opposite of German) and closed
 * compounds.
 *
 * POLISH is the tenth locale, from pl/, held by
 * lib/i18n/dashboard/__qa__/polish-dashboard.qa.ts. The USD rule is the same as
 * German's and Dutch's: a Polish consumer price has to be the total payable, so
 * a złoty figure here would be a price this product does not charge, and a euro
 * figure would be two currencies we do not charge. What is specific to Polish is
 * in the words: the formal register is third-person plural ("Państwo"), not a
 * pronoun bolted onto an imperative, so a sentence addressed to the reader is
 * rebuilt rather than translated word for word; and the product vocabulary is
 * native — pozycjonowanie, słowa kluczowe, widoczność — never the English term
 * with a Polish ending.
 */
const dashboardEsMerged = deepMergeDictionary(dashboardEn as unknown as DashboardDictionary, dashboardEs)
const dashboardPtMerged = deepMergeDictionary(dashboardEn as unknown as DashboardDictionary, dashboardPtBR)
const dashboardFrMerged = deepMergeDictionary(dashboardEn as unknown as DashboardDictionary, dashboardFr)
const dashboardItMerged = deepMergeDictionary(dashboardEn as unknown as DashboardDictionary, dashboardIt)
const dashboardJaMerged = deepMergeDictionary(dashboardEn as unknown as DashboardDictionary, dashboardJa)
const dashboardDeMerged = deepMergeDictionary(dashboardEn as unknown as DashboardDictionary, dashboardDe)
const dashboardNlMerged = deepMergeDictionary(dashboardEn as unknown as DashboardDictionary, dashboardNl)
const dashboardPlMerged = deepMergeDictionary(dashboardEn as unknown as DashboardDictionary, dashboardPl)

const DICTIONARIES = {
  he: dashboardHe,
  en: dashboardEn as unknown as DashboardDictionary,
  es: dashboardEsMerged,
  'pt-BR': dashboardPtMerged,
  fr: dashboardFrMerged,
  it: dashboardItMerged,
  ja: dashboardJaMerged,
  de: dashboardDeMerged,
  nl: dashboardNlMerged,
  pl: dashboardPlMerged,
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
