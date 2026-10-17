/**
 * Renders the keyword research page — the REAL page source, first render — in a
 * chosen scenario, for the screen suites. Not a suite itself (no `.qa.ts`).
 *
 * The page keeps its state in plain `useState` calls, so a scenario ("results on
 * screen, two selected, the opportunities panel open") is reached by seeding those
 * states BY NAME: the page source is read, each `const [name, setName] =
 * useState(init)` gets `init` wrapped in a lookup, and the result is loaded as a
 * virtual module at a path next to the page (so `@/` imports and node_modules
 * resolve exactly as for the page itself). Nothing is written to disk. The same
 * transform serves the page as it is now and any earlier version of its source
 * (the golden capture of today's screen), so both render under identical stubs.
 *
 * Stubbed, because they need a browser or a request: Next's router hooks, the
 * active project (a fixed project), the project row, and the scan research hook
 * (the scenario's scan view). Everything else is real, including the Search
 * Console hooks, which read responses primed with `primeGscResponse`.
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

const Module: any = require('module')
const fs: typeof import('fs') = require('fs')
const { join } = require('path') as typeof import('path')

export const ROOT = join(__dirname, '..', '..', '..')
export const PAGE_PATH = join(ROOT, 'app/(dashboard)/keyword-research/page.tsx')
const PAGE_DIR = join(ROOT, 'app/(dashboard)/keyword-research')

export const PROJECT_ID = 'a1111111-2222-3333-4444-555555555555'

/** What the stubs answer; a scenario sets it before rendering. */
export const H: {
  state: Record<string, unknown>
  scan: unknown
  active: { activeProjectId: string | null; projects: { id: string; name: string }[]; isResolved: boolean }
} = {
  state: {},
  scan: { view: { kind: 'none' }, reloadTracked: () => {}, retry: () => {} },
  active: { activeProjectId: PROJECT_ID, projects: [{ id: PROJECT_ID, name: 'Run Shop' }], isResolved: true },
}

const virtual = new Map<string, string>()

const origLoad = Module._load
Module._load = function (request: string, parent: any, isMain: boolean) {
  let resolved = request
  try { resolved = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (resolved.endsWith('lib/active-project/ActiveProjectProvider.tsx')) {
    return {
      useActiveProject: () => ({ ...H.active, projectsError: false, reloadProjects() {}, setActiveProject() {} }),
      ActiveProjectProvider: ({ children }: { children: unknown }) => children,
    }
  }
  if (resolved.endsWith('lib/active-project/useProjectRow.ts')) {
    return {
      useProjectRow: (id: string | null) => ({
        project: id ? { id, name: 'Run Shop', business_name: 'Run Shop', target_domain: 'runshop.co.il' } : null,
        status: id ? 'ready' : 'loading',
        reload() {},
      }),
    }
  }
  if (resolved.endsWith('components/keyword-research/useScanResearch.ts')) {
    return { useScanResearch: () => H.scan }
  }
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => '/keyword-research'
      : k === 'useSearchParams' ? () => new URLSearchParams()
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : (t as any)[k]),
  })
}

const origResolve = Module._resolveFilename
Module._resolveFilename = function (request: string, ...rest: any[]) {
  if (virtual.has(request)) return request
  return origResolve.call(this, request, ...rest)
}
const origRead = fs.readFileSync
;(fs as any).readFileSync = function (p: any, ...rest: any[]) {
  const key = typeof p === 'string' ? p : String(p)
  if (virtual.has(key)) {
    const text = virtual.get(key) as string
    return rest[0] ? text : Buffer.from(text)
  }
  return (origRead as any).call(fs, p, ...rest)
}

;(globalThis as any).__qaState = (name: string, init: () => unknown) => (name in H.state ? H.state[name] : init())

/** End of a balanced bracket run starting at `open` (the index of its opening char). */
function balanced(src: string, open: number, o: string, c: string): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === o) depth++
    else if (src[i] === c) {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error(`harness: unbalanced ${o}${c} at ${open}`)
}

/**
 * Every `const [x, setX] = useState<T>(init)` → `useState<T>(__qaState('x', () => (init)))`.
 * Returns the source and the state names it found, in order.
 */
export function seedableSource(src: string): { source: string; names: string[] } {
  const re = /const \[(\w+), set\w+\] = useState\b/g
  const names: string[] = []
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length
    if (src[i] === '<') i = balanced(src, i, '<', '>') + 1
    if (src[i] !== '(') throw new Error(`harness: useState of ${m[1]} has no call`)
    const close = balanced(src, i, '(', ')')
    const init = src.slice(i + 1, close).trim()
    out += src.slice(last, i + 1) + `(globalThis as any).__qaState(${JSON.stringify(m[1])}, () => (${init || 'undefined'}))`
    last = close
    names.push(m[1])
    re.lastIndex = close
  }
  return { source: out + src.slice(last), names }
}

const loaded = new Map<string, { Page: any; names: string[] }>()

/** The page component built from `source` (default: the page as it is on disk now). */
export function loadPage(tag = 'current', source?: string): { Page: any; names: string[] } {
  const hit = loaded.get(tag)
  if (hit) return hit
  const text = source ?? String(origRead.call(fs, PAGE_PATH, 'utf8'))
  const seeded = seedableSource(text)
  const path = join(PAGE_DIR, `page.qa-virtual-${tag}.tsx`)
  virtual.set(path, seeded.source)
  const Page = require(path).default
  const entry = { Page, names: seeded.names }
  loaded.set(tag, entry)
  return entry
}

export type Locale = 'he' | 'en'

/** The first render of the page, as markup. */
export function renderPage(locale: Locale, opts: { state?: Record<string, unknown>; scan?: unknown; tag?: string; source?: string } = {}): string {
  const { createElement } = require('react') as typeof import('react')
  const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
  const { DashboardLanguageProvider } = require('../../../lib/i18n/dashboard/useDashboardLanguage')
  const { Page } = loadPage(opts.tag, opts.source)
  H.state = opts.state ?? {}
  if (opts.scan !== undefined) H.scan = opts.scan
  return renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: createElement(Page) }) as never)
}

// ── Today's screen, the scenarios the golden capture covers ────────────────────

export const LEGACY_RESULTS = [
  { keyword: 'נעלי ריצה לנשים', avgMonthlySearches: 2900, competition: 'MEDIUM', competitionIndex: 48, lowTopOfPageBid: 1.2, highTopOfPageBid: 4.8, currency: 'ILS' },
  { keyword: 'נעלי ריצה', avgMonthlySearches: 12100, competition: 'HIGH', competitionIndex: 91, lowTopOfPageBid: 2.1, highTopOfPageBid: 7.3, currency: 'ILS' },
  { keyword: 'איך לבחור נעלי ריצה', avgMonthlySearches: 320, competition: 'LOW', competitionIndex: 12, lowTopOfPageBid: 0.6, highTopOfPageBid: 2.2, currency: 'ILS' },
  { keyword: 'נעלי ריצה לשטח', avgMonthlySearches: 880, competition: 'LOW', competitionIndex: 20, lowTopOfPageBid: null, highTopOfPageBid: 3.1, currency: 'ILS' },
  { keyword: 'גרבי ריצה', avgMonthlySearches: 40, competition: null, competitionIndex: null, lowTopOfPageBid: null, highTopOfPageBid: null, currency: 'ILS' },
  { keyword: 'running shoes sale', avgMonthlySearches: null, competition: 'MEDIUM', competitionIndex: 55, lowTopOfPageBid: 0.9, highTopOfPageBid: 1.4, currency: 'ILS' },
]

/** Named states of today's screen: each seeds the page's own useState values. */
export const LEGACY_SCENARIOS: Record<string, Record<string, unknown>> = {
  initial: {},
  results: { results: LEGACY_RESULTS },
  selectedWithOpportunities: { results: LEGACY_RESULTS, selectedKeywords: new Set(['נעלי ריצה', 'גרבי ריצה']), opportunitiesOpen: true },
  added: { results: LEGACY_RESULTS, selectedKeywords: new Set(['נעלי ריצה לשטח']), addToProjectMessage: 'ADDED 1', lastAddedProjectId: PROJECT_ID },
  addAndAiErrors: { results: LEGACY_RESULTS, selectedKeywords: new Set(['נעלי ריצה']), addToProjectError: 'ADD FAILED', aiQuestionsError: 'AI FAILED' },
  error: { error: 'SEARCH FAILED' },
  formKeywordUrlLoading: { researchType: 'keyword_url', keyword: 'נעלי ריצה', url: 'https://runshop.co.il', loading: true },
  fewResults: { results: LEGACY_RESULTS.slice(0, 1), fewResultsWarning: true },
  filteredSorted: { results: LEGACY_RESULTS, filteredOutWarning: true, sortBy: 'competition', sortDir: 'asc' },
}

export {}
