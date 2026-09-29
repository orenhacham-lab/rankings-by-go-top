/**
 * How the Search Console widgets write numbers and dates: in the screen's language,
 * the same way on every widget. Search Console figures are whole clicks and
 * impressions; a position keeps one decimal.
 */
function locale(language: string): string {
  return language === 'he' ? 'he-IL' : 'en-US'
}

export function formatCount(n: number, language: string): string {
  return new Intl.NumberFormat(locale(language), { maximumFractionDigits: 0 }).format(Math.round(n))
}

/**
 * A short number for a line that has to fit a fixed box. English: 1.2K. Hebrew never shows a "K" or an "M":
 * up to 9,999 the whole number with its separator ("1,200"), then "אלף" / "מיליון" ("12.5 אלף").
 */
export function formatCompact(n: number, language: string): string {
  if (language === 'he') {
    const v = Math.round(n)
    if (Math.abs(v) < 10_000) return formatCount(v, language)
    const one = (x: number) => new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 }).format(x)
    return Math.abs(v) < 1_000_000 ? `${one(v / 1000)} אלף` : `${one(v / 1_000_000)} מיליון`
  }
  return new Intl.NumberFormat(locale(language), { notation: 'compact', maximumFractionDigits: 1 }).format(Math.round(n))
}

export function formatPosition(n: number, language: string): string {
  return new Intl.NumberFormat(locale(language), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
}

/** A calendar date as Search Console reports it (YYYY-MM-DD, no time zone). */
export function formatDay(isoDate: string, language: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return new Intl.DateTimeFormat(locale(language), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** A change in percent, without the sign (the arrow says the direction). */
export function formatPercent(n: number, language: string): string {
  return `${new Intl.NumberFormat(locale(language), { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 }).format(n)}%`
}
