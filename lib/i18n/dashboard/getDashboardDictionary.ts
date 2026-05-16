import { dashboardHe } from './he'
import { dashboardEn } from './en'
import type { Locale } from '../locales'
import type { DashboardDictionary } from './he'

const DICTIONARIES = {
  he: dashboardHe,
  en: dashboardEn as unknown as DashboardDictionary,
} satisfies Record<Locale, DashboardDictionary>

export function getDashboardDictionary(locale: Locale): DashboardDictionary {
  return DICTIONARIES[locale] || dashboardHe
}
