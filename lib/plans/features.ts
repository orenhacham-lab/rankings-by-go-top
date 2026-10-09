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
  regular: { en: 'One website', he: 'לאתר אחד', es: 'Para una web', 'pt-BR': 'Para um site' },
  advanced: { en: 'One website', he: 'לאתר אחד', es: 'Para una web', 'pt-BR': 'Para um site' },
  premium: { en: 'Multiple websites', he: 'למספר אתרים', es: 'Para varias webs', 'pt-BR': 'Para vários sites' },
  large_agency: { en: 'Agencies', he: 'לסוכנויות', es: 'Para agencias', 'pt-BR': 'Para agências' },
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
  },
  advanced: {
    en: 'For one website that needs more articles and more tracking',
    he: 'לאתר אחד שצריך יותר מאמרים ויותר מעקב',
    es: 'Para una web que necesita más artículos y más seguimiento',
    'pt-BR': 'Para um site que precisa de mais artigos e mais monitoramento',
  },
  premium: {
    en: 'For businesses and agencies running several websites',
    he: 'לעסקים ולסוכנויות שמנהלים כמה אתרים',
    es: 'Para empresas y agencias que gestionan varias webs',
    'pt-BR': 'Para empresas e agências que cuidam de vários sites',
  },
  large_agency: {
    en: 'For agencies with many clients',
    he: 'לסוכנויות עם הרבה לקוחות',
    es: 'Para agencias con muchos clientes',
    'pt-BR': 'Para agências com muitos clientes',
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
  regular: { en: 'Basic', he: 'בייסיק', es: 'Basic', 'pt-BR': 'Basic' },
  advanced: { en: 'Advanced', he: 'מתקדם', es: 'Advanced', 'pt-BR': 'Advanced' },
  premium: { en: 'Premium', he: 'פרימיום', es: 'Premium', 'pt-BR': 'Premium' },
  large_agency: { en: 'Agency', he: 'סוכנות', es: 'Agency', 'pt-BR': 'Agency' },
}

/** The plan the pricing grid and the article widget both highlight. A UI
 *  choice, in one place so the two cannot recommend different plans. */
export const HIGHLIGHTED_PLAN: PlanCode = 'advanced'
