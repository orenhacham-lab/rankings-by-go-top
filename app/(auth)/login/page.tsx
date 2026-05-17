'use client'

import { useState, Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PLAN_LIMITS, PLAN_FEATURES } from '@/lib/subscription'
import { getGoogleOAuthUrl, generateState, saveStateToSession } from '@/lib/google-oauth'

// Minimal locale-aware UI strings for the login page. Auth/Supabase logic
// is fully language-agnostic — only the visible text changes per ?lang.
const LOGIN_UI = {
  he: {
    subtitle: 'מעקב מיקומים בגוגל ונראות ב-AI',
    loginTab: 'כניסה',
    signupTab: 'רישום',
    googleWith: 'עם Google',
    orEmail: 'או עם אימייל וסיסמה',
    emailLabel: 'כתובת אימייל',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'סיסמה',
    passwordPlaceholder: '••••••••',
    loginBtn: 'כניסה',
    signupBtn: 'יצירת חשבון',
    plansHeading: 'תוכניות מנויים',
    trialBadge: '7 ימי ניסיון',
    perMonth: 'לחודש',
    accessibility: 'נגישות',
    privacy: 'פרטיות',
    articles: 'מאמרים',
    accessibilityHref: '/accessibility',
    privacyHref: '/privacy',
    articlesHref: '/articles',
    err: {
      oauthFailed: 'כניסה עם ספק חיצוני נכשלה. בדוק שהספק מופעל בהגדרות Supabase.',
      badCredentials: 'שם משתמש או סיסמה שגויים',
      alreadyRegistered: 'כתובת האימייל כבר רשומה. נסה להתחבר.',
      signupFailed: 'שגיאה בהרשמה: ',
      googleFailed: 'שגיאה בכניסה עם Google. נסה שנית.',
      providerNotEnabled: (p: string) => `כניסה עם ${p} אינה מופעלת. אנא השתמש באימייל וסיסמה.`,
      providerError: (p: string) => `שגיאה בכניסה עם ${p}. נסה שנית.`,
      oauthConfig: 'שגיאה בטעינת הגדרות OAuth. נסה שנית.',
    },
    success: {
      confirmEmail: 'נשלח אימייל אישור. בדוק את תיבת הדואר שלך.',
    },
    planNames: {
      trial: 'ניסיון',
      regular: 'רגיל',
      advanced: 'מתקדם',
      premium: 'פרמיום',
    },
    planFeatures: {
      trial: ['פרויקט 1 בלבד', 'עד 30 מילות מפתח', 'סריקה 1 בסה"כ', 'עד 3 סריקות AI', '7 ימי ניסיון'],
      regular: ['עד 3 פרויקטים', 'עד 50 מילות מפתח לפרויקט', 'סריקה 1 בחודש לכל פרוייקט', 'עד 10 סריקות AI לכל פרויקט'],
      advanced: ['עד 10 פרויקטים', 'עד 50 מילות מפתח לפרויקט', '2 סריקות בחודש לכל פרוייקט', 'עד 10 סריקות AI לכל פרויקט'],
      premium: ['עד 25 פרויקטים', 'עד 100 מילות מפתח לפרויקט', '2 סריקות בחודש לכל פרוייקט', 'עד 20 סריקות AI לכל פרויקט'],
    },
  },
  en: {
    subtitle: 'Google ranking & AI visibility tracking',
    loginTab: 'Sign in',
    signupTab: 'Sign up',
    googleWith: 'with Google',
    orEmail: 'Or with email and password',
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••',
    loginBtn: 'Sign in',
    signupBtn: 'Create account',
    plansHeading: 'Subscription plans',
    trialBadge: '7-day trial',
    perMonth: '/ month',
    accessibility: 'Accessibility',
    privacy: 'Privacy',
    articles: 'Articles',
    accessibilityHref: '/en/accessibility',
    privacyHref: '/en/privacy',
    articlesHref: '/en/articles',
    err: {
      oauthFailed: 'Sign-in with external provider failed. Verify the provider is enabled in Supabase settings.',
      badCredentials: 'Invalid email or password',
      alreadyRegistered: 'This email is already registered. Try signing in.',
      signupFailed: 'Sign-up error: ',
      googleFailed: 'Google sign-in error. Please try again.',
      providerNotEnabled: (p: string) => `Sign-in with ${p} is not enabled. Please use email and password.`,
      providerError: (p: string) => `Sign-in with ${p} failed. Please try again.`,
      oauthConfig: 'Failed to load OAuth configuration. Please try again.',
    },
    success: {
      confirmEmail: 'A confirmation email was sent. Check your inbox.',
    },
    planNames: {
      trial: 'Trial',
      regular: 'Regular',
      advanced: 'Advanced',
      premium: 'Premium',
    },
    planFeatures: {
      trial: ['1 project', 'Up to 30 keywords', '1 scan per month', 'Up to 3 AI scans', '7-day trial'],
      regular: ['Up to 3 projects', 'Up to 50 keywords per project', '1 scan per month per project', 'Up to 10 AI scans per project'],
      advanced: ['Up to 10 projects', 'Up to 50 keywords per project', '2 scans per month per project', 'Up to 10 AI scans per project'],
      premium: ['Up to 25 projects', 'Up to 100 keywords per project', '2 scans per month per project', 'Up to 20 AI scans per project'],
    },
  },
} as const

function AuthForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') || '/dashboard'
  const oauthErrorParam = searchParams.get('error')
  const langParam = searchParams.get('lang')
  const lang: 'he' | 'en' = langParam === 'en' ? 'en' : 'he'
  const isEn = lang === 'en'
  const t = LOGIN_UI[lang]

  // Use configured app URL or fallback to current origin
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<'google' | null>(null)
  const [error, setError] = useState(() => {
    if (oauthErrorParam === 'oauth') {
      return t.err.oauthFailed
    }
    return ''
  })
  const [success, setSuccess] = useState('')

  function resetForm() {
    setError('')
    setSuccess('')
    setEmail('')
    setPassword('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    const supabase = createClient()

    if (mode === 'login') {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        setError(t.err.badCredentials)
        setLoading(false)
        return
      }
      router.replace(nextPath)
      router.refresh()
    } else {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${appUrl}/api/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      })
      if (authError) {
        if (authError.message?.includes('already registered')) {
          setError(t.err.alreadyRegistered)
        } else {
          setError(t.err.signupFailed + authError.message)
        }
        setLoading(false)
        return
      }
      setSuccess(t.success.confirmEmail)
      setLoading(false)
    }
  }

  async function handleOAuth(provider: 'google') {
    setError('')
    setSuccess('')
    setOauthLoading(provider)

    try {
      // Check with server if custom Google OAuth is configured
      const configResponse = await fetch('/api/get-oauth-config', {
        cache: 'no-store',
      })
      const config = await configResponse.json()

      console.log('[Login] OAuth config:', {
        useCustomGoogleOAuth: config.useCustomGoogleOAuth,
        hasClientId: !!config.googleClientId,
      })

      if (config.useCustomGoogleOAuth && config.googleClientId && typeof window !== 'undefined') {
        // Use custom Google OAuth app (not Supabase's)
        console.log('[Login] Using CUSTOM Google OAuth (NOT Supabase)')
        try {
          const state = generateState()
          saveStateToSession(state, nextPath)

          const redirectUri = `${appUrl}/api/auth/callback`
          const googleAuthUrl = getGoogleOAuthUrl(
            config.googleClientId,
            redirectUri,
            state,
            nextPath
          )

          console.log('[Login] Redirecting to Google:', {
            redirectUri,
            stateLength: state.length,
          })

          window.location.href = googleAuthUrl
        } catch (err) {
          console.error('[Login] Google OAuth error:', err)
          setError(t.err.googleFailed)
          setOauthLoading(null)
        }
      } else {
        // Fallback to Supabase OAuth
        console.log('[Login] Using Supabase OAuth (NOT custom Google)', {
          reason: !config.useCustomGoogleOAuth ? 'config.useCustomGoogleOAuth is false' : 'no clientId',
        })
        const supabase = createClient()

        try {
          const { error: authError } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo: `${appUrl}/api/auth/callback?next=${encodeURIComponent(nextPath)}`,
            },
          })
          if (authError) {
            const providerName = 'Google'
            if (
              authError.message?.toLowerCase().includes('not enabled') ||
              authError.message?.toLowerCase().includes('provider') ||
              authError.message?.toLowerCase().includes('unsupported')
            ) {
              setError(t.err.providerNotEnabled(providerName))
            } else {
              setError(t.err.providerError(providerName))
            }
            setOauthLoading(null)
          }
          // If no error, redirect is handled by Supabase SDK
        } catch {
          const providerName = 'Google'
          setError(t.err.providerError(providerName))
          setOauthLoading(null)
        }
      }
    } catch (err) {
      console.error('[Login] OAuth config error:', err)
      setError(t.err.oauthConfig)
      setOauthLoading(null)
    }
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
          {/* Mode toggle */}
          <div className="flex rounded-lg bg-slate-100 p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); resetForm() }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-700'
              }`}
            >
              {t.loginTab}
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); resetForm() }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'signup'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-700'
              }`}
            >
              {t.signupTab}
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div role="status" className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {success}
            </div>
          )}

          {/* OAuth buttons */}
          <div className="space-y-3 mb-6">
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              disabled={!!oauthLoading || loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              {oauthLoading === 'google' ? (
                <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {mode === 'login' ? t.loginTab : t.signupTab} {t.googleWith}
            </button>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-slate-600">{t.orEmail}</span>
            </div>
          </div>

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
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />

            <Button
              type="submit"
              loading={loading}
              className="w-full"
              size="lg"
            >
              {mode === 'login' ? t.loginBtn : t.signupBtn}
            </Button>
          </form>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200">
          <div className="text-center mb-6">
            <p className="text-slate-600 font-medium mb-3 text-sm">{t.plansHeading}</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Trial Plan */}
              <div className={`bg-slate-50 rounded-lg p-4 text-center ${isEn ? 'text-left' : 'text-right'}`}>
                <div className="text-xs text-slate-600 mb-1">{t.trialBadge}</div>
                <div className="font-bold text-slate-900 text-sm mb-3">{t.planNames.trial}</div>
                <ul className="text-xs text-slate-600 space-y-1">
                  {t.planFeatures.trial.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-600 font-bold flex-shrink-0">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Regular Plan */}
              <div className={`bg-blue-50 rounded-lg p-4 text-center ${isEn ? 'text-left' : 'text-right'}`}>
                <div className="text-xs text-slate-600 mb-1">₪{PLAN_LIMITS.regular.price} {t.perMonth}</div>
                <div className="font-bold text-slate-900 text-sm mb-3">{t.planNames.regular}</div>
                <ul className="text-xs text-slate-600 space-y-1">
                  {t.planFeatures.regular.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-600 font-bold flex-shrink-0">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Advanced Plan */}
              <div className={`bg-amber-50 rounded-lg p-4 text-center border border-amber-200 ${isEn ? 'text-left' : 'text-right'}`}>
                <div className="text-xs text-slate-600 mb-1">₪{PLAN_LIMITS.advanced.price} {t.perMonth}</div>
                <div className="font-bold text-slate-900 text-sm mb-3">{t.planNames.advanced}</div>
                <ul className="text-xs text-slate-600 space-y-1">
                  {t.planFeatures.advanced.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-600 font-bold flex-shrink-0">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Premium Plan */}
              <div className={`bg-purple-50 rounded-lg p-4 text-center ${isEn ? 'text-left' : 'text-right'}`}>
                <div className="text-xs text-slate-600 mb-1">₪{PLAN_LIMITS.premium.price} {t.perMonth}</div>
                <div className="font-bold text-slate-900 text-sm mb-3">{t.planNames.premium}</div>
                <ul className="text-xs text-slate-600 space-y-1">
                  {t.planFeatures.premium.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-600 font-bold flex-shrink-0">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
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
