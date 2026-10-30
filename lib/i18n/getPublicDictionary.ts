import { he, type PublicDictionary } from './public/he'
import { en } from './public/en'
import { es } from './public/es'
import { ptBR } from './public/pt-BR'
import { fr } from './public/fr'
import { it } from './public/it'
import { ja } from './public/ja'
import type { PublicLocale } from './locales'

const DICTIONARIES: Record<PublicLocale, PublicDictionary> = {
  he,
  en: en as unknown as PublicDictionary,
  es: es as unknown as PublicDictionary,
  'pt-BR': ptBR as unknown as PublicDictionary,
  fr: fr as unknown as PublicDictionary,
  it: it as unknown as PublicDictionary,
  ja: ja as unknown as PublicDictionary,
}

export function getPublicDictionary(locale: PublicLocale): PublicDictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES.he
}

export type { PublicDictionary } from './public/he'
