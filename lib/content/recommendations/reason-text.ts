/**
 * The customer-visible wording of a content recommendation, per content language.
 *
 * These sentences are DETERMINISTIC: the model's own prose never reaches the
 * customer (it can be malformed, or invent demand that research does not back), so
 * every reason the owner reads is composed from these frames plus structured
 * evidence. Keeping them in one place is what makes adding a language a single,
 * reviewable change instead of a hunt through five prompt files — and the
 * `Record<ContentLanguage, …>` makes a missing language a compile error.
 */
import type { ContentLanguage } from '@/lib/content/language'

export interface ReasonText {
  /** Brief-composed reason parts. */
  fillsGap: string
  freshAngle: string
  supportedByExisting: string
  /** Factual demand sentence; `volume` is already localized by the caller's locale. */
  demand: (query: string, volume: string) => string
  /** Used when the composed reason reads as truncated or malformed. */
  neutral: string
  /** Keyword-research provenance, shown with the volume it was found with. */
  foundInSearchData: (volume: string) => string
  /** A site-scan supporting topic with no reason of its own. */
  supportingTopic: string
  /** The locale tag used to group digits in the volume number. */
  numberLocale: string
}

export const REASON_TEXT: Record<ContentLanguage, ReasonText> = {
  he: {
    fillsGap: 'הנושא משלים פער תוכן בתחום שהעסק עוסק בו.',
    freshAngle: 'הנושא מוסיף זווית חדשה לצד תוכן קיים באתר.',
    supportedByExisting: 'הוא נתמך בעמודים ובמוצרים קיימים באתר.',
    demand: (query, volume) => `לפי מחקר מילות מפתח, ל"${query}" יש כ־${volume} חיפושים חודשיים.`,
    neutral: 'הנושא רלוונטי לתחום הפעילות של העסק ולביטויי החיפוש שנמצאו במחקר.',
    foundInSearchData: (volume) => `נמצא בנתוני חיפוש עם כ-${volume} חיפושים חודשיים`,
    supportingTopic: 'נושא משלים לפי נתוני האתר',
    numberLocale: 'he-IL',
  },
  en: {
    fillsGap: 'This topic fills a content gap in an area the business covers.',
    freshAngle: 'This topic adds a fresh angle alongside existing site content.',
    supportedByExisting: 'It is supported by existing site pages and products.',
    demand: (query, volume) => `Keyword research shows ~${volume} monthly searches for "${query}".`,
    neutral: 'The topic is relevant to the business and to the search terms found in research.',
    foundInSearchData: (volume) => `Found in search data with ~${volume} monthly searches`,
    supportingTopic: 'A supporting topic based on the site data',
    numberLocale: 'en-US',
  },
  es: {
    fillsGap: 'El tema cubre un vacío de contenido en un área de la que se ocupa el negocio.',
    freshAngle: 'El tema aporta un enfoque nuevo junto al contenido que ya hay en el sitio.',
    supportedByExisting: 'Se apoya en páginas y productos que ya existen en el sitio.',
    demand: (query, volume) => `Según la investigación de palabras clave, "${query}" tiene unas ${volume} búsquedas mensuales.`,
    neutral: 'El tema es relevante para la actividad del negocio y para los términos de búsqueda encontrados en la investigación.',
    foundInSearchData: (volume) => `Encontrado en los datos de búsqueda con unas ${volume} búsquedas mensuales`,
    supportingTopic: 'Tema complementario según los datos del sitio',
    numberLocale: 'es-ES',
  },
  'pt-BR': {
    fillsGap: 'O tema preenche uma lacuna de conteúdo em uma área de atuação do negócio.',
    freshAngle: 'O tema traz um ângulo novo ao lado do conteúdo que já existe no site.',
    supportedByExisting: 'Ele se apoia em páginas e produtos que já existem no site.',
    demand: (query, volume) => `Segundo a pesquisa de palavras-chave, "${query}" tem cerca de ${volume} buscas mensais.`,
    neutral: 'O tema é relevante para a atividade do negócio e para os termos de busca encontrados na pesquisa.',
    foundInSearchData: (volume) => `Encontrado nos dados de busca com cerca de ${volume} buscas mensais`,
    supportingTopic: 'Tema complementar segundo os dados do site',
    numberLocale: 'pt-BR',
  },
  fr: {
    fillsGap: "Ce sujet comble un manque de contenu dans un domaine que l'entreprise couvre.",
    freshAngle: 'Ce sujet apporte un angle nouveau à côté du contenu déjà présent sur le site.',
    supportedByExisting: "Il s'appuie sur des pages et des produits qui existent déjà sur le site.",
    demand: (query, volume) => `La recherche de mots-clés indique environ ${volume} recherches par mois pour « ${query} ».`,
    neutral: "Le sujet est pertinent pour l'activité de l'entreprise et pour les termes de recherche trouvés lors de la recherche de mots-clés.",
    foundInSearchData: (volume) => `Trouvé dans les données de recherche avec environ ${volume} recherches par mois`,
    supportingTopic: 'Un sujet complémentaire, établi à partir des données du site',
    numberLocale: 'fr-FR',
  },
  it: {
    fillsGap: 'Questo argomento colma una lacuna di contenuto in un ambito di cui si occupa l’attività.',
    freshAngle: 'Questo argomento aggiunge un punto di vista nuovo accanto ai contenuti già presenti sul sito.',
    supportedByExisting: 'Si appoggia a pagine e prodotti già presenti sul sito.',
    demand: (query, volume) => `La ricerca di parole chiave indica circa ${volume} ricerche al mese per «${query}».`,
    neutral: 'L’argomento è pertinente all’attività dell’azienda e ai termini di ricerca individuati nella ricerca di parole chiave.',
    foundInSearchData: (volume) => `Individuato nei dati di ricerca con circa ${volume} ricerche al mese`,
    supportingTopic: 'Un argomento complementare, individuato dai dati del sito',
    numberLocale: 'it-IT',
  },
  ja: {
    fillsGap: 'この事業が扱う分野で不足しているコンテンツを補うテーマです。',
    freshAngle: 'サイトにある既存のコンテンツに対して、新しい切り口を加えるテーマです。',
    supportedByExisting: 'サイト内の既存のページや商品が、このテーマを支えています。',
    demand: (query, volume) => `キーワード調査では、「${query}」の月間検索数は約${volume}件です。`,
    neutral: 'この事業の分野と、調査で見つかった検索語句の両方に関連するテーマです。',
    foundInSearchData: (volume) => `検索データで月間約${volume}件の検索が確認されました`,
    supportingTopic: 'サイトのデータにもとづく補完テーマ',
    numberLocale: 'ja-JP',
  },
}

/**
 * The demand sentence with the volume grouped for the content language, or '' when
 * there is no query to name. The query is nullable on the evidence record, and the
 * old inline templates interpolated it straight in — a missing one produced a reason
 * that read `"null"` to the owner. An empty string lets the caller drop the sentence.
 */
export function demandSentence(language: ContentLanguage, query: string | null | undefined, volume: number): string {
  const q = (query ?? '').trim()
  if (!q) return ''
  // The volume is NOT digit-grouped here: this sentence already reads this way on
  // live Hebrew recommendations, and grouping it would change copy customers see
  // for reasons that have nothing to do with adding a language.
  return REASON_TEXT[language].demand(q, String(volume))
}
