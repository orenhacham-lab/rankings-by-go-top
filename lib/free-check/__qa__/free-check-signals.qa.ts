/**
 * The deterministic half of the free check: what we read off a real page, and
 * what we then tell the merchant.
 *
 * The promise on the loading screen is "we really do read the site, we do not
 * guess", so every FINDING must be traceable to a measured signal. These cases
 * cover the extraction (title/description/H1/ALT/JSON-LD/FAQ/links against
 * hostile, truncated and minified HTML), the robots.txt reading that decides AI
 * access, and the severity split that keeps blockers out of the signup gate.
 *
 * MUTATION CONTROLS at the end break the alt-text counting and the robots
 * group parsing on purpose and show the assertions catch it.
 */
import { extractSiteSignals, readRobots } from '../html-signals'
import { buildFindings, buildGeoSignals, splitFindings } from '../findings'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const RICH = `<!doctype html><html lang="he"><head>
<title>פרפיום קלאב - בשמים יוקרתיים ומקוריים אונליין במשלוח חינם</title>
<meta name="description" content="חנות בשמים אונליין עם מותגי יוקרה מקוריים, בשמי נישה ובוטיק, משלוח לכל הארץ ושירות אישי לכל לקוח בכל רכישה.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="פרפיום קלאב">
<link rel="canonical" href="https://perfumeclub.co.il/">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Store","name":"Perfume Club"},{"@type":"FAQPage"}]}</script>
<style>.x{color:red}</style>
</head><body>
<h1>בשמים יוקרתיים</h1>
<h2>איך בוחרים בושם?</h2><h2>מה ההבדל בין נישה למותג?</h2><h2>כמה זמן מחזיק בושם?</h2>
<img src="a.jpg" alt="בושם">
<img src='b.jpg' alt=''>
<img src=c.jpg>
<a href="/collections/men">גברים</a><a href="https://www.instagram.com/x">אינסטגרם</a>
<a href="#top">למעלה</a><a href="mailto:a@b.co">מייל</a>
<p>${'טקסט '.repeat(300)}</p>
<script>var evil = "<h1>not a heading</h1>";</script>
</body></html>`

const BARE = '<html><head></head><body><p>שלום</p><img src="a.jpg"><img src="b.jpg"></body></html>'

function main() {
  console.log('EXTRACT) signals read off a real page')
  const s = extractSiteSignals(RICH, 'https://perfumeclub.co.il/', { robotsTxt: null, llmsTxt: false })
  check('lang read from <html>', s.htmlLang === 'he')
  check('title read and trimmed', (s.title ?? '').startsWith('פרפיום קלאב'))
  check('meta description read', (s.metaDescription ?? '').includes('חנות בשמים'))
  check('canonical read', s.canonical === 'https://perfumeclub.co.il/')
  check('viewport + open graph detected', s.viewportMeta && s.openGraph)
  check('exactly one H1, and it is not the one inside <script>', s.h1.length === 1 && s.h1[0] === 'בשמים יוקרתיים')
  check('images counted, missing alt counted (empty alt counts as missing)',
    s.images.total === 3 && s.images.missingAlt === 2, `${s.images.total}/${s.images.missingAlt}`)
  check('JSON-LD @graph flattened into types', s.schemaTypes.includes('Store') && s.schemaTypes.includes('FAQPage'))
  check('organization schema recognised', s.hasOrganizationSchema)
  check('FAQ recognised from schema', s.hasFaqSchema && s.hasFaqSection)
  check('internal links counted, anchors/mailto excluded', s.internalLinks === 1, String(s.internalLinks))
  check('external domain captured without www', s.externalDomains.includes('instagram.com'))
  check('word count from body text only', s.wordCount > 250)

  console.log('\nEXTRACT) hostile and degenerate input never throws')
  const bare = extractSiteSignals(BARE, 'https://x.co.il/', { robotsTxt: null, llmsTxt: false })
  check('missing title/description/H1 reported as absent', bare.title === null && bare.metaDescription === null && bare.h1.length === 0)
  check('all images missing alt', bare.images.total === 2 && bare.images.missingAlt === 2)
  const truncated = extractSiteSignals('<html><head><title>חצי', 'https://x.co.il/', { robotsTxt: null, llmsTxt: false })
  check('body truncated mid-tag does not throw', truncated.h1.length === 0)
  const badLd = extractSiteSignals('<script type="application/ld+json">{oops</script><body>x</body>', 'https://x.co.il/', { robotsTxt: null, llmsTxt: false })
  check('malformed JSON-LD is ignored, not fatal', badLd.schemaTypes.length === 0)

  console.log('\nROBOTS) only a root-level disallow counts as blocking')
  check('no robots.txt → nothing blocked', !readRobots(null).blocksAiBots)
  check('path-level disallow is not a block', !readRobots('User-agent: *\nDisallow: /wp-admin/').blocksAiBots)
  check('global root disallow blocks everyone', readRobots('User-agent: *\nDisallow: /').blocksEveryone)
  const aiBlocked = readRobots('User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin/')
  check('GPTBot root disallow detected, others untouched', aiBlocked.blocksAiBots && !aiBlocked.blocksEveryone && aiBlocked.blockedBots.includes('gptbot'))
  const grouped = readRobots('User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /')
  check('a shared group blocks every agent in it', grouped.blockedBots.length === 2)
  check('comments are stripped before parsing', readRobots('# Disallow: /\nUser-agent: *\nDisallow: /x/').blocksAiBots === false)
  check('Allow: / after Disallow: / re-opens the group', !readRobots('User-agent: GPTBot\nDisallow: /\nAllow: /').blocksAiBots)
  check('a comment mid-line does not swallow the directive',
    readRobots('User-agent: *\nDisallow: / # everything').blocksEveryone)

  // robots.txt comes from the site under check, up to the 1.5 MB fetch cap. The
  // expression this replaced backtracked from every '#' on a line holding a CR
  // or U+2028, so one long line stalled the route.
  const CR_LINE = `User-agent: *\n${'#'.repeat(60_000)}\rx\nDisallow: /`
  const t0 = performance.now()
  const crVerdict = readRobots(CR_LINE)
  const robotsMs = performance.now() - t0
  check(`a 60 000-character comment line is read in milliseconds (${robotsMs.toFixed(0)}ms)`, robotsMs < 100)
  check('and the directive after it is still parsed', crVerdict.blocksEveryone)

  const t1 = performance.now()
  CR_LINE.replace(/#.*$/, '')
  const regexMs = performance.now() - t1
  check(`CONTROL: the comment-strip regex is orders slower on the same line (${regexMs.toFixed(0)}ms)`,
    regexMs > Math.max(robotsMs * 20, 200))

  console.log('\nFINDINGS) measured signals become merchant-facing findings')
  const clean = buildFindings(s, 'he')
  check('a well-built page produces no blocker', clean.every((f) => f.severity !== 'blocker'))
  check('alt-text finding raised with its evidence', (() => {
    const f = clean.find((x) => x.id === 'images_alt')
    return !!f && f.severity === 'warning' && !!f.evidence && f.evidence.includes('3')
  })())
  const bareFindings = buildFindings(bare, 'he')
  check('missing title is a blocker', bareFindings.some((f) => f.id === 'title_missing' && f.severity === 'blocker'))
  check('blockers sort first', bareFindings[0].severity === 'blocker')
  check('every finding carries localized title and detail', bareFindings.every((f) => f.title.length > 3 && f.detail.length > 10))
  const blockedAll = buildFindings({ ...bare, robotsTxt: 'User-agent: *\nDisallow: /' }, 'he')
  check('robots blocking everyone is a blocker', blockedAll.some((f) => f.id === 'robots_blocks_all' && f.severity === 'blocker'))
  const en = buildFindings(bare, 'en')
  check('English findings are actually English', en.some((f) => f.id === 'title_missing' && /title/i.test(f.title)))

  console.log('\nGATE) blockers are never hidden behind signup')
  const split = splitFindings(bareFindings)
  check('all blockers shown', split.shown.filter((f) => f.severity === 'blocker').length === bareFindings.filter((f) => f.severity === 'blocker').length)
  check('non-blockers beyond the teaser are locked and counted',
    split.locked === Math.max(0, bareFindings.filter((f) => f.severity !== 'blocker').length - 2))
  check('shown + locked accounts for everything', split.shown.length + split.locked === bareFindings.length)

  console.log('\nGEO) four AI-readiness signals, scored from real signals')
  const geo = buildGeoSignals(s, 'he')
  check('four signals, in a stable order', geo.length === 4 && geo.map((g) => g.id).join(',') === 'schema,faq,robots,llms')
  check('schema + faq + robots pass on the rich page, llms.txt does not',
    geo.filter((g) => g.ok).length === 3 && geo.find((g) => g.id === 'llms')?.ok === false)
  check('pass and fail wording differ per signal',
    buildGeoSignals({ ...s, hasFaqSchema: false, hasFaqSection: false }, 'he').find((g) => g.id === 'faq')?.title
      !== geo.find((g) => g.id === 'faq')?.title)

  console.log('\nHOSTILE MARKUP) the parsers are linear, whatever the page opens and never closes')
  const repeat = (unit: string, bytes: number) => {
    let out = ''
    while (out.length < bytes) out += unit
    return out
  }
  const CAP = 1_500_000
  const signalsOf = (html: string) => extractSiteSignals(html, 'https://a.co.il/', { robotsTxt: null, llmsTxt: false })

  // Correctness first: the linear scanners must read a page the way the
  // expressions they replaced did.
  const tagBoundary = signalsOf('<html lang="he"><body><a href="/x">a</a><abbr title="t">b</abbr></body></html>')
  check('a tag name is matched whole, so <a> does not also match <abbr>', tagBoundary.internalLinks === 1)
  const unterminated = signalsOf('<html><body><h1>before</h1><!-- <h1>after</h1></body></html>')
  check('an unterminated comment swallows the rest, as a browser reads it',
    unterminated.h1.length === 1 && unterminated.h1[0] === 'before', JSON.stringify(unterminated.h1))
  const unclosedScript = signalsOf('<html><body><h1>before</h1><script>var a = "<h1>after</h1>"</body></html>')
  check('a script the page never closes ends what we read', unclosedScript.h1.length === 1)

  // And the timings the rewrite exists for, at the fetch cap.
  const hostile: [string, string][] = [
    ['unclosed comments', repeat('<!--x', CAP)],
    ["tags with no '>'", repeat('<img ', CAP)],
    ['unclosed script', repeat('<script ', CAP)],
    ['hundreds of thousands of script tags', repeat('<script>a</script>', CAP)],
    ['unclosed headings', repeat('<h1 ', CAP)],
    ['a well-formed page of the same size', `<html lang="he"><head><title>t</title></head><body>${repeat('<p>word</p>', CAP)}</body></html>`],
  ]
  for (const [label, html] of hostile) {
    const t = performance.now()
    signalsOf(html)
    const ms = performance.now() - t
    check(`1.5 MB of ${label}: ${ms.toFixed(0)}ms`, ms < 1_000)
  }

  // Weakenings: the two expression shapes this file no longer uses. A tenth of
  // the cap keeps the control quick; both are quadratic, so the full cap costs
  // a hundred times these numbers.
  const TENTH = CAP / 10
  const commentDoc = repeat('<!--x', TENTH)
  const tLazy = performance.now()
  commentDoc.replace(/<!--[\s\S]*?-->/g, ' ')
  const lazyMs = performance.now() - tLazy
  check(`CONTROL: the lazy comment regex costs ${lazyMs.toFixed(0)}ms at a TENTH of the cap, so ~${(lazyMs / 10).toFixed(0)}s at the cap`, lazyMs > 300)

  const tagDoc = repeat('<img ', TENTH)
  const tAttr = performance.now()
  tagDoc.match(/<img\b[^>]*>/gi)
  const attrMs = performance.now() - tAttr
  check(`CONTROL: the [^>]* tag regex costs ${attrMs.toFixed(0)}ms at a TENTH of the cap, so ~${(attrMs / 10).toFixed(0)}s at the cap`, attrMs > 300)

  const tLinear = performance.now()
  signalsOf(tagDoc)
  const linearMs = performance.now() - tLinear
  check('CONTROL: the real parser reads the same document in a fraction of that',
    linearMs * 10 < attrMs, `${linearMs.toFixed(0)}ms vs ${attrMs.toFixed(0)}ms`)

  console.log('\nMUTATION CONTROLS) weakened logic fails the assertions above')
  // Weakening: count an empty alt="" as present (the common off-by-one).
  const weakMissingAlt = (() => {
    const alts = (RICH.match(/<img\b[^>]*\balt\s*=/gi) ?? []).length
    return 3 - alts
  })()
  check('CONTROL: counting alt= as present undercounts (1 instead of 2)', weakMissingAlt === 1)
  check('CONTROL: the real extractor counts 2', s.images.missingAlt === 2)
  // Weakening: a robots reader that ignores which user-agent a group belongs to.
  const weakBlocksAi = (txt: string) => /disallow:\s*\/\s*$/im.test(txt)
  check('CONTROL: an agent-blind robots reader flags a path-only site as blocked',
    weakBlocksAi('User-agent: *\nDisallow: /wp-admin/\nDisallow: /') && !readRobots('User-agent: *\nDisallow: /wp-admin/').blocksAiBots)
  check('CONTROL: the real reader scopes a disallow to its group',
    readRobots('User-agent: GPTBot\nDisallow: /nope/\n\nUser-agent: Googlebot\nDisallow: /').blocksAiBots === false)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
