/**
 * The five LIMIT lines a plan card shows — in the approved ORDER — its audience
 * LABEL and its audience DESCRIPTION, in both languages, derived from
 * PLAN_CATALOG and never written by hand on a page.
 *
 * WHY THIS EXISTS. The same five numbers were being retyped in four places: the
 * Hebrew list in lib/subscription.ts, the Hebrew and English lists in the
 * dashboard dictionaries, and the two public pricing pages. Three of the four
 * had already drifted from the catalog by the time this was written — the
 * dictionaries still promised "Up to 10 projects" and "20 articles" for
 * Advanced. A card that promises more than the server grants is not a display
 * bug; it is a commitment the product does not keep.
 *
 * THE AUDIENCE COPY LIVES HERE FOR THE SAME REASON. Each pricing page used to
 * carry its own hand-written PLAN_UI description. When Advanced dropped from 10
 * projects to 1, both of those sentences kept selling it as a multi-site plan —
 * "לעסקים בצמיחה עם כמה אתרים" / "For growing businesses with multiple sites" —
 * because nothing tied them to the catalog. Copy that contradicts the
 * entitlement is the same class of defect as a wrong number, so it is derived
 * from one place and guarded by a test.
 *
 * Numbers come from the catalog. Only the sentence FRAMES live here.
 *
 * THE LINES SAY "A MONTH", NOT "BILLING PERIOD". Every plan is billed monthly
 * (the cards and the checkout say "per month", annual billing does not exist),
 * and "billing period" is the engineers' word for it. A small-business owner
 * reads "a month". The same goes for "project" (a website, to the customer) and
 * for the two check quotas, whose lines now name what is checked. The underlying
 * period RESOLVER (lib/billing/usage-period.ts) is untouched; this is only what
 * the sentence calls it. lib/plans/__qa__/plan-copy-plain.qa.ts keeps the
 * jargon out and the article line first.
 *
 * PURE — no React, no database, no server-only import — so the public pricing
 * pages, the dashboard billing view and the server-side entitlement module can
 * all read it without pulling anything into a page bundle.
 */

import { MAX_ARTICLES_PER_WEEK_PER_SITE as PER_SITE } from '@/lib/content/automation/schedule'
import { PLAN_CATALOG, TRIAL_CATALOG, type PlanCode } from './catalog'
import type { PublicLocale } from '@/lib/i18n/locales'

/**
 * A plan capped at ONE website describes its allowances per account, because
 * "per website" would be noise where only one can exist. Above one, the
 * per-website scope is load-bearing and is stated. (The catalog and the code
 * call a website a "project"; a customer calls it a website, so every line
 * below says website.)
 */
function isSingleProject(code: PlanCode): boolean {
  return PLAN_CATALOG[code].maxProjects === 1
}

/**
 * A MULTI-SITE PLAN ALSO STATES ITS PER-SITE RATE, because the account-wide
 * total is not what any one website receives: no site takes more than one
 * article a working day (MAX_ARTICLES_PER_WEEK_PER_SITE). Without the clause
 * a Premium customer with a single website would read "50 a month" and get
 * around 21, so the number is templated from the same constant the scheduler
 * caps by and cannot drift from it.
 *
 * THE FIVE LIMIT LINES, each addressable by name so the ORDER can be a
 * decision rather than an accident of how the array was typed.
 *
 * WRITTEN FOR A SMALL-BUSINESS OWNER, NOT FOR AN ENGINEER. Three words used to
 * stand between the customer and the number: "billing period" (the plan is
 * monthly, so the line says "a month"), "project" (a website) and "Google
 * checks" / "AI checks" (nothing said what one is). The check lines now name
 * what is checked, and the one-sentence definition sits under the plan grid
 * (CHECKS_EXPLAINER below), so a visitor never has to guess what a "check" is.
 */
interface LimitLines { articles: string; projects: string; keywords: string; google: string; ai: string }

function limitLinesFor(code: PlanCode, locale: PublicLocale): LimitLines {
  const c = PLAN_CATALOG[code]
  const single = isSingleProject(code)
  // Spanish, for the /es pricing page. Same five lines, same order, same
  // numbers from the catalog: only the sentence frames are translated.
  if (locale === 'es') {
    return {
      articles: single
        ? `${c.maxArticlesPerPeriodAccountWide} artículos al mes, escritos y publicados en tu web automáticamente`
        : `${c.maxArticlesPerPeriodAccountWide} artículos al mes, escritos y publicados automáticamente, compartidos entre todas tus webs, hasta ${PER_SITE} a la semana por web`,
      projects: single ? '1 web' : `Hasta ${c.maxProjects} webs`,
      keywords: single
        ? `Seguimiento de hasta ${c.maxKeywordsPerProject} palabras clave`
        : `Seguimiento de hasta ${c.maxKeywordsPerProject} palabras clave por web`,
      google: single
        ? `Hasta ${c.maxGoogleChecksPerPeriodPerProject} comprobaciones de posición en Google al mes`
        : `Hasta ${c.maxGoogleChecksPerPeriodPerProject} comprobaciones de posición en Google al mes por web`,
      ai: single
        ? `Hasta ${c.maxAIChecksPerPeriodPerProject} comprobaciones de visibilidad en IA al mes`
        : `Hasta ${c.maxAIChecksPerPeriodPerProject} comprobaciones de visibilidad en IA al mes por web`,
    }
  }
  // Brazilian Portuguese, for the /pt-BR pricing page and the Portuguese
  // dashboard. Without this branch the function fell through to Hebrew, which
  // is what the live /pt-BR pricing page showed.
  if (locale === 'pt-BR') {
    return {
      articles: single
        ? `${c.maxArticlesPerPeriodAccountWide} artigos por mês, escritos e publicados no seu site automaticamente`
        : `${c.maxArticlesPerPeriodAccountWide} artigos por mês, escritos e publicados automaticamente, compartilhados entre todos os seus sites, até ${PER_SITE} por semana em cada site`,
      projects: single ? '1 site' : `Até ${c.maxProjects} sites`,
      keywords: single
        ? `Acompanhamento de até ${c.maxKeywordsPerProject} palavras-chave`
        : `Acompanhamento de até ${c.maxKeywordsPerProject} palavras-chave por site`,
      google: single
        ? `Até ${c.maxGoogleChecksPerPeriodPerProject} verificações de posição no Google por mês`
        : `Até ${c.maxGoogleChecksPerPeriodPerProject} verificações de posição no Google por mês em cada site`,
      ai: single
        ? `Até ${c.maxAIChecksPerPeriodPerProject} verificações de visibilidade em IA por mês`
        : `Até ${c.maxAIChecksPerPeriodPerProject} verificações de visibilidade em IA por mês em cada site`,
    }
  }
  // French, for the /fr pricing page and the French dashboard. Same five lines,
  // same order, same numbers from the catalog; vouvoiement throughout, because a
  // merchant is addressed as "vous". Without this branch the function fell
  // through to Hebrew, the way /pt-BR once did.
  if (locale === 'fr') {
    return {
      articles: single
        ? `${c.maxArticlesPerPeriodAccountWide} articles par mois, rédigés et publiés automatiquement sur votre site`
        : `${c.maxArticlesPerPeriodAccountWide} articles par mois, rédigés et publiés automatiquement, partagés entre tous vos sites, jusqu'à ${PER_SITE} par semaine et par site`,
      projects: single ? '1 site' : `Jusqu'à ${c.maxProjects} sites`,
      keywords: single
        ? `Suivi de ${c.maxKeywordsPerProject} mots-clés au maximum`
        : `Suivi de ${c.maxKeywordsPerProject} mots-clés au maximum par site`,
      google: single
        ? `Jusqu'à ${c.maxGoogleChecksPerPeriodPerProject} vérifications de position dans Google par mois`
        : `Jusqu'à ${c.maxGoogleChecksPerPeriodPerProject} vérifications de position dans Google par mois et par site`,
      ai: single
        ? `Jusqu'à ${c.maxAIChecksPerPeriodPerProject} vérifications de visibilité dans les IA par mois`
        : `Jusqu'à ${c.maxAIChecksPerPeriodPerProject} vérifications de visibilité dans les IA par mois et par site`,
    }
  }
  // Italian, for the /it pricing page and the Italian dashboard. Same five
  // lines, same order, same numbers from the catalog; impersonal and formal
  // throughout, the way an Italian merchant is addressed.
  if (locale === 'it') {
    return {
      articles: single
        ? `${c.maxArticlesPerPeriodAccountWide} articoli al mese, redatti e pubblicati automaticamente sul proprio sito`
        : `${c.maxArticlesPerPeriodAccountWide} articoli al mese, redatti e pubblicati automaticamente, condivisi fra tutti i propri siti, fino a ${PER_SITE} alla settimana per sito`,
      projects: single ? '1 sito' : `Fino a ${c.maxProjects} siti`,
      keywords: single
        ? `Monitoraggio di un massimo di ${c.maxKeywordsPerProject} parole chiave`
        : `Monitoraggio di un massimo di ${c.maxKeywordsPerProject} parole chiave per sito`,
      google: single
        ? `Fino a ${c.maxGoogleChecksPerPeriodPerProject} controlli di posizione su Google al mese`
        : `Fino a ${c.maxGoogleChecksPerPeriodPerProject} controlli di posizione su Google al mese per sito`,
      ai: single
        ? `Fino a ${c.maxAIChecksPerPeriodPerProject} controlli di visibilità nelle IA al mese`
        : `Fino a ${c.maxAIChecksPerPeriodPerProject} controlli di visibilità nelle IA al mese per sito`,
    }
  }
  // Japanese, for the /ja pricing page. Counters take their Japanese counter
  // word: 本 for articles, 件 for keywords and checks, サイト for websites, so
  // a plan card reads the way a Japanese price list reads.
  if (locale === 'ja') {
    return {
      articles: single
        ? `月${c.maxArticlesPerPeriodAccountWide}本の記事を作成し、サイトへ自動で公開`
        : `月${c.maxArticlesPerPeriodAccountWide}本の記事を作成し、自動で公開。すべてのサイトで共有し、1サイトあたり週${PER_SITE}本まで`,
      projects: single ? 'サイト1件' : `サイト${c.maxProjects}件まで`,
      keywords: single ? `キーワード${c.maxKeywordsPerProject}件まで計測` : `1サイトあたりキーワード${c.maxKeywordsPerProject}件まで計測`,
      google: single
        ? `月${c.maxGoogleChecksPerPeriodPerProject}件までのGoogle順位チェック`
        : `1サイトあたり月${c.maxGoogleChecksPerPeriodPerProject}件までのGoogle順位チェック`,
      ai: single
        ? `月${c.maxAIChecksPerPeriodPerProject}件までのAI可視性チェック`
        : `1サイトあたり月${c.maxAIChecksPerPeriodPerProject}件までのAI可視性チェック`,
    }
  }
  // Polish, for the /pl pricing page and the Polish dashboard. Same five lines,
  // same order, same numbers from the catalog. The register is "Państwa", the
  // third-person plural Polish uses for a formal "your", and the vocabulary is
  // native: słowa kluczowe for keywords, witryna for website, pozycja for a
  // ranking position. Without this branch the function fell through to HEBREW,
  // which is what the live /pt-BR pricing page once showed.
  if (locale === 'pl') {
    return {
      articles: single
        ? `${c.maxArticlesPerPeriodAccountWide} artykułów miesięcznie, pisanych automatycznie i publikowanych na Państwa witrynie`
        : `${c.maxArticlesPerPeriodAccountWide} artykułów miesięcznie, pisanych i publikowanych automatycznie, wspólnie dla wszystkich Państwa witryn, do ${PER_SITE} tygodniowo na witrynę`,
      projects: single ? '1 witryna' : `Do ${c.maxProjects} witryn`,
      keywords: single
        ? `Monitorowanie do ${c.maxKeywordsPerProject} słów kluczowych`
        : `Monitorowanie do ${c.maxKeywordsPerProject} słów kluczowych na witrynę`,
      google: single
        ? `Do ${c.maxGoogleChecksPerPeriodPerProject} sprawdzeń pozycji w Google miesięcznie`
        : `Do ${c.maxGoogleChecksPerPeriodPerProject} sprawdzeń pozycji w Google miesięcznie na witrynę`,
      ai: single
        ? `Do ${c.maxAIChecksPerPeriodPerProject} sprawdzeń widoczności w odpowiedziach AI miesięcznie`
        : `Do ${c.maxAIChecksPerPeriodPerProject} sprawdzeń widoczności w odpowiedziach AI miesięcznie na witrynę`,
    }
  }
  // Korean, for the /ko pricing page and the Korean dashboard. Without this
  // branch the function fell through to HEBREW — the same bug the live /pt-BR
  // pricing page once showed, and it was live in the Korean work until this
  // branch was written: the five lines on /ko/pricing and on the dashboard's
  // plan cards were Hebrew.
  //
  // The counters are the Korean ones, and they are the whole translation
  // problem here: Korean has NO grammatical plural, so a count is marked by a
  // COUNTER attached to the numeral — 개 for an article, a site or a keyword,
  // 회 for a check performed. Writing the bare numeral, which a translator
  // coming from a European language does, reads as unfinished Korean. 합니다체
  // is not used on these lines because they are LABELS rather than sentences:
  // a Korean price list ends each line in a noun.
  if (locale === 'ko') {
    return {
      articles: single
        ? `매월 글 ${c.maxArticlesPerPeriodAccountWide}개를 자동으로 작성해 사이트에 게시`
        : `매월 글 ${c.maxArticlesPerPeriodAccountWide}개를 자동으로 작성해 게시, 계정의 모든 사이트가 함께 사용하며 사이트당 주 ${PER_SITE}개까지`,
      projects: single ? '사이트 1개' : `사이트 ${c.maxProjects}개까지`,
      keywords: single
        ? `키워드 ${c.maxKeywordsPerProject}개까지 순위 추적`
        : `사이트당 키워드 ${c.maxKeywordsPerProject}개까지 순위 추적`,
      google: single
        ? `매월 Google 순위 확인 ${c.maxGoogleChecksPerPeriodPerProject}회까지`
        : `사이트당 매월 Google 순위 확인 ${c.maxGoogleChecksPerPeriodPerProject}회까지`,
      ai: single
        ? `매월 AI 가시성 확인 ${c.maxAIChecksPerPeriodPerProject}회까지`
        : `사이트당 매월 AI 가시성 확인 ${c.maxAIChecksPerPeriodPerProject}회까지`,
    }
  }
  // Dutch, for the /nl pricing page and the Dutch dashboard. Same five lines,
  // same order, same numbers from the catalog; "u" throughout and the Dutch
  // word for keywords, zoekwoorden, which is what Dutch searchers type. Without
  // this branch the function fell through to HEBREW, which is what the live
  // /pt-BR pricing page once showed — the same bug, in Dutch.
  if (locale === 'nl') {
    return {
      articles: single
        ? `${c.maxArticlesPerPeriodAccountWide} artikelen per maand, automatisch geschreven en op uw website gepubliceerd`
        : `${c.maxArticlesPerPeriodAccountWide} artikelen per maand, automatisch geschreven en gepubliceerd, door al uw websites samen gebruikt, tot ${PER_SITE} per week per website`,
      projects: single ? '1 website' : `Tot ${c.maxProjects} websites`,
      keywords: single
        ? `Monitoring van tot ${c.maxKeywordsPerProject} zoekwoorden`
        : `Monitoring van tot ${c.maxKeywordsPerProject} zoekwoorden per website`,
      google: single
        ? `Tot ${c.maxGoogleChecksPerPeriodPerProject} positiecontroles in Google per maand`
        : `Tot ${c.maxGoogleChecksPerPeriodPerProject} positiecontroles in Google per maand per website`,
      ai: single
        ? `Tot ${c.maxAIChecksPerPeriodPerProject} controles van de zichtbaarheid in AI-antwoorden per maand`
        : `Tot ${c.maxAIChecksPerPeriodPerProject} controles van de zichtbaarheid in AI-antwoorden per maand per website`,
    }
  }
  // German, for the /de pricing page and the German dashboard. Same five lines,
  // same order, same numbers from the catalog; Sie throughout and nouns
  // capitalized. Without this branch the function fell through to HEBREW, which
  // is what the live /pt-BR pricing page once showed — the same bug, in German.
  if (locale === 'de') {
    return {
      articles: single
        ? `${c.maxArticlesPerPeriodAccountWide} Artikel pro Monat, automatisch geschrieben und auf Ihrer Website veröffentlicht`
        : `${c.maxArticlesPerPeriodAccountWide} Artikel pro Monat, automatisch geschrieben und veröffentlicht, von allen Ihren Websites gemeinsam genutzt, bis zu ${PER_SITE} pro Woche und Website`,
      projects: single ? '1 Website' : `Bis zu ${c.maxProjects} Websites`,
      keywords: single
        ? `Überwachung von bis zu ${c.maxKeywordsPerProject} Keywords`
        : `Überwachung von bis zu ${c.maxKeywordsPerProject} Keywords pro Website`,
      google: single
        ? `Bis zu ${c.maxGoogleChecksPerPeriodPerProject} Positionsprüfungen bei Google pro Monat`
        : `Bis zu ${c.maxGoogleChecksPerPeriodPerProject} Positionsprüfungen bei Google pro Monat und Website`,
      ai: single
        ? `Bis zu ${c.maxAIChecksPerPeriodPerProject} Prüfungen der Sichtbarkeit in KI-Antworten pro Monat`
        : `Bis zu ${c.maxAIChecksPerPeriodPerProject} Prüfungen der Sichtbarkeit in KI-Antworten pro Monat und Website`,
    }
  }
  if (locale === 'en') {
    return {
      // THE MAIN VALUE, and the first line of every plan: articles written and
      // published to the customer's site without them lifting a finger.
      articles: single
        ? `${c.maxArticlesPerPeriodAccountWide} articles a month, written and published to your website automatically`
        : `${c.maxArticlesPerPeriodAccountWide} articles a month, written and published automatically, shared across all your websites, up to ${PER_SITE} a week per website`,
      projects: single ? '1 website' : `Up to ${c.maxProjects} websites`,
      keywords: single ? `Track up to ${c.maxKeywordsPerProject} keywords` : `Track up to ${c.maxKeywordsPerProject} keywords per website`,
      google: single
        ? `Up to ${c.maxGoogleChecksPerPeriodPerProject} Google ranking checks a month`
        : `Up to ${c.maxGoogleChecksPerPeriodPerProject} Google ranking checks a month per website`,
      ai: single
        ? `Up to ${c.maxAIChecksPerPeriodPerProject} AI visibility checks a month`
        : `Up to ${c.maxAIChecksPerPeriodPerProject} AI visibility checks a month per website`,
    }
  }
  return {
    articles: single
      ? `${c.maxArticlesPerPeriodAccountWide} מאמרים בחודש, נכתבים ומתפרסמים באתר שלכם אוטומטית`
      : `${c.maxArticlesPerPeriodAccountWide} מאמרים בחודש, נכתבים ומתפרסמים אוטומטית, משותפים לכל האתרים שלכם, עד ${PER_SITE} בשבוע לכל אתר`,
    projects: single ? 'אתר אחד' : `עד ${c.maxProjects} אתרים`,
    keywords: single ? `מעקב אחרי עד ${c.maxKeywordsPerProject} מילות מפתח` : `מעקב אחרי עד ${c.maxKeywordsPerProject} מילות מפתח לכל אתר`,
    google: single
      ? `עד ${c.maxGoogleChecksPerPeriodPerProject} בדיקות מיקום בגוגל בחודש`
      : `עד ${c.maxGoogleChecksPerPeriodPerProject} בדיקות מיקום בגוגל בחודש לכל אתר`,
    ai: single
      ? `עד ${c.maxAIChecksPerPeriodPerProject} בדיקות נראות ב-AI בחודש`
      : `עד ${c.maxAIChecksPerPeriodPerProject} בדיקות נראות ב-AI בחודש לכל אתר`,
  }
}

/**
 * THE ORDER IS PART OF THE POSITIONING, not a formatting detail.
 *
 * The article line is FIRST on every plan. It is the product: a customer who
 * reads one line of a plan card should read that the site gets articles written
 * and published for it. Then how many websites, then what is tracked.
 *
 * Ordering lives HERE, once. A page that re-sorted the array itself would be
 * the same drift this module exists to prevent.
 */
export function planLimitLines(code: PlanCode, locale: PublicLocale): string[] {
  const l = limitLinesFor(code, locale)
  return [l.articles, l.projects, l.keywords, l.google, l.ai]
}

/** The article sentence on its own, for callers that want the sentence rather
 *  than an index into the array. */
export function planArticleLine(code: PlanCode, locale: PublicLocale): string {
  return limitLinesFor(code, locale).articles
}

/** Where the article sentence sits in `planLimitLines`: first on every plan. */
export function planArticleLineIndex(code: PlanCode): number {
  void code
  return 0
}

/**
 * WHAT A "CHECK" IS, in one sentence each, for the line under the plan grid
 * (both pricing pages) and the note under the dashboard's plan cards. The plan
 * lines name what is checked ("Google ranking checks", "AI visibility checks");
 * this says what one of them is, in the words a customer uses. Same definitions
 * as the "how usage is counted" section: a Google check is one keyword in one
 * place (Google or Google Maps), an AI check is one question to one AI engine.
 */
export const CHECKS_EXPLAINER: Record<PublicLocale, string> = {
  en: 'A Google ranking check looks up where one keyword appears in Google or Google Maps. An AI visibility check asks one AI engine one question, for example ChatGPT, and sees whether your business is mentioned in the answer.',
  he: 'בדיקת מיקום בגוגל בודקת איפה מילת מפתח אחת מופיעה בגוגל או בגוגל מפות. בדיקת נראות ב-AI שואלת מנוע AI אחד שאלה אחת, למשל ChatGPT, ובודקת אם העסק שלכם מוזכר בתשובה.',
  es: 'Una comprobación de posición en Google mira en qué puesto aparece una palabra clave en Google o en Google Maps. Una comprobación de visibilidad en IA hace una pregunta a un motor de IA, por ejemplo ChatGPT, y comprueba si tu negocio se menciona en la respuesta.',
  'pt-BR': 'Uma verificação de posição no Google olha em que lugar uma palavra-chave aparece no Google ou no Google Maps. Uma verificação de visibilidade em IA faz uma pergunta a um motor de IA, por exemplo o ChatGPT, e vê se o seu negócio é mencionado na resposta.',
  fr: "Une vérification de position dans Google regarde à quelle place un mot-clé apparaît dans Google ou dans Google Maps. Une vérification de visibilité dans les IA pose une question à un moteur d'IA, par exemple ChatGPT, et regarde si votre entreprise est citée dans la réponse.",
  it: 'Un controllo di posizione su Google verifica in quale posizione compare una parola chiave su Google o su Google Maps. Un controllo di visibilità nelle IA pone una domanda a un motore di IA, per esempio ChatGPT, e verifica se l\u2019attività viene citata nella risposta.',
  ja: 'Google順位チェックは、1つのキーワードがGoogleまたはGoogleマップの何位に表示されているかを調べます。AI可視性チェックは、ChatGPTなどのAIエンジン1つに質問を1件送り、その回答でお客様の事業が言及されているかを確認します。',
  de: 'Eine Google-Ranking-Prüfung sieht nach, auf welcher Position ein Keyword in Google oder in Google Maps erscheint. Eine Prüfung der KI-Sichtbarkeit stellt einem KI-Dienst, zum Beispiel ChatGPT, eine Frage und sieht nach, ob Ihr Unternehmen in der Antwort genannt wird.',
  pl: 'Sprawdzenie pozycji w Google ustala, na której pozycji dane słowo kluczowe pojawia się w Google lub w Mapach Google. Sprawdzenie widoczności w AI zadaje jednemu silnikowi AI, na przykład ChatGPT, jedno pytanie i sprawdza, czy w odpowiedzi wymieniona jest Państwa firma.',
  nl: 'Een positiecontrole in Google kijkt op welke positie een zoekwoord in Google of in Google Maps verschijnt. Een controle van de AI-zichtbaarheid stelt één AI-engine, bijvoorbeeld ChatGPT, één vraag en kijkt of uw bedrijf in het antwoord genoemd wordt.',
  ko: 'Google 순위 확인은 키워드 하나가 Google 또는 Google 지도에서 몇 위에 나오는지 조회합니다. AI 가시성 확인은 ChatGPT 같은 AI 엔진 하나에 질문 하나를 보내고, 그 답변에서 내 업체가 언급되는지 봅니다.',
}

/**
 * The free trial's lines, in the same words and the same order as the paid
 * plans, from TRIAL_CATALOG. The trial allowances are for the whole trial, not
 * per month, and the lines say so.
 */
export function trialLimitLines(locale: PublicLocale): string[] {
  const t = TRIAL_CATALOG
  if (locale === 'es') {
    return [
      'Un artículo de prueba, desde la redacción hasta la publicación',
      '1 web',
      `Hasta ${t.maxKeywordsPerProject} palabras clave`,
      `Hasta ${t.maxGoogleChecksLifetime} comprobaciones de posición en Google durante la prueba`,
      `Hasta ${t.maxAIChecksLifetime} comprobaciones de visibilidad en IA durante la prueba`,
      `${t.days} días de prueba`,
    ]
  }
  if (locale === 'pt-BR') {
    return [
      'Um artigo para experimentar, da redação até a publicação',
      '1 site',
      `Até ${t.maxKeywordsPerProject} palavras-chave`,
      `Até ${t.maxGoogleChecksLifetime} verificações de posição no Google durante o teste`,
      `Até ${t.maxAIChecksLifetime} verificações de visibilidade em IA durante o teste`,
      `${t.days} dias de teste`,
    ]
  }
  if (locale === 'fr') {
    return [
      'Un article pour essayer, de la rédaction à la publication',
      '1 site',
      `Jusqu'à ${t.maxKeywordsPerProject} mots-clés`,
      `Jusqu'à ${t.maxGoogleChecksLifetime} vérifications de position dans Google pendant l'essai`,
      `Jusqu'à ${t.maxAIChecksLifetime} vérifications de visibilité dans les IA pendant l'essai`,
      `${t.days} jours d'essai`,
    ]
  }
  if (locale === 'it') {
    return [
      'Un articolo di prova, dalla redazione alla pubblicazione',
      '1 sito',
      `Fino a ${t.maxKeywordsPerProject} parole chiave`,
      `Fino a ${t.maxGoogleChecksLifetime} controlli di posizione su Google durante la prova`,
      `Fino a ${t.maxAIChecksLifetime} controlli di visibilità nelle IA durante la prova`,
      `${t.days} giorni di prova`,
    ]
  }
  if (locale === 'ja') {
    return [
      '記事1本をお試し。作成から公開まで',
      'サイト1件',
      `キーワード${t.maxKeywordsPerProject}件まで`,
      `トライアル期間中にGoogle順位チェック${t.maxGoogleChecksLifetime}件まで`,
      `トライアル期間中にAI可視性チェック${t.maxAIChecksLifetime}件まで`,
      `${t.days}日間のトライアル`,
    ]
  }
  if (locale === 'pl') {
    return [
      'Jeden artykuł na próbę, od napisania do publikacji',
      '1 witryna',
      `Do ${t.maxKeywordsPerProject} słów kluczowych`,
      `Do ${t.maxGoogleChecksLifetime} sprawdzeń pozycji w Google w okresie próbnym`,
      `Do ${t.maxAIChecksLifetime} sprawdzeń widoczności w odpowiedziach AI w okresie próbnym`,
      `${t.days} dni okresu próbnego`,
    ]
  }
  if (locale === 'nl') {
    return [
      'Eén artikel om te proberen, van het schrijven tot de publicatie',
      '1 website',
      `Tot ${t.maxKeywordsPerProject} zoekwoorden`,
      `Tot ${t.maxGoogleChecksLifetime} positiecontroles in Google tijdens de proefperiode`,
      `Tot ${t.maxAIChecksLifetime} controles van de zichtbaarheid in AI-antwoorden tijdens de proefperiode`,
      `${t.days} proefdagen`,
    ]
  }
  if (locale === 'de') {
    return [
      'Ein Artikel zum Ausprobieren, vom Schreiben bis zur Veröffentlichung',
      '1 Website',
      `Bis zu ${t.maxKeywordsPerProject} Keywords`,
      `Bis zu ${t.maxGoogleChecksLifetime} Positionsprüfungen bei Google während des Tests`,
      `Bis zu ${t.maxAIChecksLifetime} Prüfungen der Sichtbarkeit in KI-Antworten während des Tests`,
      `${t.days} Tage Test`,
    ]
  }
  // Korean. 일 is the counter for days, 개 for an article, a site or a keyword,
  // 회 for a check. The trial's own length comes from the catalog, so the seven
  // days a Korean reader sees here are the trial's days and NOT the seven-day
  // withdrawal right of 전자상거래법 art. 17(1), which only the legal documents
  // state.
  if (locale === 'ko') {
    return [
      '체험용 글 1개, 작성부터 게시까지',
      '사이트 1개',
      `키워드 ${t.maxKeywordsPerProject}개까지`,
      `체험 기간 동안 Google 순위 확인 ${t.maxGoogleChecksLifetime}회까지`,
      `체험 기간 동안 AI 가시성 확인 ${t.maxAIChecksLifetime}회까지`,
      `${t.days}일 체험`,
    ]
  }
  if (locale === 'en') {
    return [
      'One article to try, from writing to publishing',
      '1 website',
      `Up to ${t.maxKeywordsPerProject} keywords`,
      `Up to ${t.maxGoogleChecksLifetime} Google ranking checks during the trial`,
      `Up to ${t.maxAIChecksLifetime} AI visibility checks during the trial`,
      `${t.days}-day trial`,
    ]
  }
  return [
    'מאמר אחד לניסיון, מהכתיבה ועד הפרסום',
    'אתר אחד',
    `עד ${t.maxKeywordsPerProject} מילות מפתח`,
    `עד ${t.maxGoogleChecksLifetime} בדיקות מיקום בגוגל בתקופת הניסיון`,
    `עד ${t.maxAIChecksLifetime} בדיקות נראות ב-AI בתקופת הניסיון`,
    `${t.days} ימי ניסיון`,
  ]
}

/**
 * THE AUDIENCE LABEL — a short, understated line above each plan name saying
 * who the plan is for.
 *
 * This replaced two stacked, full-width audience SECTIONS. The sections carried
 * the same information but doubled the height of the pricing block, which
 * pushed Premium and Agency below the fold on a laptop: a visitor saw two plans
 * and had to discover the other two by scrolling. A per-card label keeps the
 * distinction and gives the four cards back their single row.
 *
 * Static text, no toggle: the split is editorial and identical for every
 * visitor, so interactive state, a URL parameter or a cookie would be
 * persistence bought for nothing.
 */
export const PLAN_AUDIENCE_LABEL: Record<PlanCode, Record<PublicLocale, string>> = {
  regular: { en: 'One website', he: 'לאתר אחד', es: 'Para una web', 'pt-BR': 'Para um site', fr: 'Pour un site', it: 'Per un sito', ja: 'サイト1件向け', de: 'Eine Website', nl: 'Eén website', pl: 'Jedna witryna', ko: '사이트 한 개' },
  advanced: { en: 'One website', he: 'לאתר אחד', es: 'Para una web', 'pt-BR': 'Para um site', fr: 'Pour un site', it: 'Per un sito', ja: 'サイト1件向け', de: 'Eine Website', nl: 'Eén website', pl: 'Jedna witryna', ko: '사이트 한 개' },
  premium: { en: 'Multiple websites', he: 'למספר אתרים', es: 'Para varias webs', 'pt-BR': 'Para vários sites', fr: 'Pour plusieurs sites', it: 'Per più siti', ja: '複数サイト向け', de: 'Mehrere Websites', nl: 'Meerdere websites', pl: 'Wiele witryn', ko: '여러 사이트' },
  large_agency: { en: 'Agencies', he: 'לסוכנויות', es: 'Para agencias', 'pt-BR': 'Para agências', fr: 'Pour les agences', it: 'Per le agenzie', ja: '代理店向け', de: 'Agenturen', nl: 'Bureaus', pl: 'Agencje', ko: '대행사' },
}

/**
 * THE AUDIENCE DESCRIPTION — the sentence under the plan name.
 *
 * Advanced is a ONE-WEBSITE plan. Every phrasing implying several sites is
 * gone, and `pricing-copy-and-layout.qa.ts` fails if one returns anywhere in the tree.
 */
export const PLAN_AUDIENCE_DESCRIPTION: Record<PlanCode, Record<PublicLocale, string>> = {
  regular: {
    en: 'One website, a simple place to start',
    he: 'אתר אחד, התחלה פשוטה',
    es: 'Una web, un punto de partida sencillo',
    'pt-BR': 'Um site, um começo simples',
    fr: 'Un site, un point de départ simple',
    it: 'Un sito, un punto di partenza semplice',
    ja: 'サイト1件、まず始めるためのプラン',
    de: 'Eine Website, ein einfacher Anfang',
    nl: 'Eén website, een eenvoudig begin',
    pl: 'Jedna witryna, prosty początek',
    ko: '사이트 한 개, 간단하게 시작하는 요금제',
  },
  advanced: {
    en: 'For one website that needs more articles and more tracking',
    he: 'לאתר אחד שצריך יותר מאמרים ויותר מעקב',
    es: 'Para una web que necesita más artículos y más seguimiento',
    'pt-BR': 'Para um site que precisa de mais artigos e mais monitoramento',
    fr: "Pour un site qui a besoin de plus d'articles et de plus de suivi",
    it: 'Per un sito che ha bisogno di più articoli e di più monitoraggio',
    ja: '記事数と計測をもっと増やしたいサイト1件向け',
    de: 'Für eine Website, die mehr Artikel und mehr Tracking braucht',
    nl: 'Voor één website die meer artikelen en meer monitoring nodig heeft',
    pl: 'Dla jednej witryny, która potrzebuje więcej artykułów i więcej monitorowania',
    ko: '글과 측정을 더 늘리고 싶은 사이트 한 개를 위한 요금제',
  },
  premium: {
    en: 'For businesses and agencies running several websites',
    he: 'לעסקים ולסוכנויות שמנהלים כמה אתרים',
    es: 'Para empresas y agencias que gestionan varias webs',
    'pt-BR': 'Para empresas e agências que cuidam de vários sites',
    fr: 'Pour les entreprises et les agences qui gèrent plusieurs sites',
    it: 'Per aziende e agenzie che gestiscono più siti',
    ja: '複数のサイトを運用する企業・代理店向け',
    de: 'Für Unternehmen und Agenturen mit mehreren Websites',
    nl: 'Voor bedrijven en bureaus die meerdere websites beheren',
    pl: 'Dla firm i agencji prowadzących wiele witryn',
    ko: '여러 사이트를 운영하는 기업과 대행사를 위한 요금제',
  },
  large_agency: {
    en: 'For agencies with many clients',
    he: 'לסוכנויות עם הרבה לקוחות',
    es: 'Para agencias con muchos clientes',
    'pt-BR': 'Para agências com muitos clientes',
    fr: 'Pour les agences qui ont beaucoup de clients',
    it: 'Per le agenzie con molti clienti',
    ja: '多くのクライアントを担当する代理店向け',
    de: 'Für Agenturen mit vielen Kunden',
    nl: 'Voor bureaus met veel klanten',
    pl: 'Dla agencji z dużą liczbą klientów',
    ko: '고객사가 많은 대행사를 위한 요금제',
  },
}

/**
 * THE PLAN'S DISPLAY NAME, for the same reason as everything else in this file.
 *
 * Each pricing page carried its own `PLAN_NAME` table — four copies of the same
 * four words, one of which (Hebrew) is translated and three of which are not.
 * That is a fifth place to rename a plan and forget one, and the plans widget
 * inside a blog article would have been the sixth. The names themselves are
 * unchanged: Basic / Advanced / Premium / Agency, Hebrew in Hebrew.
 */
export const PLAN_DISPLAY_NAME: Record<PlanCode, Record<PublicLocale, string>> = {
  regular: { en: 'Basic', he: 'בייסיק', es: 'Basic', 'pt-BR': 'Basic', fr: 'Basic', it: 'Basic', ja: 'Basic', de: 'Basic', nl: 'Basic', pl: 'Basic', ko: 'Basic' },
  advanced: { en: 'Advanced', he: 'מתקדם', es: 'Advanced', 'pt-BR': 'Advanced', fr: 'Advanced', it: 'Advanced', ja: 'Advanced', de: 'Advanced', nl: 'Advanced', pl: 'Advanced', ko: 'Advanced' },
  premium: { en: 'Premium', he: 'פרימיום', es: 'Premium', 'pt-BR': 'Premium', fr: 'Premium', it: 'Premium', ja: 'Premium', de: 'Premium', nl: 'Premium', pl: 'Premium', ko: 'Premium' },
  large_agency: { en: 'Agency', he: 'סוכנות', es: 'Agency', 'pt-BR': 'Agency', fr: 'Agency', it: 'Agency', ja: 'Agency', de: 'Agency', nl: 'Agency', pl: 'Agency', ko: 'Agency' },
}

/** The plan the pricing grid and the article widget both highlight. A UI
 *  choice, in one place so the two cannot recommend different plans. */
export const HIGHLIGHTED_PLAN: PlanCode = 'advanced'
