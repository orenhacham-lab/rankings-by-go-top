'use client'

import { useState, Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { resolveAuthLocale } from '@/lib/i18n/auth-locale'
import { useAuthServerLocale } from '@/components/auth/AuthLocaleProvider'

// Minimal locale-aware UI strings for the login page. Auth/Supabase logic
// is fully language-agnostic — only the visible text changes per ?lang.
const LOGIN_UI = {
  he: {
    subtitle: 'מעקב מיקומים בגוגל ונראות ב-AI',
    heading: 'כניסה',
    emailLabel: 'כתובת אימייל',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'סיסמה',
    passwordPlaceholder: '••••••••',
    loginBtn: 'כניסה',
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
    },
  },
  en: {
    subtitle: 'Google ranking & AI visibility tracking',
    heading: 'Sign in',
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••',
    loginBtn: 'Sign in',
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
    },
  },
} as const

export function AuthForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const serverLocale = useAuthServerLocale()
  const nextPath = searchParams.get('next') || '/dashboard'
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
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(t.err.badCredentials)
      setLoading(false)
      return
    }
    router.replace(nextPath)
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
              alt="Go Top logo"
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
                href={isEn ? '/en/signup' : '/signup'}
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
