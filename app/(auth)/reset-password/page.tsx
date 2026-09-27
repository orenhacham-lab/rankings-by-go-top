'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import AuthShell from '@/components/auth/AuthShell'
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
export function ResetPasswordForm() {
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
    <AuthShell locale={lang} logoAlt={ui.logoAlt} subtitle={ui.subtitle}>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">{t.heading}</h2>
      {outcome === 'updated' ? (
        <p role="status" className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">{t.updated}</p>
      ) : (
        <>
          {outcome && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {t.err[outcome]}
              {expired && (
                <>
                  {' '}
                  <Link href={authHref('forgot-password', lang)} className="font-medium underline">{t.requestNew}</Link>
                </>
              )}
            </div>
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
      <div className="mt-6 text-center pt-6 border-t border-slate-200">
        <Link href={authHref('login', lang)} className="text-blue-600 text-sm font-medium hover:underline">
          {ui.backToLogin}
        </Link>
      </div>
    </AuthShell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100" />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
