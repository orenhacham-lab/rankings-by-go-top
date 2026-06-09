'use client'

import { useState, Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const SIGNUP_UI = {
  he: {
    subtitle: 'מעקב מיקומים בגוגל ונראות ב-AI',
    heading: 'צור חשבון חדש',
    fullName: 'שם מלא',
    fullNamePlaceholder: 'ישראל כהן',
    email: 'כתובת אימייל',
    emailPlaceholder: 'you@example.com',
    companyName: 'שם חברה / עסק',
    companyNamePlaceholder: 'שם העסק שלך',
    phone: 'טלפון נייד',
    phonePlaceholder: '050-1234567',
    password: 'סיסמה',
    passwordPlaceholder: '••••••••',
    termsCheckbox: 'אני מסכים לתנאי השימוש ולמדיניות הפרטיות',
    signupBtn: 'יצירת חשבון',
    trialBadge: '7 ימי ניסיון בחינם',
    alreadyHaveAccount: 'יש לי כבר חשבון',
    signIn: 'כניסה',
    accessibility: 'נגישות',
    privacy: 'פרטיות',
    articles: 'מאמרים',
    accessibilityHref: '/accessibility',
    privacyHref: '/privacy',
    articlesHref: '/articles',
    err: {
      invalidEmail: 'כתובת אימייל לא תקינה',
      passwordTooShort: 'הסיסמה חייבת להכיל לפחות 8 תווים',
      invalidPhone: 'מספר טלפון לא תקין',
      fieldRequired: 'שדה זה הוא חובה',
      termsRequired: 'עליך להסכים לתנאים ולמדיניות הפרטיות',
      emailExists: 'כתובת האימייל כבר רשומה במערכת. נסו להתחבר או לאפס סיסמה.',
      emailRateLimit: 'נשלחו יותר מדי בקשות הרשמה בזמן קצר. נסו שוב בעוד כמה דקות או השתמשו בכתובת אימייל אחרת.',
      signupFailed: 'אירעה שגיאה ביצירת החשבון. אנא נסו שוב.',
      createTrialFailed: 'אירעה שגיאה בהפעלת תקופת הניסיון. אנא נסו שוב.',
    },
    success: {
      accountCreated: 'חשבון נוצר בהצלחה! מעביר אותך לדאשבורד...',
      emailConfirmationRequired: 'החשבון נוצר. בדקו את תיבת האימייל שלכם כדי לאשר את ההרשמה.',
    },
  },
  en: {
    subtitle: 'Google ranking & AI visibility tracking',
    heading: 'Create your account',
    fullName: 'Full name',
    fullNamePlaceholder: 'John Smith',
    email: 'Email address',
    emailPlaceholder: 'you@example.com',
    companyName: 'Company / Business name',
    companyNamePlaceholder: 'Your business name',
    phone: 'Mobile phone',
    phonePlaceholder: '(555) 123-4567',
    password: 'Password',
    passwordPlaceholder: '••••••••',
    termsCheckbox: 'I agree to the Terms of Service and Privacy Policy',
    signupBtn: 'Create account',
    trialBadge: '7-day free trial',
    alreadyHaveAccount: 'Already have an account?',
    signIn: 'Sign in',
    accessibility: 'Accessibility',
    privacy: 'Privacy',
    articles: 'Articles',
    accessibilityHref: '/en/accessibility',
    privacyHref: '/en/privacy',
    articlesHref: '/en/articles',
    err: {
      invalidEmail: 'Invalid email address',
      passwordTooShort: 'Password must be at least 8 characters',
      invalidPhone: 'Invalid phone number',
      fieldRequired: 'This field is required',
      termsRequired: 'You must agree to the terms and privacy policy',
      emailExists: 'This email is already registered. Please sign in or reset your password.',
      emailRateLimit: 'Too many signup requests were sent in a short time. Please try again in a few minutes or use a different email address.',
      signupFailed: 'An error occurred while creating your account. Please try again.',
      createTrialFailed: 'An error occurred while activating your trial. Please try again.',
    },
    success: {
      accountCreated: 'Account created successfully! Redirecting to dashboard...',
      emailConfirmationRequired: 'Your account was created. Please check your email to confirm your signup.',
    },
  },
} as const

export function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const langParam = searchParams.get('lang')
  const lang: 'he' | 'en' =
    langParam === 'en' || pathname?.startsWith('/en/') ? 'en' : 'he'
  const isEn = lang === 'en'
  const t = SIGNUP_UI[lang]

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    companyName: '',
    phone: '',
    password: '',
    termsAccepted: false,
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Phone input filter: allow only digits and dash, max 11 chars, max 1 dash
  function handlePhoneChange(value: string) {
    // Allow only digits and dash
    let filtered = value.replace(/[^\d-]/g, '')

    // Limit to 11 chars (054-9489377)
    filtered = filtered.substring(0, 11)

    // Prevent multiple dashes and ensure dash is only after 3rd digit
    const dashCount = (filtered.match(/-/g) || []).length
    if (dashCount > 1) {
      // Remove all dashes and rebuild
      const digits = filtered.replace(/-/g, '')
      if (digits.length > 3) {
        filtered = digits.substring(0, 3) + '-' + digits.substring(3, 10)
      } else {
        filtered = digits
      }
    } else if (dashCount === 1) {
      const dashIndex = filtered.indexOf('-')
      if (dashIndex !== 3) {
        // Remove dash and rebuild
        const digits = filtered.replace(/-/g, '')
        if (digits.length > 3) {
          filtered = digits.substring(0, 3) + '-' + digits.substring(3, 10)
        } else {
          filtered = digits
        }
      }
    }

    setFormData({ ...formData, phone: filtered })
  }

  // Form validation
  function validateForm(): string[] {
    const errors: string[] = []

    if (!formData.fullName.trim()) {
      errors.push(t.err.fieldRequired)
    }

    if (!formData.email.trim()) {
      errors.push(t.err.fieldRequired)
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.push(t.err.invalidEmail)
    }

    if (!formData.companyName.trim()) {
      errors.push(t.err.fieldRequired)
    }

    if (!formData.phone.trim()) {
      errors.push(t.err.fieldRequired)
    } else if (!/^(?:[0-9]{10}|[0-9]{3}-[0-9]{7})$/.test(formData.phone)) {
      errors.push(t.err.invalidPhone)
    }

    if (!formData.password) {
      errors.push(t.err.fieldRequired)
    } else if (formData.password.length < 8) {
      errors.push(t.err.passwordTooShort)
    }

    if (!formData.termsAccepted) {
      errors.push(t.err.termsRequired)
    }

    return errors
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const validationErrors = validateForm()
    if (validationErrors.length > 0) {
      setError(validationErrors[0])
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      // Normalize phone (remove dash) before storing
      const normalizedPhone = formData.phone.replace(/-/g, '')

      // 1. Create Supabase auth user with metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            company_name: formData.companyName,
            phone: normalizedPhone,
            terms_accepted: true,
          },
          emailRedirectTo: `${appUrl}/api/auth/callback?next=${encodeURIComponent('/dashboard')}`,
        },
      })

      if (authError) {
        console.error('Signup auth error:', authError)
        const msg = (authError.message || '').toLowerCase()
        const code = ((authError as { code?: string }).code || '').toLowerCase()
        if (
          msg.includes('rate limit') ||
          msg.includes('too many') ||
          code.includes('rate_limit') ||
          code.includes('over_email_send_rate_limit')
        ) {
          setError(t.err.emailRateLimit)
        } else if (
          msg.includes('already registered') ||
          msg.includes('already been registered') ||
          msg.includes('user already exists') ||
          code.includes('user_already_exists')
        ) {
          setError(t.err.emailExists)
        } else {
          setError(t.err.signupFailed)
        }
        setLoading(false)
        return
      }

      if (!authData.user) {
        setError(t.err.signupFailed)
        setLoading(false)
        return
      }

      // Check if email confirmation is required (no session returned)
      if (!authData.session) {
        console.log('Email confirmation required — no session in signup response')
        setSuccess(t.success.emailConfirmationRequired)
        setLoading(false)
        return
      }

      // 2. Create trial subscription in database (only after auth signup succeeded with session)
      try {
        const now = new Date()
        const trialEndsAt = new Date(now)
        trialEndsAt.setDate(trialEndsAt.getDate() + 7)

        const response = await fetch('/api/auth/create-trial', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: authData.user.id,
            trialEndsAt: trialEndsAt.toISOString(),
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error('Failed to create trial subscription:', errorData)
          setError(t.err.createTrialFailed)
          setLoading(false)
          return
        }
      } catch (trialError) {
        console.error('Trial creation error:', trialError)
        setError(t.err.createTrialFailed)
        setLoading(false)
        return
      }

      // 3. Sign in the user (should be immediate if session exists)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })

      if (signInError) {
        console.error('Auto-login error:', signInError)
        // Even if auto-login fails, the account is created, so we can still redirect
      }

      setSuccess(t.success.accountCreated)

      // Send admin notification email
      try {
        await fetch('/api/send-notification-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            userName: formData.fullName || formData.email,
          }),
        })
        console.log('[signup-email] admin notification sent')
      } catch (emailError) {
        console.error('[signup-email] admin notification failed:', emailError instanceof Error ? emailError.message : String(emailError))
        // Don't block signup if email fails
      }

      // Track signup success in Google Tag Manager (for Meta Pixel via GTM)
      if (typeof window !== 'undefined') {
        (window as any).dataLayer = (window as any).dataLayer || []
        ;(window as any).dataLayer.push({
          event: 'signup_success',
          product: 'rankings_by_go_top',
        })
      }

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.replace('/dashboard')
        router.refresh()
      }, 1000)
    } catch (err) {
      console.error('Signup error:', err)
      setError(t.err.signupFailed)
      setLoading(false)
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
          {/* Trial badge */}
          <div className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-green-600" />
            {t.trialBadge}
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-6">{t.heading}</h2>

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

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label={t.fullName}
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder={t.fullNamePlaceholder}
              required
              autoComplete="name"
            />

            <Input
              label={t.email}
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder={t.emailPlaceholder}
              required
              autoComplete="email"
            />

            <Input
              label={t.companyName}
              type="text"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              placeholder={t.companyNamePlaceholder}
              required
              autoComplete="organization"
            />

            <Input
              label={t.phone}
              type="tel"
              value={formData.phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder={t.phonePlaceholder}
              required
              autoComplete="tel"
            />

            <Input
              label={t.password}
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder={t.passwordPlaceholder}
              required
              autoComplete="new-password"
            />

            {/* Terms checkbox */}
            <div className="flex items-start gap-3 pt-2">
              <input
                type="checkbox"
                id="terms"
                checked={formData.termsAccepted}
                onChange={(e) => setFormData({ ...formData, termsAccepted: e.target.checked })}
                className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="terms" className="text-sm text-slate-600 cursor-pointer flex-1">
                {t.termsCheckbox}
              </label>
            </div>

            <Button
              type="submit"
              loading={loading}
              className="w-full mt-2"
              size="lg"
            >
              {t.signupBtn}
            </Button>
          </form>
        </div>

        {/* Sign in link */}
        <div className="mt-6 text-center">
          <p className="text-slate-600 text-sm">
            {t.alreadyHaveAccount}{' '}
            <Link
              href={isEn ? '/en/login' : '/login'}
              className="text-blue-600 font-medium hover:underline"
            >
              {t.signIn}
            </Link>
          </p>
        </div>

        {/* Footer */}
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

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100" />}>
      <SignupForm />
    </Suspense>
  )
}
