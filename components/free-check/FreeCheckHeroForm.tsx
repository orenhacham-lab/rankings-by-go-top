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
import { ArrowRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { freeCheckCopy } from '@/lib/free-check/copy'
import type { Locale } from '@/lib/i18n/locales'

export function FreeCheckHeroForm({ locale }: { locale: Locale }) {
  const copy = freeCheckCopy(locale)
  const router = useRouter()
  const [url, setUrl] = useState('')
  const target = locale === 'en' ? '/en/free-check' : '/free-check'

  return (
    <form
      className="mx-auto w-full max-w-xl"
      onSubmit={(e) => {
        e.preventDefault()
        const candidate = url.trim()
        router.push(candidate ? `${target}?url=${encodeURIComponent(candidate)}` : target)
      }}
    >
      <label htmlFor="hero-free-check-url" className="sr-only">
        {copy.form.label}
      </label>
      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-2 shadow-card sm:flex-row">
        <div className="min-w-0 flex-1">
          <Input
            id="hero-free-check-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={copy.form.placeholder}
            className="h-11 border-transparent bg-sunk/60 text-start shadow-none hover:border-line focus:bg-surface"
          />
        </div>
        <Button type="submit" size="lg" className="shrink-0">
          {copy.form.submit}
          <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Button>
      </div>
      <p className="mt-2.5 text-center text-caption text-muted">{copy.page.badge}</p>
    </form>
  )
}
