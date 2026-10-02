'use client'

import { sanitizeNextPath } from '@/lib/i18n/request-locale'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { resolveAuthLocale } from '@/lib/i18n/auth-locale'
import { useAuthServerLocale } from '@/components/auth/AuthLocaleProvider'
import { authHref, withLocaleParam } from '@/lib/i18n/auth-href'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import AuthShell, { AUTH_LINK_CLASSES, AUTH_TITLE_CLASSES } from '@/components/auth/AuthShell'
import { NoticeBox } from '@/components/ui/Notice'
import { cn } from '@/lib/utils'

// Minimal locale-aware UI strings for the login page. Auth/Supabase logic
// is fully language-agnostic — only the visible text changes per ?lang.
const LOGIN_UI = {
  he: {
    subtitle: 'מעקב מיקומים בגוגל ונראות ב-AI',
    logoAlt: 'הלוגו של Go Top SEO',
    heading: 'כניסה',
    emailLabel: 'כתובת אימייל',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'סיסמה',
    passwordPlaceholder: '••••••••',
    loginBtn: 'כניסה',
    forgotPassword: 'שכחתם את הסיסמה?',
    dontHaveAccount: 'אין לך חשבון?',
    startTrial: 'התחל ניסיון חינם',
    accessibility: 'נגישות',
    privacy: 'פרטיות',
    articles: 'מאמרים',
    accessibilityHref: '/accessibility',
    privacyHref: '/privacy',
    articlesHref: '/articles',
    err: {
      badCredentials: 'שם משתמש או סיסמה שגויים',
      emailNotConfirmed: 'כתובת האימייל עדיין לא אושרה. פתחו את הודעת האישור ששלחנו אליכם ולחצו על הקישור שבה.',
      linkInvalid: 'קישור האישור אינו תקין או שפג תוקפו. התחברו, או הירשמו שוב כדי לקבל קישור חדש.',
    },
  },
  en: {
    subtitle: 'Google ranking & AI visibility tracking',
    logoAlt: 'Go Top SEO logo',
    heading: 'Sign in',
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••',
    loginBtn: 'Sign in',
    forgotPassword: 'Forgot your password?',
    dontHaveAccount: "Don't have an account?",
    startTrial: 'Start free trial',
    accessibility: 'Accessibility',
    privacy: 'Privacy',
    articles: 'Articles',
    accessibilityHref: '/en/accessibility',
    privacyHref: '/en/privacy',
    articlesHref: '/en/articles',
    err: {
      badCredentials: 'Invalid email or password',
      emailNotConfirmed: 'Your email address is not confirmed yet. Open the confirmation email we sent you and click the link in it.',
      linkInvalid: 'This confirmation link is invalid or has expired. Sign in, or sign up again to get a new link.',
    },
  },
} as const

export function AuthForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const serverLocale = useAuthServerLocale()
  // OPEN-REDIRECT PROTECTION. This was `searchParams.get('next') || '/dashboard'`
  // handed straight to `router.replace`, so `?next=https://evil.com` sent the
  // merchant off-origin immediately after they typed their password. Only a
  // same-origin path survives sanitizeNextPath; anything else becomes the
  // default, so a hostile value degrades to a safe page rather than an error.
  const nextPath = sanitizeNextPath(searchParams.get('next'), '/dashboard')
  const langParam = searchParams.get('lang')
  // The route, then an explicit ?lang, then the locale the SERVER resolved for
  // this request. That last step is the fix: without it every request without an
  // /en URL or a ?lang rendered Hebrew, including one the server had already
  // resolved to English and labelled lang="en" dir="ltr".
  const lang: 'he' | 'en' = resolveAuthLocale({ pathname, langParam, serverLocale })
  const isEn = lang === 'en'
  const t = LOGIN_UI[lang]

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  // The email-confirmation callback sends a failed exchange back here as
  // ?error=oauth. It used to be dropped silently: the visitor saw an empty
  // sign-in form and no word about the link they had just clicked.
  const [error, setError] = useState(searchParams.get('error') ? t.err.linkInvalid : '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      // Only the stable code is read, never the provider's text.
      const code = ((authError as { code?: string }).code || '').toLowerCase()
      setError(code === 'email_not_confirmed' || /email not confirmed/i.test(authError.message || '') ? t.err.emailNotConfirmed : t.err.badCredentials)
      setLoading(false)
      return
    }
    // The app opens in the language this form was shown in (the proxy persists
    // it), not in whatever the account's first visit happened to set.
    router.replace(withLocaleParam(nextPath, lang))
    router.refresh()
  }

  return (
    <AuthShell
      variant="login"
      locale={lang}
      logoAlt={t.logoAlt}
      subtitle={t.subtitle}
      footer={t}
      below={
        <p>
          {t.dontHaveAccount}{' '}
          <Link href={authHref('signup', lang)} className={AUTH_LINK_CLASSES}>
            {t.startTrial}
          </Link>
        </p>
      }
    >
      <div className="space-y-6">
        <h1 className={AUTH_TITLE_CLASSES}>{t.heading}</h1>

        {error && <NoticeBox tone="bad" language={lang}>{error}</NoticeBox>}

        {/* Off unless NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED, and never for a Shopify destination or inside a frame. */}
        <GoogleSignInButton lang={lang} nextPath={nextPath} />

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

          <div className="space-y-1.5">
            <Input
              label={t.passwordLabel}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.passwordPlaceholder}
              required
              autoComplete="current-password"
            />
            <div className="text-end">
              <Link href={authHref('forgot-password', lang)} className={cn(AUTH_LINK_CLASSES, 'text-caption')} data-forgot-password>
                {t.forgotPassword}
              </Link>
            </div>
          </div>

          <Button
            type="submit"
            loading={loading}
            className="w-full"
            size="lg"
          >
            {t.loginBtn}
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <AuthForm />
    </Suspense>
  )
}
