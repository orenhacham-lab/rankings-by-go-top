/**
 * The OpenAPI document describes the endpoint we actually serve, and nothing
 * else.
 *
 * A catalogue's validator reads this document and then calls the paths in it.
 * So the checks here are not style checks: every path must exist in the app,
 * every response field the document promises must be a field the route really
 * serves, and the licence and version must be the ones the data carries rather
 * than literals retyped in a second place.
 *
 * Run: npx tsx lib/ai-crawlers/__qa__/openapi.qa.ts
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { aiCrawlerOpenApiDocument } from '../openapi'
import {
  AI_CRAWLER_CANDIDATES,
  AI_CRAWLER_DATASET,
  AI_CRAWLER_DATASET_LICENSE,
  AI_CRAWLER_DATASET_VERSION,
} from '../dataset'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name) }
}

const ROOT = join(__dirname, '..', '..', '..')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/**
 * The document, read the way a catalogue reads it: as plain JSON of unknown
 * shape. Typing it as the builder's return type would make every check below a
 * tautology the compiler proves, which is the opposite of what a guard is for.
 */
type Json = Record<string, unknown>
const doc = JSON.parse(JSON.stringify(aiCrawlerOpenApiDocument())) as Json

/** Walk a dotted path through the parsed JSON. Returns undefined, never throws. */
function at(root: unknown, path: string): unknown {
  let node: unknown = root
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}
const obj = (value: unknown): Json => (value && typeof value === 'object' ? (value as Json) : {})
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const row = (value: unknown): Record<string, unknown> => value as Record<string, unknown>
const DATASET_PATH = '/api/public/ai-crawlers'

// ---- the document is a document ----

check('declares OpenAPI 3.1', doc.openapi === '3.1.0')
check('info.title is set', str(at(doc, 'info.title')).length > 0)
check('info.description is long enough to be useful', str(at(doc, 'info.description')).length > 200)
check('info.version is the dataset version', at(doc, 'info.version') === AI_CRAWLER_DATASET_VERSION)
check('info.license is the served licence', at(doc, 'info.license.url') === AI_CRAWLER_DATASET_LICENSE.url)
check('info.license names the served licence id', at(doc, 'info.license.name') === AI_CRAWLER_DATASET_LICENSE.id)
check('info.contact carries a URL a catalogue can show', /^https:\/\//.test(str(at(doc, 'info.contact.url'))))
const servers = arr(doc.servers)
check('a single https server is declared', servers.length === 1 && /^https:\/\//.test(str(at(servers[0], 'url'))))

// ---- it describes only what we serve ----

const paths = Object.keys(obj(doc.paths))
check('exactly one path is described', paths.length === 1)
check('that path is the dataset endpoint', paths[0] === DATASET_PATH)

const get = at(doc, `paths.${DATASET_PATH}.get`)
check('the path declares GET and nothing else', Object.keys(obj(at(doc, `paths.${DATASET_PATH}`))).join(',') === 'get')
check('GET has an operationId', str(at(get, 'operationId')).length > 0)

// Every described path must resolve to a route file in the app, or a validator
// following the document gets a 404 from us.
for (const p of paths) {
  const routeFile = join(ROOT, 'app', p, 'route.ts')
  check(`${p} has a route handler on disk`, existsSync(routeFile))
}

// The only query parameter the route reads is `format`, and csv is its only
// meaningful value.
const params = arr(at(get, 'parameters'))
check('exactly one query parameter is described', params.length === 1)
check('it is `format` in the query', at(params[0], 'name') === 'format' && at(params[0], 'in') === 'query')
check('format is optional', at(params[0], 'required') === false)
check('csv is the only enumerated value', JSON.stringify(at(params[0], 'schema.enum')) === JSON.stringify(['csv']))

const routeSrc = stripComments(readFileSync(join(ROOT, 'app', DATASET_PATH, 'route.ts'), 'utf8'))
check('the route really reads a `format` parameter', routeSrc.includes("searchParams.get('format')"))
check('the route really answers csv', routeSrc.includes("format === 'csv'"))

// Both response codes the route can produce, and no others invented.
const codes = Object.keys(obj(at(get, 'responses'))).sort()
check('the documented status codes are 200 and 451', JSON.stringify(codes) === JSON.stringify(['200', '451']))
check('the route really can answer 451', routeSrc.includes('status: 451'))
check('200 declares both media types the route serves', JSON.stringify(Object.keys(obj(at(get, 'responses.200.content'))).sort()) === JSON.stringify(['application/json', 'text/csv']))
check('the x-license header is documented', typeof at(get, 'responses.200.headers.x-license') === 'object')
check('the route really sets x-license', routeSrc.includes("'x-license'"))

// ---- the schema matches the real response ----

const schemas = obj(at(doc, 'components.schemas'))
const dataset = obj(schemas.Dataset)
check('the Dataset schema is referenced by the 200 response', at(get, 'responses.200.content.application/json.schema.$ref') === '#/components/schemas/Dataset')

// The route builds its JSON from these keys; the document must require the same
// ones, or a consumer validates our own response as invalid.
const SERVED_KEYS = ['version', 'license', 'source', 'notes', 'crawlers', 'candidates']
check('Dataset requires exactly the keys the route serves', JSON.stringify(dataset.required) === JSON.stringify(SERVED_KEYS))
check('Dataset describes exactly those properties', JSON.stringify(Object.keys(obj(dataset.properties))) === JSON.stringify(SERVED_KEYS))
for (const key of SERVED_KEYS) {
  check(`the route really serves \`${key}\``, new RegExp(`\\b${key}:`).test(routeSrc))
}

// A row's documented required fields must be present on every real row, and a
// documented property must exist on at least one — a field we describe but
// never send is a promise a validator can catch.
const crawler = obj(schemas.Crawler)
const crawlerProps = Object.keys(obj(crawler.properties))
for (const field of arr(crawler.required).map(str)) {
  check(
    `every dataset row carries the required field \`${field}\``,
    AI_CRAWLER_DATASET.every((r) => row(r)[field] !== undefined),
  )
}
for (const field of crawlerProps) {
  check(
    `at least one dataset row carries the described field \`${field}\``,
    AI_CRAWLER_DATASET.some((r) => row(r)[field] !== undefined),
  )
}
check(
  'no dataset row carries a field the document does not describe',
  AI_CRAWLER_DATASET.every((r) => Object.keys(row(r)).every((k) => crawlerProps.includes(k))),
)

const candidate = obj(schemas.Candidate)
const candidateProps = Object.keys(obj(candidate.properties))
for (const field of arr(candidate.required).map(str)) {
  check(
    `every candidate row carries the required field \`${field}\``,
    AI_CRAWLER_CANDIDATES.every((r) => row(r)[field] !== undefined),
  )
}
check(
  'no candidate row carries a field the document does not describe',
  AI_CRAWLER_CANDIDATES.every((r) => Object.keys(row(r)).every((k) => candidateProps.includes(k))),
)

// The purpose enum must cover every purpose in use, or a validator rejects our
// own rows.
const purposes = [...new Set([...AI_CRAWLER_DATASET, ...AI_CRAWLER_CANDIDATES].map((c) => c.purpose as string))].sort()
const documentedPurposes = arr(at(crawler, 'properties.purpose.enum')).map(str).sort()
check(
  `the purpose enum covers every purpose in the data (${purposes.join(', ')})`,
  purposes.every((p) => documentedPurposes.includes(p)),
)
check(
  'the candidate purpose enum is the same list',
  JSON.stringify(arr(at(candidate, 'properties.purpose.enum')).map(str).sort()) === JSON.stringify(documentedPurposes),
)

// ---- our own response validates against our own description ----
//
// This is what a catalogue's validator does: fetch the endpoint, then check the
// body against the schema the document promises. Rather than add a validator
// dependency for one document, the subset of JSON Schema this document actually
// uses is checked directly — type, required, properties, items, enum and $ref.

type Schema = Record<string, unknown>

function resolve(schema: Schema): Schema {
  if (!schema?.$ref) return schema
  const name = String(schema.$ref).replace('#/components/schemas/', '')
  return obj(schemas[name])
}

/** Returns the paths that do not satisfy the schema; empty means valid. */
function violations(schema: Schema, value: unknown, path = '$'): string[] {
  const s = resolve(schema)
  const out: string[] = []
  const t = s.type

  if (t === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path}: not an object`]
    const node = value as Record<string, unknown>
    for (const req of arr(s.required).map(str)) {
      if (node[req] === undefined) out.push(`${path}.${req}: required but absent`)
    }
    for (const [key, child] of Object.entries(node)) {
      const childSchema = obj(s.properties)[key] as Schema | undefined
      if (!childSchema) { out.push(`${path}.${key}: not described`); continue }
      if (child !== undefined) out.push(...violations(childSchema, child, `${path}.${key}`))
    }
    return out
  }

  if (t === 'array') {
    if (!Array.isArray(value)) return [`${path}: not an array`]
    value.forEach((item, i) => out.push(...violations(obj(s.items), item, `${path}[${i}]`)))
    return out
  }

  if (t === 'string') {
    if (typeof value !== 'string') return [`${path}: not a string`]
    if (s.enum && !arr(s.enum).includes(value)) out.push(`${path}: "${value}" is not in the enum`)
    if (s.format === 'uri' && !/^https?:\/\//.test(value)) out.push(`${path}: not a URI`)
    if (s.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) out.push(`${path}: not a date`)
    return out
  }

  if (t === 'boolean' && typeof value !== 'boolean') return [`${path}: not a boolean`]
  return out
}

// The body the route builds, assembled here from the same constants it serves.
const body = {
  version: AI_CRAWLER_DATASET_VERSION,
  license: AI_CRAWLER_DATASET_LICENSE,
  source: 'https://www.gotopseo.com/en/ai-crawlers',
  notes: ['a note'],
  crawlers: AI_CRAWLER_DATASET,
  candidates: AI_CRAWLER_CANDIDATES,
}
const failures = violations({ $ref: '#/components/schemas/Dataset' }, body)
check(`the real response validates against the Dataset schema${failures.length ? ' — ' + failures.slice(0, 5).join('; ') : ''}`, failures.length === 0)

// And the validator itself has to be able to fail, or the check above is a
// decoration: a row with a purpose outside the enum must be rejected.
const badPurpose = { ...body, crawlers: [{ ...(AI_CRAWLER_DATASET[0] as object), purpose: 'vibes' }] }
check('MUT the schema check rejects a purpose outside the enum', violations({ $ref: '#/components/schemas/Dataset' }, badPurpose).length > 0)

const missingToken = { ...body, crawlers: [{ operator: 'X', purpose: 'train', crawls: true, respectsRobots: true, docs: 'https://x.test', verified: '2026-11-01' }] }
check('MUT the schema check rejects a row with no token', violations({ $ref: '#/components/schemas/Dataset' }, missingToken).length > 0)

const extraField = { ...body, crawlers: [{ ...(AI_CRAWLER_DATASET[0] as object), pricePerCall: 1 }] }
check('MUT the schema check rejects an undescribed field', violations({ $ref: '#/components/schemas/Dataset' }, extraField).length > 0)

// ---- nothing invented ----

const raw = JSON.stringify(doc)
check('no authentication scheme is claimed', !/securitySchemes|"security"/.test(raw))
check('no rate limit is claimed', !/rate.?limit/i.test(raw))
check('no price or plan is mentioned', !/price|pricing|\bplan\b|subscription/i.test(raw))
check('no example response is fabricated as real data', !/"example"\s*:/.test(raw))

// The licence URL is read from the dataset module, never retyped here.
const openapiSrc = stripComments(readFileSync(join(ROOT, 'lib/ai-crawlers/openapi.ts'), 'utf8'))
check('the licence URL is not hard-coded in openapi.ts', !openapiSrc.includes('creativecommons.org/licenses'))
check('the dataset version is not hard-coded in openapi.ts', !/['"]\d{4}\.\d{2}\.\d{2}['"]/.test(openapiSrc))

// ---- the document is actually served ----

const openapiRoute = join(ROOT, 'app/api/public/ai-crawlers/openapi/route.ts')
check('a route serves the document', existsSync(openapiRoute))
if (existsSync(openapiRoute)) {
  const src = stripComments(readFileSync(openapiRoute, 'utf8'))
  check('that route calls the builder', src.includes('aiCrawlerOpenApiDocument()'))
  check('it is served as an OpenAPI document', src.includes('application/openapi+json'))
  check('it is CORS-open, like the dataset it describes', src.includes("'access-control-allow-origin': '*'"))
  check('it is cacheable', src.includes('max-age='))
  check('it keeps the sanctions guard the public surface uses', src.includes('restrictionForRequest'))
}

// ---- mutation controls ----
//
// Each guard above earns its line only if it fails when the thing it guards
// breaks. These break the document on purpose and show the same predicate
// rejecting it.

/** A path we do not serve must be caught by the route-exists check. */
check(
  'MUT a described path with no route handler is caught',
  !existsSync(join(ROOT, 'app', '/api/public/ai-crawlers/history', 'route.ts')),
)

/** A required field the data does not carry must be caught. */
const invented = { ...crawler, required: [...arr(crawler.required).map(str), 'pricePerCall'] }
check(
  'MUT a required field absent from every row is caught',
  !AI_CRAWLER_DATASET.every((r) => invented.required.every((f) => row(r)[f] !== undefined)),
)

/** A described field no row sends must be caught. */
check(
  'MUT a described field absent from every row is caught',
  !AI_CRAWLER_DATASET.some((r) => row(r).pricePerCall !== undefined),
)

/** A purpose missing from the enum must be caught. */
check(
  'MUT a purpose enum missing a purpose in use is caught',
  !purposes.every((p) => ['train'].includes(p)),
)

/** An invented licence must be caught. */
const wrongLicence: string = 'https://opensource.org/licenses/MIT'
check('MUT a licence other than the served one is caught', wrongLicence !== AI_CRAWLER_DATASET_LICENSE.url)

/** A security scheme written into the document must be caught. */
const withAuth = { ...doc, components: { ...obj(doc.components), securitySchemes: { apiKey: { type: 'apiKey' } } } }
check('MUT a securityScheme in the document is caught', /securitySchemes/.test(JSON.stringify(withAuth)))

/** A version retyped as a literal must be caught. */
check("MUT a hard-coded version literal is caught", /['"]\d{4}\.\d{2}\.\d{2}['"]/.test("const v = '2026.11.01'"))

console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1

export {}
