/**
 * How the research tab writes money and dates, in the screen's language.
 * Pure: no React, no I/O.
 */
function locale(language: string): string {
  return language === 'he' ? 'he-IL' : 'en-US'
}

/** A click price in its currency ("₪4.80"); a bare figure when the currency is unknown. */
export function formatMoney(value: number, currency: string, language: string): string {
  if (currency) {
    try {
      return new Intl.NumberFormat(locale(language), { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    } catch {
      // Not an ISO currency code: fall through to the bare figure.
    }
  }
  return new Intl.NumberFormat(locale(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

/** The day a research was fetched ("12 Sept 2026"); null when the timestamp is unreadable. */
export function formatResearchDate(iso: string | null, language: string): string | null {
  const t = Date.parse(iso ?? '')
  if (!Number.isFinite(t)) return null
  return new Intl.DateTimeFormat(locale(language), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(t))
}
