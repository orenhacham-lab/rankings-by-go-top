'use client'

/**
 * The landing-page hero's entry point into the free check.
 *
 * It navigates rather than scanning in place: /free-check owns the three-state
 * experience, and handing the address over in the query string means the hero,
 * the nav link and a shared link all land on the same screen and behave
 * identically. The value is encoded, and the API admits it independently — this
 * form trusts nothing.
 */
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { freeCheckCopy } from '@/lib/free-check/copy'
import type { Locale } from '@/lib/i18n/locales'

export function FreeCheckHeroForm({ locale }: { locale: Locale }) {
  const copy = freeCheckCopy(locale)
  const router = useRouter()
  const [url, setUrl] = useState('')
  const target = locale === 'en' ? '/en/free-check' : '/free-check'

  return (
    <form
      className="mx-auto max-w-xl bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/60 p-3 sm:p-4"
      onSubmit={(e) => {
        e.preventDefault()
        const candidate = url.trim()
        router.push(candidate ? `${target}?url=${encodeURIComponent(candidate)}` : target)
      }}
    >
      <div className="flex flex-col sm:flex-row gap-2.5">
        <label htmlFor="hero-free-check-url" className="sr-only">
          {copy.form.label}
        </label>
        <input
          id="hero-free-check-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          dir="ltr"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={copy.form.placeholder}
          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="submit"
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-600/25 hover:from-blue-700 hover:to-indigo-700 transition-all whitespace-nowrap"
        >
          {copy.form.submit}
        </button>
      </div>
      <p className="mt-2.5 text-xs text-slate-500 text-center">{copy.page.badge}</p>
    </form>
  )
}
