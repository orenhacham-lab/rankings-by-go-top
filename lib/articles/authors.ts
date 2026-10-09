import type { PublicLocale } from '@/lib/i18n/locales'

/**
 * WHO WROTE THIS, IN THE READER'S LANGUAGE.
 *
 * E-E-A-T is not a byline. A name with no person behind it tells a reader
 * nothing and tells Google nothing: the experience has to be visible and
 * checkable. So an author here carries a role and a short, TRUE line about the
 * work the claims come from, and the article links to the page that backs it.
 *
 * Matching is by the `author` column's value, which the admin form types by
 * hand, so both spellings an article was saved with resolve to one profile.
 * An author with no profile still gets a byline — the box simply does not
 * appear — because an unknown name is better than a wrong biography.
 *
 * Nothing invented belongs in here. Every line is something Go Top can show:
 * the agency, its years of work, and the product this blog is about.
 */

export interface ArticleAuthor {
  /** The name as it is printed, per language. */
  name: Record<PublicLocale, string>
  role: Record<PublicLocale, string>
  bio: Record<PublicLocale, string>
  /** The page that backs the claim, used by the box and by the JSON-LD. */
  href: Record<PublicLocale, string>
  /**
   * A real photograph of the person, square, served from /public. A face is
   * part of what makes authorship checkable — an initial in a circle is a
   * placeholder — so the box shows it and the JSON-LD points Google at it.
   * Null falls back to the initial rather than to a stock avatar.
   */
  photo: string | null
}

const OREN: ArticleAuthor = {
  name: {
    he: 'אורן חכם',
    en: 'Oren Hacham',
    es: 'Oren Hacham',
    'pt-BR': 'Oren Hacham',
  },
  role: {
    he: 'Go Top — קידום אתרים ודיגיטל',
    en: 'Go Top — SEO and digital marketing',
    es: 'Go Top — SEO y marketing digital',
    'pt-BR': 'Go Top — SEO e marketing digital',
  },
  bio: {
    he: 'עומד מאחורי Go Top, סוכנות דיגיטל שעוסקת מעל 11 שנה בקידום אתרים אורגני ובפרסום ממומן לעסקים בישראל, ומאחורי המערכת Go Top SEO. מה שכתוב כאן מגיע מעבודה יומיומית על אתרים של לקוחות, לא מתיאוריה.',
    en: 'Behind Go Top, a digital agency that has worked in organic search and paid media for over 11 years, and behind the Go Top SEO platform. What is written here comes from daily work on client sites, not from theory.',
    es: 'Detrás de Go Top, una agencia digital con más de 11 años en posicionamiento orgánico y publicidad de pago, y detrás de la plataforma Go Top SEO. Lo que se escribe aquí viene del trabajo diario en sitios de clientes, no de la teoría.',
    'pt-BR': 'Por trás da Go Top, agência digital com mais de 11 anos em busca orgânica e mídia paga, e por trás da plataforma Go Top SEO. O que está escrito aqui vem do trabalho diário em sites de clientes, não da teoria.',
  },
  href: { he: '/about', en: '/en/about', es: '/es/about', 'pt-BR': '/pt-BR/about' },
  photo: '/authors/oren-hacham.jpg',
}

/** Every spelling an article row may carry, lower-cased. */
const BY_NAME: Record<string, ArticleAuthor> = {
  'אורן חכם': OREN,
  'oren hacham': OREN,
  'orenhacham@gmail.com': OREN,
}

export function articleAuthor(author: string | null | undefined): ArticleAuthor | null {
  if (!author) return null
  return BY_NAME[author.trim().toLowerCase()] ?? null
}

/** The initials for the avatar, for an author with no photo on file. */
export function authorInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase()
}
