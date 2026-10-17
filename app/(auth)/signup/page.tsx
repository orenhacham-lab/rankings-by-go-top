'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { resolveAuthLocale } from '@/lib/i18n/auth-locale'
import type { PublicLocale } from '@/lib/i18n/locales'
import { useAuthServerLocale } from '@/components/auth/AuthLocaleProvider'
import { DASHBOARD_LANGUAGE_STORAGE_KEY } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { keepSeedClaim, seedClaimDestination } from './claim-action'
import { CLAIM_START_PATH } from '@/lib/onboarding/claim-start'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import AuthShell, { AUTH_LINK_CLASSES, AUTH_TITLE_CLASSES } from '@/components/auth/AuthShell'
import Badge from '@/components/ui/Badge'
import { NoticeBox } from '@/components/ui/Notice'
import PasswordField from '@/components/auth/PasswordField'
import { authHref, withLocaleParam } from '@/lib/i18n/auth-href'
import { REFERRAL_PARAM, normalizeReferralCode, withReferral } from '@/lib/affiliate/referral'

const SIGNUP_UI = {
  he: {
    subtitle: 'מעקב מיקומים בגוגל ונראות ב-AI',
    logoAlt: 'הלוגו של Go Top SEO',
    heading: 'פותחים חשבון בחינם',
    intro: 'כמה פרטים ומתחילים. את פרטי העסק נקרא מהאתר שלכם בצעד הבא.',
    fullName: 'שם מלא',
    fullNamePlaceholder: 'ישראל ישראלי',
    company: 'שם החברה',
    companyOptional: '(לא חובה)',
    companyPlaceholder: 'שם העסק או החברה',
    phone: 'טלפון',
    phonePlaceholder: '050-1234567',
    email: 'כתובת אימייל',
    emailPlaceholder: 'you@example.com',
    password: 'סיסמה',
    passwordPlaceholder: '••••••••',
    passwordHint: 'לפחות 8 תווים',
    confirmPassword: 'אימות סיסמה',
    confirmPasswordPlaceholder: 'מקלידים שוב את הסיסמה',
    showPassword: 'הצגת הסיסמה',
    hidePassword: 'הסתרת הסיסמה',
    consentBefore: 'ביצירת החשבון אתם מאשרים את ',
    terms: 'תנאי השימוש',
    consentMiddle: ' ואת ',
    privacyPolicy: 'מדיניות הפרטיות',
    consentAfter: '.',
    termsHref: '/terms',
    privacyPolicyHref: '/privacy',
    signupBtn: 'יצירת חשבון בחינם',
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
      fieldRequired: 'שדה זה הוא חובה',
      fullNameInvalid: 'נא להזין שם מלא (לפחות 2 תווים)',
      phoneInvalid: 'נא להזין מספר טלפון תקין',
      passwordMismatch: 'הסיסמאות אינן זהות. נא להקליד אותה סיסמה בשני השדות.',
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
    logoAlt: 'Go Top SEO logo',
    heading: 'Create your free account',
    intro: 'A few details and you are in. We read your business details from your site in the next step.',
    fullName: 'Full name',
    fullNamePlaceholder: 'Jane Smith',
    company: 'Company',
    companyOptional: '(optional)',
    companyPlaceholder: 'Your business or company name',
    phone: 'Phone',
    phonePlaceholder: '+972 50 123 4567',
    email: 'Email address',
    emailPlaceholder: 'you@example.com',
    password: 'Password',
    passwordPlaceholder: '••••••••',
    passwordHint: 'At least 8 characters',
    confirmPassword: 'Confirm password',
    confirmPasswordPlaceholder: 'Type the password again',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    consentBefore: 'By creating an account you agree to the ',
    terms: 'Terms of Service',
    consentMiddle: ' and the ',
    privacyPolicy: 'Privacy Policy',
    consentAfter: '.',
    termsHref: '/en/terms',
    privacyPolicyHref: '/en/privacy',
    signupBtn: 'Create free account',
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
      fieldRequired: 'This field is required',
      fullNameInvalid: 'Please enter your full name (at least 2 characters)',
      phoneInvalid: 'Please enter a valid phone number',
      passwordMismatch: 'The passwords do not match. Type the same password in both fields.',
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
  es: {
    subtitle: 'Seguimiento de posiciones en Google y visibilidad en IA',
    logoAlt: 'Logotipo de Go Top SEO',
    heading: 'Crea tu cuenta gratis',
    intro: 'Unos datos y ya estás dentro. Los datos de tu negocio los leemos de tu web en el paso siguiente.',
    fullName: 'Nombre y apellidos',
    fullNamePlaceholder: 'Ana García',
    company: 'Empresa',
    companyOptional: '(opcional)',
    companyPlaceholder: 'El nombre de tu negocio o empresa',
    phone: 'Teléfono',
    phonePlaceholder: '+34 600 123 456',
    email: 'Correo electrónico',
    emailPlaceholder: 'tu@ejemplo.com',
    password: 'Contraseña',
    passwordPlaceholder: '••••••••',
    passwordHint: 'Al menos 8 caracteres',
    confirmPassword: 'Confirma la contraseña',
    confirmPasswordPlaceholder: 'Escribe la contraseña otra vez',
    showPassword: 'Mostrar la contraseña',
    hidePassword: 'Ocultar la contraseña',
    consentBefore: 'Al crear una cuenta aceptas los ',
    terms: 'Términos del servicio',
    consentMiddle: ' y la ',
    privacyPolicy: 'Política de privacidad',
    consentAfter: '.',
    termsHref: '/es/terms',
    privacyPolicyHref: '/es/privacy',
    signupBtn: 'Crear cuenta gratis',
    trialBadge: '7 días de prueba gratis',
    alreadyHaveAccount: '¿Ya tienes cuenta?',
    signIn: 'Iniciar sesión',
    accessibility: 'Accesibilidad',
    privacy: 'Privacidad',
    articles: 'Artículos',
    accessibilityHref: '/es/accessibility',
    privacyHref: '/es/privacy',
    articlesHref: '/es/articles',
    err: {
      invalidEmail: 'El correo electrónico no es válido',
      passwordTooShort: 'La contraseña debe tener al menos 8 caracteres',
      fieldRequired: 'Este campo es obligatorio',
      fullNameInvalid: 'Escribe tu nombre completo (al menos 2 caracteres)',
      phoneInvalid: 'Escribe un número de teléfono válido',
      passwordMismatch: 'Las contraseñas no coinciden. Escribe la misma en los dos campos.',
      emailExists: 'Este correo electrónico ya está registrado. Inicia sesión.',
      emailRateLimit: 'Se han enviado demasiadas solicitudes de registro en poco tiempo. Inténtalo de nuevo en unos minutos o usa otro correo electrónico.',
      signupFailed: 'Ha ocurrido un error al crear la cuenta. Inténtalo de nuevo.',
      weakPasswordLength: (min: number) => `La contraseña debe tener al menos ${min} caracteres`,
      weakPasswordCharacters: 'La contraseña debe incluir minúsculas, mayúsculas, números y símbolos, según los requisitos de seguridad',
      weakPasswordPwned: 'Esta contraseña ha aparecido en filtraciones de datos conocidas. Elige otra.',
      weakPassword: 'Esta contraseña no cumple los requisitos de seguridad. Elige una más fuerte.',
      createTrialFailed: 'Ha ocurrido un error al activar tu periodo de prueba. Inténtalo de nuevo.',
    },
    success: {
      accountCreated: '¡Cuenta creada! Te llevamos al panel…',
      accountCreatedFromScan: 'Tu cuenta está lista. Abrimos el proyecto de tu análisis…',
      emailConfirmationRequired: 'Tu cuenta se ha creado. Revisa tu correo electrónico para confirmar el registro.',
    },
  },
  'pt-BR': {
    subtitle: 'Acompanhamento de posições no Google e visibilidade em IA',
    logoAlt: 'Logotipo da Go Top SEO',
    heading: 'Crie sua conta de graça',
    intro: 'Alguns dados e você já está dentro. Os dados do seu negócio nós lemos do seu site no passo seguinte.',
    fullName: 'Nome completo',
    fullNamePlaceholder: 'Ana Souza',
    company: 'Empresa',
    companyOptional: '(opcional)',
    companyPlaceholder: 'O nome do seu negócio ou da sua empresa',
    phone: 'Telefone',
    phonePlaceholder: '+55 11 91234-5678',
    email: 'E-mail',
    emailPlaceholder: 'voce@exemplo.com',
    password: 'Senha',
    passwordPlaceholder: '••••••••',
    passwordHint: 'Pelo menos 8 caracteres',
    confirmPassword: 'Confirme a senha',
    confirmPasswordPlaceholder: 'Digite a senha outra vez',
    showPassword: 'Mostrar a senha',
    hidePassword: 'Ocultar a senha',
    consentBefore: 'Ao criar uma conta você aceita os ',
    terms: 'Termos do serviço',
    consentMiddle: ' e a ',
    privacyPolicy: 'Política de privacidade',
    consentAfter: '.',
    termsHref: '/pt-BR/terms',
    privacyPolicyHref: '/pt-BR/privacy',
    signupBtn: 'Criar conta gratuita',
    trialBadge: '7 dias de teste gratuito',
    alreadyHaveAccount: 'Já tem conta?',
    signIn: 'Entrar',
    accessibility: 'Acessibilidade',
    privacy: 'Privacidade',
    articles: 'Artigos',
    accessibilityHref: '/pt-BR/accessibility',
    privacyHref: '/pt-BR/privacy',
    articlesHref: '/pt-BR/articles',
    err: {
      invalidEmail: 'O e-mail não é válido',
      passwordTooShort: 'A senha precisa ter pelo menos 8 caracteres',
      fieldRequired: 'Este campo é obrigatório',
      fullNameInvalid: 'Escreva seu nome completo (pelo menos 2 caracteres)',
      phoneInvalid: 'Escreva um número de telefone válido',
      passwordMismatch: 'As senhas não coincidem. Digite a mesma nos dois campos.',
      emailExists: 'Este e-mail já está cadastrado. Entre na sua conta.',
      emailRateLimit: 'Chegaram muitas solicitações de cadastro em pouco tempo. Tente de novo em alguns minutos ou use outro e-mail.',
      signupFailed: 'Ocorreu um erro ao criar a conta. Tente de novo.',
      weakPasswordLength: (min: number) => `A senha precisa ter pelo menos ${min} caracteres`,
      weakPasswordCharacters: 'A senha precisa incluir minúsculas, maiúsculas, números e símbolos, conforme os requisitos de segurança',
      weakPasswordPwned: 'Esta senha apareceu em vazamentos de dados conhecidos. Escolha outra.',
      weakPassword: 'Esta senha não atende aos requisitos de segurança. Escolha uma mais forte.',
      createTrialFailed: 'Ocorreu um erro ao ativar seu período de teste. Tente de novo.',
    },
    success: {
      accountCreated: 'Conta criada! Estamos levando você para o painel…',
      accountCreatedFromScan: 'Sua conta está pronta. Estamos abrindo o projeto da sua análise…',
      emailConfirmationRequired: 'Sua conta foi criada. Verifique seu e-mail para confirmar o cadastro.',
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
  const lang: PublicLocale = resolveAuthLocale({ pathname, langParam, serverLocale })
  const isEn = lang === 'en'
  const t = SIGNUP_UI[lang]

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')

  // W4 onboarding: the free check's claim token (?claim=) goes to the server,
  // which keeps it in an httpOnly cookie for the first project, and then leaves
  // the address. The page never shows it or sends it anywhere else.
  // An affiliate link's code arrives on the URL and is never stored anywhere:
  // lib/affiliate/referral.ts says why (ePrivacy art. 5(3), and a consent record
  // the middleware cannot read), and the live agreement promises partners
  // exactly that. It is read here, sent to the server once the account exists,
  // and that is the end of it.
  const referralCode = normalizeReferralCode(searchParams.get(REFERRAL_PARAM))

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

  // The fields (w9): full name, company (optional), email, phone, a password and
  // its confirmation, which must match. The free check stays optional: a visitor who
  // ran one arrives with ?claim= and it is kept exactly as before. Name, company and
  // phone go into the auth user's metadata at signUp (full_name, company_name, phone),
  // which is where the account's default client (lib/clients/ensure-default-client.ts)
  // and the operator's signup notice already read them. No table, no migration.
  const [formData, setFormData] = useState({
    fullName: '',
    company: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  type FieldKey = keyof typeof formData
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function setField(key: FieldKey, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }))
    // An error clears as soon as its field is edited (the confirmation also when the password changes).
    setFieldErrors((prev) => {
      if (!prev[key] && !(key === 'password' && prev.confirmPassword)) return prev
      const next = { ...prev }
      delete next[key]
      if (key === 'password') delete next.confirmPassword
      return next
    })
  }

  // Form validation: one message per field, shown under that field.
  function validateForm(): Partial<Record<FieldKey, string>> {
    const errors: Partial<Record<FieldKey, string>> = {}

    if (formData.fullName.trim().length < 2) errors.fullName = formData.fullName.trim() ? t.err.fullNameInvalid : t.err.fieldRequired

    if (!formData.email.trim()) {
      errors.email = t.err.fieldRequired
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = t.err.invalidEmail
    }

    const phone = formData.phone.trim()
    if (!phone) errors.phone = t.err.fieldRequired
    else if (!/^\+?[\d\s\-().]{7,20}$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) errors.phone = t.err.phoneInvalid

    if (!formData.password) {
      errors.password = t.err.fieldRequired
    } else if (formData.password.length < 8) {
      errors.password = t.err.passwordTooShort
    }

    if (!formData.confirmPassword) errors.confirmPassword = t.err.fieldRequired
    else if (formData.confirmPassword !== formData.password) errors.confirmPassword = t.err.passwordMismatch

    return errors
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const validationErrors = validateForm()
    setFieldErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setLoading(true)
    const email = formData.email.trim()

    try {
      const supabase = createClient()

      // 1. Create Supabase auth user with metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: formData.password,
        options: {
          data: {
            // Agreed by creating the account: the consent line sits right above the button.
            terms_accepted: true,
            // Who the account is (w9): read by ensure-default-client and the signup notice.
            full_name: formData.fullName.trim().slice(0, 120),
            ...(formData.company.trim() ? { company_name: formData.company.trim().slice(0, 120) } : {}),
            phone: formData.phone.trim().slice(0, 30),
            // Area G — persist the signup-origin language (derived from the route/param,
            // NOT the browser) so a later fresh-device login opens the app in that language.
            locale: lang,
          },
          // Carry the choice through the email-confirmation callback so it survives that hop.
          // The affiliate code rides on `next` here too: a visitor whose project
          // requires email confirmation reaches the dashboard through the
          // callback, which credits the partner there.
          emailRedirectTo: `${appUrl}/api/auth/callback?next=${encodeURIComponent(withReferral('/dashboard', referralCode))}&lang=${lang}`,
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
        email,
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

      // The partner who sent this visitor, credited now that the account exists
      // and the session is live. The route decides everything (the account must
      // be new, one account belongs to one partner for ever, the code must be an
      // approved partner's); the answer is ignored on purpose, because a
      // referral that cannot be created must never be the reason a signup fails.
      if (referralCode) {
        try {
          await fetch('/api/affiliate/attach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: referralCode }),
          })
        } catch { /* non-blocking */ }
      }

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
          // The route ignores the body and reads the verified user; nothing to send.
          body: JSON.stringify({}),
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
      variant="signup"
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
        <div className="space-y-2">
          <Badge variant="success">{t.trialBadge}</Badge>
          <h1 className={AUTH_TITLE_CLASSES}>{t.heading}</h1>
          <p className="text-copy text-body">{t.intro}</p>
        </div>

        {error && <NoticeBox tone="bad" language={lang}>{error}</NoticeBox>}

        {success && <NoticeBox tone="ok" language={lang}>{success}</NoticeBox>}

        {/* Off unless NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED. Held while a free-check claim is still being
            kept (it leaves the address once its cookie is set), so the claim survives the trip to Google. */}
        {/* Google's round trip keeps nothing of ours but the `next` path, so the
            affiliate code rides on it and app/api/auth/callback credits it there
            with the same function this form's own route calls. */}
        <GoogleSignInButton lang={lang} nextPath={withReferral('/dashboard', referralCode)} disabled={searchParams.has('claim')} />

        <form onSubmit={handleSubmit} className="space-y-4" noValidate data-signup-form>
          <Input
            label={t.fullName}
            type="text"
            value={formData.fullName}
            onChange={(e) => setField('fullName', e.target.value)}
            placeholder={t.fullNamePlaceholder}
            error={fieldErrors.fullName}
            required
            autoComplete="name"
            autoFocus
            maxLength={120}
            className="h-11"
          />

          <Input
            label={`${t.company} ${t.companyOptional}`}
            id="signup-company"
            type="text"
            value={formData.company}
            onChange={(e) => setField('company', e.target.value)}
            placeholder={t.companyPlaceholder}
            autoComplete="organization"
            maxLength={120}
            className="h-11"
          />

          <Input
            label={t.email}
            type="email"
            value={formData.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder={t.emailPlaceholder}
            error={fieldErrors.email}
            required
            autoComplete="email"
            className="h-11"
          />

          <Input
            label={t.phone}
            id="signup-phone"
            type="tel"
            inputMode="tel"
            value={formData.phone}
            onChange={(e) => setField('phone', e.target.value)}
            placeholder={t.phonePlaceholder}
            error={fieldErrors.phone}
            required
            autoComplete="tel"
            maxLength={30}
            className="h-11"
          />

          <PasswordField
            id="signup-password"
            label={t.password}
            value={formData.password}
            onChange={(password) => setField('password', password)}
            placeholder={t.passwordPlaceholder}
            hint={t.passwordHint}
            error={fieldErrors.password}
            showLabel={t.showPassword}
            hideLabel={t.hidePassword}
            autoComplete="new-password"
          />

          <PasswordField
            id="signup-password-confirm"
            label={t.confirmPassword}
            value={formData.confirmPassword}
            onChange={(confirmPassword) => setField('confirmPassword', confirmPassword)}
            placeholder={t.confirmPasswordPlaceholder}
            error={fieldErrors.confirmPassword}
            showLabel={t.showPassword}
            hideLabel={t.hidePassword}
            autoComplete="new-password"
          />

          <p className="text-caption text-muted" data-signup-consent>
            {t.consentBefore}
            <Link href={t.termsHref} className={AUTH_LINK_CLASSES} target="_blank">{t.terms}</Link>
            {t.consentMiddle}
            <Link href={t.privacyPolicyHref} className={AUTH_LINK_CLASSES} target="_blank">{t.privacyPolicy}</Link>
            {t.consentAfter}
          </p>

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
