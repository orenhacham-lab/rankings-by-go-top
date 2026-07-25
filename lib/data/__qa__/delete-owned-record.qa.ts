/**
 * Area I — ownership-enforced hard delete of clients/projects (cascade-based).
 *
 * Behavioral (fake Supabase records every .delete()): the action issues exactly ONE
 * delete against the target table scoped by id + user_id; it never deletes child
 * tables (the DB's ON DELETE CASCADE does that) and never touches the per-user
 * gsc_connections. Cross-user / RLS-blocked deletes (zero rows) fail closed; a DB
 * error is surfaced. Plus source-contract: ownership predicate, no service-role, no
 * remote destructive calls, deactivate stays a separate reversible action, and the
 * confirmation dialog shows the exact name + blocks double-submission.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { deleteOwnedRecord } from '../delete-owned-record'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

interface Ctx { deletes: Array<{ table: string; eqs: Array<[string, unknown]> }>; result?: { data: unknown; error: unknown } }
class FakeQ {
  private _delete = false
  private eqs: Array<[string, unknown]> = []
  constructor(private table: string, private ctx: Ctx) {}
  delete() { this._delete = true; return this }
  eq(col: string, val: unknown) { this.eqs.push([col, val]); return this }
  select() { return this }
  then<T>(res: (v: unknown) => T, rej?: (e: unknown) => T) { return Promise.resolve(this._resolve()).then(res, rej) }
  private _resolve(): unknown {
    if (this._delete) {
      this.ctx.deletes.push({ table: this.table, eqs: this.eqs })
      return this.ctx.result ?? { data: [{ id: 'x' }], error: null }
    }
    return { data: null, error: null }
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeSupabase = (ctx: Ctx) => ({ from: (t: string) => new FakeQ(t, ctx) }) as any

async function main() {
  console.log('Area I — deleteOwnedRecord + wiring')

  // ── owner deletes their project → ok; exactly one delete on `projects`, scoped by id + user_id.
  {
    const ctx: Ctx = { deletes: [] }
    const r = await deleteOwnedRecord(fakeSupabase(ctx), 'projects', 'p1', 'u1')
    check('owner project delete → ok', r.ok === true)
    check('exactly ONE delete issued', ctx.deletes.length === 1)
    check('delete targets the projects table only', ctx.deletes[0]?.table === 'projects')
    check('scoped by id AND user_id (ownership predicate)',
      JSON.stringify(ctx.deletes[0]?.eqs) === JSON.stringify([['id', 'p1'], ['user_id', 'u1']]))
    check('NEVER deletes gsc_connections (per-user, survives project delete)',
      !ctx.deletes.some((d) => d.table === 'gsc_connections'))
    check('NEVER deletes child tables directly (cascade is the DB\'s job)',
      !ctx.deletes.some((d) => ['tracking_targets', 'scans', 'generated_articles', 'project_gsc_properties'].includes(d.table)))
  }

  // ── client delete cascades to projects → the action deletes ONLY the clients row.
  {
    const ctx: Ctx = { deletes: [] }
    const r = await deleteOwnedRecord(fakeSupabase(ctx), 'clients', 'c1', 'u1')
    check('owner client delete → ok, targets clients only (projects cascade at DB)',
      r.ok === true && ctx.deletes.length === 1 && ctx.deletes[0]?.table === 'clients')
    check('client delete never touches gsc_connections', !ctx.deletes.some((d) => d.table === 'gsc_connections'))
  }

  // ── cross-user / RLS blocks the row (zero rows returned) → fail closed.
  {
    const ctx: Ctx = { deletes: [], result: { data: [], error: null } }
    const r = await deleteOwnedRecord(fakeSupabase(ctx), 'projects', 'p2', 'other-user')
    check('RLS/ownership blocks cross-user delete → not_found_or_not_owned', !r.ok && r.error === 'not_found_or_not_owned')
  }

  // ── a real DB error is surfaced (never a silent success).
  {
    const ctx: Ctx = { deletes: [], result: { data: null, error: { code: '42501' } } }
    const r = await deleteOwnedRecord(fakeSupabase(ctx), 'clients', 'c2', 'u1')
    check('DB error → delete_failed', !r.ok && r.error === 'delete_failed')
  }

  console.log('SOURCE) actions, core, and dialog contract')
  const core = strip(read('lib/data/delete-owned-record.ts'))
  check('core scopes by id + user_id', /\.eq\('id', id\)\s*\.eq\('user_id', userId\)/.test(core))
  check('core uses the user client, NOT service role', !/service_role|SERVICE_ROLE|createClient\(process\.env/.test(core))
  check('core never references gsc_connections', !/gsc_connections/.test(core))
  check('core does no remote WordPress/Shopify destructive call', !/wordpress|shopify|fetch\(/i.test(core))

  const clientsA = strip(read('app/actions/clients.ts'))
  const projectsA = strip(read('app/actions/projects.ts'))
  check('deleteClientAction present + auth-guarded (not_authenticated)', /export async function deleteClientAction/.test(clientsA) && /not_authenticated/.test(clientsA) && /getUser\(\)/.test(clientsA))
  check('deleteProjectAction present + auth-guarded (not_authenticated)', /export async function deleteProjectAction/.test(projectsA) && /not_authenticated/.test(projectsA) && /getUser\(\)/.test(projectsA))
  check('client action delegates to deleteOwnedRecord(...clients...)', /deleteOwnedRecord\(supabase, 'clients'/.test(clientsA))
  check('project action delegates to deleteOwnedRecord(...projects...)', /deleteOwnedRecord\(supabase, 'projects'/.test(projectsA))
  check('reversible deactivate is KEPT as a separate action', /toggleClientActiveAction/.test(clientsA) && /toggleProjectActiveAction/.test(projectsA))
  check('actions perform no remote WordPress/Shopify delete', !/wordpress|shopify/i.test(clientsA) && !/wordpress|shopify/i.test(projectsA))

  const dialog = strip(read('components/ui/DeleteConfirmDialog.tsx'))
  check('dialog shows the exact record name (replaces {name})', /\.replace\('\{name\}', name\)/.test(dialog))
  check('dialog prevents double-submission', /if \(deleting\) return/.test(dialog) && /disabled=\{deleting\}/.test(dialog))
  check('dialog uses the danger variant (distinct from reversible deactivate)', /variant="danger"/.test(dialog))
  check('dialog shows a clear failure result', /role="alert"/.test(dialog) && /labels\.error/.test(dialog))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
