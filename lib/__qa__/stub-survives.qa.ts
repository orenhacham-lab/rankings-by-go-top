/**
 * ONE REQUEST MUST NOT KILL THE JOURNEY STUB
 * (lib/__qa__/reviewer-journey/supabase-stub.js).
 *
 * What happened on 27 Oct 2026: flash-of-disconnected slows one table
 * (/__stub/slow) so it can tell "answered before the work" from "answered
 * after it", and resets the fixture between its cases. A slowed GET was parked
 * in its `await` while /__stub/reset REPLACED the whole db object, so the lines
 * after the wait read `db[table]` as `undefined` and threw. An exception inside
 * an async request handler is an unhandled rejection, so node ended the stub,
 * and from then on every journey in the run failed on a refused connection:
 * 29 "failures" in screen-tours and 4 more suites that said nothing at all
 * about the code under test, and hours of classifying them against main.
 *
 *  A) a GET slowed past a /__stub/reset answers 200 with the fresh, empty
 *     table instead of throwing, and the stub is still serving afterwards;
 *  B) a request the stub genuinely cannot serve answers 500 and the stub is
 *     STILL serving — the process survives any one request;
 *  C) the handler's own shape: the server callback catches, so no route added
 *     later can take the process down with it.
 * Each has a mutation control that restores the old behaviour and fails.
 *
 * Run: npx tsx lib/__qa__/stub-survives.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..')
const STUB = join(ROOT, 'lib', '__qa__', 'reviewer-journey', 'supabase-stub.js')
const PORT = 5571 // not 5555: a journey's stub may be running
const BASE = `http://127.0.0.1:${PORT}`
const SERVICE = { apikey: 'stub-service-key', authorization: 'Bearer stub-service-key' }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withStub(body: () => Promise<void>) {
  const child = spawn('node', [STUB], { env: { ...process.env, STUB_PORT: String(PORT) }, stdio: 'ignore' })
  try {
    for (let i = 0; i < 80; i++) {
      if (await fetch(`${BASE}/__stub/db`).then(() => true, () => false)) break
      await sleep(100)
    }
    await body()
  } finally {
    child.kill('SIGKILL')
  }
}

const alive = () => fetch(`${BASE}/__stub/db`, { headers: SERVICE }).then((r) => r.ok, () => false)

async function main() {
  await withStub(async () => {
    console.log('\nA) a slowed read that a reset overtakes')
    // A table the fixture does NOT define, which the stub creates on first use:
    // the reset drops it again, so after the wait `db[table]` is gone. That is
    // the exact shape that killed the process, and `projects` would not show it
    // because a reset seeds that one afresh.
    const TABLE = 'zz_table_the_fixture_never_had'
    await fetch(`${BASE}/__stub/slow?tables=${TABLE}&ms=1500`, { headers: SERVICE })
    const slowRead = fetch(`${BASE}/rest/v1/${TABLE}?select=id`, { headers: SERVICE })
    await sleep(300)
    const reset = await fetch(`${BASE}/__stub/reset`, { headers: SERVICE }).then((r) => r.status, () => 0)
    const answered = await slowRead.then(async (r) => ({ status: r.status, body: await r.text() }), (e) => ({ status: 0, body: String(e) }))
    check('A1: the reset is served while the read waits', reset === 200, `reset answered ${reset}`)
    check('A2: the parked read answers 200, not a dead socket', answered.status === 200, `answered ${answered.status}: ${answered.body.slice(0, 120)}`)
    check('A3: its body is JSON — the table was defaulted again after the wait',
      (() => { try { return Array.isArray(JSON.parse(answered.body)) } catch { return false } })(), answered.body.slice(0, 120))
    check('A4: the stub is still serving afterwards', await alive())

    console.log('\nB) a request the stub cannot serve')
    // A POST whose body is not JSON: JSON.parse throws inside the handler,
    // which is exactly the shape of failure that used to end the process.
    const broken = await fetch(`${BASE}/rest/v1/projects`, { method: 'POST', headers: { ...SERVICE, 'content-type': 'application/json' }, body: '{not json' })
      .then((r) => r.status, () => 0)
    check('B1: it answers 500 rather than nothing', broken === 500, `answered ${broken}`)
    check('B2: the stub is STILL serving after it', await alive())
  })

  console.log('\nC) the shape that makes A and B true')
  const src = readFileSync(STUB, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const catches = /createServer\(\(req, res\) => handle\(req, res\)\.catch\(/.test(src)
  check('C1: the server callback catches whatever the handler throws', catches)
  const afterWait = /await new Promise\(\(r\) => setTimeout\(r, slowMs\)\)\s*\n\s*if \(!db\[table\]\) db\[table\] = \[\]/.test(src)
  check('C2: the table is defaulted again after the slow wait', afterWait)

  console.log('\nMUTATION CONTROLS (the old code, which must fail the checks above)')
  const oldHandler = src.replace('createServer((req, res) => handle(req, res).catch(', 'createServer(async (req, res) => (')
  check('M1: a server callback that does not catch fails C1',
    !/createServer\(\(req, res\) => handle\(req, res\)\.catch\(/.test(oldHandler))
  const noDefault = src.replace(/(await new Promise\(\(r\) => setTimeout\(r, slowMs\)\)\s*\n)\s*if \(!db\[table\]\) db\[table\] = \[\]\n/, '$1')
  check('M2: dropping the second default fails C2',
    !/await new Promise\(\(r\) => setTimeout\(r, slowMs\)\)\s*\n\s*if \(!db\[table\]\) db\[table\] = \[\]/.test(noDefault))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

void main()

export {}
