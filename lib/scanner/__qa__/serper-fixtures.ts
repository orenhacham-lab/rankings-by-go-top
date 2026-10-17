/**
 * Serper responses in the exact shape Serper returns them, for the rank-scanner
 * QA. Nothing here was fetched: the provider is never called from QA, and these
 * are fixed lists so that every run sees the same search result page.
 *
 * The lists are built to exercise every rule the scanner applies to the
 * project's own domain, because a competitor must be located by exactly the
 * same rules: `www.` and letter case, a subdomain of the domain, a look-alike
 * domain that must NOT match, a Google redirect wrapping the real address, an
 * address found only in a result's sitelinks, page 1 returning more than ten
 * results, and a domain that appears more than once.
 */

export interface FixtureResult {
  title: string
  link: string
  snippet?: string
  position: number
  displayedLink?: string
  sitelinks?: Array<{ title?: string; link: string }>
}

export interface FixtureResponse {
  searchParameters: Record<string, unknown>
  organic?: FixtureResult[]
  error?: string
  credits?: number
}

/** The project's own domain in the recorded pages, spelled as merchants type it. */
export const PROJECT_DOMAIN = 'https://www.Shoes-IL.co.il/'

const params = (q: string, page: number) => ({ q, gl: 'il', hl: 'he', type: 'search', num: 10, page, engine: 'google' })

function r(position: number, link: string, title: string, extra: Partial<FixtureResult> = {}): FixtureResult {
  return { title, link, snippet: `${title} — snippet`, position, ...extra }
}

/** Page 1 of "נעלי ריצה תל אביב". Eleven results: the scanner keeps the first ten. */
export const PAGE_1: FixtureResponse = {
  searchParameters: params('נעלי ריצה תל אביב', 1),
  organic: [
    r(1, 'https://www.nike.com/il/w/running-shoes', 'Running Shoes. Nike IL'),
    r(2, 'https://www.shoes-il.co.il/running', 'נעלי ריצה | Shoes IL', {
      sitelinks: [{ title: 'נשים', link: 'https://www.shoes-il.co.il/women' }],
    }),
    r(3, 'https://m.rival-shoes.com/tlv/running', 'Rival Shoes תל אביב'),
    r(4, 'https://www.google.com/url?q=https%3A%2F%2Fwww.competitor-b.co.il%2Fsale&sa=U&ved=2ah', 'מבצע נעלי ריצה'),
    r(5, 'https://notrival-shoes.com/', 'Not Rival Shoes'),
    r(6, 'https://www.adidas.co.il/running', 'adidas נעלי ריצה'),
    r(7, 'https://blog.shoes-il.co.il/guide', 'המדריך לנעלי ריצה'),
    r(8, 'https://www.facebook.com/groups/runners-tlv', 'רצים תל אביב'),
    r(9, 'https://www.zap.co.il/models.aspx?sog=c-runningshoes', 'נעלי ריצה - זאפ'),
    r(10, 'https://www.ynet.co.il/health/article/running', 'איך לבחור נעלי ריצה'),
    // An eleventh result. The scanner caps each page at ten, so this one is
    // outside the top 20 for the project and must be for competitors too.
    r(11, 'https://www.competitor-f.com/overflow', 'Competitor F'),
  ],
  credits: 1,
}

/** Page 2 of the same search: positions 11-20. */
export const PAGE_2: FixtureResponse = {
  searchParameters: params('נעלי ריצה תל אביב', 2),
  organic: [
    r(1, 'https://www.rival-shoes.com/second-listing', 'Rival Shoes — second listing'),
    r(2, 'https://shop.competitor-c.com/running', 'Competitor C shop'),
    r(3, 'https://www.aggregator.co.il/best-running-shoes', 'השוואת נעלי ריצה', {
      sitelinks: [
        { title: 'Top', link: 'https://www.aggregator.co.il/top' },
        { title: 'Competitor D', link: 'https://www.competitor-d.net/deal' },
      ],
    }),
    r(4, 'https://www.mako.co.il/running', 'מאקו ריצה'),
    r(5, 'https://www.walla.co.il/running', 'וואלה ריצה'),
    r(6, 'https://www.asics.com/il/he-il/running', 'ASICS'),
    r(7, 'https://www.competitor-f.com/page-2', 'Competitor F page 2'),
    r(8, 'https://www.runners.co.il/', 'Runners'),
    r(9, 'https://www.decathlon.co.il/running', 'דקטלון'),
    r(10, 'https://www.terminalx.com/running', 'Terminal X'),
  ],
  credits: 1,
}

/** Both pages with nothing organic at all. */
export const EMPTY_PAGE = (page: number): FixtureResponse => ({ searchParameters: params('נעלי ריצה תל אביב', page), organic: [], credits: 1 })

/**
 * Radius mode: one organic list per scan point, in the order the scanner
 * visits them (center, N, S, E, W, NE, NW, SE, SW). Radius requests ask for up
 * to 100 results and the scanner matches on `link` alone there.
 */
function radiusList(entries: Array<[number, string]>, length = 30): FixtureResponse {
  const organic: FixtureResult[] = []
  for (let i = 1; i <= length; i++) {
    const hit = entries.find(([p]) => p === i)
    organic.push(r(i, hit ? hit[1] : `https://filler-${i}.example.org/page`, hit ? `hit ${hit[1]}` : `filler ${i}`))
  }
  return { searchParameters: { q: 'running shoes bakersfield', gl: 'us', hl: 'en', type: 'search', num: 100 }, organic, credits: 1 }
}

export const RADIUS_POINTS: Array<FixtureResponse | 'http_500'> = [
  // center: project at 9, rival at 4, competitor-c beyond the top 20 (25)
  radiusList([[4, 'https://www.rival-shoes.com/'], [9, 'https://www.shoes-il.co.il/'], [25, 'https://competitor-c.com/']]),
  // north: rival at 2 (its best), project at 12
  radiusList([[2, 'https://rival-shoes.com/north'], [12, 'https://shoes-il.co.il/north']]),
  // south: provider failure — contributes nothing, for the project or anyone
  'http_500',
  // east: project at 6 (its best); competitor-b present ONLY in displayedLink,
  // which radius mode does not read for the project, so not for competitors either
  {
    searchParameters: { q: 'running shoes bakersfield', num: 100 },
    organic: [
      r(1, 'https://www.nike.com/', 'Nike'),
      r(2, 'https://tracking.example.net/r?id=1', 'Competitor B via tracker', { displayedLink: 'https://www.competitor-b.co.il' }),
      r(3, 'https://www.adidas.com/', 'adidas'),
      r(4, 'https://www.asics.com/', 'ASICS'),
      r(5, 'https://www.brooks.com/', 'Brooks'),
      r(6, 'https://www.shoes-il.co.il/east', 'Shoes IL east'),
    ],
    credits: 1,
  },
  // west: competitor-c at 22 — still outside the top 20
  radiusList([[22, 'https://shop.competitor-c.com/west']]),
  radiusList([[7, 'https://www.rival-shoes.com/ne']]),
  radiusList([]),
  // south-east: competitor-b by its real link at 18 — inside the top 20
  radiusList([[18, 'https://www.competitor-b.co.il/se'], [19, 'https://www.competitor-b.co.il/se-2']]),
  radiusList([], 5),
]

/** Every radius point failing. */
export const RADIUS_ALL_FAIL: Array<'http_500'> = Array.from({ length: 9 }, () => 'http_500' as const)
