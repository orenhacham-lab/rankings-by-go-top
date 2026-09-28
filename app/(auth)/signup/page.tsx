'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { resolveAuthLocale } from '@/lib/i18n/auth-locale'
import { useAuthServerLocale } from '@/components/auth/AuthLocaleProvider'
import { DASHBOARD_LANGUAGE_STORAGE_KEY } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { keepSeedClaim, seedClaimDestination } from './claim-action'
import { CLAIM_START_PATH } from '@/lib/onboarding/claim-start'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import AuthShell, { AUTH_LINK_CLASSES, AUTH_TITLE_CLASSES } from '@/components/auth/AuthShell'
import Badge from '@/components/ui/Badge'
import Checkbox from '@/components/ui/Checkbox'
import { NoticeBox } from '@/components/ui/Notice'
import { authHref, withLocaleParam } from '@/lib/i18n/auth-href'

const SIGNUP_UI = {
  he: {
    subtitle: 'מעקב מיקומים בגוגל ונראות ב-AI',
    logoAlt: 'הלוגו של Go Top',
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
    confirmPassword: 'אימות סיסמה',
    confirmPasswordPlaceholder: '••••••••',
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
      passwordMismatch: 'הסיסמאות אינן תואמות',
      invalidPhone: 'מספר טלפון לא תקין',
      fieldRequired: 'שדה זה הוא חובה',
      termsRequired: 'עליך להסכים לתנאים ולמדיניות הפרטיות',
      emailExists: 'כתובת האימייל כבר רשומה במערכת. נסו להתחבר.',
      emailRateLimit: 'נשלחו יותר מדי בקשות הרשמה בזמן קצר. נסו שוב בעוד כמה דקות או השתמשו בכתובת אימייל אחרת.',
      signupFailed: 'אירעה שגיאה ביצירת החשבון. אנא נסו שוב.',
      weakPasswordLength: (min: number) => `הסיסמה חייבת להכיל לפחות ${min} תווים`,
      weakPasswordCharacters: 'הסיסמה חייבת לכלול אותיות קטנות וגדולות באנגלית, ספרות ותווים מיוחדים לפי דרישות האבטחה',
      weakPasswordPwned: 'הסיסמה הזו הופיעה בדליפות מידע ידועות. בחרו סיסמה אחרת.',
      weakPassword: 'הסיסמה אינה עומדת בדרישות האבטחה. בחרו סיסמה חזקה יותר.',
      createTrialFailed: 'אירעה שגיאה בהפעלת תקופת הניסיון. אנא נסו שוב.',
    },
    success: {
      accountCreated: 'חשבון נוצר בהצלחה! מעביר אותך לדאשבורד...',
      accountCreatedFromScan: 'החשבון נוצר. פותחים את הפרויקט מהבדיקה שעשיתם…',
      emailConfirmationRequired: 'החשבון נוצר. בדקו את תיבת האימייל שלכם כדי לאשר את ההרשמה.',
    },
  },
  en: {
    subtitle: 'Google ranking & AI visibility tracking',
    logoAlt: 'Go Top logo',
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
    confirmPassword: 'Confirm password',
    confirmPasswordPlaceholder: '••••••••',
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
      passwordMismatch: 'Passwords do not match',
      invalidPhone: 'Invalid phone number',
      fieldRequired: 'This field is required',
      termsRequired: 'You must agree to the terms and privacy policy',
      emailExists: 'This email is already registered. Please sign in instead.',
      emailRateLimit: 'Too many signup requests were sent in a short time. Please try again in a few minutes or use a different email address.',
      signupFailed: 'An error occurred while creating your account. Please try again.',
      weakPasswordLength: (min: number) => `Password must be at least ${min} characters`,
      weakPasswordCharacters: 'Password must include lowercase and uppercase letters, digits and symbols as required',
      weakPasswordPwned: 'This password has appeared in known data breaches. Please choose a different one.',
      weakPassword: 'This password does not meet the security requirements. Please choose a stronger one.',
      createTrialFailed: 'An error occurred while activating your trial. Please try again.',
    },
    success: {
      accountCreated: 'Account created successfully! Redirecting to dashboard...',
      accountCreatedFromScan: 'Your account is ready. Opening the project from your check…',
      emailConfirmationRequired: 'Your account was created. Please check your email to confirm your signup.',
    },
  },
} as const

export function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const serverLocale = useAuthServerLocale()
  const langParam = searchParams.get('lang')
  // The route, then an explicit ?lang, then the locale the SERVER resolved for
  // this request. That last step is the fix: without it every request without an
  // /en URL or a ?lang rendered Hebrew, including one the server had already
  // resolved to English and labelled lang="en" dir="ltr".
  const lang: 'he' | 'en' = resolveAuthLocale({ pathname, langParam, serverLocale })
  const isEn = lang === 'en'
  const t = SIGNUP_UI[lang]

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')

  // W4 onboarding: the free check's claim token (?claim=) goes to the server,
  // which keeps it in an httpOnly cookie for the first project, and then leaves
  // the address. The page never shows it or sends it anywhere else.
  const claimParam = searchParams.get('claim')
  useEffect(() => {
    if (!claimParam) return
    keepSeedClaim(claimParam)
      .catch(() => {})
      .finally(() => {
        const rest = new URLSearchParams(Array.from(searchParams.entries()).filter(([key]) => key !== 'claim')).toString()
        router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false })
      })
  }, [claimParam, pathname, router, searchParams])

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    companyName: '',
    phone: '',
    password: '',
    confirmPassword: '',
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

    if (!formData.confirmPassword) {
      errors.push(t.err.fieldRequired)
    } else if (formData.password !== formData.confirmPassword) {
      errors.push(t.err.passwordMismatch)
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

    // Debug: Log raw phone input
    console.log('[signup-phone] raw phone:', JSON.stringify(formData.phone), 'length:', formData.phone.length)

    const validationErrors = validateForm()

    // Debug: Log validation result
    console.log('[signup-phone] validation errors:', validationErrors)
    console.log('[signup-phone] phone regex test:', /^(?:[0-9]{10}|[0-9]{3}-[0-9]{7})$/.test(formData.phone))

    if (validationErrors.length > 0) {
      console.log('[signup] validation failed, showing error:', validationErrors[0])
      setError(validationErrors[0])
      return
    }

    setLoading(true)

    // Debug: Normalization
    const normalizedPhone = formData.phone.replace(/-/g, '')
    console.log('[signup-phone] normalized phone:', normalizedPhone, 'length:', normalizedPhone.length)

    try {
      const supabase = createClient()

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
            // Area G — persist the signup-origin language (derived from the route/param,
            // NOT the browser) so a later fresh-device login opens the app in that language.
            locale: lang,
          },
          // Carry the choice through the email-confirmation callback so it survives that hop.
          emailRedirectTo: `${appUrl}/api/auth/callback?next=${encodeURIComponent('/dashboard')}&lang=${lang}`,
        },
      })

      if (authError) {
        console.error('Signup auth error:', authError)
        const msg = (authError.message || '').toLowerCase()
        const code = ((authError as { code?: string }).code || '').toLowerCase()
        // Supabase enforces the project's password policy (length / required
        // characters / leaked passwords) and answers `weak_password` with the
        // reasons. The client check below it only knows "8 characters", so a
        // stricter policy used to surface as the generic "signup failed".
        const reasons = ((authError as { reasons?: unknown }).reasons as string[] | undefined) ?? []
        if (code === 'weak_password' || reasons.length > 0) {
          const min = Number(/at least (\d+) characters/i.exec(authError.message || '')?.[1])
          const parts: string[] = []
          if (reasons.includes('length')) parts.push(t.err.weakPasswordLength(Number.isFinite(min) && min > 0 ? min : 8))
          if (reasons.includes('characters')) parts.push(t.err.weakPasswordCharacters)
          if (reasons.includes('pwned')) parts.push(t.err.weakPasswordPwned)
          setError(parts.length > 0 ? parts.join(' · ') : t.err.weakPassword)
        } else if (
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

      // Area C — immediate-session path: auto-create the account's default client from the
      // signup data (server-authoritative; the endpoint ignores any body and derives every
      // field from the session + metadata). Best-effort — never block signup on its outcome.
      try { await fetch('/api/clients/ensure-default', { method: 'POST' }) } catch { /* non-blocking */ }

      // Where the new account opens: with a free-check claim kept, the new-project
      // screen that creates the project from that scan and opens it
      // (lib/onboarding/claim-start.ts); otherwise the dashboard. Only the server
      // can read the claim cookie, so it answers; a failed answer is the dashboard.
      const fromScan = (await seedClaimDestination().catch(() => null)) === CLAIM_START_PATH
      const destination = fromScan ? CLAIM_START_PATH : '/dashboard'
      setSuccess(fromScan ? t.success.accountCreatedFromScan : t.success.accountCreated)

      // Send admin notification email
      try {
        console.log('[signup-email] sending admin notification...')
        const emailResponse = await fetch('/api/send-notification-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: formData.fullName,
            email: formData.email,
            companyName: formData.companyName,
            phone: normalizedPhone,
          }),
        })

        console.log('[signup-email] response status:', emailResponse.status, 'ok:', emailResponse.ok)

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text().catch(() => '(no response body)')
          console.error('[signup-email] failed, status:', emailResponse.status, 'body:', errorText)
        } else {
          const result = await emailResponse.json().catch(() => ({}))
          console.log('[signup-email] admin notification sent, messageId:', result.messageId)
        }
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

      // Area G — immediate-session path: seed the EXISTING dashboard-language store so the
      // dashboard opens in the signup language on this device right away (the switcher can
      // still override afterward, and a returning device keeps whatever was last chosen).
      try { localStorage.setItem(DASHBOARD_LANGUAGE_STORAGE_KEY, lang) } catch { /* ignore quota / privacy mode */ }

      // Redirect after a short delay
      setTimeout(() => {
        router.replace(withLocaleParam(destination, lang))
        router.refresh()
      }, 1000)
    } catch (err) {
      console.error('Signup error:', err)
      setError(t.err.signupFailed)
      setLoading(false)
    }
  }

  return (
    <AuthShell
      locale={lang}
      logoAlt={t.logoAlt}
      subtitle={t.subtitle}
      footer={t}
      below={
        <p>
          {t.alreadyHaveAccount}{' '}
          <Link href={authHref('login', lang)} className={AUTH_LINK_CLASSES}>
            {t.signIn}
          </Link>
        </p>
      }
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <Badge variant="success">{t.trialBadge}</Badge>
          <h1 className={AUTH_TITLE_CLASSES}>{t.heading}</h1>
        </div>

        {error && <NoticeBox tone="bad" language={lang}>{error}</NoticeBox>}

        {success && <NoticeBox tone="ok" language={lang}>{success}</NoticeBox>}

        {/* Off unless NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED. Held while a free-check claim is still being
            kept (it leaves the address once its cookie is set), so the claim survives the trip to Google. */}
        <GoogleSignInButton lang={lang} nextPath="/dashboard" disabled={searchParams.has('claim')} />

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

          <Input
            label={t.confirmPassword}
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            placeholder={t.confirmPasswordPlaceholder}
            required
            autoComplete="new-password"
          />

          <Checkbox
            id="terms"
            checked={formData.termsAccepted}
            onChange={(checked) => setFormData({ ...formData, termsAccepted: checked })}
            label={t.termsCheckbox}
            className="pt-1"
          />

          <Button
            type="submit"
            loading={loading}
            className="w-full"
            size="lg"
          >
            {t.signupBtn}
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <SignupForm />
    </Suspense>
  )
}
