'use client'

/**
 * The AI crawler access checker, as a visitor experiences it.
 *
 * Three things shape this screen and are worth stating, because each of them
 * is the difference between a tool a stranger links to and a lead magnet
 * nobody cites:
 *
 *  1. THE REFERENCE TABLE IS ALWAYS THERE. It renders before anyone types
 *     anything, it is plain server-rendered markup, and it is the same table
 *     whether a check has run or not. That is what a writer links to; the
 *     interactive part is what they came for the first time.
 *  2. THE VERDICT SHOWS ITS WORKING. Every blocked row quotes the deciding
 *     line and its line number, so the reader can open their own file and find
 *     it. A red dot with no reason is something to distrust.
 *  3. THE LIMITS ARE ON THE PAGE, not in a footnote. robots.txt is a request;
 *     a crawler can ignore it; a CDN can block one it allows. Saying so is
 *     what makes the rest of the page believable.
 *
 * The call to action sits at the BOTTOM, after the answer and after the
 * limits. Nothing is gated, nothing is held back for an email address.
 */
import Link from 'next/link'
import { useCallback, useState, type FormEvent } from 'react'
import { Bot, Check, CircleAlert, FileText, Info, Search, Sparkles, X } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { buttonClasses, Eyebrow } from '@/components/public/marketing'
import { cn } from '@/lib/utils'
import { AI_CRAWLERS } from '@/lib/ai-crawlers/agents'
import { aiCrawlerCopy } from '@/lib/ai-crawlers/copy'
import type { AiCrawlerErrorCode, AiCrawlerResponse, AiCrawlerResult, CrawlerVerdict } from '@/lib/ai-crawlers/types'
import { authHref } from '@/lib/i18n/auth-href'
import type { PublicLocale } from '@/lib/i18n/locales'

function VerdictRow({ verdict, copy, dir }: { verdict: CrawlerVerdict; copy: ReturnType<typeof aiCrawlerCopy>; dir: 'rtl' | 'ltr' }) {
  const good = verdict.allowed
  return (
    <li
      className={cn(
        'flex flex-col gap-1 border-s-2 bg-surface px-4 py-3 shadow-control sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        good ? 'border-s-ok' : 'border-s-bad',
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-copy font-semibold text-ink" dir="ltr">
            {verdict.token}
          </code>
          <Badge variant="neutral">{copy.purposes[verdict.purpose].label}</Badge>
          {!verdict.respectsRobots && (
            <span className="inline-flex items-center gap-1 text-caption text-warn">
              <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {copy.results.ignoresRobots}
            </span>
          )}
        </div>
        <p className="mt-1 text-caption text-muted">
          {verdict.operator}
          {verdict.rule ? (
            <>
              {' · '}
              {copy.results.decidedBy}{' '}
              <code dir="ltr" className="text-ink">
                {verdict.rule.kind === 'allow' ? 'Allow' : 'Disallow'}: {verdict.rule.pattern}
              </code>{' '}
              <span dir="ltr">(L{verdict.rule.line})</span>
              {verdict.source === 'wildcard' ? ` · ${copy.results.viaWildcard}` : ''}
            </>
          ) : (
            <>
              {' · '}
              {copy.results.noRule}
            </>
          )}
        </p>
      </div>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 text-copy font-semibold',
          good ? 'text-ok' : 'text-bad',
        )}
        dir={dir}
      >
        {good ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
        {good ? copy.results.allowed : copy.results.blocked}
      </span>
    </li>
  )
}

function Results({ result, copy, dir }: { result: AiCrawlerResult; copy: ReturnType<typeof aiCrawlerCopy>; dir: 'rtl' | 'ltr' }) {
  const ai = result.verdicts.filter((v) => !v.classicSearch)
  const classic = result.verdicts.filter((v) => v.classicSearch)

  return (
    <section className="mt-10" aria-live="polite">
      <h2 className="text-lead font-bold text-ink">
        {copy.results.heading}{' '}
        <span dir="ltr" className="text-action">
          {result.domain}
        </span>{' '}
        <span className="text-muted">
          {copy.results.forPath}{' '}
          <code dir="ltr">{result.path}</code>
        </span>
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-copy">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ok">
          {result.summary.allowed} {copy.results.allowedCount}
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-bad">
          {result.summary.blocked} {copy.results.blockedCount}
        </span>
        {result.robots === 'found' && (
          <span className="inline-flex items-center gap-1.5 text-caption text-muted">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {copy.results.robotsFound} <span dir="ltr">({result.bytes} B)</span>
          </span>
        )}
      </div>

      {result.robots === 'absent' && (
        <p className="mt-3 rounded-card border border-line bg-sunk/60 px-4 py-3 text-copy text-body">{copy.results.robotsAbsent}</p>
      )}
      {result.robots === 'unreadable' && (
        <p className="mt-3 rounded-card border border-line bg-sunk/60 px-4 py-3 text-copy text-body">{copy.results.robotsUnreadable}</p>
      )}

      <h3 className="mt-7 text-copy font-bold text-ink">{copy.groups.ai}</h3>
      <ul className="mt-2 space-y-2 rounded-card">
        {ai.map((v) => (
          <VerdictRow key={v.token} verdict={v} copy={copy} dir={dir} />
        ))}
      </ul>

      <h3 className="mt-7 text-copy font-bold text-ink">{copy.groups.classic}</h3>
      <ul className="mt-2 space-y-2">
        {classic.map((v) => (
          <VerdictRow key={v.token} verdict={v} copy={copy} dir={dir} />
        ))}
      </ul>

      {result.sitemaps.length > 0 && (
        <div className="mt-7">
          <h3 className="text-copy font-bold text-ink">{copy.results.sitemapsTitle}</h3>
          <ul className="mt-2 space-y-1">
            {result.sitemaps.map((s) => (
              <li key={s} dir="ltr" className="truncate text-caption text-muted">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export function AiCrawlerChecker({ locale, initialUrl = '' }: { locale: PublicLocale; initialUrl?: string }) {
  const copy = aiCrawlerCopy(locale)
  const dir: 'rtl' | 'ltr' = locale === 'he' ? 'rtl' : 'ltr'
  const signupHref = authHref('signup', locale)

  const [url, setUrl] = useState(initialUrl)
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AiCrawlerErrorCode | null>(null)
  const [result, setResult] = useState<AiCrawlerResult | null>(null)

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (busy || !url.trim()) return
      setBusy(true)
      setError(null)
      try {
        const res = await fetch('/api/ai-crawlers', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url, path }),
        })
        // A body that is not the contract — a proxy's error page, a dropped
        // connection — is the generic failure, never a parse exception.
        const data = (await res.json().catch(() => null)) as AiCrawlerResponse | null
        if (!data || !data.ok) {
          setError(data?.ok === false ? data.code : 'internal')
          setResult(null)
        } else {
          setResult(data.result)
        }
      } catch {
        setError('internal')
        setResult(null)
      } finally {
        setBusy(false)
      }
    },
    [busy, path, url],
  )

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-16" dir={dir}>
      <Eyebrow icon={Bot}>{copy.page.badge}</Eyebrow>
      <h1 className="mt-4 text-display font-bold text-ink">{copy.page.title}</h1>
      <p className="mt-3 max-w-2xl text-lead text-body">{copy.page.subtitle}</p>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {copy.page.trust.map((t) => (
          <li key={t} className="inline-flex items-center gap-1.5 text-caption text-muted">
            <Check className="h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
            {t}
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="mt-8 grid gap-4 rounded-card border border-line bg-surface p-5 shadow-control sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <Input
          label={copy.form.urlLabel}
          // `text`, not `url`: the browser's own `type="url"` validation
          // rejects a bare `example.com`, which is exactly how a visitor types
          // a domain. The server's URL guard admits it and assumes https.
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={copy.form.urlPlaceholder}
          maxLength={300}
          required
        />
        <Input
          label={copy.form.pathLabel}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder={copy.form.pathPlaceholder}
          hint={copy.form.pathHint}
          maxLength={500}
        />
        <Button type="submit" loading={busy} disabled={busy} size="lg">
          <Search className="h-4 w-4" aria-hidden />
          {busy ? copy.form.submitting : copy.form.submit}
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-4 inline-flex items-center gap-2 rounded-control border border-bad/40 bg-bad/5 px-4 py-3 text-copy text-bad">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
          {copy.form.errors[error]}
        </p>
      )}

      {result && <Results result={result} copy={copy} dir={dir} />}

      {/* The reference table: always rendered, never behind the form. */}
      <section className="mt-14">
        <h2 className="text-lead font-bold text-ink">{copy.reference.title}</h2>
        <p className="mt-2 max-w-2xl text-copy text-body">{copy.reference.intro}</p>
        <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface shadow-control">
          <table className="w-full border-collapse text-copy">
            <thead>
              <tr className="border-b border-line bg-sunk/60 text-caption font-semibold text-ink">
                <th scope="col" className="px-4 py-2 text-start">{copy.reference.colAgent}</th>
                <th scope="col" className="px-4 py-2 text-start">{copy.reference.colOperator}</th>
                <th scope="col" className="px-4 py-2 text-start">{copy.reference.colPurpose}</th>
              </tr>
            </thead>
            <tbody>
              {AI_CRAWLERS.map((c) => (
                <tr key={c.token} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2 align-top">
                    <code dir="ltr" className="font-semibold text-ink">{c.token}</code>
                  </td>
                  <td className="px-4 py-2 align-top text-body">{c.operator}</td>
                  <td className="px-4 py-2 align-top text-body">
                    <span className="font-semibold text-ink">{copy.purposes[c.purpose].label}</span>
                    <span className="block text-caption text-muted">{copy.purposes[c.purpose].blurb}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 rounded-card border border-line bg-sunk/50 p-5">
        <h2 className="inline-flex items-center gap-2 text-copy font-bold text-ink">
          <Info className="h-4 w-4 shrink-0" aria-hidden />
          {copy.limits.title}
        </h2>
        <ul className="mt-3 space-y-2">
          {copy.limits.items.map((item) => (
            <li key={item} className="text-copy text-body">
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 rounded-card border border-line bg-surface p-6 shadow-control">
        <h2 className="inline-flex items-center gap-2 text-lead font-bold text-ink">
          <Sparkles className="h-5 w-5 shrink-0 text-action" aria-hidden />
          {copy.cta.title}
        </h2>
        <p className="mt-2 max-w-2xl text-copy text-body">{copy.cta.body}</p>
        <Link href={signupHref} className={buttonClasses('primary', 'lg', 'mt-4')}>
          {copy.cta.button}
        </Link>
      </section>
    </div>
  )
}
