'use client'

/**
 * The two pieces of the partner's dashboard that need a browser: the link box
 * and the ready-to-post texts. Everything else on that screen is server
 * rendered, because everything else is a number.
 *
 * COPYING IS THE WHOLE INTERACTION. A partner's job is to put a link somewhere
 * else, so the only control that matters is one that puts it on the clipboard
 * and says it did. `navigator.clipboard` is missing or refused often enough
 * (an insecure origin, an old browser, a hardened profile) that the failure path
 * is not theoretical: the text stays selectable and the button simply does not
 * claim success.
 */
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AFFILIATE_DASHBOARD_COPY, CREATIVE_LINK_TOKEN } from '@/lib/i18n/public/affiliate-dashboard'
import type { PublicLocale } from '@/lib/i18n/locales'

function useCopier() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000)
    } catch {
      // Nothing is claimed that did not happen: the text is selectable, so the
      // partner can still copy it by hand.
    }
  }
  return { copied, copy }
}

export function PartnerLinkPanel({ locale, links }: { locale: PublicLocale; links: { label: string; url: string }[] }) {
  const c = AFFILIATE_DASHBOARD_COPY[locale]
  const { copied, copy } = useCopier()
  return (
    <Card>
      <h2 className="text-copy font-semibold text-ink">{c.linkTitle}</h2>
      <p className="mt-1 text-caption text-muted">{c.linkHint}</p>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.url} className="flex flex-wrap items-center gap-3">
            <span className="min-w-28 text-caption text-muted">{link.label}</span>
            <code dir="ltr" className="min-w-0 flex-1 truncate rounded-inset border border-line bg-sunk px-3 py-2 text-caption text-ink">{link.url}</code>
            <Button variant="secondary" size="sm" onClick={() => copy(link.url, link.url)}>
              {copied === link.url
                ? <><Check aria-hidden className="size-4" />{c.copied}</>
                : <><Copy aria-hidden className="size-4" />{c.copyLink}</>}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function PartnerCreatives({ locale, link }: { locale: PublicLocale; link: string }) {
  const c = AFFILIATE_DASHBOARD_COPY[locale]
  const { copied, copy } = useCopier()
  return (
    <Card>
      <h2 className="text-copy font-semibold text-ink">{c.creativesTitle}</h2>
      <p className="mt-1 text-caption text-muted">{c.creativesHint}</p>
      <div className="mt-4 space-y-4">
        {c.creatives.map((creative) => {
          // The partner's own link, dropped in where the draft expects it, so
          // nothing they paste points at a code that is not theirs.
          const body = creative.body.split(CREATIVE_LINK_TOKEN).join(link)
          return (
            <div key={creative.label} className="rounded-inset border border-line bg-sunk p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-caption font-semibold text-ink">{creative.label}</span>
                <Button variant="ghost" size="sm" onClick={() => copy(creative.label, body)}>
                  {copied === creative.label
                    ? <><Check aria-hidden className="size-4" />{c.copied}</>
                    : <><Copy aria-hidden className="size-4" />{c.creativeCopy}</>}
                </Button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-caption text-body">{body}</p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
