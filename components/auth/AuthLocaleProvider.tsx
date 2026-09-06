'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Locale } from '@/lib/i18n/locales'

/**
 * Carries the SERVER-resolved locale into the auth forms.
 *
 * The forms are client components and cannot read cookies, the proxy header or
 * Accept-Language themselves; the `(auth)` layout is a server component and can.
 * This is the one wire between them. It holds a value and nothing else — no
 * state, no effect — so the value the server rendered with is exactly the value
 * the first client render sees.
 *
 * Deliberately NOT DashboardLanguageProvider: that one owns the switcher and the
 * localStorage migration, neither of which belongs on a signed-out page.
 */
const AuthLocaleContext = createContext<Locale | null>(null)

export function AuthLocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <AuthLocaleContext.Provider value={locale}>{children}</AuthLocaleContext.Provider>
}

/** The server-resolved locale, or null when rendered outside the provider. */
export function useAuthServerLocale(): Locale | null {
  return useContext(AuthLocaleContext)
}
