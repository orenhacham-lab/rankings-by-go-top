'use client'

/**
 * "Continue with Google", above the email form of the sign-in and sign-up
 * pages. Shown only when lib/auth/google-signin.ts says so (the flag on, not a
 * Shopify destination, not inside a frame); otherwise it renders nothing, and
 * the page is exactly as before.
 *
 * Supabase hosts the OAuth dance (PKCE) and returns to the existing callback.
 * A failure to start it is one sentence in the page's language; the provider's
 * own message is never shown.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { googleRedirectTo, googleSignInEnabled, googleSignInVisible } from '@/lib/auth/google-signin'
import type { Locale } from '@/lib/i18n/locales'

const COPY = {
  he: { label: 'המשך עם Google', or: 'או', failed: 'לא הצלחנו להתחיל את ההתחברות עם Google. נסו שוב, או המשיכו עם אימייל.' },
  en: { label: 'Continue with Google', or: 'or', failed: "We couldn't start signing in with Google. Try again, or continue with email." },
} as const

export default function GoogleSignInButton({ lang, nextPath, disabled = false }: { lang: Locale; nextPath: string; disabled?: boolean }) {
  const t = COPY[lang]
  const [framed, setFramed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    try {
      setFramed(window.self !== window.top)
    } catch {
      // A cross-origin parent throws on access: that is a frame too.
      setFramed(true)
    }
  }, [])

  if (!googleSignInVisible({ enabled: googleSignInEnabled(), nextPath, framed })) return null

  async function start() {
    if (busy || disabled) return
    setBusy(true)
    setError(false)
    try {
      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: googleRedirectTo(window.location.origin, nextPath, lang) },
      })
      if (oauthError) {
        setError(true)
        setBusy(false)
      }
      // On success the browser is already on its way to Google.
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <div className="mb-6" data-google-signin>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy || disabled}
        aria-busy={busy || undefined}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-[0.9375rem] font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        {t.label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {t.failed}
        </p>
      )}
      <div className="mt-6 flex items-center gap-3 text-xs text-slate-400" aria-hidden>
        <span className="h-px flex-1 bg-slate-200" />
        {t.or}
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  )
}
