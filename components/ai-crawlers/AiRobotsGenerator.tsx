'use client'

/**
 * The robots.txt line generator: the other half of the checker above it.
 *
 * The checker answers "what does my file say today". Every reader who gets an
 * answer they did not want then asks "so what should it say", and until now
 * the page sent them away to find out. This section answers it on the page,
 * from the same table, which is the whole reason it belongs here rather than
 * in a second asset nobody would link to.
 *
 * FOUR DECISIONS, each of which is a correctness matter rather than a taste
 * one:
 *
 *  1. CLASSIC SEARCH CRAWLERS ARE NOT OFFERED. Googlebot and Bingbot are in
 *     the reference table because people check them in the same breath, but a
 *     control that lets someone tick "block Googlebot" is a control that
 *     de-indexes their site, and no amount of warning text beside it makes
 *     that a reasonable thing for us to hand out. The generator is AI crawlers
 *     only, and `GENERATOR_CRAWLERS` is where that is enforced.
 *  2. THE DEFAULT IS ALLOW. Nothing starts blocked, so a reader who copies
 *     without reading copies nothing. The empty state says exactly that
 *     instead of printing a file that does nothing.
 *  3. ONE GROUP PER CRAWLER, NEVER A MERGED `User-agent` RUN. It would be
 *     shorter to emit one group naming every blocked token, and it would be
 *     correct by RFC 9309 — but the reader's next edit is almost always "allow
 *     this one again", and deleting two lines of their own group is a safe
 *     edit while editing one line out of a shared run is where people break
 *     the file.
 *  4. THE OUTPUT CARRIES NO LOCALISED TEXT. A robots.txt is read by machines
 *     and by whoever inherits the site; a Japanese or Hebrew comment inside it
 *     is noise to both. The warning the reader needs — that naming a crawler
 *     REPLACES their catch-all group for it (RFC 9309, and rule 2 in
 *     lib/ai-crawlers/robots.ts) — is on the page in their language, beside
 *     the box, where they will actually read it.
 */
import { useCallback, useMemo, useState } from 'react'
import { Check, Copy, FileCode2, Info } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { AI_CRAWLERS } from '@/lib/ai-crawlers/agents'
import type { AiCrawlerCopy } from '@/lib/ai-crawlers/copy'

/**
 * The crawlers the generator offers, in the table's own reading order.
 *
 * See decision 1 above: the classic search crawlers are filtered out on
 * purpose, and the guard in `__qa__/ai-crawler-generator.qa.ts` fails if that
 * filter is ever dropped.
 */
const GENERATOR_CRAWLERS = AI_CRAWLERS.filter((c) => !c.classicSearch)

/** One group per blocked token, in table order. Empty string when none are. */
export function buildRobotsBlock(blocked: readonly string[]): string {
  const tokens = GENERATOR_CRAWLERS.map((c) => c.token).filter((t) => blocked.includes(t))
  if (tokens.length === 0) return ''
  return tokens.map((t) => `User-agent: ${t}\nDisallow: /`).join('\n\n') + '\n'
}

export function AiRobotsGenerator({ copy }: { copy: AiCrawlerCopy }) {
  const [blocked, setBlocked] = useState<readonly string[]>([])
  const [copied, setCopied] = useState(false)

  const output = useMemo(() => buildRobotsBlock(blocked), [blocked])

  const toggle = useCallback((token: string) => {
    setCopied(false)
    setBlocked((prev) => (prev.includes(token) ? prev.filter((t) => t !== token) : [...prev, token]))
  }, [])

  const onCopy = useCallback(async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // A denied clipboard permission is not an error worth a message: the
      // textarea below holds the same text and is selectable by hand.
    }
  }, [output])

  return (
    <section id="robots-generator" className="mt-14">
      <h2 className="inline-flex items-center gap-2 text-lead font-bold text-ink">
        <FileCode2 className="h-5 w-5 shrink-0 text-action" aria-hidden />
        {copy.generator.title}
      </h2>
      <p className="mt-2 max-w-2xl text-copy text-body">{copy.generator.intro}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setCopied(false)
            setBlocked([])
          }}
        >
          {copy.generator.allowAll}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setCopied(false)
            setBlocked(GENERATOR_CRAWLERS.map((c) => c.token))
          }}
        >
          {copy.generator.blockAll}
        </Button>
      </div>

      <ul className="mt-4 divide-y divide-line/60 overflow-hidden rounded-card border border-line bg-surface shadow-control">
        {GENERATOR_CRAWLERS.map((c) => {
          const isBlocked = blocked.includes(c.token)
          return (
            <li key={c.token} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <code dir="ltr" className="font-semibold text-ink">
                  {c.token}
                </code>
                <span className="block text-caption text-muted">
                  {c.operator} · {copy.purposes[c.purpose].label}
                </span>
                {/* Said here, not only in the table above: a reader deciding
                    whether to block this one is entitled to know that for this
                    agent the file is a request nobody has promised to honour. */}
                {!c.respectsRobots && (
                  <span className="block text-caption text-muted">{copy.results.ignoresRobots}</span>
                )}
              </span>
              {/* A two-state switch rather than a checkbox, because "blocked"
                  and "allowed" are both positions a reader chooses, and an
                  unticked checkbox reads as "not decided yet". */}
              <span className="inline-flex shrink-0 rounded-control border border-line p-0.5" role="group">
                <button
                  type="button"
                  aria-pressed={!isBlocked}
                  onClick={() => isBlocked && toggle(c.token)}
                  className={cn(
                    'rounded-control px-3 py-1 text-caption font-semibold transition-colors',
                    isBlocked ? 'text-muted hover:text-ink' : 'bg-sunk text-ink',
                  )}
                >
                  {copy.results.allowed}
                </button>
                <button
                  type="button"
                  aria-pressed={isBlocked}
                  onClick={() => !isBlocked && toggle(c.token)}
                  className={cn(
                    'rounded-control px-3 py-1 text-caption font-semibold transition-colors',
                    isBlocked ? 'bg-sunk text-ink' : 'text-muted hover:text-ink',
                  )}
                >
                  {copy.results.blocked}
                </button>
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-copy font-bold text-ink">{copy.generator.outputTitle}</h3>
          {output !== '' && (
            <Button type="button" variant="secondary" size="sm" onClick={onCopy}>
              <span className="inline-flex items-center gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                {copied ? copy.generator.copied : copy.generator.copy}
              </span>
            </Button>
          )}
        </div>
        {output === '' ? (
          <p className="mt-2 max-w-2xl text-copy text-body">{copy.generator.nothingBlocked}</p>
        ) : (
          <>
            <textarea
              dir="ltr"
              readOnly
              value={output}
              rows={Math.min(24, output.split('\n').length + 1)}
              aria-label={copy.generator.outputTitle}
              className="mt-2 w-full rounded-card border border-line bg-sunk/60 p-4 font-mono text-caption text-ink"
            />
            <p className="mt-2 inline-flex max-w-2xl gap-2 text-caption text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{copy.generator.outputNote}</span>
            </p>
          </>
        )}
      </div>
    </section>
  )
}
