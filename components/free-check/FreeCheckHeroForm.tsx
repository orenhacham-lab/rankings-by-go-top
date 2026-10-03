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
import type { PublicLocale } from '@/lib/i18n/locales'
import { cn } from '@/lib/utils'

/**
 * `inverse` is the home hero's navy variant (wave 8): a white 56px field and
 * the action button on a frosted plate, start-aligned under the headline.
 */
export function FreeCheckHeroForm({ locale, tone = 'default' }: { locale: PublicLocale; tone?: 'default' | 'inverse' }) {
  const inverse = tone === 'inverse'
  const copy = freeCheckCopy(locale)
  const router = useRouter()
  const [url, setUrl] = useState('')
  const target = locale === 'en' ? '/en/free-check' : '/free-check'

  return (
    <form
      className={cn('w-full', inverse ? 'max-w-2xl' : 'max-w-xl mx-auto')}
      onSubmit={(e) => {
        e.preventDefault()
        const candidate = url.trim()
        router.push(candidate ? `${target}?url=${encodeURIComponent(candidate)}` : target)
      }}
    >
      <label htmlFor="hero-free-check-url" className="sr-only">
        {copy.form.label}
      </label>
      <div
        className={cn(
          'flex flex-col gap-2 rounded-card p-2 sm:flex-row',
          inverse ? 'bg-white/15 p-2.5 ring-2 ring-white/40 shadow-[0_12px_40px_rgb(0_0_0/0.3)] backdrop-blur-sm' : 'border border-line bg-surface shadow-card',
        )}
      >
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
            className={cn(
              'text-start',
              inverse
                ? 'h-16 border-transparent bg-surface text-section focus:ring-white/40'
                : 'h-11 border-transparent bg-sunk/60 shadow-none hover:border-line focus:bg-surface',
            )}
          />
        </div>
        <Button type="submit" size="lg" className={cn('shrink-0', inverse && 'h-16 px-8 text-section focus-visible:ring-white/50')}>
          {copy.form.submit}
          <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Button>
      </div>
      <p className={cn('mt-2.5 text-caption', inverse ? 'text-start text-copy text-contrast-ink/80' : 'text-center text-muted')}>{copy.page.badge}</p>
    </form>
  )
}
