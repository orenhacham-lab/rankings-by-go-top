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
 *  4. A CRAWLER CAN ALSO BE ALLOWED ON PURPOSE, AND THAT IS THE SECTION'S
 *     SHARPEST EDGE. The reading behind this page found that of the sites
 *     blocking OAI-SearchBot — the crawler that fetches a page while a person
 *     waits for an answer that cites and links it — 43.6% never chose it: the
 *     block came from a `*` group aimed at every bot alike. There is no way to
 *     carve one crawler back out of a `*` group by editing that group, because
 *     RFC 9309 selects ONE group. The only fix is a group that names the
 *     crawler, and `Disallow:` with nothing after it is the documented way to
 *     say "no restrictions" (rule 4 in lib/ai-crawlers/robots.ts). Two lines,
 *     and the catch-all stops applying to that crawler alone. Nothing else we
 *     could ship undoes a bigger accident, so the switch has three positions
 *     rather than two: out of the file, allowed on purpose, blocked.
 *  5. THE OUTPUT CARRIES NO LOCALISED TEXT. A robots.txt is read by machines
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

/**
 * One group per chosen token, in table order. Empty string when none are chosen.
 *
 * `blocked` gets `Disallow: /`; `allowed` gets an empty `Disallow:`, which is
 * robots.txt's own way of writing "no restrictions" and is the only thing that
 * lifts a `*` block off one crawler. A token in both lists is treated as
 * blocked: the UI cannot produce that, and of the two readings the safer one is
 * the one that does not quietly open a site up.
 */
export function buildRobotsBlock(
  blocked: readonly string[],
  allowed: readonly string[] = [],
): string {
  const groups = GENERATOR_CRAWLERS.map((c) => c.token)
    .map((t) =>
      blocked.includes(t)
        ? `User-agent: ${t}\nDisallow: /`
        : allowed.includes(t)
          ? `User-agent: ${t}\nDisallow:`
          : null,
    )
    .filter((g): g is string => g !== null)
  if (groups.length === 0) return ''
  return groups.join('\n\n') + '\n'
}

/** What the reader has decided about one crawler. `out` writes no lines at all. */
type Choice = 'out' | 'allow' | 'block'

export function AiRobotsGenerator({ copy }: { copy: AiCrawlerCopy }) {
  const [choices, setChoices] = useState<Readonly<Record<string, Choice>>>({})
  const [copied, setCopied] = useState(false)

  const blocked = useMemo(
    () => Object.keys(choices).filter((t) => choices[t] === 'block'),
    [choices],
  )
  const allowed = useMemo(
    () => Object.keys(choices).filter((t) => choices[t] === 'allow'),
    [choices],
  )
  const output = useMemo(() => buildRobotsBlock(blocked, allowed), [blocked, allowed])

  const choose = useCallback((token: string, choice: Choice) => {
    setCopied(false)
    setChoices((prev) => (prev[token] === choice ? prev : { ...prev, [token]: choice }))
  }, [])

  const setAll = useCallback((choice: Choice) => {
    setCopied(false)
    setChoices(Object.fromEntries(GENERATOR_CRAWLERS.map((c) => [c.token, choice])))
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

  /* The three positions, in the order a reader reads them: no opinion, then the
     two opinions. `out` first keeps the default on the left, where nothing has
     been decided yet. */
  const POSITIONS: readonly { value: Choice; label: string }[] = [
    { value: 'out', label: copy.generator.notInFile },
    { value: 'allow', label: copy.generator.allowExplicitly },
    { value: 'block', label: copy.results.blocked },
  ]

  return (
    <section id="robots-generator" className="mt-14">
      <h2 className="inline-flex items-center gap-2 text-lead font-bold text-ink">
        <FileCode2 className="h-5 w-5 shrink-0 text-action" aria-hidden />
        {copy.generator.title}
      </h2>
      <p className="mt-2 max-w-2xl text-copy text-body">{copy.generator.intro}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setChoices({})}>
          {copy.generator.clearAll}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setAll('block')}>
          {copy.generator.blockAll}
        </Button>
      </div>

      <ul className="mt-4 divide-y divide-line/60 overflow-hidden rounded-card border border-line bg-surface shadow-control">
        {GENERATOR_CRAWLERS.map((c) => {
          const choice: Choice = choices[c.token] ?? 'out'
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
              {/* Three positions rather than a checkbox, because "allowed on
                  purpose" is a decision a reader makes and writes down, and an
                  unticked checkbox cannot say it. */}
              <span className="inline-flex shrink-0 rounded-control border border-line p-0.5" role="group">
                {POSITIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={choice === p.value}
                    onClick={() => choose(c.token, p.value)}
                    className={cn(
                      'rounded-control px-3 py-1 text-caption font-semibold transition-colors',
                      choice === p.value ? 'bg-sunk text-ink' : 'text-muted hover:text-ink',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
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
            {blocked.length > 0 && (
              <p className="mt-2 inline-flex max-w-2xl gap-2 text-caption text-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{copy.generator.outputNote}</span>
              </p>
            )}
            {allowed.length > 0 && (
              <p className="mt-2 inline-flex max-w-2xl gap-2 text-caption text-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{copy.generator.allowNote}</span>
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
