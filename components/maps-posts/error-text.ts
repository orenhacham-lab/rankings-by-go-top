import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

type T = DashboardDictionary['mapsPosts']

/** A server code → our sentence. Anything unknown (never a provider's text) is "something went wrong". */
export function gbpErrorText(t: T, code: unknown): string {
  if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(t.errors, code)) return t.errors[code as keyof T['errors']]
  return t.errors.unexpected
}

/** A validation code → our sentence for the field. */
export function gbpFieldText(t: T, code: unknown): string {
  if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(t.fields, code)) return t.fields[code as keyof T['fields']]
  return t.errors.unexpected
}
