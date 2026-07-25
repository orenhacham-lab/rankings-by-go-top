/**
 * Area C — ensureDefaultClient: server-authoritative, idempotent, quota-aware.
 *
 * Behavioral coverage via a fake Supabase (records inserts / injects PostgREST errors):
 * zero-client → created with fields derived ONLY from auth user + metadata; existing
 * client → no-op; no user → skipped; 23505 (partial-unique race) → exists; missing
 * is_default column (pre-migration) → best-effort fallback insert WITHOUT is_default;
 * phone normalized; name falls back when company_name is absent. Plus source-contract
 * that the three lifecycle points and the API route are wired.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { ensureDefaultClient } from '../ensure-default-client'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

interface Ctx {
  user: unknown
  clientCount: number
  countError?: { code: string } | null
  profile?: unknown
  subscription?: unknown
  inserted: Array<Record<string, unknown>>
  // Returns the {data,error} for the Nth insert (0-based). Default: success.
  insertBehavior?: (row: Record<string, unknown>, attempt: number) => { data: unknown; error: unknown }
}

class FakeQuery {
  private _insert: Record<string, unknown> | null = null
  private _count = false
  constructor(private table: string, private ctx: Ctx) {}
  select(_c?: unknown, opts?: { head?: boolean }) { if (opts?.head) this._count = true; return this }
  eq() { return this }
  in() { return this }
  order() { return this }
  limit() { return this }
  insert(row: Record<string, unknown>) { this._insert = row; return this }
  maybeSingle() { return Promise.resolve(this._resolve()) }
  // Awaitable for the head-count query (no maybeSingle()).
  then<T>(res: (v: unknown) => T, rej?: (e: unknown) => T) { return Promise.resolve(this._resolve()).then(res, rej) }
  private _resolve(): unknown {
    const { table, ctx } = this
    if (this._insert) {
      const attempt = ctx.inserted.length
      ctx.inserted.push(this._insert)
      return ctx.insertBehavior ? ctx.insertBehavior(this._insert, attempt) : { data: { id: `c${attempt}` }, error: null }
    }
    if (this._count && table === 'clients') return { count: ctx.clientCount, error: ctx.countError ?? null }
    if (table === 'profiles') return { data: ctx.profile ?? null, error: null }
    if (table === 'subscriptions') return { data: ctx.subscription ?? null, error: null }
    return { data: null, error: null }
  }
}
const fakeSupabase = (ctx: Ctx) => ({
  auth: { getUser: async () => ({ data: { user: ctx.user } }) },
  from: (t: string) => new FakeQuery(t, ctx),
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

const baseUser = {
  id: 'u-1', email: 'owner@acme.co',
  user_metadata: { company_name: '  Acme Ltd  ', full_name: 'Jane Doe', phone: '054-948-9377' },
}

async function main() {
  console.log('Area C — ensureDefaultClient')

  // ── zero-client → created; fields derived ONLY from auth user + metadata.
  {
    const ctx: Ctx = { user: baseUser, clientCount: 0, profile: null, subscription: null, inserted: [] }
    const r = await ensureDefaultClient(fakeSupabase(ctx))
    check('zero-client user → created', r.status === 'created')
    const row = ctx.inserted[0] ?? {}
    check('name = company_name (trimmed)', row.name === 'Acme Ltd')
    check('contact_name = full_name', row.contact_name === 'Jane Doe')
    check('email = auth email', row.email === 'owner@acme.co')
    check('phone normalized to digits only', row.phone === '0549489377')
    check('notes null, is_active true, is_default true', row.notes === null && row.is_active === true && row.is_default === true)
    check('user_id = authenticated user id (never client input)', row.user_id === 'u-1')
  }

  // ── idempotent: any existing client → no-op, NO insert.
  {
    const ctx: Ctx = { user: baseUser, clientCount: 1, profile: null, subscription: null, inserted: [] }
    const r = await ensureDefaultClient(fakeSupabase(ctx))
    check('existing client → exists (idempotent), no insert', r.status === 'exists' && ctx.inserted.length === 0)
  }

  // ── no authenticated user → skipped(no_user).
  {
    const ctx: Ctx = { user: null, clientCount: 0, inserted: [] }
    const r = await ensureDefaultClient(fakeSupabase(ctx))
    check('no user → skipped(no_user), no insert', r.status === 'skipped' && r.reason === 'no_user' && ctx.inserted.length === 0)
  }

  // ── concurrent default lost the partial-unique race (23505) → exists, no second attempt.
  {
    const ctx: Ctx = {
      user: baseUser, clientCount: 0, profile: null, subscription: null, inserted: [],
      insertBehavior: () => ({ data: null, error: { code: '23505' } }),
    }
    const r = await ensureDefaultClient(fakeSupabase(ctx))
    check('23505 on is_default insert → exists (race backstop)', r.status === 'exists')
    check('23505 does NOT trigger a second insert', ctx.inserted.length === 1)
  }

  // ── pre-migration: is_default column missing (42703) → fallback insert WITHOUT is_default.
  {
    const ctx: Ctx = {
      user: baseUser, clientCount: 0, profile: null, subscription: null, inserted: [],
      insertBehavior: (row, attempt) =>
        attempt === 0 ? { data: null, error: { code: '42703' } } : { data: { id: 'c-fallback' }, error: null },
    }
    const r = await ensureDefaultClient(fakeSupabase(ctx))
    check('missing column → still created (best-effort)', r.status === 'created')
    check('first attempt carried is_default; fallback did NOT', ctx.inserted[0]?.is_default === true && !('is_default' in (ctx.inserted[1] ?? {})))
  }

  // ── field fallbacks: no company_name → name = full_name; neither → email local part.
  {
    const ctx: Ctx = { user: { id: 'u-2', email: 'solo@x.io', user_metadata: { full_name: 'Solo Dev' } }, clientCount: 0, profile: null, subscription: null, inserted: [] }
    await ensureDefaultClient(fakeSupabase(ctx))
    check('no company_name → name = full_name', ctx.inserted[0]?.name === 'Solo Dev')
  }
  {
    const ctx: Ctx = { user: { id: 'u-3', email: 'nameless@x.io', user_metadata: {} }, clientCount: 0, profile: null, subscription: null, inserted: [] }
    await ensureDefaultClient(fakeSupabase(ctx))
    check('no company/full name → name = email local part', ctx.inserted[0]?.name === 'nameless')
  }

  console.log('WIRING) helper takes only the supabase client (no caller input) + 3 lifecycle points')
  const helper = strip(read('lib/clients/ensure-default-client.ts'))
  check('helper signature takes ONLY the supabase client', /export async function ensureDefaultClient\(supabase: SupabaseClient\)/.test(helper))
  check('helper derives fields from auth user + metadata only', /supabase\.auth\.getUser\(\)/.test(helper) && /user\.user_metadata/.test(helper) && /company_name/.test(helper))
  check('helper is quota-aware via entitlement.limits.maxClients', /entitlement\.limits\.maxClients/.test(helper))
  check('helper creates NO project', !/from\(['"]projects['"]\)/.test(helper))
  check('helper logs no PII (no email/phone/name in console)', !/console\.(log|warn|error)\([^)]*(email|phone|md\.|\.name)/.test(helper))

  const signup = strip(read('app/(auth)/signup/page.tsx'))
  check('signup (immediate session) calls the ensure-default endpoint', /fetch\('\/api\/clients\/ensure-default',\s*\{\s*method:\s*'POST'\s*\}\)/.test(signup))
  const callback = strip(read('app/api/auth/callback/route.ts'))
  check('auth callback (email-confirmation) calls ensureDefaultClient(supabase)', /ensureDefaultClient\(supabase\)/.test(callback))
  const layout = strip(read('app/(dashboard)/layout.tsx'))
  check('dashboard layout catch-all calls ensureDefaultClient(supabase)', /ensureDefaultClient\(supabase\)/.test(layout))
  const route = strip(read('app/api/clients/ensure-default/route.ts'))
  check('API route ignores the body (POST() takes no request)', /export async function POST\(\)/.test(route) && /ensureDefaultClient\(supabase\)/.test(route))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
