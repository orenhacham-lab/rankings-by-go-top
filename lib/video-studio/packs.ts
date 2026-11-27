/**
 * Credit packs. Prices live HERE and only here: a checkout takes a pack id from the
 * browser and never an amount, so the caller cannot choose what it pays.
 * Israel pays in shekels through PayPal (1 credit = 1 shekel, 10% off the big pack);
 * everywhere else pays in dollars through Creem (9 / 27 USD, the same ratio).
 * Approved by the owner on 27.11.2026. Credits are not refundable except as the law requires.
 */
export type PackId = 'p30' | 'p100'
export type PackCurrency = 'ILS' | 'USD'
export interface CreditPack { id: PackId; credits: number; amountMinor: Record<PackCurrency, number> }

export const CREDIT_PACKS: Record<PackId, CreditPack> = {
  p30: { id: 'p30', credits: 30, amountMinor: { ILS: 3000, USD: 900 } },
  p100: { id: 'p100', credits: 100, amountMinor: { ILS: 9000, USD: 2700 } },
}

export function isPackId(v: unknown): v is PackId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CREDIT_PACKS, v)
}
export const majorAmount = (minor: number) => (minor / 100).toFixed(2)
