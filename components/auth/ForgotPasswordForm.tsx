'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import AuthShell from '@/components/auth/AuthShell'
import { useAuthServerLocale } from '@/components/auth/AuthLocaleProvider'
import { createClient } from '@/lib/supabase/client'
import { resolveAuthLocale } from '@/lib/i18n/auth-locale'
import { authHref } from '@/lib/i18n/auth-href'
import { passwordUi } from '@/lib/i18n/auth-password'
import { recoveryRedirectTo, requestPasswordReset } from '@/lib/auth/password-reset'

/**
 * Ask for a password-reset link (lib/auth/password-reset.ts). The answer is
 * the same whether or not the address has an account.
 */
export default function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const serverLocale = useAuthServerLocale()
  const lang = resolveAuthLocale({ pathname, langParam: searchParams.get('lang'), serverLocale })
  const ui = passwordUi(lang)
  const t = ui.forgot

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  // A recovery link the callback could not exchange comes back as ?error=link.
  const [error, setError] = useState(searchParams.get('error') === 'link' ? t.linkExpired : '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    const outcome = await requestPasswordReset(createClient(), email, recoveryRedirectTo(appUrl, lang))
    setLoading(false)
    if (outcome === 'sent') setSentTo(email.trim())
    else setError(outcome === 'invalid_email' ? t.invalidEmail : t.unavailable)
  }

  return (
    <AuthShell locale={lang} logoAlt={ui.logoAlt} subtitle={ui.subtitle}>
      {sentTo ? (
        <div data-reset-sent>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">{t.sentHeading}</h2>
          <p role="status" className="text-slate-700 text-sm leading-relaxed">{t.sent(sentTo)}</p>
          <button type="button" onClick={() => { setSentTo(null); setEmail('') }} className="mt-4 text-sm text-blue-600 font-medium hover:underline">
            {t.sendAgain}
          </button>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{t.heading}</h2>
          <p className="text-slate-600 text-sm mb-6">{t.intro}</p>
          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label={t.emailLabel}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              required
              autoComplete="email"
              autoFocus
            />
            <Button type="submit" loading={loading} className="w-full" size="lg">
              {t.submit}
            </Button>
          </form>
        </>
      )}
      <div className="mt-6 text-center pt-6 border-t border-slate-200">
        <Link href={authHref('login', lang)} className="text-blue-600 text-sm font-medium hover:underline">
          {ui.backToLogin}
        </Link>
      </div>
    </AuthShell>
  )
}
