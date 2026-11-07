/**
 * The AI-visibility question suggested for a published article.
 *
 * Built from a template and the article's primary keyword: no model call, no
 * provider call, no quota. It is only a SUGGESTION — nothing is written until
 * the owner clicks "track", which goes through the existing prompt-creation
 * route (/api/ai-visibility/prompts). Running a check on it later is the
 * existing, quota-checked flow; this file never runs one.
 *
 * The question is conversational and never names the brand: a question that
 * names the business measures whether engines repeat the name back, not whether
 * they cite the article to someone who does not know it yet.
 */

import { normalizeContentLanguage, type ContentLanguage } from './language'

/** Alias kept for the existing importers; the content language is one type. */
export type SuggestionLanguage = ContentLanguage

export interface AiQuerySuggestionInput {
  /** The topic's primary keyword. The title is used only when there is none. */
  keyword: string | null | undefined
  title?: string | null
  language: string | null | undefined
  /** Business name, project name, domain: any of these in the question drops it. */
  brandTerms?: (string | null | undefined)[]
}

const QUESTION_START: Record<SuggestionLanguage, RegExp> = {
  he: /^(?:מה|מהו|מהי|מהם|מהן|איך|כיצד|למה|מדוע|כמה|איפה|היכן|מתי|האם|איזה|איזו|אילו|מי)(?:\s|$)/,
  en: /^(?:what|how|why|which|where|when|who|is|are|can|should|do|does)\b/i,
  es: /^(?:qu[ée]|c[oó]mo|por\s+qu[ée]|cu[áa]l|cu[áa]les|d[oó]nde|cu[áa]ndo|qui[ée]n|cu[áa]nto|cu[áa]nta|cu[áa]ntos|cu[áa]ntas|es|son|puedo|debo|hay|conviene|sirve|vale)\b/i,
  'pt-BR': /^(?:o\s+que|que|como|por\s+que|qual|quais|onde|quando|quem|quanto|quanta|quantos|quantas|[ée]|s[ãa]o|posso|devo|vale|existe|h[áa]|serve|precisa)\b/i,
  fr: /^(?:qu['’]est-ce|que|quoi|comment|pourquoi|quel|quelle|quels|quelles|o[ùu]|quand|qui|combien|est-ce|sont|puis-je|dois-je|faut-il|y\s+a-t-il|vaut-il)\b/i,
  it: /^(?:che\s+cosa|cosa|che|come|perch[éè]|quale|quali|dove|quando|chi|quanto|quanta|quanti|quante|[èe]|sono|posso|devo|bisogna|conviene|serve|vale|esiste|ci\s+sono)\b/i,
  // Japanese asks at the END of the clause, so this one is anchored at the end:
  // 「か」「ですか」「とは」「？」. The leading interrogatives are listed too, because
  // 「なぜ…」 and 「どのように…」 do open a question.
  ja: /(?:か|ですか|ますか|でしょうか|とは|？|\?)\s*$|^(?:なぜ|どう|どのように|どうやって|いくら|どこ|いつ|どれ|どの|何|なに)/,
  de: /^(?:was|wie|warum|wieso|weshalb|welche|welcher|welches|wo|woher|wann|wer|wie\s+viel|wie\s+viele|wie\s+lange|ist|sind|kann|kann\s+man|muss|muss\s+man|soll|sollte|darf|lohnt|braucht|gibt)\b/i,
  nl: /^(?:wat|hoe|hoeveel|hoelang|hoe\s+lang|hoe\s+veel|waarom|waardoor|waarvoor|welke|welk|waar|waarvandaan|wanneer|wie|is|zijn|kan|kun\s+je|kan\s+je|moet|moet\s+je|mag|loont|heb\s+je|bestaat|bestaan)\b/i,
  // Polish inflects its interrogatives by case and gender, so the stems are
  // listed with \w*: "jaki/jaka/jakie/jakiego", "ktory/ktora/ktore/ktorego",
  // "ile/ilu". "czy" is the yes-no particle that opens a Polish question with no
  // English counterpart, and "warto" / "mozna" / "trzeba" open the impersonal
  // questions a Polish searcher actually types ("warto kupic...").
  pl: /^(?:co|jak|jaki\w*|jaka|jakie\w*|dlaczego|czemu|kt[óo]r\w+|gdzie|sk[ąa]d|kiedy|kto|kogo|komu|ile|ilu|czy|po\s+co|na\s+co|warto|czy\s+warto|mo[żz]na|trzeba|opłaca)\b/i,
}

/** "best / recommended" words: the question asks for a recommendation. */
const RECOMMEND: Record<SuggestionLanguage, RegExp> = {
  he: /(?:^|\s)(?:הכי\s+טוב\S*|מומלצ\S*|הטוב\S*\s+ביותר|טופ)(?:\s|$)/,
  en: /\b(?:best|top|recommended)\b/i,
  es: /\b(?:mejor|mejores|recomendad\w*|top)\b/i,
  'pt-BR': /\b(?:melhor|melhores|recomendad\w*|top)\b/i,
  fr: /\b(?:meilleur\w*|recommand\w*|top)\b/i,
  it: /\b(?:migliore|migliori|miglior|consigliat\w*|raccomandat\w*|top)\b/i,
  // No \b in Japanese: there is no word boundary to anchor to.
  ja: /(?:おすすめ|オススメ|お勧め|お薦め|人気|最適|ベスト|一番|最高)/,
  de: /\b(?:best\w*|empfehl\w*|empfohlen\w*|top|testsieger)\b/i,
  // Dutch superlatives inflect ('beste', 'beter'), and 'aanrader' is the noun a
  // Dutch reviewer reaches for where English says "a must". 'tip' is deliberately
  // absent: it is also the ordinary word for a hint and would match everywhere.
  nl: /\b(?:best\w*|beter\w*|aanbevol\w*|aanbevel\w*|aanrader\w*|aanraden|top|getest)\b/i,
  // "najlepszy" inflects in every case and gender, hence the stem. "polec\w*"
  // covers "polecany", "polecane" and "godny polecenia"; it also catches
  // "polecenie" in its unrelated sense of an instruction, which costs nothing
  // here because a false positive only picks the recommendation template.
  pl: /\b(?:najleps\w*|polec\w*|rekomend\w*|ranking|top|testowan\w*)\b/i,
}

/** A keyword that already names the act of buying ("buying X", "buy X"). */
const BUY: Record<SuggestionLanguage, RegExp> = {
  he: /^(?:קניית|קנייה של|רכישת|הזמנת)\s/,
  en: /^(?:buy|buying|order|ordering)\s/i,
  es: /^(?:comprar|compra de|comprando|pedir|encargar|contratar)\s/i,
  'pt-BR': /^(?:comprar|compra de|comprando|pedir|encomendar|contratar)\s/i,
  fr: /^(?:acheter|achat d['’e]|commander|commande d['’e]|louer|souscrire)\s?/i,
  it: /^(?:comprare|acquistare|acquisto di|ordinare|ordine di|noleggiare|sottoscrivere)\s/i,
  // Japanese names the act of buying as a SUFFIX on the noun (「ノートパソコンの
  // 購入」, 「車を買う」), never as a word before it, so this pattern is anchored at
  // the end where the others are anchored at the start.
  ja: /(?:の購入|を購入|購入|を買う|の注文|を注文|のレンタル|を借りる|の申し込み|を申し込む)\s*$/,
  // German names the act of buying either as a verb before the noun ("Laptop
  // kaufen" puts it AFTER, "Kauf eines Laptops" before), so both ends are
  // covered: the separable-verb form that ends the phrase, and the noun form
  // that opens it.
  de: /^(?:kaufen|kauf\s+(?:von|eines|einer)|bestellen|bestellung\s+(?:von|eines|einer)|mieten|miete\s+(?:von|eines|einer)|buchen)\s|\s(?:kaufen|bestellen|mieten|buchen)\s*$/i,
  // Dutch puts the buying verb at the END of the phrase ('laptop kopen'), the way
  // German's separable form does, and the noun form at the front ('koop van',
  // 'huur van'). Both ends are covered, and 'laten installeren' is included
  // because a Dutch service query is almost always phrased that way.
  nl: /^(?:kopen|koop\s+van|bestellen|bestelling\s+van|huren|huur\s+van|boeken|aanschaffen)\s|\s(?:kopen|bestellen|huren|boeken|aanschaffen|laten\s+installeren|laten\s+plaatsen)\s*$/i,
  // Polish keeps the buying word FIRST, unlike German and Dutch: "zakup
  // laptopa", "kupno mieszkania", "kupic laptopa". The noun that follows is in
  // the genitive, which is why nothing here tries to rebuild the phrase.
  pl: /^(?:kupi[ćc]|kupno|zakup\w*|zam[óo]wi[ćc]|zam[óo]wienie|wynaj[ąa][ćc]|wynajem|wypo[żz]yczy[ćc]|montaż|instalacja)\s/i,
}

const TEMPLATES: Record<SuggestionLanguage, { recommend: (k: string) => string; buy: (k: string) => string; general: (k: string) => string }> = {
  he: {
    recommend: (k) => `אשמח להמלצה: ${k}. מה כדאי לבחור?`,
    buy: (k) => `מה חשוב לבדוק לפני ${k}?`,
    general: (k) => `מה חשוב לדעת על ${k}?`,
  },
  en: {
    recommend: (k) => `I'm looking for the ${k.replace(/^the\s+/i, '')}. What would you recommend?`,
    buy: (k) => `What should I check before ${k.replace(/^buy\s/i, 'buying ').replace(/^order\s/i, 'ordering ')}?`,
    general: (k) => `What should I know about ${k}?`,
  },
  es: {
    recommend: (k) => `Busco ${k.replace(/^el\s+|^la\s+|^los\s+|^las\s+/i, '')}. ¿Qué me recomiendas?`,
    buy: (k) => `¿Qué debo revisar antes de ${k.replace(/^compra de\s/i, 'comprar ')}?`,
    general: (k) => `¿Qué debo saber sobre ${k}?`,
  },
  'pt-BR': {
    recommend: (k) => `Estou procurando ${k.replace(/^o\s+|^a\s+|^os\s+|^as\s+/i, '')}. O que você recomenda?`,
    buy: (k) => `O que devo verificar antes de ${k.replace(/^compra de\s/i, 'comprar ')}?`,
    general: (k) => `O que devo saber sobre ${k}?`,
  },
  ja: {
    // Plain 丁寧体 questions, the way a Japanese user actually types one into an
    // assistant: no particle is inserted before the keyword, because a Japanese
    // noun needs none, and the question word ends the sentence.
    recommend: (k) => `${k}を探しています。おすすめはどれですか？`,
    buy: (k) => `${k}の前に確認しておくべきことは何ですか？`,
    general: (k) => `${k}について知っておくべきことは何ですか？`,
  },
  fr: {
    recommend: (k) => `Je cherche ${k.replace(/^le\s+|^la\s+|^les\s+|^l['’]/i, '')}. Que me conseillez-vous ?`,
    buy: (k) => `Que faut-il vérifier avant ${k.replace(/^achat d['’]/i, 'd’acheter ').replace(/^acheter\s/i, 'd’acheter ')} ?`,
    general: (k) => `Que faut-il savoir sur ${k} ?`,
  },
  it: {
    recommend: (k) => `Sto cercando ${k.replace(/^il\s+|^lo\s+|^la\s+|^i\s+|^gli\s+|^le\s+|^l['’]/i, '')}. Che cosa consigliate?`,
    buy: (k) => `Che cosa conviene verificare prima di ${k.replace(/^acquisto di\s/i, 'acquistare ').replace(/^ordine di\s/i, 'ordinare ')}?`,
    general: (k) => `Che cosa è utile sapere su ${k}?`,
  },
  nl: {
    recommend: (k) => `Ik zoek ${k.replace(/^de\s+|^het\s+|^een\s+/i, '')}. Wat zou u aanraden?`,
    buy: (k) => `Waar moet ik op letten voordat ik ${k.replace(/^koop\s+van\s/i, '').replace(/\skopen\s*$/i, '')} koop?`,
    general: (k) => `Wat moet ik weten over ${k}?`,
  },
  de: {
    recommend: (k) => `Ich suche ${k.replace(/^der\s+|^die\s+|^das\s+|^ein\s+|^eine\s+/i, '')}. Was würden Sie empfehlen?`,
    buy: (k) => `Was sollte ich prüfen, bevor ich ${k.replace(/^kauf\s+(?:von|eines|einer)\s/i, '').replace(/\skaufen\s*$/i, '')} kaufe?`,
    general: (k) => `Was sollte ich über ${k} wissen?`,
  },
  // Polish is the one language here where a template cannot put the keyword
  // inside a sentence: "o X" asks for the locative, "szukam X" for the
  // genitive, and the keyword arrives in the nominative. Declining it would
  // need a morphological analyser. So the keyword stays untouched before a
  // colon, which is how a Polish search query is written anyway, and the
  // question after the colon carries the whole grammar.
  pl: {
    recommend: (k) => `${k}: co warto wybrać?`,
    buy: (k) => `${k}: na co zwrócić uwagę przed zakupem?`,
    general: (k) => `${k}: co warto wiedzieć?`,
  },
}

const MIN_LEN = 3
const MAX_LEN = 160

const collapse = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()

export function suggestionLanguage(l: string | null | undefined): SuggestionLanguage {
  return normalizeContentLanguage(l)
}

/** Second-level suffixes and platform hosts that are never the brand part of a domain. */
const NOT_BRAND_LABELS = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'myshopify', 'wixsite', 'wordpress', 'blogspot', 'www'])

/** Words of a brand term worth checking: the term itself, and for a domain its brand label ("runshop.co.il" → "runshop"). */
function brandTokens(term: string): string[] {
  const lower = collapse(term).toLowerCase()
  const pieces = new Set<string>([lower])
  const host = lower.replace(/^https?:\/\//, '').split('/')[0]
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
    const labels = host.split('.').slice(0, -1).filter((l) => !NOT_BRAND_LABELS.has(l))
    const brand = labels[labels.length - 1]
    if (brand) pieces.add(brand.replace(/-+/g, ' '))
  }
  return [...pieces].filter((p) => p.length >= 3)
}

/** True when the text names the business (whole brand term, case-insensitive). */
export function mentionsBrand(text: string, brandTerms: (string | null | undefined)[] = []): boolean {
  const hay = ` ${collapse(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  for (const raw of brandTerms) {
    const term = collapse(raw)
    if (!term) continue
    for (const tok of brandTokens(term)) {
      const needle = ` ${tok.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
      if (needle.trim().length >= 3 && hay.includes(needle)) return true
    }
  }
  return false
}

/**
 * The suggested question, or null when there is nothing sound to suggest
 * (no keyword, a keyword that names the brand, or a result out of bounds).
 */
export function suggestAiQuery(input: AiQuerySuggestionInput): string | null {
  const lang = suggestionLanguage(input.language)
  const keyword = collapse(input.keyword).replace(/[?？!.]+$/, '')
  if (keyword.length < MIN_LEN) return null
  if (mentionsBrand(keyword, input.brandTerms)) return null

  let question: string
  if (QUESTION_START[lang].test(keyword)) question = `${keyword}?`
  else if (RECOMMEND[lang].test(keyword)) question = TEMPLATES[lang].recommend(keyword)
  else if (BUY[lang].test(keyword)) question = TEMPLATES[lang].buy(keyword)
  else question = TEMPLATES[lang].general(keyword)

  question = collapse(question)
  if (lang !== 'he') question = question.replace(/\p{L}/u, (c) => c.toUpperCase())
  if (question.length > MAX_LEN) return null
  if (mentionsBrand(question, input.brandTerms)) return null
  return question
}
