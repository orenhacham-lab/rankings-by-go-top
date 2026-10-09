/**
 * THE PUBLIC BLOG, IN EVERY LANGUAGE THE SITE HAS.
 *
 * The blog used to be Hebrew only: `app/(public)/articles` read the `articles`
 * table and rendered it, while `/en|/es|/pt-BR/articles` were hand-written
 * "coming soon" pages with no list, no `[slug]` route and no way to publish.
 *
 * Adding three more copies of those two pages would have meant four copies of
 * the same query, the same card grid, the same table of contents and the same
 * JSON-LD — four places for a fix to be forgotten. Instead the two pages are
 * one component each (`components/public/articles/`), and the words they
 * differ by live here, one entry per `PublicLocale`, so a new language is a new
 * entry and the compiler asks for it.
 *
 * `articles.locale` (migration 20261009180750) is what ties a row to an entry:
 * each locale's blog lists only rows written in that language.
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import { authHref } from '@/lib/i18n/auth-href'
import type { ArticlesPromoCopy } from '@/components/public/ArticlesPromo'

export interface ArticlesCopy {
  /** The /articles listing. */
  index: {
    eyebrow?: string
    title: string
    /** Rendered in the accent colour after `title`, Hebrew only today. */
    accent?: string
    subtitle: string
    breadcrumb: string
    empty: string
    loading: string
    readMore: string
  }
  /** One article. */
  article: {
    loading: string
    notFoundTitle: string
    notFoundBody: string
    backToArticles: string
    backHome: string
    toc: string
  }
  /** The software block under both pages. */
  promo: ArticlesPromoCopy
}

/** `/articles` in this locale. Hebrew is the bare root, as everywhere else. */
export function articlesIndexHref(locale: PublicLocale): string {
  return locale === 'he' ? '/articles' : `/${locale}/articles`
}

export function articleHref(locale: PublicLocale, slug: string): string {
  return `${articlesIndexHref(locale)}/${slug}`
}

export const ARTICLES_COPY: Record<PublicLocale, ArticlesCopy> = {
  he: {
    index: {
      eyebrow: 'בלוג Go Top SEO',
      title: 'מאמרים, מדריכים',
      accent: 'ותובנות',
      subtitle: 'תכנים מקצועיים בנושאי קידום אתרים, נראות ב-AI, שיווק דיגיטלי וטכנולוגיה — מהצוות של Go Top.',
      breadcrumb: 'מאמרים',
      empty: 'בקרוב יפורסמו כאן מאמרים חדשים.',
      loading: 'טוען מאמרים...',
      readMore: 'לקריאת המאמר',
    },
    article: {
      loading: 'טוען...',
      notFoundTitle: 'מאמר לא נמצא',
      notFoundBody: 'המאמר שחיפשת אינו קיים או הוסר',
      backToArticles: 'חזור למאמרים',
      backHome: 'חזור לעמוד הבית',
      toc: 'תוכן עניינים',
    },
    promo: {
      badge: 'Go Top SEO',
      title: ['עקבו אחר הדירוגים שלכם', 'בגוגל, מתי שתרצו'],
      body: 'מערכת מקצועית למעקב מיקומים בגוגל אורגני וגוגל מפות. סריקה ידנית בכל רגע וסריקה אוטומטית חודשית, דוחות מפורטים ותמיכה אישית בעברית.',
      signup: { label: 'התחילו ניסיון חינם', href: authHref('signup', 'he') },
      pricing: { label: 'צפו במחירים', href: '/pricing' },
      stats: [
        { num: '1000+', label: 'מילות מפתח' },
        { num: '2', label: 'מנועי דירוג (Google + Maps)' },
        { num: '100%', label: 'בעברית' },
        { num: '7 ימים', label: 'ניסיון חינם' },
      ],
      features: [
        { title: 'גוגל אורגני', desc: 'מעקב אחר דירוגים בעמודי 1-2 בגוגל עם תוצאות מדויקות' },
        { title: 'גוגל מפות', desc: 'מעקב לפי מיקום גיאוגרפי מדויק — עיר, מיקוד, נקודת ציון' },
        { title: 'דוחות מקצועיים', desc: 'יצוא דוחות PDF ו-Excel עם מגמות, השוואות וניתוח מתקדם' },
      ],
    },
  },
  en: {
    index: {
      title: 'Articles',
      subtitle: 'Guides and insights on Google rank tracking, SEO and AI visibility',
      breadcrumb: 'Articles',
      empty: 'New articles are on the way.',
      loading: 'Loading articles...',
      readMore: 'Read the article',
    },
    article: {
      loading: 'Loading...',
      notFoundTitle: 'Article not found',
      notFoundBody: 'The article you were looking for does not exist or was removed',
      backToArticles: 'Back to articles',
      backHome: 'Back to home',
      toc: 'Table of contents',
    },
    promo: {
      badge: 'Go Top SEO',
      title: ['Track Your Rankings', 'in Google, Whenever You Need'],
      body: 'Professional platform for tracking your Google organic and Google Maps rankings. Scan on demand whenever you need, or automatically once a month. Detailed reports, trend tracking and personal support.',
      signup: { label: 'Start Free Trial', href: '/en/signup' },
      pricing: { label: 'View Pricing', href: '/en/pricing' },
      stats: [
        { num: '1000+', label: 'Keywords' },
        { num: '2', label: 'Ranking Engines (Google + Maps)' },
        { num: 'AI', label: 'Visibility Tracking' },
        { num: '7 days', label: 'Free Trial' },
      ],
      features: [
        { title: 'Google Organic', desc: 'Track rankings on pages 1-2 of Google with accurate results' },
        { title: 'Google Maps', desc: 'Track your position by geographic location - city, zip, landmark' },
        { title: 'Professional Reports', desc: 'Export PDF and Excel reports with trends, comparisons and advanced analysis' },
      ],
    },
  },
  es: {
    index: {
      title: 'Artículos',
      subtitle: 'Guías y análisis sobre el seguimiento de posiciones en Google, SEO y visibilidad en IA',
      breadcrumb: 'Artículos',
      empty: 'Pronto publicaremos artículos aquí.',
      loading: 'Cargando artículos...',
      readMore: 'Leer el artículo',
    },
    article: {
      loading: 'Cargando...',
      notFoundTitle: 'Artículo no encontrado',
      notFoundBody: 'El artículo que buscas no existe o fue retirado',
      backToArticles: 'Volver a los artículos',
      backHome: 'Volver al inicio',
      toc: 'Índice',
    },
    promo: {
      badge: 'Go Top SEO',
      title: ['Sigue tus posiciones', 'en Google cuando lo necesites'],
      body: 'Plataforma profesional para seguir tus posiciones en Google orgánico y en Google Maps. Lanza un análisis cuando quieras, o deja que se ejecute solo una vez al mes. Informes detallados, seguimiento de tendencias y soporte personal.',
      signup: { label: 'Empezar la prueba gratuita', href: authHref('signup', 'es') },
      pricing: { label: 'Ver precios', href: '/es/pricing' },
      stats: [
        { num: '1000+', label: 'Palabras clave' },
        { num: '2', label: 'Motores de posición (Google + Maps)' },
        { num: 'IA', label: 'Seguimiento de visibilidad' },
        { num: '7 días', label: 'De prueba gratuita' },
      ],
      features: [
        { title: 'Google orgánico', desc: 'Sigue tus posiciones en las páginas 1 y 2 de Google con resultados precisos' },
        { title: 'Google Maps', desc: 'Sigue tu posición por ubicación: ciudad, código postal o punto de referencia' },
        { title: 'Informes profesionales', desc: 'Exporta informes en PDF y Excel con tendencias, comparativas y análisis avanzado' },
      ],
    },
  },
  'pt-BR': {
    index: {
      title: 'Artigos',
      subtitle: 'Guias e análises sobre o acompanhamento de posições no Google, SEO e visibilidade em IA',
      breadcrumb: 'Artigos',
      empty: 'Em breve publicaremos artigos aqui.',
      loading: 'Carregando artigos...',
      readMore: 'Ler o artigo',
    },
    article: {
      loading: 'Carregando...',
      notFoundTitle: 'Artigo não encontrado',
      notFoundBody: 'O artigo que você procura não existe ou foi removido',
      backToArticles: 'Voltar aos artigos',
      backHome: 'Voltar ao início',
      toc: 'Índice',
    },
    promo: {
      badge: 'Go Top SEO',
      title: ['Acompanhe suas posições', 'no Google quando precisar'],
      body: 'Plataforma profissional para acompanhar suas posições no Google orgânico e no Google Maps. Faça uma análise quando quiser, ou deixe que ela rode sozinha uma vez por mês. Relatórios detalhados, acompanhamento de tendências e suporte pessoal.',
      signup: { label: 'Começar o teste grátis', href: authHref('signup', 'pt-BR') },
      pricing: { label: 'Ver preços', href: '/pt-BR/pricing' },
      stats: [
        { num: '1000+', label: 'Palavras-chave' },
        { num: '2', label: 'Mecanismos de posição (Google + Maps)' },
        { num: 'IA', label: 'Acompanhamento de visibilidade' },
        { num: '7 dias', label: 'De teste grátis' },
      ],
      features: [
        { title: 'Google orgânico', desc: 'Acompanhe suas posições nas páginas 1 e 2 do Google com resultados precisos' },
        { title: 'Google Maps', desc: 'Acompanhe sua posição por local: cidade, CEP ou ponto de referência' },
        { title: 'Relatórios profissionais', desc: 'Exporte relatórios em PDF e Excel com tendências, comparativos e análise avançada' },
      ],
    },
  },
}
