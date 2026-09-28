'use client'

import { sanitizeNextPath } from '@/lib/i18n/request-locale'
import { useState, Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { resolveAuthLocale } from '@/lib/i18n/auth-locale'
import { useAuthServerLocale } from '@/components/auth/AuthLocaleProvider'
import { authHref, withLocaleParam } from '@/lib/i18n/auth-href'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

// Minimal locale-aware UI strings for the login page. Auth/Supabase logic
// is fully language-agnostic — only the visible text changes per ?lang.
const LOGIN_UI = {
  he: {
    subtitle: 'מעקב מיקומים בגוגל ונראות ב-AI',
    logoAlt: 'הלוגו של Go Top',
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
    logoAlt: 'Go Top logo',
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
    <main dir={isEn ? 'ltr' : 'rtl'} className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              src="/gotop-primary.png"
              alt={t.logoAlt}
              width={160}
              height={64}
              className="h-16 w-auto object-contain"
              sizes="(max-width: 768px) 128px, 160px"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Rankings by Go Top</h1>
          <p className="text-slate-600 mt-1 text-sm">{t.subtitle}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">{t.heading}</h2>

          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

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

            <Input
              label={t.passwordLabel}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.passwordPlaceholder}
              required
              autoComplete="current-password"
            />
            <div className="-mt-2 text-end">
              <Link href={authHref('forgot-password', lang)} className="text-sm text-blue-600 hover:underline" data-forgot-password>
                {t.forgotPassword}
              </Link>
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

          {/* Sign up link */}
          <div className="mt-6 text-center pt-6 border-t border-slate-200">
            <p className="text-slate-600 text-sm">
              {t.dontHaveAccount}{' '}
              <Link
                href={authHref('signup', lang)}
                className="text-blue-600 font-medium hover:underline"
              >
                {t.startTrial}
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200 text-center text-slate-500 text-xs space-y-2">
          <div className="flex items-center justify-center gap-3">
            <Link href={t.accessibilityHref} className="hover:text-slate-700 transition-colors">
              {t.accessibility}
            </Link>
            <span>•</span>
            <Link href={t.privacyHref} className="hover:text-slate-700 transition-colors">
              {t.privacy}
            </Link>
            <span>•</span>
            <Link href={t.articlesHref} className="hover:text-slate-700 transition-colors">
              {t.articles}
            </Link>
          </div>
          <p>
            Rankings by
            <a
              href="https://www.gotop.co.il"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline mx-1"
            >
              Go Top
            </a>
            &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100" />}>
      <AuthForm />
    </Suspense>
  )
}
