/**
 * THE GEO GRID, FROM THE FORM TO THE STORED POINTS.
 *
 * lib/scanner/__qa__/grid-scan.qa.ts holds the geometry and the metrics. This
 * suite holds the WIRING: that a grid keyword actually measures its square,
 * that the headline position is the centre and not the best of the square, that
 * every measured point is stored, and that the checks it spends are the checks
 * it reserves.
 *
 * THE DEFECT IT CLOSES, measured on main 213c91dc:
 *   1. 'grid' had been removed as a location mode (109b5597) and the scan route
 *      silently converted it to 'custom' or 'project', so a row that asked for
 *      a grid got a single city check.
 *   2. Radius mode makes NINE provider calls per check and reserveUsage was
 *      told `amount: 1`. Eight of nine calls were ours to pay for and nobody's
 *      allowance was debited. A 25-point grid on the same accounting would have
 *      been twenty-four.
 *   3. Radius kept none of its nine measurements, so the one thing a map needs
 *      — a position per place — was computed and thrown away.
 *
 * WHAT IS CHECKED:
 *   A. runGridScan: batching, the deadline, and a query that throws.
 *   B. The scanner in grid mode, over a stubbed network.
 *   C. The checks a keyword costs, and what a whole-project scan reserves.
 *   D. recordGridPoints: the rows it writes, and that it never throws.
 *   E. Source guards (the converter is gone, the route reserves checks not
 *      keywords, the points are written under the aggregate row's id) with a
 *      MUTATION CONTROL for each.
 *
 * Run: npx tsx lib/scanner/__qa__/grid-wiring.qa.ts
 */
import { readFileSync } from 'fs'
import { runGridScan, generateGridPoints, gridPointCount, DEFAULT_GRID_SIZE, type GridPoint } from '../grid-scan'
import { scanGoogleMaps } from '../google-maps'
import { recordGridPoints } from '../grid-points-store'
import { providerChecksForTarget, countPlannedChecks, RADIUS_PROVIDER_CHECKS } from '../../quota'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
}

const ROUTE_SRC = stripComments(readFileSync('app/api/scan/route.ts', 'utf8'))
const SCHEDULER_SRC = stripComments(readFileSync('lib/scan-scheduler/process-scheduled-scan.ts', 'utf8'))
const FORM_SRC = stripComments(readFileSync('components/keywords/TrackingTargetForm.tsx', 'utf8'))
const PANEL_SRC = stripComments(readFileSync('components/keywords/ProjectKeywordsPanel.tsx', 'utf8'))
const QUOTA_SRC = stripComments(readFileSync('lib/quota.ts', 'utf8'))
const ACTIONS_SRC = stripComments(readFileSync('app/actions/tracking-targets.ts', 'utf8'))

interface Seen { url: string; body?: Record<string, unknown> }
function installNet(opts: { places?: unknown[]; placesFor?: (ll: string) => unknown[] }) {
  const seen: Seen[] = []
  const real = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith('https://google.serper.dev/')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      seen.push({ url, body })
      const places = opts.placesFor ? opts.placesFor(String(body.ll ?? '')) : (opts.places ?? [])
      return new Response(JSON.stringify({ places }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.startsWith('https://nominatim.openstreetmap.org/')) {
      seen.push({ url })
      return new Response(JSON.stringify([{ lat: '45.4642', lon: '9.1900', display_name: 'Milano' }]),
        { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.startsWith('https://maps.googleapis.com/')) {
      seen.push({ url })
      return new Response(JSON.stringify({ status: 'ZERO_RESULTS' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`unexpected request in QA: ${url}`)
  }) as typeof globalThis.fetch
  return { seen, restore: () => { globalThis.fetch = real } }
}

/** Milan, with the business ranked 4th everywhere and 1st only at one corner. */
const BUSINESS = 'Pizzeria Da Mario'
function placesWithPosition(position: number | null): unknown[] {
  if (position === null) return [{ title: 'Someone Else', address: 'Via X', position: 1 }]
  const out: unknown[] = []
  for (let i = 1; i < position; i++) out.push({ title: `Rival ${i}`, address: 'Via Y', position: i })
  out.push({ title: BUSINESS, address: 'Via Roma 1, Milano', position })
  return out
}

async function run() {
  const prevSerper = process.env.SERPER_API_KEY
  const prevGeoKey = process.env.GOOGLE_GEOCODING_API_KEY
  process.env.SERPER_API_KEY = 'test-key'
  delete process.env.GOOGLE_GEOCODING_API_KEY

  // ------------------------------------------------------------ A. runGridScan
  console.log('\nA) runGridScan: batches, the deadline, and a query that throws')
  {
    const points = generateGridPoints(45.46, 9.19, 'small', 2)
    let inFlight = 0, maxInFlight = 0
    const outcome = await runGridScan(points, async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
      return { found: true, position: 4 }
    }, { concurrency: 5 })
    check('every point of a 5 × 5 grid is measured', outcome.results.length === 25, String(outcome.results.length))
    check('nothing is skipped when there is time', outcome.skipped === 0 && !outcome.stoppedForDeadline)
    check('at most the requested number of requests are in flight', maxInFlight <= 5, String(maxInFlight))
    check('more than one at a time, so a grid is not a serial loop', maxInFlight > 1, String(maxInFlight))
    check('the results stay in grid order',
      outcome.results[0].point.row === 0 && outcome.results[0].point.col === 0 &&
      outcome.results[24].point.row === 4 && outcome.results[24].point.col === 4)
  }
  {
    const points = generateGridPoints(45.46, 9.19, 'medium', 2)
    let clock = 0
    const outcome = await runGridScan(points, async () => { clock += 100; return { found: false, position: null } },
      { concurrency: 5, deadlineAtMs: 1000, now: () => clock })
    check('the batch stops at the deadline instead of being cut off', outcome.stoppedForDeadline)
    check('…and says how many points it never reached',
      outcome.skipped === 49 - outcome.results.length && outcome.skipped > 0, `${outcome.skipped} skipped`)
    check('a stopped grid still returns what it measured', outcome.results.length > 0 && outcome.results.length < 49)
  }
  {
    const points = generateGridPoints(45.46, 9.19, 'small', 2)
    const outcome = await runGridScan(points, async (p: GridPoint) => {
      if (p.row === 2 && p.col === 2) throw new Error('provider exploded')
      return { found: true, position: 4 }
    })
    check('a query that throws becomes one failed point, not a failed grid',
      outcome.results.length === 25 && outcome.results.filter((r) => r.error).length === 1)
    check('…and the other 24 points are still measured',
      outcome.results.filter((r) => r.found).length === 24)
  }

  // --------------------------------------------------------- B. the scanner
  console.log('\nB) the scanner in grid mode')
  {
    // 4th everywhere, 1st at the north-west corner: the best of the grid is 1,
    // the centre is 4. The headline must be 4.
    const net = installNet({
      placesFor: (ll) => {
        const [lat] = ll.replace('@', '').split(',')
        return placesWithPosition(Number(lat) > 45.475 ? 1 : 4)
      },
    })
    const out = await scanGoogleMaps({
      engine: 'google_maps', keyword: 'pizzeria milano', targetBusinessName: BUSINESS,
      country: 'IT', language: 'it', locationMode: 'grid', gridSize: 'small', gridSpacingKm: 2,
      exactPoint: { lat: 45.4642, lng: 9.19 },
    })
    net.restore()
    const serperCalls = net.seen.filter((s) => s.url.includes('serper.dev'))
    check('a 5 × 5 grid makes 25 provider calls', serperCalls.length === 25, String(serperCalls.length))
    check('every call carries its own coordinates',
      new Set(serperCalls.map((s) => String(s.body?.ll))).size === 25)
    check('every call is in the project\'s own country and language',
      serperCalls.every((s) => s.body?.gl === 'it' && s.body?.hl === 'it'))
    check('the headline position is the CENTRE, not the best of the square',
      out.position === 4, `position=${String(out.position)}`)
    check('the grid metadata is attached', Boolean(out.gridScanMetadata))
    check('…with one entry per measured point', out.gridScanMetadata?.points.length === 25)
    check('…and the average over every point is worse than the best corner',
      (out.gridScanMetadata?.averageTotalPosition ?? 0) > 1)
    check('the audit records the grid and its size',
      (out.audit?.decision as Record<string, unknown> | undefined)?.grid_used === true &&
      (out.audit?.decision as Record<string, unknown> | undefined)?.grid_size === 'small')
    check('the point rows carry their own position', (out.gridScanMetadata?.points ?? []).every((p) => p.found && p.position !== null))
  }
  {
    // No exact point: the centre comes from the postal code, geocoded in-country.
    const net = installNet({ places: placesWithPosition(7) })
    const out = await scanGoogleMaps({
      engine: 'google_maps', keyword: 'pizzeria milano', targetBusinessName: BUSINESS,
      country: 'IT', language: 'it', locationMode: 'grid', gridSize: 'small', gridSpacingKm: 2,
      postalCode: '20121',
    })
    net.restore()
    const geo = net.seen.find((s) => s.url.includes('nominatim'))
    check('with no exact point the centre is the postal code', Boolean(geo?.url.includes('countrycodes=it')), geo?.url)
    check('…and the grid still measures its 25 points', out.gridScanMetadata?.pointsScanned === 25)
    check('the centre source is recorded',
      String((out.audit?.decision as Record<string, unknown> | undefined)?.grid_center_source || '').startsWith('postal_code'))
  }
  {
    const net = installNet({ places: [] })
    const out = await scanGoogleMaps({
      engine: 'google_maps', keyword: 'pizzeria', targetBusinessName: BUSINESS,
      country: 'IT', language: 'it', locationMode: 'grid',
    })
    net.restore()
    check('a grid with no centre is an error, never a guess', out.found === false && Boolean(out.error))
    check('…and nothing was sent to the provider', !net.seen.some((s) => s.url.includes('serper.dev')))
  }

  // ------------------------------------------------------ C. what it costs
  console.log('\nC) the checks a keyword costs')
  check('an ordinary keyword costs one check', providerChecksForTarget({ location_mode: 'project' }) === 1)
  check('a postal-code keyword costs one check', providerChecksForTarget({ location_mode: 'zip' }) === 1)
  check('a radius keyword costs nine, which is what it has always spent',
    providerChecksForTarget({ location_mode: 'radius' }) === 9 && RADIUS_PROVIDER_CHECKS === 9)
  check('a 5 × 5 grid costs 25', providerChecksForTarget({ location_mode: 'grid', grid_size: 'small' }) === 25)
  check('a 7 × 7 grid costs 49', providerChecksForTarget({ location_mode: 'grid', grid_size: 'medium' }) === 49)
  check('a 9 × 9 grid costs 81', providerChecksForTarget({ location_mode: 'grid', grid_size: 'large' }) === 81)
  // Both fall back to DEFAULT_GRID_SIZE, read from the module rather than
  // written out, so changing the default cannot leave this asserting the old one.
  check('a grid row with a nonsense size costs the default, not zero',
    providerChecksForTarget({ location_mode: 'grid', grid_size: 'enormous' }) === gridPointCount(DEFAULT_GRID_SIZE))
  check('a grid row with no size at all costs the default',
    providerChecksForTarget({ location_mode: 'grid', grid_size: null }) === gridPointCount(DEFAULT_GRID_SIZE))
  check('and that default is the 5 x 5, so an unsized row is never billed as a 7 x 7',
    gridPointCount(DEFAULT_GRID_SIZE) === 25)
  {
    const rows = [
      { location_mode: 'project', grid_size: null },
      { location_mode: 'zip', grid_size: null },
      { location_mode: 'radius', grid_size: null },
      { location_mode: 'grid', grid_size: 'small' },
    ]
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: rows }) }) }),
      }),
    }
    const planned = await countPlannedChecks('p1', admin)
    check('a whole-project scan reserves the checks, not the keywords (1+1+9+25 = 36)', planned === 36, String(planned))
    const empty = { from: () => ({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null }) }) }) }) }
    check('an unreadable keyword list reserves nothing rather than guessing', (await countPlannedChecks('p1', empty)) === 0)
  }

  // ------------------------------------------------------- D. the stored rows
  console.log('\nD) the points that are stored')
  {
    const points = generateGridPoints(45.4642, 9.19, 'small', 2).map((p, i) => ({
      row: p.row, col: p.col, lat: p.lat, lng: p.lng,
      found: i % 2 === 0, position: i % 2 === 0 ? 3 : null,
    }))
    let inserted: Record<string, unknown>[] = []
    const admin = { from: () => ({ insert: (rows: Record<string, unknown>[]) => { inserted = rows; return Promise.resolve({ error: null }) } }) }
    const grid = {
      gridSize: 'small' as const, spacingKm: 2, centerLat: 45.4642, centerLng: 9.19,
      pointsPlanned: 25, pointsScanned: 25, skippedPoints: 0, stoppedForDeadline: false,
      foundCount: 13, averagePosition: 3, averageTotalPosition: 11.6, top3Share: 0.52, top10Share: 0.52,
      points,
    }
    const written = await recordGridPoints(admin, {
      ownerId: 'u1', projectId: 'p1', trackingTargetId: 't1', scanResultId: 'r1',
      checkedAt: '2026-11-21T06:00:00Z', grid,
    })
    check('every point is written', written === 25 && inserted.length === 25)
    check('each row carries its owner, project, keyword and the aggregate row',
      inserted.every((r) => r.user_id === 'u1' && r.project_id === 'p1' && r.tracking_target_id === 't1' && r.scan_result_id === 'r1'))
    check('a point that found nothing has no position',
      inserted.filter((r) => r.found === false).every((r) => r.position === null))
    check('a point that found the business has one',
      inserted.filter((r) => r.found === true).every((r) => typeof r.position === 'number'))
    check('every row shares the aggregate\'s checked_at',
      inserted.every((r) => r.checked_at === '2026-11-21T06:00:00Z'))
  }
  {
    const failing = { from: () => ({ insert: () => Promise.resolve({ error: { code: '23514' } }) }) }
    const throwing = { from: () => ({ insert: () => Promise.reject(new Error('down')) }) }
    const grid = {
      gridSize: 'small' as const, spacingKm: 2, centerLat: 1, centerLng: 1, pointsPlanned: 1, pointsScanned: 1,
      skippedPoints: 0, stoppedForDeadline: false, foundCount: 1, averagePosition: 1, averageTotalPosition: 1,
      top3Share: 1, top10Share: 1, points: [{ row: 0, col: 0, lat: 1, lng: 1, found: true, position: 1 }],
    }
    const save = { ownerId: 'u1', projectId: 'p1', trackingTargetId: 't1', scanResultId: 'r1', checkedAt: 'now', grid }
    check('a refused insert is reported as nothing written, never thrown', (await recordGridPoints(failing, save)) === 0)
    check('a database that is down does not reject into the scan', (await recordGridPoints(throwing, save)) === 0)
    const impossible = {
      ...grid,
      points: [{ row: 0, col: 0, lat: 999, lng: 1, found: true, position: 1 }, { row: 1, col: 1, lat: 1, lng: 1, found: true, position: 99 }],
    }
    let got: Record<string, unknown>[] = []
    const admin = { from: () => ({ insert: (rows: Record<string, unknown>[]) => { got = rows; return Promise.resolve({ error: null }) } }) }
    await recordGridPoints(admin, { ...save, grid: impossible })
    check('a point the table could not hold is dropped, not sent', got.length === 0)
  }

  // ------------------------------------------------------- E. source guards
  console.log('\nE) the route, and the mode that was being converted away')
  const guardNoGridConverter = (src: string) => !/locationMode = target\.custom_city\?\.trim\(\) \? 'custom' : 'project'/.test(src)
  const guardReservesChecks = (src: string) => /await countPlannedChecks\(projectId, admin\)/.test(src)
  const guardSingleTargetCounts = (src: string) => /providerChecksForTarget\(one\)/.test(src)
  const guardDispatchCountsPlanned = (src: string) => /dispatchedCount \+= plannedChecks/.test(src)
  const guardUnspentReturned = (src: string) => /dispatchedCount -= Math\.max\(0, plannedChecks - grid\.pointsScanned\)/.test(src)
  const guardPointsNeedTheRow = (src: string) => /if \(insertedResult\?\.id\) \{/.test(src)
  const guardSchedulerStillCityOnly = (src: string) => !/locationMode/.test(src)

  check('the route no longer converts a grid keyword into a city check', guardNoGridConverter(ROUTE_SRC))
  check('a whole-project scan reserves checks', guardReservesChecks(ROUTE_SRC))
  check('a single-keyword scan reserves that keyword\'s own checks', guardSingleTargetCounts(ROUTE_SRC))
  check('what is consumed is what the provider was actually asked', guardDispatchCountsPlanned(ROUTE_SRC))
  check('points a deadline prevented are given back', guardUnspentReturned(ROUTE_SRC))
  check('the points are written only under a real aggregate row', guardPointsNeedTheRow(ROUTE_SRC))
  check('the SCHEDULED scan still sends no location mode at all, so a grid keyword costs it nothing extra',
    guardSchedulerStillCityOnly(SCHEDULER_SRC))

  console.log('\nE-MUT) mutation controls')
  check('the converter guard fails on the old code',
    !guardNoGridConverter("locationMode = target.custom_city?.trim() ? 'custom' : 'project'"))
  check('the reservation guard fails on counting keywords',
    !guardReservesChecks('await countActiveTargets(projectId, admin)'))
  check('the single-keyword guard fails on the old constant', !guardSingleTargetCounts('const checksThisScan = targetId ? 1 : x'))
  check('the consumption guard fails on the old increment', !guardDispatchCountsPlanned('dispatchedCount++'))
  check('the give-back guard fails when it is removed', !guardUnspentReturned('dispatchedCount -= 0'))
  check('the aggregate-row guard fails when the id is assumed', !guardPointsNeedTheRow('recordGridPoints(admin, { scanResultId: id })'))
  check('the scheduler guard would fail if a location mode were sent there',
    !guardSchedulerStillCityOnly("runScanFn(target.engine_type, { locationMode: target.location_mode })"))

  // --------------------------------------------- F. the grid's centre point
  // THE DEFECT: the form showed only the grid-size select, so a grid keyword
  // saved no centre at all. effectiveCity then fell back to project.city, and a
  // project with no city made google-maps.ts return "Grid mode needs a centre"
  // — the row stored zero points and the table showed dashes with no message.
  console.log('\nF) the grid asks for a centre, and refuses to save without one')

  const guardFormOffersCentre = (src: string) =>
    /const isCentreMode = locationMode === 'exact_point' \|\| locationMode === 'grid'/.test(src) &&
    /\{isCentreMode && \(/.test(src)
  const guardFormSubmitsCentre = (src: string) => /\{!isCentreMode && \(/.test(src)
  const guardCentreOptionalForGrid = (src: string) =>
    /required=\{locationMode === 'exact_point'\}/.test(src)
  const guardActionsResolveGridCentre = (src: string) =>
    (src.match(/locationMode === 'grid'\)? \{[\s\S]{0,400}?resolveGridCentre\(/g) || []).length >= 2
  const guardGridCentreRefuses = (src: string) =>
    /throw new UserFacingError\(m\.gridNeedsCentre\)/.test(src)
  const guardGridCentreAcceptsCity = (src: string) =>
    /if \(projectCity && projectCity\.trim\(\)\) return null/.test(src)
  const guardRouteSendsGridCentre = (src: string) =>
    /else if \(locationMode === 'grid'\) \{[\s\S]{0,600}?exactPointInput = \{/.test(src)
  const guardRouteDoesNotBlockGrid = (src: string) =>
    !/locationMode === 'grid'[\s\S]{0,300}?throw new Error\(/.test(src)

  check('the form offers a centre in grid mode, not only the grid size', guardFormOffersCentre(FORM_SRC))
  check("the centre's inputs are no longer blanked out in grid mode", guardFormSubmitsCentre(FORM_SRC))
  check('the centre is required for an exact point and optional for a grid', guardCentreOptionalForGrid(FORM_SRC))
  check('creating and editing a grid keyword both resolve its centre', guardActionsResolveGridCentre(ACTIONS_SRC))
  check('a grid with no centre and no project city is refused at save time', guardGridCentreRefuses(ACTIONS_SRC))
  check("a project that does have a city still stands in for the centre", guardGridCentreAcceptsCity(ACTIONS_SRC))
  check('the scan passes a saved grid centre to the scanner', guardRouteSendsGridCentre(ROUTE_SRC))
  check('the scan does not throw on a grid that leans on its city', guardRouteDoesNotBlockGrid(ROUTE_SRC))

  console.log('\nF-MUT) mutation controls')
  check('the centre-mode guard fails on the old condition',
    !guardFormOffersCentre("const isCentreMode = locationMode === 'exact_point'\n{locationMode === 'exact_point' && ("))
  check('the submit guard fails on the old blanking condition',
    !guardFormSubmitsCentre("{locationMode !== 'exact_point' && ("))
  check('the optional-centre guard fails when the grid is made to require one',
    !guardCentreOptionalForGrid('required'))
  check('the resolve guard fails when only one write path is covered',
    !guardActionsResolveGridCentre("if (locationMode === 'grid') { const r = await resolveGridCentre(formData) }"))
  check('the refusal guard fails when the error is dropped',
    !guardGridCentreRefuses('return null'))
  check('the city guard fails when the city is ignored',
    !guardGridCentreAcceptsCity('if (projectCity) throw new UserFacingError(m.gridNeedsCentre)'))
  check('the route guard fails when the grid centre is not passed',
    !guardRouteSendsGridCentre("if (locationMode === 'exact_point') { exactPointInput = { lat, lng } }"))
  check('the no-throw guard fails if the grid were blocked like an exact point',
    !guardRouteDoesNotBlockGrid("if (locationMode === 'grid') { throw new Error('needs a centre') }"))

  // ------------------------------- G. a refusal reaches the screen, no repeats
  // Found on the preview: the quota payload names its kind in `code`, the panel
  // matched `errorCode`, so a refused scan showed "failed, try again" (or nothing
  // the reader could use). And a single save had no duplicate check at all.
  console.log('\nG) the quota answer is shown, and a repeated save is refused')
  const guardPayloadUsesCode = (src: string) => /return \{ error, errorEn, code, limit/.test(src)
  const guardPanelReadsCode = (src: string) => /data\?\.code \?\? data\?\.errorCode/.test(src) && /startsWith\('QUOTA_'\)/.test(src)
  const guardPanelPicksLanguage = (src: string) => /language === 'he' \? data\.error : data\.errorEn/.test(src)
  const guardSingleSaveDedupes = (src: string) => /throw new UserFacingError\(m\.keywordExistsSameLocation\)/.test(src)
  const guardLabelsLocalized = (src: string) => /t\.latitudeLabel/.test(src) && /t\.longitudeLabel/.test(src) && !/'Latitude/.test(src)
  check('the quota payload carries its kind as `code`', guardPayloadUsesCode(QUOTA_SRC))
  check('the panel reads that `code`, so a quota refusal is recognised', guardPanelReadsCode(PANEL_SRC))
  check('the refusal is shown in the screen language, not always Hebrew', guardPanelPicksLanguage(PANEL_SRC))
  check('a repeated single save is refused instead of duplicated', guardSingleSaveDedupes(ACTIONS_SRC))
  check('the coordinate labels come from the dictionary', guardLabelsLocalized(FORM_SRC))
  console.log('\nG-MUT) mutation controls')
  check('the panel guard fails on the old errorCode-only match', !guardPanelReadsCode("data?.errorCode === 'QUOTA_KEYWORD_CHECKS' && data.error"))
  check('the language guard fails on the old Hebrew-only return', !guardPanelPicksLanguage('return data.error'))
  check('the dedupe guard fails when the check is removed', !guardSingleSaveDedupes('insert(data)'))
  check('the label guard fails on a hard-coded English label', !guardLabelsLocalized("label=\"Latitude *\""))

  if (prevSerper === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevSerper
  if (prevGeoKey !== undefined) process.env.GOOGLE_GEOCODING_API_KEY = prevGeoKey

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

void run()

export {}
