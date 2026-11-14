/**
 * The affiliate cluster's copy, one entry per public locale.
 *
 * The shape and the reasoning are in ./types. Each language is its own file
 * because the copy is written, not translated field by field: the Japanese page
 * opens on アフィリエイト and the Polish one on marketing afiliacyjny because
 * that is the word each market actually types.
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import type { AffiliateClusterCopy } from './types'
import { HE_CLUSTER } from './he'
import { EN_CLUSTER } from './en'
import { ES_CLUSTER } from './es'
import { PT_BR_CLUSTER } from './pt-BR'
import { FR_CLUSTER } from './fr'
import { IT_CLUSTER } from './it'
import { JA_CLUSTER } from './ja'
import { DE_CLUSTER } from './de'
import { NL_CLUSTER } from './nl'
import { PL_CLUSTER } from './pl'
import { KO_CLUSTER } from './ko'

export type { AffiliateClusterCopy, AffiliateClusterPage } from './types'

/** The two pages of the cluster, by the path segment each one lives at. */
export const AFFILIATE_CLUSTER_SLUGS = {
  marketing: 'affiliate-marketing',
  choosing: 'choosing-a-program',
} as const

export type AffiliateClusterKey = keyof typeof AFFILIATE_CLUSTER_SLUGS

export const AFFILIATE_CLUSTER: Record<PublicLocale, AffiliateClusterCopy> = {
  he: HE_CLUSTER,
  en: EN_CLUSTER,
  es: ES_CLUSTER,
  'pt-BR': PT_BR_CLUSTER,
  fr: FR_CLUSTER,
  it: IT_CLUSTER,
  ja: JA_CLUSTER,
  de: DE_CLUSTER,
  nl: NL_CLUSTER,
  pl: PL_CLUSTER,
  ko: KO_CLUSTER,
}

/** The path of a cluster page inside a language tree, after the locale prefix. */
export function affiliateClusterPath(key: AffiliateClusterKey): string {
  return `/affiliates/${AFFILIATE_CLUSTER_SLUGS[key]}`
}
