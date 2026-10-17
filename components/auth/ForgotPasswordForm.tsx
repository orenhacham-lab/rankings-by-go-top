'use client'

import { useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import AuthShell, { AUTH_TITLE_CLASSES } from '@/components/auth/AuthShell'
import BackLink from '@/components/ui/BackLink'
import { NoticeBox } from '@/components/ui/Notice'
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
    <AuthShell
      variant="recover"
      locale={lang}
      logoAlt={ui.logoAlt}
      subtitle={ui.subtitle}
      footer={ui.footer}
      below={<BackLink href={authHref('login', lang)} className="ms-0">{ui.backToLogin}</BackLink>}
    >
      {sentTo ? (
        <div data-reset-sent className="space-y-4">
          <h1 className={AUTH_TITLE_CLASSES}>{t.sentHeading}</h1>
          <NoticeBox tone="ok" language={lang}>{t.sent(sentTo)}</NoticeBox>
          <Button type="button" variant="secondary" size="md" className="w-full" onClick={() => { setSentTo(null); setEmail('') }}>
            {t.sendAgain}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-1.5">
            <h1 className={AUTH_TITLE_CLASSES}>{t.heading}</h1>
            <p className="text-copy text-body">{t.intro}</p>
          </div>
          {error && <NoticeBox tone="bad" language={lang}>{error}</NoticeBox>}
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
        </div>
      )}
    </AuthShell>
  )
}
