import { he, type PublicDictionary } from './public/he'
import { en } from './public/en'
import type { Locale } from './locales'

const DICTIONARIES: Record<Locale, PublicDictionary> = { he, en: en as unknown as PublicDictionary }

export function getPublicDictionary(locale: Locale): PublicDictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES.he
}

export type { PublicDictionary } from './public/he'
