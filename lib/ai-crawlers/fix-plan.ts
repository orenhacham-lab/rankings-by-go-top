/**
 * What to WRITE, once the checker has said what the file says.
 *
 * The checker answers "is this crawler allowed". Every reader who gets an
 * answer they did not want asks "so what do I change", and until now the page
 * answered that only in the abstract: the generator below the results builds
 * lines from a table, without ever having read the reader's own file. This
 * module closes that, because by the time the results render we HAVE their
 * file, group by group and line by line.
 *
 * The reason this is worth a module of its own is the measurement behind the
 * page: of the sites blocking OAI-SearchBot — the crawler that fetches a page
 * while a person waits for an answer that cites and links it — 43.6% never
 * chose it. The block came from a `*` group aimed at every bot alike. That is
 * the commonest accident on this page by a distance, and it has a two-line fix
 * that nobody discovers on their own.
 *
 * THE ANSWER COMES IN TWO HALVES, and the split is RFC 9309's, not a design
 * preference (both rules are documented in ./robots.ts):
 *
 *  - `paste` — the block came from the `*` group. A group that NAMES the
 *    crawler replaces the `*` group for it (rule 2), and `Disallow:` with
 *    nothing after it is the documented way to say "no restrictions" (rule 4).
 *    Two lines, and the catch-all stops applying to that one crawler.
 *  - `edit` — the block came from a group that already names the crawler.
 *    Pasting is worse than useless here: groups naming the same agent MERGE,
 *    so the existing `Disallow: /` stays in force and the reader would conclude
 *    the advice was wrong. The deciding line and its number are named instead,
 *    because that line is what has to go.
 *
 * WHAT IS DELIBERATELY NOT PROPOSED. Classic search crawlers: their rules are
 * not ours to rewrite, for the same reason the generator offers no Googlebot
 * switch. Crawlers whose operator says they may ignore robots.txt: an allow
 * line there is a reassurance nobody has promised to honour. And `train`
 * crawlers, ever: blocking a training corpus is a legitimate editorial choice
 * somebody probably made on purpose, and a page that nudges them to undo it
 * has stopped being a checker and started being an argument.
 */
import type { CrawlerVerdict } from './types'

export type FixPlan = {
  /** The robots.txt lines to paste, or '' when there are none. */
  lines: string
  /** Tokens those lines cover, in the order the results list them. */
  paste: string[]
  /** Blocked by their own group: the line to edit, not lines to add. */
  edit: { token: string; line: number | null }[]
}

export function buildFixPlan(verdicts: readonly CrawlerVerdict[]): FixPlan {
  const candidates = verdicts.filter(
    (v) =>
      !v.allowed &&
      !v.classicSearch &&
      v.respectsRobots &&
      (v.purpose === 'search' || v.purpose === 'answer'),
  )
  const paste = candidates.filter((v) => v.source !== 'agent')
  const edit = candidates
    .filter((v) => v.source === 'agent')
    .map((v) => ({ token: v.token, line: v.rule?.line ?? null }))
  const lines = paste.length
    ? paste.map((v) => `User-agent: ${v.token}\nDisallow:`).join('\n\n') + '\n'
    : ''
  return { lines, paste: paste.map((v) => v.token), edit }
}
