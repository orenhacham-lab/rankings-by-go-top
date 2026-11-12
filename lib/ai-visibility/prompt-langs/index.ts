/**
 * The AI-visibility question banks for the live content languages that
 * `prompt-templates.ts` itself does not carry.
 *
 * `prompt-templates.ts` was written for Hebrew and English, then grew a Spanish
 * and a French arm inside its own if/else ladders. Six more languages went live
 * on the public site — pt-BR, Italian, Japanese, German, Dutch, Polish — and
 * every one of them answered ENGLISH questions, because `normalizeLanguage`
 * sent anything it did not recognize to 'en' (or, worse, to the Hebrew
 * fallback). A Brazilian merchant was shown "Reviews of {business}" and asked
 * to believe it was the question their customer types into ChatGPT.
 *
 * Adding six more arms to forty if/else ladders would have been forty times
 * six chances to get one of them wrong. So the new languages are DATA: each one
 * is a `LangPack`, the pack is the single thing `prompt-templates.ts` consults,
 * and the ladders it already had for he/en/es/fr are untouched. A language is
 * complete when its pack compiles — every field here is required unless its
 * comment says otherwise, so TypeScript, not a reviewer, is what notices a
 * missing bank or a missing label.
 *
 * Only TYPES come from `../prompt-templates`, so there is no runtime import
 * cycle: the type import is erased, and the value import points one way, from
 * the templates to this directory.
 */
import type {
  BusinessCategory,
  FallbackIntent,
  KeywordThemes,
  PromptIntent,
  QueryDef,
  ServiceLabelForms,
} from '../prompt-templates'

/** The content languages whose questions live in this directory. */
export type ExtraPromptLanguage = 'pt-BR' | 'it' | 'ja' | 'de' | 'nl' | 'pl'

export const EXTRA_PROMPT_LANGUAGES: ExtraPromptLanguage[] = [
  'pt-BR', 'it', 'ja', 'de', 'nl', 'pl',
]

/** The words a suggestion is wrapped in, in the language's own voice. */
export type PackReasonCopy = {
  category: (v: string) => string
  intent: (v: string) => string
  location: (v: string) => string
  themes: Partial<Record<keyof KeywordThemes, string>>
}

/** The five frames a tracked keyword is turned into a question with. */
export type PackKeywordFrames = {
  price: (kw: string) => string
  review: (kw: string) => string
  prePurchase: (kw: string) => string
  recommendation: (kw: string) => string
  local: (kw: string, city: string) => string
}

/** The generator's own words, the ones a customer reads beside a question. */
export type PackGenCopy = {
  insufficient: string
  review: string
  insufficientReason: string
  starter: string
  default_: string
  starterValue: string
}

/**
 * The "safe curated" frames — the four questions that are correct for any
 * business, used when there is too little context to pick from the bank.
 */
export type PackSafeCurated = {
  /** "How much does this service cost?" */
  price: (isService: boolean) => string
  /** "How do I choose a cleaning company?" — `label` is already inflected. */
  choose: (label: string) => string
  /** "Reviews of Acme" */
  reviews: (businessName: string) => string
  /** "Best cleaning companies in Berlin" */
  local: (label: string, city: string) => string
}

/** The reason line under a suggestion, one per branch the generator takes. */
export type PackValueReason = {
  commercial: string
  competitive: string
  local: string
  prePurchase: string
  recommendation: string
  frequent: string
  rare: string
}

/**
 * The quality filters, as data. Each entry is a reason to REJECT a question,
 * so an empty list is a language that rejects nothing — which is wrong but
 * safe, where a bad regex is neither.
 */
export type PackFilters = {
  /** A frame and the keyword both carried an intent word: "Quanto costa prezzo…". */
  doubledIntent: RegExp[]
  /** Matches a gift question, which may only fire for a gift-ish category. */
  gift: RegExp
  /** Three or more of these stacked reads as keyword stuffing. */
  stackedModifiers: string[]
  /** Phrasings that are grammatical but no human types them. */
  unnatural: RegExp[]
  /** `unnatural` entries that only apply to a product (non-service) category. */
  unnaturalForProducts: RegExp[]
}

/**
 * One language's complete contribution to the generator. Every field is read
 * by `prompt-templates.ts`; nothing here is decorative.
 */
export type LangPack = {
  /** BCP-47 tag, for the comment trail and for assertions in QA. */
  readonly code: ExtraPromptLanguage
  intentLabel: Record<PromptIntent, string>
  categoryLabel: Record<BusinessCategory, string>
  /** What an unknown category is called, e.g. "empresa". */
  genericCategoryLabel: string
  bank: Record<BusinessCategory, QueryDef[]>
  countryNames: Record<string, string>
  placeholder: { business: string; city: string }
  reason: PackReasonCopy
  keywordFrames: PackKeywordFrames
  genCopy: PackGenCopy
  /** Intent words stripped out of a keyword before it is framed as a question. */
  intentWords: ReadonlySet<string>
  /** Multi-word variants of the same, stripped before the single words are. */
  intentPhrases: readonly string[]
  /**
   * The category noun in the grammatical forms the frames need. Absent
   * categories fall back to the generic frames, exactly as `he`/`en` do when
   * `CATEGORY_SERVICE_LABELS` has no entry.
   */
  serviceLabels: Partial<Record<BusinessCategory, ServiceLabelForms>>
  /** One natural question for one intent, or null when it cannot be said. */
  intentQuestion: (
    intent: FallbackIntent,
    label: ServiceLabelForms,
    location: string | null
  ) => string | null
  safeCurated: PackSafeCurated
  /** Questions built around a real brand name. */
  nameQuestions: (
    businessName: string,
    label: ServiceLabelForms | null
  ) => Array<{ prompt: string; intent: PromptIntent }>
  /** "What is the difference between A and B?" */
  difference: (a: string, b: string) => string
  /** The guaranteed minimum — true for any business, naming none. */
  genericQuestions: readonly string[]
  /** Does this question carry commercial intent in its own words? */
  commercialPattern: RegExp
  /** Does it carry a location in its own words ("near me", "in my city")? */
  locationPattern: RegExp
  valueReason: PackValueReason
  /**
   * Phrasing buckets for the diversity cap. Without them every question in the
   * language lands in one bucket and the cap of one-per-phrasing cuts a set of
   * seven down to two. Checked in order; the first match wins.
   */
  phrasingBuckets: ReadonlyArray<{ bucket: string; test: RegExp }>
  /**
   * Stripped off the front of a question to get its keyword family (the cap key
   * that collapses "How much does X cost?" and "How do I choose X?" together).
   */
  familyPrefix: RegExp
  filters: PackFilters
  /**
   * What makes a price question invalid in this language. A price is asked OF
   * something, and a company is not a thing with a price: "How much does a
   * cleaning company cost?" is a question no customer asks, while "How much
   * does office cleaning cost?" is one they ask constantly. `priceQuestion`
   * recognizes a price question at all and `businessEntity` the company-shaped
   * subject that makes it nonsense; `isInvalidPriceQuestion` in
   * smart-question-keyword-enrichment.ts rejects a question matching both.
   */
  priceFilter: {
    priceQuestion: RegExp
    businessEntity: RegExp
  }
}

import { PT_BR_PACK } from './pt-br'
import { IT_PACK } from './it'
import { JA_PACK } from './ja'
import { DE_PACK } from './de'
import { NL_PACK } from './nl'
import { PL_PACK } from './pl'

/**
 * The registry. `prompt-templates.ts` reads this and nothing else from here:
 * `EXTRA_LANG_PACKS[lang]` is defined exactly for the languages whose copy
 * lives in this directory, and `undefined` for he/en/es/fr, which is how every
 * call site decides whether to take the pack path or its own original ladder.
 */
export const EXTRA_LANG_PACKS: Record<ExtraPromptLanguage, LangPack> = {
  'pt-BR': PT_BR_PACK,
  it: IT_PACK,
  ja: JA_PACK,
  de: DE_PACK,
  nl: NL_PACK,
  pl: PL_PACK,
}
