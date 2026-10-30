/**
 * A robots.txt parser and matcher, written to RFC 9309.
 *
 * It is a pure function of a string: no network, no clock, no environment. The
 * route fetches the file (lib/free-check/site-fetch.ts) and hands the text
 * here, which is what lets the whole of this module be exercised by the QA
 * suite without a live site.
 *
 * WHY NOT A LIBRARY. The answer the page gives is not "allowed / blocked"; it
 * is "allowed / blocked, BECAUSE of this line, in this group". Every parser we
 * looked at returns the boolean and throws the provenance away, and the
 * provenance is the entire reason a reader trusts the verdict instead of
 * re-reading their own file. So the matcher returns the deciding rule.
 *
 * THE FOUR RULES THAT ARE EASY TO GET WRONG, and that the QA suite pins:
 *
 *  1. GROUP SELECTION IS EXACT, NOT PREFIX. A group for `Google-Extended` does
 *     NOT govern `Googlebot`, and a group for `Googlebot` does not govern
 *     `Googlebot-Image`. RFC 9309 matches the product token itself, case
 *     insensitively. A prefix match here is the classic bug that reports a site
 *     as blocking Google when it blocks one Google product.
 *  2. `*` IS A FALLBACK, NOT AN ADDITION. If any group names the crawler, the
 *     `*` group is ignored entirely — not merged, not consulted for paths the
 *     specific group is silent about. A site whose `*` group disallows
 *     everything and whose `GPTBot` group is empty ALLOWS GPTBot everywhere.
 *  3. LONGEST MATCH WINS, AND ALLOW BREAKS THE TIE. `Disallow: /blog/` plus
 *     `Allow: /blog/public/` allows `/blog/public/x`. Equal-length Allow and
 *     Disallow resolve to Allow.
 *  4. AN EMPTY `Disallow:` ALLOWS EVERYTHING. It is the documented way to say
 *     "no restrictions", and reading it as a zero-length prefix — which every
 *     path matches — inverts the file's meaning completely.
 */

export type RobotsRule = {
  kind: 'allow' | 'disallow'
  /** The path pattern exactly as written in the file. */
  pattern: string
  /** 1-based line number in the file, so the UI can quote it. */
  line: number
}

export type RobotsGroup = {
  /** The user-agent tokens this group is for, as written. */
  agents: string[]
  rules: RobotsRule[]
}

export type ParsedRobots = {
  groups: RobotsGroup[]
  /** `Sitemap:` lines, which are global and belong to no group. */
  sitemaps: string[]
  /** True when the file had no `User-agent:` line at all. */
  empty: boolean
}

/**
 * Split a robots.txt into groups.
 *
 * A run of consecutive `User-agent:` lines opens one group that all of them
 * share; the first rule line closes the run, and the next `User-agent:` after
 * a rule starts a new group. Groups naming the same agent are NOT merged here —
 * `rulesFor` merges them, which keeps this function a faithful reading of the
 * file and puts the RFC's merging rule in one place.
 */
export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = []
  const sitemaps: string[] = []
  let current: RobotsGroup | null = null
  // True while we are still inside the run of User-agent lines that opens a
  // group, i.e. before that group's first rule.
  let collectingAgents = false
  let sawAgent = false

  const lines = text.split(/\r\n|\r|\n/)
  for (let i = 0; i < lines.length; i++) {
    // A `#` starts a comment anywhere on the line, including mid-value.
    const raw = lines[i].split('#')[0].trim()
    if (!raw) continue
    const colon = raw.indexOf(':')
    if (colon === -1) continue
    const field = raw.slice(0, colon).trim().toLowerCase()
    const value = raw.slice(colon + 1).trim()

    if (field === 'user-agent') {
      sawAgent = true
      if (!collectingAgents || !current) {
        current = { agents: [], rules: [] }
        groups.push(current)
        collectingAgents = true
      }
      if (value) current.agents.push(value)
      continue
    }

    if (field === 'sitemap') {
      if (value) sitemaps.push(value)
      continue
    }

    if (field === 'allow' || field === 'disallow') {
      // A rule before any `User-agent:` line belongs to no group and is
      // discarded, exactly as a crawler discards it.
      if (!current) continue
      collectingAgents = false
      current.rules.push({ kind: field, pattern: value, line: i + 1 })
      continue
    }

    // `Crawl-delay`, `Host`, and anything else: not ours to interpret, but it
    // does close the user-agent run the same way a rule does.
    if (current) collectingAgents = false
  }

  return { groups, sitemaps, empty: !sawAgent }
}

/**
 * The rules that govern one crawler, and whether they came from its own group
 * or from the `*` fallback.
 *
 * Every group naming the token is merged, per RFC 9309 — a file may legally
 * list `User-agent: GPTBot` twice with different rules — but the `*` group is
 * consulted ONLY when no group names the token at all.
 */
export function rulesFor(parsed: ParsedRobots, token: string): { rules: RobotsRule[]; source: 'agent' | 'wildcard' | 'none' } {
  const wanted = token.toLowerCase()
  const named = parsed.groups.filter((g) => g.agents.some((a) => a.toLowerCase() === wanted))
  if (named.length) return { rules: named.flatMap((g) => g.rules), source: 'agent' }

  const wildcard = parsed.groups.filter((g) => g.agents.some((a) => a.trim() === '*'))
  if (wildcard.length) return { rules: wildcard.flatMap((g) => g.rules), source: 'wildcard' }

  return { rules: [], source: 'none' }
}

/**
 * Does a robots.txt path pattern match a path?
 *
 * `*` stands for any run of characters and `$` at the very end anchors the
 * match to the end of the path; everything else is literal. The pattern is
 * always anchored at the START of the path — robots.txt patterns are prefixes,
 * never substrings, so `/blog` does not match `/my/blog`.
 *
 * Returns the number of characters of the pattern that were used to decide, or
 * null for no match. That length IS the specificity RFC 9309 ranks rules by.
 */
export function matchLength(pattern: string, path: string): number | null {
  // An empty Disallow is "no restriction"; the caller drops it before getting
  // here, and an empty Allow is meaningless in the same way.
  if (pattern === '') return null

  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern

  // No wildcard: a plain prefix test, which is the overwhelmingly common case
  // and avoids building a regex for it.
  if (!body.includes('*')) {
    if (anchored) return path === body ? pattern.length : null
    return path.startsWith(body) ? pattern.length : null
  }

  const escaped = body
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  const re = new RegExp(`^${escaped}${anchored ? '$' : ''}`)
  return re.test(path) ? pattern.length : null
}

export type Verdict = {
  allowed: boolean
  /** Which group decided: the crawler's own, the `*` fallback, or neither. */
  source: 'agent' | 'wildcard' | 'none'
  /** The rule that decided, when one did. Null means "nothing matched". */
  decidedBy: RobotsRule | null
}

/**
 * Is `path` allowed for `token` by this robots.txt?
 *
 * Default is ALLOW: robots.txt is an opt-out list, so a path no rule matches is
 * open, and so is a crawler no group names.
 */
export function isAllowed(parsed: ParsedRobots, token: string, path: string): Verdict {
  const { rules, source } = rulesFor(parsed, token)

  let best: { rule: RobotsRule; length: number } | null = null
  for (const rule of rules) {
    // RULE 4: an empty `Disallow:` is the documented "allow everything", not a
    // zero-length prefix that matches every path.
    if (rule.pattern === '') continue
    const length = matchLength(rule.pattern, path)
    if (length === null) continue
    if (
      best === null ||
      length > best.length ||
      // RULE 3: equal specificity resolves to Allow.
      (length === best.length && rule.kind === 'allow' && best.rule.kind === 'disallow')
    ) {
      best = { rule, length }
    }
  }

  if (!best) return { allowed: true, source, decidedBy: null }
  return { allowed: best.rule.kind === 'allow', source, decidedBy: best.rule }
}

/**
 * Normalise the path a visitor typed into the form into the path a crawler
 * would test. Everything that is not a path is dropped, and a bare `blog`
 * becomes `/blog`, because that is plainly what was meant.
 */
export function normalizeCheckPath(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return '/'
  // A whole URL pasted into the path field: keep only its path.
  let value = trimmed
  const schemed = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
  if (schemed) {
    try {
      const u = new URL(value)
      value = u.pathname + u.search
    } catch {
      return '/'
    }
  }
  if (!value.startsWith('/')) value = `/${value}`
  // Robots matching is done against the path, so a fragment is not part of it.
  value = value.split('#')[0]
  return value.slice(0, 500) || '/'
}
