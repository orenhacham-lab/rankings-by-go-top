'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import AuthShell, { AUTH_TITLE_CLASSES } from '@/components/auth/AuthShell'
import BackLink from '@/components/ui/BackLink'
import { NoticeBox } from '@/components/ui/Notice'
import { useAuthServerLocale } from '@/components/auth/AuthLocaleProvider'
import { createClient } from '@/lib/supabase/client'
import { resolveAuthLocale } from '@/lib/i18n/auth-locale'
import { authHref, withLocaleParam } from '@/lib/i18n/auth-href'
import { passwordUi } from '@/lib/i18n/auth-password'
import { setNewPassword, type NewPasswordOutcome } from '@/lib/auth/password-reset'

/**
 * Choose a new password, on the session the recovery link opened
 * (/api/auth/callback exchanged its code). Opened without one — directly, or
 * after the session ended — it says the link expired and offers a new one.
 */
export default function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const serverLocale = useAuthServerLocale()
  const lang = resolveAuthLocale({ pathname, langParam: searchParams.get('lang'), serverLocale })
  const ui = passwordUi(lang)
  const t = ui.reset

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [outcome, setOutcome] = useState<NewPasswordOutcome | null>(null)

  useEffect(() => {
    let live = true
    createClient().auth.getUser().then(({ data }) => {
      if (live && !data.user) setOutcome('link_expired')
    }).catch(() => {})
    return () => { live = false }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const result = await setNewPassword(createClient(), password, confirm)
    setOutcome(result)
    setLoading(false)
    if (result === 'updated') {
      router.replace(withLocaleParam('/dashboard', lang))
      router.refresh()
    }
  }

  const expired = outcome === 'link_expired'
  return (
    <AuthShell
      variant="recover"
      locale={lang}
      logoAlt={ui.logoAlt}
      subtitle={ui.subtitle}
      footer={ui.footer}
      below={<BackLink href={authHref('login', lang)} className="ms-0">{ui.backToLogin}</BackLink>}
    >
      <div className="space-y-6">
        <h1 className={AUTH_TITLE_CLASSES}>{t.heading}</h1>
        {outcome === 'updated' ? (
          <NoticeBox tone="ok" language={lang}>{t.updated}</NoticeBox>
        ) : (
          <>
            {outcome && (
              <NoticeBox tone="bad" language={lang}>
                {t.err[outcome]}
                {expired && (
                  <>
                    {' '}
                    <Link href={authHref('forgot-password', lang)} className="font-semibold underline underline-offset-2">{t.requestNew}</Link>
                  </>
                )}
              </NoticeBox>
            )}
            {!expired && (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <Input
                  label={t.passwordLabel}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  hint={t.hint}
                  required
                  autoComplete="new-password"
                  autoFocus
                />
                <Input
                  label={t.confirmLabel}
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <Button type="submit" loading={loading} className="w-full" size="lg">
                  {t.submit}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </AuthShell>
  )
}
