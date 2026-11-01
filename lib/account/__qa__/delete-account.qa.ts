/**
 * ACCOUNT DELETION (lib/account/delete-account.ts, app/api/account/delete/route.ts).
 *
 * Why this suite exists: the privacy policy promised erasure while no deletion
 * route existed, and the obvious implementation — call `deleteUser` and let the
 * foreign keys cascade — is wrong in a way that cannot be undone. A key reaches
 * rows, never storage objects, and one of the merchant buckets is PUBLIC. Delete
 * the rows first and a photo of a person stays served at an address no later pass
 * can discover, because nothing records whose it was any more.
 *
 *   A) THE SWEEP: both merchant buckets, nested prefixes reached (the Maps-post
 *      photos live one level down), paging, a non-UUID id refused BEFORE storage is
 *      touched, and a provider error reported without its text reaching the log;
 *   B) THE ORDER: storage is cleared before the user is deleted, a failed sweep
 *      ABORTS and leaves the account intact, and only the caller's own projects
 *      are swept;
 *   C) THE ROUTE: an operator account and a live subscription are refused, the
 *      confirmation is the session's own email, and no provider text is returned.
 *
 * Every group has MUTATION CONTROLS that break the real module and show the check
 * that should catch it failing. A storage fake that flattened nested paths would
 * make the recursion look untested, so this one reproduces Supabase's own
 * semantics instead: `list` returns immediate children only, and a child that is a
 * prefix rather than an object has `id: null`.
 *
 * Run: npx tsx lib/account/__qa__/delete-account.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'
import { FakeAdmin } from '../../__qa__/_fake-admin'

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const M = require('../delete-account') as typeof import('../delete-account')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

const MUTANTS: string[] = []
process.on('exit', () => { for (const f of MUTANTS) { try { unlinkSync(f) } catch { /* gone */ } } })
/** A broken copy of the real module, loaded for real. Pattern: lib/gbp/__qa__/gbp-image-removal.qa.ts. */
function mutant<T>(rel: string, edit: (s: string) => string): T {
  const src = read(rel)
  const out = edit(src)
  if (out === src) throw new Error(`mutation did not apply to ${rel}`)
  const file = join(__dirname, `.mut-${crypto.randomUUID()}.ts`)
  writeFileSync(file, out.replace(/(\sfrom\s*|\brequire\()'@\//g, "$1'../../../"))
  MUTANTS.push(file)
  return require(file) as T
}
const MOD = 'lib/account/delete-account.ts'

const USER = '99999999-9999-4999-8999-999999999999'
const OTHER_USER = '88888888-8888-4888-8888-888888888888'
const PROJECT = '11111111-1111-4111-8111-111111111111'
const FOREIGN = '22222222-2222-4222-8222-222222222222'
const CONTENT = 'content-article-images'
const AUTHOR = 'author-photos'

/**
 * Storage that behaves like Supabase's, which is the whole point: `list(prefix)`
 * returns IMMEDIATE children, and a child that is only a prefix of deeper objects
 * comes back with `id: null`. A fake that returned `gbp/photo.jpg` as one flat
 * entry of `<project>` would never exercise the recursion.
 */
function fakeStorage(objects: string[], opts: { failRemove?: boolean; failList?: boolean; limit?: number } = {}) {
  const live = new Set(objects)
  const calls: { op: string; bucket: string; arg: unknown }[] = []
  const bucketOf = (p: string) => p.slice(0, p.indexOf(':'))
  const keyOf = (p: string) => p.slice(p.indexOf(':') + 1)
  const from = (bucket: string) => ({
    list: async (prefix: string, o?: { limit?: number }) => {
      calls.push({ op: 'list', bucket, arg: prefix })
      if (opts.failList) return { data: null, error: { message: 'raw provider error: listing refused for bucket' } }
      const children = new Map<string, boolean>() // name -> isFolder
      for (const p of live) {
        if (bucketOf(p) !== bucket) continue
        const key = keyOf(p)
        if (!key.startsWith(`${prefix}/`)) continue
        const rest = key.slice(prefix.length + 1)
        const slash = rest.indexOf('/')
        if (slash === -1) children.set(rest, false)
        else children.set(rest.slice(0, slash), true)
      }
      const all = [...children].map(([name, isFolder]) => ({ name, id: isFolder ? null : crypto.randomUUID() }))
      return { data: all.slice(0, opts.limit ?? o?.limit ?? 100), error: null }
    },
    remove: async (paths: string[]) => {
      calls.push({ op: 'remove', bucket, arg: paths })
      if (opts.failRemove) return { data: null, error: { message: 'raw provider error: object not found' } }
      for (const p of paths) live.delete(`${bucket}:${p}`)
      return { data: [], error: null }
    },
  })
  const storage = { from } as any
  // Shaped like the service-role client, because that is what the module receives.
  return { storage, admin: { storage } as any, live, calls }
}

/** console.error captured, so a check can assert what did and did not reach the log. */
async function captureErrors<T>(fn: () => Promise<T>): Promise<{ out: T; logged: string }> {
  const orig = console.error
  const lines: string[] = []
  console.error = (...a: unknown[]) => { lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')) }
  try { return { out: await fn(), logged: lines.join('\n') } } finally { console.error = orig }
}

/** The service role: the two projects tables plus a recording `auth.admin`. */
function world(storage = fakeStorage([]), opts: { failUserDelete?: boolean; selectFails?: boolean } = {}) {
  const admin: any = new FakeAdmin(
    {
      projects: [
        { id: PROJECT, user_id: USER, name: 'דנה' },
        { id: FOREIGN, user_id: OTHER_USER, name: 'אחר' },
      ],
    },
    opts.selectFails ? { projects: { select: () => ({ code: '42501', message: 'raw provider error: permission denied' }) } } : {},
  )
  admin.storage = storage.storage
  const deleted: string[] = []
  // Recorded in call order against the storage fake's, so ORDER can be asserted.
  admin.auth = {
    admin: {
      deleteUser: async (id: string) => {
        storage.calls.push({ op: 'deleteUser', bucket: '-', arg: id })
        if (opts.failUserDelete) return { data: null, error: { status: 500, message: 'raw provider error' } }
        deleted.push(id)
        return { data: {}, error: null }
      },
    },
  }
  return { admin, deleted, storage }
}

const objs = (...keys: string[]) => keys
const sweepable = objs(
  `${CONTENT}:${PROJECT}/article-abc.jpg`,
  `${CONTENT}:${PROJECT}/gbp/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`,
  `${AUTHOR}:${PROJECT}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`,
  `${CONTENT}:${FOREIGN}/article-zzz.jpg`,
)

async function main() {
  console.log('\nA) the sweep')

  {
    const s = fakeStorage(sweepable)
    const out = await M.removeProjectStorage(s.admin, PROJECT)
    check('A1: the nested gbp folder is reached, so a Maps-post photo is removed',
      !s.live.has(`${CONTENT}:${PROJECT}/gbp/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`))
    check('A2: both merchant buckets are swept, not only the public one',
      !s.live.has(`${AUTHOR}:${PROJECT}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`))
    check('A3: another project\'s objects are left alone',
      s.live.has(`${CONTENT}:${FOREIGN}/article-zzz.jpg`))
    check('A4: it reports what it removed and no failure', out.failed === false && out.removed === 3,
      JSON.stringify(out))
  }

  {
    const s = fakeStorage(sweepable)
    const out = await M.removeProjectStorage(s.admin, 'not-a-uuid')
    check('A5: a project id that is not a uuid is refused BEFORE storage is touched',
      out.failed === true && s.calls.length === 0)
  }

  {
    // 250 objects in one prefix, listed 100 at a time: paging must clear them all.
    const many = Array.from({ length: 250 }, (_, i) => `${CONTENT}:${PROJECT}/img-${i}.jpg`)
    const s = fakeStorage(many, { limit: 100 })
    const out = await M.removeProjectStorage(s.admin, PROJECT)
    check('A6: a prefix larger than one listing page is fully cleared',
      out.failed === false && out.removed === 250 && [...s.live].length === 0, JSON.stringify(out))
  }

  {
    const s = fakeStorage(sweepable, { failList: true })
    const { out, logged } = await captureErrors(() => M.removeProjectStorage(s.admin, PROJECT))
    check('A7: a listing error is reported, not swallowed', out.failed === true)
    check('A8: the provider\'s own words never reach the log', !/raw provider error/.test(logged), logged)
  }

  {
    const s = fakeStorage(sweepable, { failRemove: true })
    const { out, logged } = await captureErrors(() => M.removeProjectStorage(s.admin, PROJECT))
    check('A9: a removal error is reported and carries no provider text',
      out.failed === true && !/raw provider error/.test(logged))
  }

  console.log('\nA) mutation controls')

  {
    // Drop the recursion into sub-prefixes: the gbp photo then survives.
    const Broken = mutant<typeof import('../delete-account')>(MOD, (s) =>
      s.replace(/    for \(const folder of folders\) \{[\s\S]*?\n    \}\n/, ''))
    const s = fakeStorage(sweepable)
    await Broken.removeProjectStorage(s.admin, PROJECT)
    check('A-MUT1: without the recursion the Maps-post photo survives, so A1 would fail',
      s.live.has(`${CONTENT}:${PROJECT}/gbp/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`))
  }

  {
    // Sweep only the public bucket: the author photo then survives.
    const Broken = mutant<typeof import('../delete-account')>(MOD, (s) =>
      s.replace('[CONTENT_IMAGE_BUCKET, AUTHOR_PHOTO_BUCKET]', '[CONTENT_IMAGE_BUCKET]'))
    const s = fakeStorage(sweepable)
    await Broken.removeProjectStorage(s.admin, PROJECT)
    check('A-MUT2: with one bucket dropped the author photo survives, so A2 would fail',
      s.live.has(`${AUTHOR}:${PROJECT}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`))
  }

  {
    // Accept any project id: storage is then touched for a non-uuid.
    const Broken = mutant<typeof import('../delete-account')>(MOD, (s) =>
      s.replace('if (!UUID.test(projectId)) return { removed: 0, failed: true }', ''))
    const s = fakeStorage(sweepable)
    await Broken.removeProjectStorage(s.admin, 'not-a-uuid')
    check('A-MUT3: without the uuid guard storage IS touched for a bad id, so A5 would fail',
      s.calls.length > 0)
  }

  console.log('\nB) the order, and whose projects')

  {
    const s = fakeStorage(sweepable)
    const w = world(s)
    const out = await M.deleteAccount(w.admin, USER)
    const firstDelete = s.calls.findIndex((c) => c.op === 'deleteUser')
    const lastRemove = s.calls.map((c) => c.op).lastIndexOf('remove')
    check('B1: the account is deleted', out.ok === true && w.deleted.includes(USER), JSON.stringify(out))
    check('B2: every storage removal happens BEFORE the user is deleted',
      firstDelete > -1 && lastRemove > -1 && lastRemove < firstDelete, `remove@${lastRemove} deleteUser@${firstDelete}`)
    check('B3: only the caller\'s project is swept — the other user\'s objects remain',
      s.live.has(`${CONTENT}:${FOREIGN}/article-zzz.jpg`))
    check('B4: it reports the projects and files it accounted for',
      out.ok === true && out.projects === 1 && out.filesRemoved === 3, JSON.stringify(out))
  }

  {
    const s = fakeStorage(sweepable, { failRemove: true })
    const w = world(s)
    const { out } = await captureErrors(() => M.deleteAccount(w.admin, USER))
    check('B5: a failed sweep ABORTS: the answer says so', out.ok === false && (out as any).error === 'storage_incomplete')
    check('B6: …and the user is NOT deleted, so the request stays retryable',
      w.deleted.length === 0 && !s.calls.some((c) => c.op === 'deleteUser'))
  }

  {
    const w = world(fakeStorage(sweepable), { selectFails: true })
    const { out } = await captureErrors(() => M.deleteAccount(w.admin, USER))
    check('B7: if the projects cannot be read, nothing is deleted at all',
      out.ok === false && (out as any).error === 'projects_unreadable' && w.deleted.length === 0)
  }

  {
    const s = fakeStorage(sweepable)
    const w = world(s, { failUserDelete: true })
    const { out, logged } = await captureErrors(() => M.deleteAccount(w.admin, USER))
    check('B8: a failed user delete is reported without provider text',
      out.ok === false && (out as any).error === 'user_delete_failed' && !/raw provider error/.test(logged))
  }

  console.log('\nB) mutation controls')

  {
    // Delete the user first, then sweep: the orphan case this module exists to prevent.
    const Broken = mutant<typeof import('../delete-account')>(MOD, (s) => {
      const sweep = s.match(/  let filesRemoved = 0\n[\s\S]*?\n  \}\n/)
      if (!sweep) throw new Error('sweep block not found')
      const authBlock = s.match(/  const \{ error: authError \} = await admin\.auth\.admin\.deleteUser\(userId\)\n/)
      if (!authBlock) throw new Error('auth block not found')
      return s.replace(sweep[0], '').replace(authBlock[0], authBlock[0] + sweep[0])
    })
    const s = fakeStorage(sweepable)
    const w = world(s)
    await Broken.deleteAccount(w.admin, USER)
    const firstDelete = s.calls.findIndex((c) => c.op === 'deleteUser')
    const lastRemove = s.calls.map((c) => c.op).lastIndexOf('remove')
    check('B-MUT1: with the order reversed the user goes first, so B2 would fail',
      firstDelete > -1 && lastRemove > firstDelete)
  }

  {
    // Carry on after a failed sweep: the user is deleted and the files are orphaned.
    const Broken = mutant<typeof import('../delete-account')>(MOD, (s) =>
      s.replace("if (sweep.failed) return { ok: false, error: 'storage_incomplete' }", ''))
    const s = fakeStorage(sweepable, { failRemove: true })
    const w = world(s)
    await captureErrors(() => Broken.deleteAccount(w.admin, USER))
    check('B-MUT2: without the abort the user IS deleted while files remain, so B6 would fail',
      w.deleted.includes(USER) && s.live.has(`${CONTENT}:${PROJECT}/gbp/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`))
  }

  {
    // Drop the owner filter on a service-role read, which bypasses RLS.
    const Broken = mutant<typeof import('../delete-account')>(MOD, (s) =>
      s.replace(".select('id').eq('user_id', userId)", ".select('id')"))
    const s = fakeStorage(sweepable)
    const w = world(s)
    await Broken.deleteAccount(w.admin, USER)
    check('B-MUT3: without the owner filter ANOTHER user\'s objects are swept, so B3 would fail',
      !s.live.has(`${CONTENT}:${FOREIGN}/article-zzz.jpg`))
  }

  console.log('\nC) the route')

  const routeSrc = strip(read('app/api/account/delete/route.ts'))
  check('C1: the user id comes from the session, never from the request body',
    /await supabase\.auth\.getUser\(\)/.test(routeSrc) && /deleteAccount\(admin, user\.id\)/.test(routeSrc))
  check('C2: an operator account is refused', /entitlement\.isAdmin\) return refuse\('admin_account'/.test(routeSrc))
  check('C3: a live paid subscription is refused rather than silently cancelled',
    /entitlement\.hasActiveSubscription\) return refuse\('subscription_active'/.test(routeSrc))
  check('C4: the confirmation is compared against the SESSION\'s email',
    /const expected = \(user\.email \?\? ''\)/.test(routeSrc) && /typed\.trim\(\)\.toLowerCase\(\) !== expected/.test(routeSrc))
  check('C5: the session is cleared after the account is gone', /supabase\.auth\.signOut\(\)/.test(routeSrc))
  check('C6: nothing but a fixed code is returned to the browser',
    /NextResponse\.json\(\{ ok: false, error \}/.test(routeSrc) && !/error\.message/.test(routeSrc))
  // A route that read the id from the body would delete someone else's account; a
  // regex that merely found `deleteAccount(` would not notice.
  check('C7: the body is read for the confirmation only',
    !/body\.(userId|user_id|id)\b/.test(routeSrc))

  console.log('\nC) mutation controls')
  check('C-MUT1: C2 fails when the operator refusal is removed',
    !/entitlement\.isAdmin\) return refuse\('admin_account'/.test(
      routeSrc.replace(/if \(entitlement\.isAdmin\) return refuse\('admin_account', 403\)/, '')))
  check('C-MUT2: C3 fails when the subscription refusal is removed',
    !/entitlement\.hasActiveSubscription\) return refuse\('subscription_active'/.test(
      routeSrc.replace(/if \(entitlement\.hasActiveSubscription\) return refuse\('subscription_active', 409\)/, '')))
  check('C-MUT3: C4 fails when the confirmation is compared to a constant instead',
    !/typed\.trim\(\)\.toLowerCase\(\) !== expected/.test(
      routeSrc.replace("typed.trim().toLowerCase() !== expected", "typed !== 'DELETE'")))
  check('C-MUT4: C7 fails when the route takes a user id from the body',
    /body\.(userId|user_id|id)\b/.test(routeSrc.replace('body.confirm', 'body.userId')))


  /**
   * D) THE PUBLISHED PROMISE, in all seven locales.
   *
   * The retention section used to say an account is kept "up to 90 days after it
   * is deleted so an accidental deletion can be undone" — a grace period for a
   * deletion that had no route at all. Now the deletion is immediate, so the
   * sentence is wrong in the other direction and has to be gone from every
   * document, not only the two hand-written pages.
   *
   * The checks run `promisesUndo` and `statesImmediate` over the REAL documents,
   * and the mutation controls run the same two functions over the real text with
   * the old sentence put back, so a guard that cannot fail would show here.
   */
  console.log('\nD) the privacy policy, seven locales')

  const PRIVACY: Record<string, { file: string; old: string; now: string }> = {
    he: {
      file: 'app/(legal)/privacy/page.tsx',
      old: 'ועד 90 יום לאחר מחיקתו',
      now: 'מחיקת החשבון\n          ממסך ההגדרות מוחקת מיד',
    },
    en: {
      file: 'app/(public)/en/privacy/page.tsx',
      old: 'up to 90 days after it is deleted',
      now: 'Deleting the account from the settings screen erases every site',
    },
    es: {
      file: 'content/legal/es/privacy.md',
      old: 'hasta 90 días después de su eliminación',
      now: 'Eliminar la cuenta desde la pantalla de configuración suprime de inmediato',
    },
    fr: {
      file: 'content/legal/fr/privacy.md',
      old: "jusqu'à 90 jours après sa suppression",
      now: "La suppression du compte depuis l'écran des réglages efface immédiatement",
    },
    it: {
      file: 'content/legal/it/privacy.md',
      old: 'fino a 90 giorni dopo la sua cancellazione',
      now: "La cancellazione dell'account dalla schermata delle impostazioni elimina subito",
    },
    ja: {
      file: 'content/legal/ja/privacy.md',
      old: '削除後90日まで',
      now: '設定画面からアカウントを削除すると',
    },
    'pt-BR': {
      file: 'content/legal/pt-BR/privacy.md',
      old: 'até 90 dias depois da exclusão',
      now: 'Excluir a conta na tela de configurações apaga na hora',
    },
  }

  /** The undo promise, in the words each document used for it. */
  const promisesUndo = (text: string, old: string) => text.includes(old)
  /** The sentence that replaced it. */
  const statesImmediate = (text: string, now: string) => text.includes(now)

  for (const [locale, doc] of Object.entries(PRIVACY)) {
    const text = read(doc.file)
    check(`D1 ${locale}: the 90-day undo promise is gone`, !promisesUndo(text, doc.old))
    check(`D2 ${locale}: the document says the deletion is immediate`, statesImmediate(text, doc.now))
    // The merchant has to be told WHERE, or the right is theoretical.
    check(`D3 ${locale}: it says the button is on the settings screen`,
      /ההגדרות|settings screen|pantalla de configuración|écran des réglages|schermata delle impostazioni|設定画面|tela de configurações/.test(text))
  }

  console.log('\nD) mutation controls')

  for (const [locale, doc] of Object.entries(PRIVACY)) {
    // The real document with the old sentence put back where it was.
    const restored = read(doc.file).replace(doc.now, `${doc.old} ${doc.now}`)
    check(`D-MUT ${locale}: D1 fails when the undo promise comes back`,
      promisesUndo(restored, doc.old))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

void main()
export {}
