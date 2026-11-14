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

/**
 * The second value on the same wire: whether the request's COUNTRY is one where
 * only the trial is offered (Korea today). It is a country decision and not a
 * language one, so it cannot be derived from the locale above — see the
 * `(auth)` layout, which resolves it, and lib/billing/korea-sale.ts, which
 * explains why the two must never be collapsed.
 *
 * It defaults to false rather than null: a page that forgets the provider
 * renders no notice, and the duty is held down by a QA guard on the layout
 * instead of by a runtime surprise in a sign-up form.
 */
const KoreaTrialOnlyContext = createContext<boolean>(false)

export function AuthLocaleProvider({
  locale,
  koreaTrialOnly = false,
  children,
}: {
  locale: Locale
  koreaTrialOnly?: boolean
  children: ReactNode
}) {
  return (
    <AuthLocaleContext.Provider value={locale}>
      <KoreaTrialOnlyContext.Provider value={koreaTrialOnly}>{children}</KoreaTrialOnlyContext.Provider>
    </AuthLocaleContext.Provider>
  )
}

/** The server-resolved locale, or null when rendered outside the provider. */
export function useAuthServerLocale(): Locale | null {
  return useContext(AuthLocaleContext)
}

/** True where the request's country gets the trial and no paid subscription. */
export function useKoreaTrialOnlyNotice(): boolean {
  return useContext(KoreaTrialOnlyContext)
}
