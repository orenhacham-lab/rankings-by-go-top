/**
 * THE LINKS FROM AN ARTICLE INTO THE PAGES THAT SELL THE PRODUCT.
 *
 * Measured over the 221 published articles on 21 Nov 2026: NOT ONE of them
 * linked to `/compare/*`, `/free-check` or `/ai-crawlers`, and four linked to a
 * `/features/*` page. In-body anchors averaged 1.0-1.5, and 209 of the 221 had
 * at most one — the trial link `lib/blog/auto/body-links.ts` adds. All the real
 * internal linking on this blog is the three-link "read also" block at the
 * foot, which points at other ARTICLES. So 26,170 impressions of blog traffic
 * had no path into the pages a reader decides on, and the pages that answer a
 * buying question got no internal links from the only part of the site that
 * publishes every day.
 *
 * THE RULE THIS MODULE OBEYS, which is the same one the body-link passes obey:
 * it never writes a sentence. It wraps a phrase the article already wrote, in
 * prose the article already has, and if the phrase is not there no link is
 * added. So it cannot change an article's meaning in any language, cannot
 * change its word count, and cannot change whether it passes a gate.
 *
 * It runs twice, deliberately:
 *   - at publish, inside `withBodyLinks`, so a new article ships with them;
 *   - at render, inside the article view, so the 221 pages already published
 *     gain them with no write to the database and nothing to backfill.
 *
 * WHY A PHRASE MAP AND NOT THE MODEL: the generator is given these pages as
 * optional anchors and ignores them (an anchor it is REQUIRED to place is
 * force-inserted in a sentence of its own, which reads badly under a byline).
 * A map is also the only form in which the choice is reviewable per language:
 * every phrase below is a term an article in that language actually writes.
 */
import { blockOfRun, isLinkableRun, textRuns, tokenizeHtml } from '@/lib/articles/bare-urls'
import { getLocaleHref, type PublicLocale } from '@/lib/i18n/locales'

export interface ProductLinkTarget {
  /**
   * The page as a HEBREW-canonical path. `getLocaleHref` puts it under the
   * article's own language, so a Japanese article links the Japanese page.
   */
  path: string
  /**
   * Phrases written the same way in every language: product names, bot tokens
   * and the technical terms that are not translated. These carry no
   * translation risk at all, which is why the map leans on them.
   */
  universal?: string[]
  /** Phrases per language. A language with no entry simply gets no link here. */
  perLocale?: Partial<Record<PublicLocale, string[]>>
}

/**
 * THE MAP, IN PRIORITY ORDER: the first target whose phrase is in the article
 * wins the slot. The order is most-specific-first on purpose — a competitor's
 * name or a crawler token is a precise signal of what the reader is doing,
 * while "internal links" is a topic many articles touch in passing.
 */
export const PRODUCT_LINK_TARGETS: readonly ProductLinkTarget[] = [
  // ── the free assets, which are what a reader actually clicks ──────────────
  {
    path: '/ai-crawlers',
    universal: ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Claude-SearchBot', 'GPTBot', 'CCBot', 'llms.txt'],
  },
  // ── one page per competitor, and the competitor's name is the same word in
  //    every language, so these need no translation and cannot mistranslate ──
  { path: '/compare/semrush', universal: ['Semrush', 'SEMrush'] },
  { path: '/compare/yoast', universal: ['Yoast SEO', 'Yoast'] },
  { path: '/compare/rankmath', universal: ['Rank Math', 'RankMath'] },
  { path: '/compare/surfer', universal: ['Surfer SEO', 'SurferSEO'] },
  { path: '/compare/brightlocal', universal: ['BrightLocal'] },
  { path: '/compare/writesonic', universal: ['Writesonic'] },
  { path: '/compare/booster', universal: ['Booster SEO'] },
  // ── the features, each named by what an article in that language calls it ──
  {
    path: '/features/search-console',
    universal: ['Google Search Console', 'Search Console'],
    perLocale: { ja: ['サーチコンソール'] },
  },
  {
    path: '/features/keyword-research',
    universal: ['Keyword Planner'],
    perLocale: {
      he: ['מחקר מילות מפתח', 'מחקר ביטויים', 'נפח חיפוש'],
      en: ['keyword research', 'search volume'],
      es: ['investigación de palabras clave', 'volumen de búsqueda'],
      'pt-BR': ['pesquisa de palavras-chave', 'volume de busca'],
      fr: ['recherche de mots-clés', 'volume de recherche'],
      it: ['ricerca di parole chiave', 'volume di ricerca'],
      ja: ['キーワード調査', 'キーワードリサーチ', '検索ボリューム'],
      de: ['Keyword-Recherche', 'Suchvolumen'],
      nl: ['zoekwoordenonderzoek', 'zoekvolume'],
      pl: ['analiza słów kluczowych', 'badanie słów kluczowych', 'liczba wyszukiwań'],
      ko: ['키워드 리서치', '키워드 조사', '검색량'],
    },
  },
  {
    path: '/features/ai-visibility-tracking',
    universal: ['AI Overviews'],
    perLocale: {
      he: ['נראות ב-AI', 'מנועי AI', 'תשובות של ChatGPT'],
      en: ['AI visibility', 'AI search results', 'AI answers'],
      es: ['visibilidad en IA', 'respuestas de IA'],
      'pt-BR': ['visibilidade em IA', 'respostas de IA'],
      fr: ["visibilité dans l'IA", "réponses de l'IA"],
      it: ["visibilità nell'IA", 'risposte di IA'],
      ja: ['AI検索', 'AIの回答', 'AI での引用'],
      de: ['Sichtbarkeit in KI', 'KI-Antworten', 'KI-Suche'],
      nl: ['zichtbaarheid in AI', 'AI-antwoorden'],
      pl: ['widoczność w AI', 'odpowiedzi AI'],
      ko: ['AI 노출', 'AI 검색', 'AI 답변'],
    },
  },
  {
    path: '/features/google-business-profile',
    universal: ['Google Business Profile'],
    perLocale: {
      he: ['פרופיל העסק בגוגל', 'כרטיס העסק בגוגל'],
      es: ['Perfil de Empresa en Google'],
      'pt-BR': ['Perfil da Empresa no Google'],
      fr: ["fiche d'établissement"],
      it: ["profilo dell'attività su Google"],
      ja: ['Googleビジネスプロフィール', 'Google ビジネス プロフィール'],
      de: ['Google Unternehmensprofil'],
      nl: ['Google Bedrijfsprofiel'],
      pl: ['Profil Firmy w Google'],
      ko: ['Google 비즈니스 프로필', '구글 비즈니스 프로필'],
    },
  },
  {
    path: '/features/google-maps-rank-tracking',
    perLocale: {
      he: ['מיקום בגוגל מפות', 'דירוג בגוגל מפות'],
      en: ['local rank tracking', 'Google Maps rankings'],
      es: ['posiciones en Google Maps'],
      'pt-BR': ['posições no Google Maps'],
      fr: ['positions dans Google Maps'],
      it: ['posizioni su Google Maps'],
      ja: ['Googleマップの順位', 'Google マップの順位'],
      de: ['Rankings in Google Maps'],
      nl: ['posities in Google Maps'],
      pl: ['pozycje w Mapach Google'],
      ko: ['구글 지도 순위', 'Google 지도 순위'],
    },
  },
  {
    path: '/features/google-organic-rank-tracking',
    perLocale: {
      he: ['מעקב מיקומים', 'מעקב דירוגים', 'בדיקת מיקום בגוגל'],
      en: ['rank tracking', 'rank tracker', 'position tracking'],
      es: ['seguimiento de posiciones'],
      'pt-BR': ['monitoramento de posições', 'acompanhamento de posições'],
      fr: ['suivi des positions', 'suivi de positions'],
      it: ['monitoraggio delle posizioni', 'monitoraggio posizioni'],
      ja: ['検索順位の計測', '順位チェック', '順位計測'],
      de: ['Rankings überwachen', 'Positionen überwachen'],
      nl: ['posities volgen', 'positiemonitoring'],
      pl: ['monitorowanie pozycji', 'śledzenie pozycji'],
      ko: ['검색 순위 추적', '순위 추적'],
    },
  },
  {
    path: '/features/site-health-fixes',
    universal: ['Core Web Vitals', 'meta description'],
    perLocale: {
      he: ['תיאור מטא', 'טקסט חלופי', 'תגית כותרת'],
      en: ['title tag', 'alt text', 'technical SEO'],
      es: ['metadescripción', 'texto alternativo'],
      'pt-BR': ['meta descrição', 'texto alternativo'],
      fr: ['méta description', 'texte alternatif'],
      it: ['meta descrizione', 'testo alternativo'],
      ja: ['メタディスクリプション', '代替テキスト'],
      de: ['Meta-Beschreibung', 'Alt-Text'],
      nl: ['metabeschrijving', 'alt-tekst'],
      pl: ['meta opis', 'tekst alternatywny'],
      ko: ['메타 설명', '대체 텍스트'],
    },
  },
  {
    path: '/features/site-links',
    perLocale: {
      he: ['קישורים פנימיים'],
      en: ['internal linking', 'internal links'],
      es: ['enlaces internos'],
      'pt-BR': ['links internos'],
      fr: ['liens internes'],
      it: ['link interni'],
      ja: ['内部リンク'],
      de: ['interne Verlinkung', 'interne Links'],
      nl: ['interne links'],
      pl: ['linkowanie wewnętrzne', 'linki wewnętrzne'],
      ko: ['내부 링크'],
    },
  },
  {
    path: '/features/competitor-tracking',
    perLocale: {
      he: ['ניתוח מתחרים', 'בדיקת מתחרים'],
      en: ['competitor analysis', 'competitor research'],
      es: ['análisis de la competencia'],
      'pt-BR': ['análise da concorrência'],
      fr: ['analyse des concurrents'],
      it: ['analisi dei concorrenti'],
      ja: ['競合分析'],
      de: ['Wettbewerbsanalyse', 'Konkurrenzanalyse'],
      nl: ['concurrentieanalyse'],
      pl: ['analiza konkurencji'],
      ko: ['경쟁사 분석'],
    },
  },
  {
    path: '/features/google-maps-posts',
    perLocale: {
      he: ['פוסטים בגוגל מפות'],
      en: ['Google Maps posts'],
      ja: ['Googleマップへの投稿'],
      de: ['Beiträge im Google Unternehmensprofil'],
      nl: ['berichten in Google Bedrijfsprofiel'],
      pl: ['posty w Profilu Firmy'],
      ko: ['Google 지도 게시물'],
    },
  },
  {
    path: '/free-check',
    perLocale: {
      he: ['בדיקת אתר'],
      en: ['site audit', 'SEO audit'],
      es: ['auditoría SEO'],
      'pt-BR': ['auditoria de SEO'],
      fr: ['audit SEO'],
      it: ['audit SEO'],
      ja: ['サイト診断', 'SEO診断'],
      de: ['SEO-Audit'],
      nl: ['SEO-audit'],
      pl: ['audyt SEO'],
      ko: ['사이트 점검', 'SEO 점검'],
    },
  },
]

/** How many of these an article gets. Four would be crowding a 1,400-word page. */
export const MAX_PRODUCT_LINKS = 3

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Is this phrase written in a script where a word has edges?
 *
 * It decides how the phrase is matched, and getting it wrong breaks a language:
 * Japanese, Hebrew and Korean put no space around a word, so a letter-boundary
 * rule would refuse every legitimate match in them (`内部リンク` is always
 * flanked by letters). Latin script needs the opposite — without the boundary
 * rule, "AI search results" would match inside a longer word and "Yoast" inside
 * a URL slug.
 */
export const hasWordEdges = (phrase: string): boolean => !/[֐-׿　-鿿가-힯＀-￯]/.test(phrase)

/** The phrase as a pattern: bounded in Latin script, plain everywhere else. */
export function phrasePattern(phrase: string): RegExp {
  const body = escapeRe(phrase)
  return hasWordEdges(phrase)
    ? new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu')
    : new RegExp(body, 'iu')
}

/** Every phrase of a target in this language, longest first. */
export function phrasesFor(target: ProductLinkTarget, locale: PublicLocale): string[] {
  const all = [...(target.universal ?? []), ...(target.perLocale?.[locale] ?? [])]
  return [...new Set(all)].sort((a, b) => b.length - a.length)
}

/**
 * THE TOKENS OF AN FAQ QUESTION AND ANSWER, WHICH NOTHING MAY BE ADDED TO.
 *
 * `extractFaqSchema` (lib/articles/server.ts) reads an article's FAQ out of the
 * shape it is written in, `<p><strong>question</strong><br>answer</p>`, and the
 * answer it captures is a run of characters that are not `<`. An anchor placed
 * inside such an answer therefore does not merely sit there: that whole entry
 * stops matching and DISAPPEARS from the FAQPage schema. The extractor is being
 * made tolerant of inline tags in the same change, and this skip is the second
 * lock on the same door, because the cost of being wrong is a rich result we
 * already earn going quietly missing.
 */
const FAQ_PARAGRAPH = /^<p[^>]*>\s*<strong[^>]*>[^<]+<\/strong>\s*<br\s*\/?>/i

export function faqTokenIndexes(tokens: string[]): Set<number> {
  const skip = new Set<number>()
  let open = -1
  tokens.forEach((token, index) => {
    if (/^<p\b/i.test(token)) { open = index; return }
    if (!/^<\/p\s*>/i.test(token) || open < 0) return
    if (FAQ_PARAGRAPH.test(tokens.slice(open, index).join(''))) {
      for (let i = open; i <= index; i += 1) skip.add(i)
    }
    open = -1
  })
  return skip
}

/**
 * Link up to `MAX_PRODUCT_LINKS` phrases the article already wrote to the pages
 * that answer them, in the article's own language.
 *
 * What it will not touch: a heading, an existing link, code, the article's
 * first paragraph (the generator's own audit treats a link there as placed too
 * early), an FAQ question or answer, a paragraph that already took one of these
 * links, and any page this body already links to. Everything it does is
 * idempotent, so running it at publish and again at render adds nothing twice.
 */
export function withProductLinks(html: string, locale: PublicLocale, max = MAX_PRODUCT_LINKS): string {
  if (!html) return html
  let current = html
  const usedPaths = new Set<string>()
  // Paragraph numbers stay stable across the loop because nothing here ever
  // adds a `<p>`: an inline anchor cannot renumber the paragraphs around it.
  const usedParagraphs = new Set<number>()
  let added = 0

  for (const target of PRODUCT_LINK_TARGETS) {
    if (added >= max) break
    const href = getLocaleHref(target.path, locale)
    if (usedPaths.has(href)) continue
    // A page the article already points at — by hand, or because this pass
    // already ran over this body at publish — is not linked a second time.
    if (new RegExp(`href\\s*=\\s*"${escapeRe(href)}(?:[?#"])`, 'i').test(current)) continue

    const tokens = tokenizeHtml(current)
    const skip = faqTokenIndexes(tokens)
    const runs = textRuns(tokens).filter((run) =>
      isLinkableRun(run)
      && blockOfRun(run) !== null
      && run.paragraph !== 0
      && !skip.has(run.token)
      && !usedParagraphs.has(run.paragraph))

    let placed = false
    for (const phrase of phrasesFor(target, locale)) {
      if (placed) break
      const pattern = phrasePattern(phrase)
      for (const run of runs) {
        const hit = pattern.exec(run.text)
        if (!hit) continue
        const found = hit[0]
        const at = hit.index
        // The anchor text is the article's OWN words, which is the fix to the
        // other half of the defect: the "read also" anchors were the target's
        // full title, so the title appeared twice on the page and the anchor
        // said nothing about why a reader would follow it.
        tokens[run.token] = `${run.text.slice(0, at)}<a href="${href}">${found}</a>${run.text.slice(at + found.length)}`
        current = tokens.join('')
        usedPaths.add(href)
        usedParagraphs.add(run.paragraph)
        added += 1
        placed = true
        break
      }
    }
  }

  return current
}
