/**
 * THE AUTHOR PHOTO — the guards (lib/content/author-box/photo.ts, photo-file.ts,
 * photo-copy.ts; the 'upload' image choice of the author box).
 *
 *   P) the storage path is `<project_id>/<random uuid>.<ext>` and nothing else;
 *   V) the file: JPEG, PNG or WebP by its first bytes, at most 2 MB, re-encoded
 *      with no metadata (EXIF/GPS gone), turned upright and fitted to 512 px;
 *   D) deleting the photo, replacing it, or saving the image back to 'none' or
 *      'site_icon' REMOVES THE STORAGE OBJECT (storage.remove), not only the
 *      pointer; a removal that fails changes nothing; an upload whose pointer
 *      cannot be written removes its object;
 *   O) only the owner: someone else's project is not_found before any storage call;
 *   A) no AI: no module importing the photo modules, and nothing they import,
 *      reaches a model client;
 *   B) the private bucket: only signed URLs, downloads, uploads and removals,
 *      never a public URL; the migration makes it private; a published box
 *      never links our storage, only the copy in the customer's site;
 *   C) the copy into WordPress: uploaded once per project and site, reused, a
 *      file name with no person in it; the published box draws that copy;
 *   S) the Shopify gating: 'upload' is offered only on WordPress with an
 *      application password (the copy is possible), never on a store;
 *   N) the box: the name line is the link (the settings preview too);
 *   L) every new string in the four dashboard languages, used by the card;
 *   M) the migration: 'upload' in the CHECK, the path CHECK, the private bucket.
 *
 * Every group has a MUTATION CONTROL: a deliberately broken copy of the module
 * (written next to it, imported, deleted) or of the source text must fail the
 * same check.
 *
 * Run: npx tsx lib/content/__qa__/author-photo.qa.ts
 */
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join, relative } from 'path'
import sharp from 'sharp'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { applyArticleDesign } from '@/lib/content/article-style/publish'
import { authorBoxContent, authorBoxStructure } from '@/lib/content/author-box/box'
import { AUTHOR_PHOTO_PATH, authorPhotoPath, isAuthorPhotoPath } from '@/lib/content/author-box/photo-file'
import type * as PhotoMod from '@/lib/content/author-box/photo'
import type * as PhotoFileMod from '@/lib/content/author-box/photo-file'
import { copyAuthorPhotoToWordPress } from '@/lib/content/author-box/photo-copy'
import { loadWritingGuidance, saveWritingGuidance, type GuidanceDeps } from '@/lib/content/writing-guidance/data'
import type * as DataMod from '@/lib/content/writing-guidance/data'
import type * as PreviewMod from '@/lib/content/author-box/preview'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  PASS ${name}`) } else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** A deliberately broken copy of a module, next to it (so its relative imports resolve), imported, deleted. */
async function mutant<T>(rel: string, edit: (src: string) => string): Promise<T> {
  const file = join(ROOT, rel)
  const src = readFileSync(file, 'utf8')
  const out = edit(src)
  if (out === src) throw new Error(`mutation of ${rel} changed nothing`)
  const copy = file.replace(/\.ts$/, `.mut-${process.pid}-${Math.random().toString(36).slice(2, 8)}.ts`)
  writeFileSync(copy, out)
  try {
    return (await import(copy)) as T
  } finally {
    unlinkSync(copy)
  }
}

const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const OTHER_PROJECT = 'a9999999-2222-3333-4444-555555555555'
const OWNER = 'u-owner'
const OTHER = 'u-other'
const ART = 'b1111111-2222-3333-4444-555555555555'
const DOMAIN = 'shop.example.co.il'
const UUID1 = '0f0e0d0c-0b0a-4908-8706-050403020100'
const UUID2 = '1f1e1d1c-1b1a-4918-9716-151413121110'
const OLD_PATH = `${PROJECT}/${UUID2}.png`
const NOW = new Date('2026-10-17T12:00:00Z')
const SIGNED = 'https://pmzicbtulloeynsosseh.supabase.co/storage/v1/object/sign/author-photos/x?token=t'

type Row = Record<string, unknown>

/** A fake of the service role's storage: records every call; removal can be made to fail. */
function fakeStorage(opts: { failRemove?: boolean; failUpload?: boolean } = {}) {
  const objects = new Map<string, { bucket: string; bytes: Uint8Array; type?: string }>()
  const calls: { op: string; bucket: string; arg: unknown }[] = []
  const from = (bucket: string) => ({
    upload: async (path: string, bytes: Uint8Array, o?: { contentType?: string }) => {
      calls.push({ op: 'upload', bucket, arg: path })
      if (opts.failUpload) return { data: null, error: { message: 'raw provider error' } }
      objects.set(path, { bucket, bytes, type: o?.contentType }); return { data: { path }, error: null }
    },
    remove: async (paths: string[]) => {
      calls.push({ op: 'remove', bucket, arg: paths })
      if (opts.failRemove) return { data: null, error: { message: 'raw provider error' } }
      for (const p of paths) objects.delete(p); return { data: [], error: null }
    },
    download: async (path: string) => {
      calls.push({ op: 'download', bucket, arg: path })
      const o = objects.get(path)
      return o ? { data: new Blob([Buffer.from(o.bytes)], { type: o.type }), error: null } : { data: null, error: { message: 'not found' } }
    },
    createSignedUrl: async (path: string, seconds: number) => { calls.push({ op: 'sign', bucket, arg: [path, seconds] }); return { data: { signedUrl: SIGNED }, error: null } },
    getPublicUrl: (path: string) => { calls.push({ op: 'public', bucket, arg: path }); return { data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } } },
  })
  return { storage: { from }, objects, calls }
}

function db(styles: Row[], opts: { failUpsert?: boolean } = {}) {
  return new FakeAdmin({
    projects: [
      { id: PROJECT, user_id: OWNER, name: 'Bakery project', business_name: 'Levi Bakery', target_domain: DOMAIN, language: 'en' },
      { id: OTHER_PROJECT, user_id: OTHER, name: 'Other', business_name: 'Other', target_domain: 'other.example', language: 'en' },
    ],
    project_article_styles: styles,
    generated_articles: [{ id: ART, project_id: PROJECT, topic_id: null, wp_post_url: null, published_at: null }],
    project_profiles: [],
    site_page_map: [],
    content_topics: [],
    wordpress_connections: [],
  }, opts.failUpsert ? { project_article_styles: { upsert: () => ({ code: '23514', message: 'raw provider error' }) } } : {})
}
const styleRow = (d: FakeAdmin, user = OWNER, project = PROJECT) => (d.tables.project_article_styles as Row[]).find((r) => r.project_id === project && r.user_id === user) as Row
const baseRow = (extra: Row = {}): Row => ({ project_id: PROJECT, user_id: OWNER, design: 'minimal', brand_colors: [], author_box: true, theme_author_box: false, theme_author_box_checked_at: NOW.toISOString(), author_box_name: null, author_box_url: null, author_box_image: 'none', author_box_photo_path: null, author_box_photo_media: null, writing_guidance: null, ...extra })
const decoyRow = (): Row => ({ ...baseRow({ user_id: OTHER, author_box_photo_path: `${PROJECT}/${UUID1}.jpg`, author_box_image: 'upload' }) })

const photoDeps = (d: FakeAdmin, s: ReturnType<typeof fakeStorage>, user = OWNER) => ({
  session: async () => ({ userId: user, db: d as never }),
  storage: () => ({ storage: s.storage }) as never,
  uuid: () => UUID1,
})
const guidanceDeps = (d: FakeAdmin, s?: ReturnType<typeof fakeStorage>): GuidanceDeps => ({
  session: async () => ({ userId: OWNER, db: d as never }), now: () => NOW, ...(s ? { storage: () => ({ storage: s.storage }) as never } : {}),
})
const fileOf = (bytes: Uint8Array, size = bytes.byteLength) => ({ size, arrayBuffer: async () => new Uint8Array(bytes).buffer })

async function main() {
  const photo = await import('@/lib/content/author-box/photo')

  // Real images, made here.
  const raw = { width: 900, height: 600, channels: 3 as const, background: { r: 200, g: 120, b: 40 } }
  const jpegWithExif = await sharp({ create: raw }).withExif({ IFD0: { Artist: 'Dana Levi', Copyright: 'secret-owner' } }).jpeg().toBuffer()
  const png = await sharp({ create: raw }).png().toBuffer()
  const webp = await sharp({ create: raw }).webp().toBuffer()
  const gif = await sharp({ create: raw }).gif().toBuffer()

  // ── P) the path ──────────────────────────────────────────────────────────
  console.log('\nP) the storage path is <project_id>/<random uuid>.<ext>, nothing else')
  {
    const shape = (m: typeof PhotoFileMod) => {
      const a = m.authorPhotoPath(PROJECT, 'jpeg')
      const b = m.authorPhotoPath(PROJECT, 'jpeg')
      return AUTHOR_PHOTO_PATH.test(a) && a.startsWith(`${PROJECT}/`) && a !== b && m.authorPhotoPath(PROJECT, 'webp', UUID1) === `${PROJECT}/${UUID1}.webp`
        && m.authorPhotoPath(PROJECT, 'png', UUID1) === `${PROJECT}/${UUID1}.png` && a.split('/').length === 2
    }
    check('P1: a new path is the project id, a fresh random uuid and the sniffed extension, and nothing else', shape(await import('@/lib/content/author-box/photo-file')))
    let threw = 0
    for (const bad of ['dana-levi', '../x', `${PROJECT}/..`]) { try { authorPhotoPath(bad, 'jpeg') } catch { threw++ } }
    try { authorPhotoPath(PROJECT, 'jpeg', 'dana-levi') } catch { threw++ }
    check('P2: anything that is not a uuid (a name, a traversal) cannot become a path', threw === 4)
    check('P3: only this project\'s well-formed paths are accepted',
      isAuthorPhotoPath(`${PROJECT}/${UUID1}.jpg`, PROJECT) && !isAuthorPhotoPath(`${OTHER_PROJECT}/${UUID1}.jpg`, PROJECT)
      && !isAuthorPhotoPath(`${PROJECT}/dana-levi.jpg`, PROJECT) && !isAuthorPhotoPath(`${PROJECT}/${UUID1}.gif`, PROJECT)
      && !isAuthorPhotoPath(`${PROJECT}/${UUID1}/x.jpg`, PROJECT) && !isAuthorPhotoPath(`${PROJECT}/${UUID1}.jpg/../x`, PROJECT))
    const named = await mutant<typeof PhotoFileMod>('lib/content/author-box/photo-file.ts', (s) => s.replace('return `${project}/${id}.${AUTHOR_PHOTO_EXT[kind]}`', 'return `${project}/dana-levi-${id}.${AUTHOR_PHOTO_EXT[kind]}`'))
    check('MUTATION CONTROL: a path with a name in it fails P1', !shape(named))
    const src = strip(read('lib/content/author-box/photo.ts'))
    const upPath = (s: string) => /const path = authorPhotoPath\(o\.projectId, prepared\.kind, deps\.uuid\?\.\(\)\)/.test(s) && !/\.name\b|email|slug/.test(s.slice(s.indexOf('export async function uploadAuthorPhoto'), s.indexOf('export async function deleteAuthorPhoto')))
    check('P4: the upload stores at authorPhotoPath(project, sniffed kind) and reads no file name, email or slug', upPath(src))
    check('MUTATION CONTROL: an upload that keeps the file name fails P4', !upPath(src.replace('const path = authorPhotoPath(o.projectId, prepared.kind, deps.uuid?.())', 'const path = `${o.projectId}/${(file as File).name}`')))
  }

  // ── V) the file ─────────────────────────────────────────────────────────
  console.log('\nV) JPEG, PNG or WebP by its bytes, at most 2 MB, re-encoded without metadata')
  {
    const sniffs = (m: typeof PhotoFileMod) => m.sniffAuthorPhoto(jpegWithExif) === 'jpeg' && m.sniffAuthorPhoto(png) === 'png' && m.sniffAuthorPhoto(webp) === 'webp'
      && m.sniffAuthorPhoto(gif) === null && m.sniffAuthorPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')) === null
      && m.sniffAuthorPhoto(Buffer.from('%PDF-1.4')) === null && m.sniffAuthorPhoto(Buffer.from('RIFF\0\0\0\0WAVE')) === null && m.sniffAuthorPhoto(new Uint8Array()) === null
    check('V1: the kind comes from the first bytes: JPEG, PNG and WebP pass; GIF, SVG, PDF, WAV and empty do not', sniffs(await import('@/lib/content/author-box/photo-file')))
    const always = await mutant<typeof PhotoFileMod>('lib/content/author-box/photo-file.ts', (s) => s.replace('  return null\n}\n\nconst UUID', "  return 'jpeg'\n}\n\nconst UUID"))
    check('MUTATION CONTROL: a sniffer that accepts anything fails V1', !sniffs(always))

    const before = await sharp(jpegWithExif).metadata()
    const prepared = await photo.prepareAuthorPhoto(jpegWithExif)
    const after = prepared.ok ? await sharp(prepared.bytes).metadata() : null
    const stripped = (p: typeof prepared, a: typeof after) => p.ok && !!a && !a.exif && !a.xmp && !a.iptc && !p.bytes.includes(Buffer.from('secret-owner')) && Math.max(a.width ?? 0, a.height ?? 0) <= 512
    check('V2: the photo is written again with no EXIF, XMP or IPTC (the artist and copyright are gone), within 512 px', !!before.exif && stripped(prepared, after))
    const keep = await mutant<typeof PhotoMod>('lib/content/author-box/photo.ts', (s) => s.replace(".rotate()\n", '.rotate().keepMetadata()\n'))
    const kept = await keep.prepareAuthorPhoto(jpegWithExif)
    check('MUTATION CONTROL: an encoder that keeps the metadata fails V2', !stripped(kept, kept.ok ? await sharp(kept.bytes).metadata() : null))

    const big = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)])
    const tooBig = await photo.prepareAuthorPhoto(big)
    const asGif = await photo.prepareAuthorPhoto(gif)
    const broken = await photo.prepareAuthorPhoto(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('not really a jpeg')]))
    const pngOk = await photo.prepareAuthorPhoto(png)
    const webpOk = await photo.prepareAuthorPhoto(webp)
    check('V3: over 2 MB, a GIF, and a fake JPEG header are refused with their own codes; PNG and WebP stay their kind',
      !tooBig.ok && tooBig.code === 'photo_too_large' && !asGif.ok && asGif.code === 'photo_type' && !broken.ok && broken.code === 'photo_unreadable'
      && pngOk.ok && pngOk.kind === 'png' && webpOk.ok && webpOk.kind === 'webp')
    const noCap = await mutant<typeof PhotoMod>('lib/content/author-box/photo.ts', (s) => s.replace("if (input.byteLength > AUTHOR_PHOTO_MAX_BYTES) return { ok: false, code: 'photo_too_large' }", ''))
    const r = await noCap.prepareAuthorPhoto(big)
    check('MUTATION CONTROL: without the size cap a 2 MB+ file is accepted (so V3 would fail)', r.ok || r.code !== 'photo_too_large')
    {
      const d = db([baseRow()])
      const s = fakeStorage()
      const declared = await photo.uploadAuthorPhoto(photoDeps(d, s), PROJECT, fileOf(png, 3 * 1024 * 1024))
      const typed = await photo.uploadAuthorPhoto(photoDeps(d, s), PROJECT, { ...fileOf(gif), type: 'image/png', name: 'x.png' })
      check('V4: the upload refuses a declared size over 2 MB before reading it, and a GIF named .png; nothing is stored',
        !declared.ok && declared.code === 'photo_too_large' && !typed.ok && typed.code === 'photo_type' && s.calls.length === 0 && styleRow(d).author_box_photo_path === null)
    }
  }

  // ── D) the object is removed ────────────────────────────────────────────
  console.log('\nD) deleting, replacing or switching the image away REMOVES THE STORAGE OBJECT')
  {
    const d = db([baseRow()])
    const s = fakeStorage()
    const up = await photo.uploadAuthorPhoto(photoDeps(d, s), PROJECT, fileOf(jpegWithExif))
    const path = `${PROJECT}/${UUID1}.jpg`
    check('D0: an upload stores the object in the private bucket and points the owner\'s row at it, the image now upload',
      up.ok && s.objects.has(path) && s.calls[0]?.bucket === 'author-photos' && styleRow(d).author_box_photo_path === path && styleRow(d).author_box_image === 'upload', JSON.stringify({ up, calls: s.calls, row: styleRow(d) }))
    // A decoy row of another owner for the same project (service-role reads must never pick it).
    ;(d.tables.project_article_styles as Row[]).push(decoyRow())
    const del = await photo.deleteAuthorPhoto(photoDeps(d, s), PROJECT)
    const removed = (st: ReturnType<typeof fakeStorage>, p: string) => st.calls.some((c) => c.op === 'remove' && c.bucket === 'author-photos' && JSON.stringify(c.arg) === JSON.stringify([p])) && !st.objects.has(p)
    check('D1: delete removes the object (storage.remove), then clears the pointer and puts the image back to none', del.ok && removed(s, path) && styleRow(d).author_box_photo_path === null && styleRow(d).author_box_image === 'none' && styleRow(d).author_box_photo_media === null)
    check('D1b: the other owner\'s decoy row for the same project is never touched', styleRow(d, OTHER).author_box_photo_path === path && styleRow(d, OTHER).author_box_image === 'upload')
    const pointerOnly = await mutant<typeof PhotoMod>('lib/content/author-box/photo.ts', (s2) => s2.replace('const { error } = await storage.storage.from(AUTHOR_PHOTO_BUCKET).remove([path])\n    return !error', 'return true'))
    const d2 = db([baseRow({ author_box_image: 'upload', author_box_photo_path: path })])
    const s2 = fakeStorage(); s2.objects.set(path, { bucket: 'author-photos', bytes: png })
    await pointerOnly.deleteAuthorPhoto(photoDeps(d2, s2), PROJECT)
    check('MUTATION CONTROL: a delete that clears only the pointer fails D1', !removed(s2, path))
  }
  {
    const path = `${PROJECT}/${UUID1}.jpg`
    const d = db([baseRow({ author_box_image: 'upload', author_box_photo_path: path })])
    const s = fakeStorage({ failRemove: true })
    const del = await photo.deleteAuthorPhoto(photoDeps(d, s), PROJECT)
    check('D2: a removal that fails changes nothing (the owner can try again) and says only a code', !del.ok && del.code === 'delete_failed' && styleRow(d).author_box_photo_path === path && !JSON.stringify(del).includes('raw provider'))
  }
  {
    const d = db([baseRow({ author_box_image: 'upload', author_box_photo_path: OLD_PATH })])
    const s = fakeStorage(); s.objects.set(OLD_PATH, { bucket: 'author-photos', bytes: png })
    const up = await photo.uploadAuthorPhoto(photoDeps(d, s), PROJECT, fileOf(webp))
    check('D3: a replaced photo\'s object is removed; the new one is kept', up.ok && !s.objects.has(OLD_PATH) && s.objects.has(`${PROJECT}/${UUID1}.webp`) && styleRow(d).author_box_photo_path === `${PROJECT}/${UUID1}.webp`)
    const keepOld = await mutant<typeof PhotoMod>('lib/content/author-box/photo.ts', (x) => x.replace('if (current.path && current.path !== path && !(await removeAuthorPhotoObject(storage, o.projectId, current.path))) {', 'if (false) {'))
    const d2 = db([baseRow({ author_box_image: 'upload', author_box_photo_path: OLD_PATH })])
    const s2 = fakeStorage(); s2.objects.set(OLD_PATH, { bucket: 'author-photos', bytes: png })
    await keepOld.uploadAuthorPhoto(photoDeps(d2, s2), PROJECT, fileOf(webp))
    check('MUTATION CONTROL: a replacement that keeps the old object fails D3', s2.objects.has(OLD_PATH))
  }
  {
    const d = db([baseRow()], { failUpsert: true })
    const s = fakeStorage()
    const up = await photo.uploadAuthorPhoto(photoDeps(d, s), PROJECT, fileOf(png))
    check('D4: an upload whose pointer cannot be written removes its own object (no orphan), and says only a code', !up.ok && s.objects.size === 0 && s.calls.some((c) => c.op === 'remove') && !JSON.stringify(up).includes('raw provider'))
  }
  for (const next of ['none', 'site_icon'] as const) {
    const path = `${PROJECT}/${UUID1}.jpg`
    const d = db([baseRow({ author_box_image: 'upload', author_box_photo_path: path, author_box_photo_media: { site: 'https://shop.example.co.il', path, media_id: 5, url: `https://${DOMAIN}/wp-content/uploads/a.jpg` } })])
    const s = fakeStorage(); s.objects.set(path, { bucket: 'author-photos', bytes: png })
    const saved = await saveWritingGuidance(guidanceDeps(d, s), PROJECT, { instructions: '', exclusions: [], rules: [], authorBoxImage: next })
    check(`D5 (${next}): saving the image back to ${next} removes the object and clears the pointer and the site copy`,
      saved.ok && !s.objects.has(path) && s.calls.some((c) => c.op === 'remove') && styleRow(d).author_box_photo_path === null && styleRow(d).author_box_photo_media === null && styleRow(d).author_box_image === next && saved.data.authorBoxPhoto === false)
  }
  {
    const path = `${PROJECT}/${UUID1}.jpg`
    const noRemoval = await mutant<typeof DataMod>('lib/content/writing-guidance/data.ts', (x) => x.replace('if (!(await removeAuthorPhotoObject(deps.storage(), o.projectId, boxView.photoPath))) return { ok: false, code: \'save_failed\' }', ''))
    const d = db([baseRow({ author_box_image: 'upload', author_box_photo_path: path })])
    const s = fakeStorage(); s.objects.set(path, { bucket: 'author-photos', bytes: png })
    await noRemoval.saveWritingGuidance(guidanceDeps(d, s), PROJECT, { instructions: '', exclusions: [], rules: [], authorBoxImage: 'none' })
    check('MUTATION CONTROL: a save that only drops the pointer leaves the object, so D5 would fail', s.objects.has(path))
    const failing = fakeStorage({ failRemove: true }); failing.objects.set(path, { bucket: 'author-photos', bytes: png })
    const d2 = db([baseRow({ author_box_image: 'upload', author_box_photo_path: path })])
    const r = await saveWritingGuidance(guidanceDeps(d2, failing), PROJECT, { instructions: 'x', exclusions: [], rules: [], authorBoxImage: 'none' })
    const noStorage = await saveWritingGuidance(guidanceDeps(d2), PROJECT, { instructions: 'x', exclusions: [], rules: [], authorBoxImage: 'none' })
    check('D6: when the object cannot be removed (or no storage is wired) the save is refused and nothing changes',
      !r.ok && !noStorage.ok && styleRow(d2).author_box_photo_path === path && styleRow(d2).author_box_image === 'upload')
    const keep = await saveWritingGuidance(guidanceDeps(d2, fakeStorage()), PROJECT, { instructions: 'x', exclusions: [], rules: [], authorBoxImage: 'upload' })
    check('D7: saving with upload kept leaves the photo alone', keep.ok && styleRow(d2).author_box_photo_path === path)
    const d3 = db([baseRow()])
    const noPhoto = await saveWritingGuidance(guidanceDeps(d3, fakeStorage()), PROJECT, { instructions: '', exclusions: [], rules: [], authorBoxImage: 'upload' })
    check('D8: upload cannot be saved without a stored photo', !noPhoto.ok && noPhoto.code === 'invalid_request' && styleRow(d3).author_box_image === 'none')
  }

  // ── O) only the owner ───────────────────────────────────────────────────
  console.log('\nO) only the owner, the dashboard\'s own owner check')
  {
    const d = db([baseRow(), { ...baseRow({ project_id: OTHER_PROJECT, user_id: OTHER, author_box_photo_path: `${OTHER_PROJECT}/${UUID1}.jpg`, author_box_image: 'upload' }) }])
    const s = fakeStorage()
    const up = await photo.uploadAuthorPhoto(photoDeps(d, s), OTHER_PROJECT, fileOf(png))
    const del = await photo.deleteAuthorPhoto(photoDeps(d, s), OTHER_PROJECT)
    const anon = await photo.uploadAuthorPhoto({ ...photoDeps(d, s), session: async () => ({ userId: null, db: d as never }) }, PROJECT, fileOf(png))
    const bad = await photo.uploadAuthorPhoto(photoDeps(d, s), 'not-a-uuid', fileOf(png))
    check('O1: someone else\'s project, no session, or a bad id: refused before any storage call',
      !up.ok && up.code === 'not_found' && !del.ok && del.code === 'not_found' && !anon.ok && anon.code === 'unauthorized' && !bad.ok && s.calls.length === 0
      && styleRow(d, OTHER, OTHER_PROJECT).author_box_photo_path === `${OTHER_PROJECT}/${UUID1}.jpg`)
    const src = strip(read('lib/content/author-box/photo.ts'))
    const ownerFirst = (x: string) => ['uploadAuthorPhoto', 'deleteAuthorPhoto'].every((fn) => {
      const body = x.slice(x.indexOf(`export async function ${fn}`))
      return /^[^{]*\{\s*const o = await owner\(deps, projectId\)\s*if \(!o\.ok\) return o/.test(body)
    }) && /import \{ owner, type GuidanceSession \} from '@\/lib\/content\/writing-guidance\/data'/.test(x) && !/requireAdminApi/.test(x)
    check('O2: both start with the settings actions\' owner check (writing-guidance/data owner), not requireAdminApi', ownerFirst(src))
    check('MUTATION CONTROL: an upload without the owner check fails O2', !ownerFirst(src.replace('const o = await owner(deps, projectId)\n  if (!o.ok) return o\n  if (!isFileLike', 'const o = { ok: true } as never as Extract<Awaited<ReturnType<typeof owner>>, { ok: true }>\n  if (!isFileLike')))
    const filtered = (x: string) => (x.match(/\.from\(ARTICLE_STYLE_TABLE\)/g) ?? []).length === (x.match(/\.from\(ARTICLE_STYLE_TABLE\)[\s\S]{0,400}?\.eq\('project_id', [\s\S]{0,40}?\)\s*\.eq\('user_id'|\.from\(ARTICLE_STYLE_TABLE\)\s*\.upsert\(\{\s*project_id: o\.projectId,\s*user_id: o\.userId/g) ?? []).length
    check('O3: every read and write of the settings row names the project AND the owner (photo.ts, photo-copy.ts)', filtered(src) && filtered(strip(read('lib/content/author-box/photo-copy.ts'))))
    check('MUTATION CONTROL: a delete that forgets the owner filter fails O3', !filtered(src.replace(".eq('project_id', o.projectId)\n    .eq('user_id', o.userId)\n  if (error) return { ok: false, code: 'save_failed' }", ".eq('project_id', o.projectId)\n  if (error) return { ok: false, code: 'save_failed' }")))
  }

  // ── A) no AI ────────────────────────────────────────────────────────────
  console.log('\nA) the photo never reaches an AI or model call')
  {
    const AI_IMPORT = /from ['"](?:@google\/genai|@google\/generative-ai|openai|@anthropic-ai\/[^'"]*|@ai-sdk\/[^'"]*|ai)['"]|require\(['"](?:@google\/genai|@google\/generative-ai|openai)['"]\)/
    const AI_CALL = /generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|process\.env\.GEMINI_API_KEY/
    const isAi = (src: string) => AI_IMPORT.test(src) || AI_CALL.test(strip(src))
    const files: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        if (f === 'node_modules' || f.startsWith('.') || f === '__qa__' || f === '__tests__') continue
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(f) && !/\.(qa|test)\.ts$|\.mut-/.test(f)) files.push(relative(ROOT, p))
      }
    }
    for (const d of ['lib', 'app', 'components']) walk(join(ROOT, d))
    const resolve = (from: string, spec: string): string | null => {
      const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? join(ROOT, dirname(from), spec) : null
      if (!base) return null
      for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (existsSync(c) && statSync(c).isFile()) return relative(ROOT, c)
      return null
    }
    const importsOf = (file: string, src = read(file)) => [...strip(src).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => resolve(file, m[1]!)).filter((x): x is string => !!x)
    const closure = (start: string, override?: Record<string, string>) => {
      const seen = new Set<string>([start]); const q = [start]
      while (q.length) { const f = q.pop()!; for (const n of importsOf(f, override?.[f])) if (!seen.has(n)) { seen.add(n); q.push(n) } }
      return seen
    }
    const PHOTO = ['lib/content/author-box/photo.ts', 'lib/content/author-box/photo-file.ts', 'lib/content/author-box/photo-copy.ts']
    const importers = files.filter((f) => !PHOTO.includes(f) && importsOf(f).some((i) => PHOTO.includes(i)))
    const aiIn = (set: Set<string>, override?: Record<string, string>) => [...set].filter((f) => isAi(override?.[f] ?? read(f)))
    const reach = PHOTO.flatMap((f) => aiIn(closure(f)))
    check('A1: nothing the photo modules import (transitively) is a model client', reach.length === 0, reach.join(', '))
    const direct = importers.filter((f) => isAi(read(f)) || importsOf(f).some((i) => isAi(read(i))))
    check(`A2: no module importing them (${importers.length}: ${importers.join(', ')}) imports a model client`, importers.length >= 5 && direct.length === 0, direct.join(', '))
    // The publishers' own import graphs DO reach model modules (unrelated steps: the article generator's
    // image helper, the free check), so the photo's bytes are followed instead: in the copy step they go
    // only to the sniffer and to the WordPress media upload.
    const flow = (x: string) => {
      const uses = [...x.matchAll(/\bbytes\b/g)].length
      return /const bytes = Buffer\.from\(await dl\.data\.arrayBuffer\(\)\)/.test(x) && /sniffAuthorPhoto\(bytes\)/.test(x) && /\{ data: bytes, filename: name/.test(x) && uses === 3
    }
    const copySrc = strip(read('lib/content/author-box/photo-copy.ts'))
    check('A3: in the copy step the downloaded bytes go only to the sniffer and the WordPress media upload', flow(copySrc))
    check('MUTATION CONTROL: bytes handed to anything else (a describe step) fail A3', !flow(copySrc.replace('const kind = sniffAuthorPhoto(bytes)', 'const kind = sniffAuthorPhoto(bytes)\n    await describe(bytes)')))
    // Mutation controls: a photo module (and an importer) that pulls in a model client.
    const poisoned = { 'lib/content/author-box/photo-copy.ts': `${read('lib/content/author-box/photo-copy.ts')}\nimport { GoogleGenAI } from '@google/genai'\n` }
    check('MUTATION CONTROL: photo-copy.ts importing @google/genai fails A1', aiIn(closure('lib/content/author-box/photo-copy.ts', poisoned), poisoned).length > 0)
    const viaImport = { 'lib/content/author-box/photo.ts': `${read('lib/content/author-box/photo.ts')}\nimport { generateArticle } from '@/lib/content/gemini-article'\n` }
    check('MUTATION CONTROL: photo.ts importing the article generator fails A1', aiIn(closure('lib/content/author-box/photo.ts', viaImport), viaImport).length > 0)
    const importer = { 'lib/content/author-box/preview.ts': `${read('lib/content/author-box/preview.ts')}\nimport { GoogleGenerativeAI } from '@google/generative-ai'\n` }
    check('MUTATION CONTROL: an importer (preview.ts) importing a model client fails A2', isAi(importer['lib/content/author-box/preview.ts']))
    check('A4: the legal guard\'s words are absent from the photo module (gemini, generateContent, openai)', !/gemini|generateContent|openai/i.test(read('lib/content/author-box/photo.ts')))
  }

  // ── B) the private bucket ───────────────────────────────────────────────
  console.log('\nB) the private bucket: signed URLs and service-role reads only; our copy never in an article')
  {
    const all = ['lib/content/author-box/photo.ts', 'lib/content/author-box/photo-copy.ts', 'lib/content/author-box/preview.ts', 'lib/content/writing-guidance/data.ts', 'app/(dashboard)/settings/writing-guidance-actions.ts', 'lib/content/wordpress-publish.ts', 'lib/content/wordpress-plugin-publish.ts']
    const privateUse = (srcs: string[]) => srcs.every((x) => !/AUTHOR_PHOTO_BUCKET\)\.getPublicUrl|author-photos['"]\)\.getPublicUrl/.test(x))
      && /storage\.from\(AUTHOR_PHOTO_BUCKET\)\.createSignedUrl\(path, AUTHOR_PHOTO_PREVIEW_SECONDS\)/.test(srcs[0]!) && /AUTHOR_PHOTO_PREVIEW_SECONDS = 300\b/.test(srcs[0]!)
    const srcs = all.map((f) => strip(read(f)))
    check('B1: no public URL of the bucket anywhere; the preview uses a 5-minute signed URL', privateUse(srcs))
    check('MUTATION CONTROL: a preview that asks for a public URL fails B1', !privateUse([srcs[0]!.replace('.createSignedUrl(path, AUTHOR_PHOTO_PREVIEW_SECONDS)', '.getPublicUrl(path)'), ...srcs.slice(1)]))
    const ops = [...strip(read('lib/content/author-box/photo.ts') + read('lib/content/author-box/photo-copy.ts')).matchAll(/from\(AUTHOR_PHOTO_BUCKET\)\.(\w+)/g)].map((m) => m[1])
    check('B2: the bucket is only uploaded to, removed from, downloaded (the copy step) and signed (the preview)', ops.length >= 4 && ops.every((o) => ['upload', 'remove', 'download', 'createSignedUrl'].includes(o!)), ops.join(','))
    const box = (m: typeof import('@/lib/content/author-box/box')) => {
      const ours = m.authorBoxContent({ language: 'en', businessName: 'Levi Bakery', domain: DOMAIN, imageChoice: 'upload', photoUrl: SIGNED })
      const publicOurs = m.authorBoxContent({ language: 'en', businessName: 'Levi Bakery', domain: DOMAIN, imageChoice: 'upload', photoUrl: 'https://pmzicbtulloeynsosseh.supabase.co/storage/v1/object/public/author-photos/a.jpg' })
      const site = m.authorBoxContent({ language: 'en', businessName: 'Levi Bakery', domain: DOMAIN, imageChoice: 'upload', photoUrl: `https://${DOMAIN}/wp-content/uploads/author-photo-abc.jpg` })
      return !ours?.image && !publicOurs?.image && site?.image?.url === `https://${DOMAIN}/wp-content/uploads/author-photo-abc.jpg` && !/supabase/.test(m.authorBoxStructure(ours!))
    }
    check('B3: the box draws only the copy on the customer\'s site; our storage (signed or public) is never linked', box(await import('@/lib/content/author-box/box')))
    const anyHost = await mutant<typeof import('@/lib/content/author-box/box')>('lib/content/author-box/box.ts', (x) => x.replace('if (h !== site && !WP_CDN.test(h)) return null', ''))
    check('MUTATION CONTROL: an image check without the host rule would link our storage (B3 fails)', !box(anyHost))
    const storeSrc = strip(read('lib/content/author-box/store.ts'))
    check('B4: the publish reader asks for the site copy only when publishing (never in the preview)', /const wantPhoto = req\.platform === 'wordpress' && !req\.preview && overrides\.image === 'upload' && !!req\.authorPhoto/.test(storeSrc))
  }

  // ── C) the copy ─────────────────────────────────────────────────────────
  console.log('\nC) the copy into the WordPress media library, once per project and site')
  {
    const path = `${PROJECT}/${UUID1}.jpg`
    const prepared = await photo.prepareAuthorPhoto(jpegWithExif)
    const d = db([baseRow({ author_box_image: 'upload', author_box_photo_path: path }), decoyRow()])
    const s = fakeStorage(); s.objects.set(path, { bucket: 'author-photos', bytes: prepared.ok ? prepared.bytes : new Uint8Array() })
    ;(d as unknown as { storage: unknown }).storage = s.storage
    const uploads: { filename: string; mimeType: string; size: number }[] = []
    const upload = (async (_c: unknown, f: { filename: string; mimeType: string; data: Buffer }) => { uploads.push({ filename: f.filename, mimeType: f.mimeType, size: f.data.byteLength }); return { id: 77, sourceUrl: `https://${DOMAIN}/wp-content/uploads/2026/10/${f.filename}` } }) as never
    const creds = { siteUrl: `https://${DOMAIN}`, username: 'u', applicationPassword: 'p' }
    const first = await copyAuthorPhotoToWordPress(d as never, creds, PROJECT, OWNER, { upload })
    const second = await copyAuthorPhotoToWordPress(d as never, creds, PROJECT, OWNER, { upload })
    check('C1: the first article uploads the photo once, with a file name that has no person in it; the next reuses the copy',
      uploads.length === 1 && /^author-photo-[0-9a-f]{12}\.jpg$/.test(uploads[0]!.filename) && uploads[0]!.mimeType === 'image/jpeg'
      && first === second && first === `https://${DOMAIN}/wp-content/uploads/2026/10/${uploads[0]!.filename}`
      && (styleRow(d).author_box_photo_media as Row).media_id === 77 && styleRow(d, OTHER).author_box_photo_media === null)
    await copyAuthorPhotoToWordPress(d as never, { ...creds, siteUrl: 'https://other-site.example' }, PROJECT, OWNER, { upload })
    check('C2: another site gets its own upload', uploads.length === 2)
    const noCache = await mutant<typeof import('@/lib/content/author-box/photo-copy')>('lib/content/author-box/photo-copy.ts', (x) => x.replace('if (photo.media && photo.media.site === site && photo.media.path === photo.path) return photo.media.url', ''))
    const before = uploads.length
    await noCache.copyAuthorPhotoToWordPress(d as never, { ...creds, siteUrl: 'https://other-site.example' }, PROJECT, OWNER, { upload })
    check('MUTATION CONTROL: a copy step without the reuse uploads again for every article (C1/C2 would fail)', uploads.length === before + 1)

    // The publish: the box draws the copy's address.
    const d2 = db([baseRow({ author_box_image: 'upload', author_box_photo_path: path })])
    let asked = 0
    const out = await applyArticleDesign(d2 as never, ART, '<p>Body.</p>', 'wordpress', {
      authorPhoto: async (p, o) => { asked++; return p === PROJECT && o === OWNER ? `https://${DOMAIN}/wp-content/uploads/author-photo-abc.jpg` : null },
      themeDeps: { now: () => NOW, fetchText: (async () => ({ ok: false, reason: 'network' })) as never },
    })
    check('C3: publishing to WordPress draws the box\'s img from the media-library copy', asked === 1 && out.includes(`src="https://${DOMAIN}/wp-content/uploads/author-photo-abc.jpg"`) && !/supabase/.test(out))
    const appSrc = strip(read('lib/content/wordpress-publish.ts'))
    const plugSrc = strip(read('lib/content/wordpress-plugin-publish.ts'))
    const wired = (a: string, p: string) => /authorPhoto: \(projectId, ownerId\) => copyAuthorPhotoToWordPress\(admin, creds, projectId, ownerId\)/.test(a)
      && /opts\.photoCreds \? \{ authorPhoto: [^}]*copyAuthorPhotoToWordPress\(admin, opts\.photoCreds!, projectId, ownerId\)/.test(p) && /photoCreds: publisher\.creds/.test(p)
    check('C4: both WordPress publishers copy through the application password (the existing media upload)', wired(appSrc, plugSrc))
    check('MUTATION CONTROL: a publisher that drops the photo fails C4', !wired(appSrc.replace('authorPhoto: (projectId, ownerId) => copyAuthorPhotoToWordPress(admin, creds, projectId, ownerId)', ''), plugSrc))
    const copySrc = strip(read('lib/content/author-box/photo-copy.ts'))
    check('C5: the copy uses lib/wordpress/client uploadMedia, never the plugin\'s public-storage /media', /import \{ uploadMedia \} from '@\/lib\/wordpress\/client'/.test(copySrc) && !/pluginMedia|getPublicUrl/.test(copySrc))
  }

  // ── S) Shopify gating ───────────────────────────────────────────────────
  console.log('\nS) upload is offered only where a copy can be made: never on a Shopify store')
  {
    const { previewAuthorBox } = await import('@/lib/content/author-box/preview')
    const path = `${PROJECT}/${UUID1}.jpg`
    const run = async (mod: Pick<typeof PreviewMod, 'previewAuthorBox'>, platform: 'wordpress' | 'shopify' | 'wix' | 'none', canCopy: boolean) => {
      const d = db([baseRow({ author_box_image: 'upload', author_box_photo_path: path })])
      ;(d as unknown as { storage: unknown }).storage = fakeStorage().storage
      const r = await mod.previewAuthorBox({
        session: async () => ({ userId: OWNER, db: d as never }), admin: () => d as never, platform: async () => platform, siteUserName: async () => null,
        fetchText: (async () => ({ ok: false, reason: 'network' })) as never, photoCopyAvailable: async () => canCopy,
      }, PROJECT)
      return r.ok ? r.data : null
    }
    const wp = await run({ previewAuthorBox }, 'wordpress', true)
    const shop = await run({ previewAuthorBox }, 'shopify', true)
    const pluginOnly = await run({ previewAuthorBox }, 'wordpress', false)
    const custom = await run({ previewAuthorBox }, 'none', true)
    check('S1: WordPress with an application password offers upload and previews our photo signed', wp?.photoUploadAvailable === true && wp.photoPreviewUrl === SIGNED)
    check('S2: a Shopify store never offers it (Files needs a scope the app does not hold), nor does a plugin-only or custom site',
      shop?.photoUploadAvailable === false && pluginOnly?.photoUploadAvailable === false && custom?.photoUploadAvailable === false)
    const leaky = await mutant<typeof PreviewMod>('lib/content/author-box/preview.ts', (x) => x.replace("const photoUploadAvailable = boxPlatform === 'wordpress' && !!deps.photoCopyAvailable", 'const photoUploadAvailable = !!deps.photoCopyAvailable'))
    check('MUTATION CONTROL: a preview without the WordPress rule offers upload on Shopify (S2 fails)', (await run(leaky, 'shopify', true))?.photoUploadAvailable === true)
    const d = db([baseRow({ author_box_image: 'upload', author_box_photo_path: path })])
    let asked = 0
    const out = await applyArticleDesign(d as never, ART, '<p>Body.</p>', 'shopify', { authorPhoto: async () => { asked++; return `https://${DOMAIN}/x.jpg` }, themeDeps: { now: () => NOW } })
    check('S3: publishing to a store never asks for a copy and draws no image', asked === 0 && !/<img/.test(out))
    const card = strip(read('components/settings/WritingGuidanceCard.tsx'))
    const gated = (x: string) => /const photoOffered = preview\.status === 'ready' && preview\.data\.photoUploadAvailable && photo\.editable/.test(x) && /\(c === 'upload' && photoOffered\)/.test(x)
    check('S4: the card offers upload only when the preview says a copy can be made', gated(card))
    check('MUTATION CONTROL: a card that always offers upload fails S4', !gated(card.replace("(c === 'upload' && photoOffered)", "c === 'upload'")))
    check('S5: the Shopify scopes are unchanged', /scopes = "read_products,read_content,write_content"/.test(read('shopify.app.toml')))
  }

  // ── N) the name is the link ─────────────────────────────────────────────
  console.log('\nN) the name line is the link, in the published box and in the settings preview')
  {
    const c = authorBoxContent({ language: 'en', businessName: 'Levi Bakery', domain: DOMAIN })!
    const h = authorBoxStructure(c)
    check('N1: the business-name fallback appears once, as the link', (h.match(/Levi Bakery/g) ?? []).length === 1 && /<a data-as="author-link" href="https:\/\/shop\.example\.co\.il\/">Levi Bakery<\/a>/.test(h))
    const card = strip(read('components/settings/WritingGuidanceCard.tsx'))
    const previewLink = (x: string) => /content\.link \? <span className="underline" data-author-box-name-link="">\{content\.name\}<\/span> : content\.name/.test(x) && !/content\.link\.label/.test(x)
    check('N2: the settings preview draws the name as the link and no second link line', previewLink(card))
    check('MUTATION CONTROL: a preview with the old link line fails N2', !previewLink(`${card}{content.link && <p>{content.link.label}</p>}`))
  }

  // ── L) strings ──────────────────────────────────────────────────────────
  console.log('\nL) every new string in the four dashboard languages')
  {
    const KEYS = ['authorBoxImageUpload', 'authorBoxPhotoHint', 'authorBoxPhotoConsent', 'authorBoxPhotoChoose', 'authorBoxPhotoReplace', 'authorBoxPhotoDelete', 'authorBoxPhotoBusy', 'authorBoxPhotoAlt', 'authorBoxPhotoEmpty', 'authorBoxPhotoDeleteNote', 'authorBoxPhotoWillDelete', 'authorBoxPhotoPublishNote', 'authorBoxPhotoTooLarge', 'authorBoxPhotoType', 'authorBoxPhotoUnreadable', 'authorBoxPhotoFailed']
    const dict = (l: 'he' | 'en' | 'es' | 'pt-BR') => getDashboardDictionary(l).projectSettings.writingGuidance as unknown as Record<string, string | undefined>
    const allThere = (get: typeof dict) => (['he', 'en', 'es', 'pt-BR'] as const).every((l) => KEYS.every((k) => {
      const v = get(l)[k]
      return !!v?.trim() && (l === 'he' ? /[א-ת]/.test(v) : !/[א-ת]/.test(v))
    })) && new Set((['he', 'en', 'es', 'pt-BR'] as const).map((l) => get(l).authorBoxPhotoConsent)).size === 4
    check('L1: every new string in he, en, es and pt-BR (Hebrew only in Hebrew; English for Shopify merchants)', allThere(dict))
    check('MUTATION CONTROL: a language missing a string fails L1', !allThere((l) => (l === 'es' ? { ...dict(l), authorBoxPhotoConsent: '' } : dict(l))))
    const card = read('components/settings/WritingGuidanceCard.tsx')
    check('L2: the card uses every one of them', KEYS.every((k) => card.includes(`w.${k}`)), KEYS.filter((k) => !card.includes(`w.${k}`)).join(','))
    check('L3: the consent text says the person in the photo agreed, in every language', /הסכים/.test(dict('he').authorBoxPhotoConsent!) && /agreed/.test(dict('en').authorBoxPhotoConsent!) && /aceptó/.test(dict('es').authorBoxPhotoConsent!) && /concordou/.test(dict('pt-BR').authorBoxPhotoConsent!))
    const errorsOwn = /setError\(\(PHOTO_ERRORS as readonly string\[\]\)\.includes\(res\.code\) \? \(res\.code as PhotoError\) : 'failed'\)/.test(strip(card)) && !/res\.message|error\.message/.test(strip(card))
    check('L4: a failure shows one of our own sentences, never a provider\'s message', errorsOwn)
  }

  // ── M) the migration ────────────────────────────────────────────────────
  console.log('\nM) the migration')
  {
    const mig = read('supabase/migrations/20261017120000_project_author_photo.sql')
    const ok = (m: string) => /author_box_image IN \('none', 'site_icon', 'upload'\)/.test(m)
      && /split_part\(author_box_photo_path, '\/', 1\) = project_id::text/.test(m)
      && /VALUES \('author-photos', 'author-photos', false, 2097152, ARRAY\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/.test(m)
      && /ON CONFLICT \(id\) DO UPDATE SET\s+public = false/.test(m) && !/CREATE POLICY/i.test(m) && /ADD COLUMN IF NOT EXISTS author_box_photo_path text/.test(m)
    check('M1: additive: upload in the CHECK, the path tied to the row\'s project, a private 2 MB image-only bucket, no storage policy', ok(mig))
    check('MUTATION CONTROL: a public bucket fails M1', !ok(mig.replace("'author-photos', false,", "'author-photos', true,")))
    const loaded = await loadWritingGuidance(guidanceDeps(db([baseRow()])), PROJECT)
    check('M2: with the columns present the card can offer upload (photo editable)', loaded.ok && loaded.data.authorBoxPhotoEditable === true && loaded.data.authorBoxPhoto === false)
  }

  // ── P) when there is nothing to choose, the screen says why ─────────────
  // Both images live in the merchant's own site, so neither is possible before the
  // site is connected. The fieldset used to vanish with only "no image" left, and
  // the owner hunted for an upload no screen mentioned (be-cln.co.il, 26 Oct 2026).
  console.log('\nP) nothing to choose, and the reason for it')
  {
    const card = strip(read('components/settings/WritingGuidanceCard.tsx'))
    const section = (x: string) => /\{\(choices\.length > 1 \|\| imageNotes\.length > 0\) && \(/.test(x)
    check('P1: the image section is shown when there is a choice OR a reason to give', section(card))
    check('MUTATION CONTROL: the old condition, which hid the section, fails P1',
      !section(card.replace('{(choices.length > 1 || imageNotes.length > 0) && (', '{choices.length > 1 && (')))
    const note = (x: string) => /const imageNotes: string\[\] = preview\.status !== 'ready' \? \[\]/.test(x)
      && /platform === 'shopify' \? \(choices\.length > 1 \? \[\] : \[w\.authorBoxImageNotOnStore\]\)/.test(x)
      && /iconOffered \? \[\] : \[w\.authorBoxImageMissing\]/.test(x)
      && /photoOffered \? \[\] : \[w\.authorBoxImageOwnPhotoNeedsPassword\]/.test(x)
      && /\[w\.authorBoxImageNeedsSite\]/.test(x)
    check('P2: the reason names this case: a Shopify store, a WordPress site with no icon, one whose connection cannot carry a photo, or a site not connected yet', note(card))
    check('MUTATION CONTROL: telling a Shopify store to connect WordPress fails P2',
      !note(card.replace("platform === 'shopify' ? (choices.length > 1 ? [] : [w.authorBoxImageNotOnStore])", "platform === 'shopify' ? (choices.length > 1 ? [] : [w.authorBoxImageNeedsSite])")))
    // The case Oren hit on be-cln.co.il: WordPress connected through our plugin
    // alone. The icon IS offered, so the fieldset appears with two choices and the
    // owner's own photo is simply missing. The note must be given THERE too, not
    // only when a single choice is left, because the copy at publish time needs an
    // application password the plugin connection does not carry.
    check('P2b: the photo note is given even when the icon leaves a choice on screen',
      !/photoOffered \? \[\] : \[w\.authorBoxImageOwnPhotoNeedsPassword\][^]]*choices\.length > 1 \? \[\]/.test(card) &&
      /\[\.\.\.\(iconOffered \? \[\] : \[w\.authorBoxImageMissing\]\), \.\.\.\(photoOffered \? \[\] : \[w\.authorBoxImageOwnPhotoNeedsPassword\]\)\]/.test(card))
    check('MUTATION CONTROL: hiding that note behind a single choice fails P2b',
      !/\[\.\.\.\(iconOffered \? \[\] : \[w\.authorBoxImageMissing\]\), \.\.\.\(photoOffered \? \[\] : \[w\.authorBoxImageOwnPhotoNeedsPassword\]\)\]/.test(
        card.replace('[...(iconOffered ? [] : [w.authorBoxImageMissing]), ...(photoOffered ? [] : [w.authorBoxImageOwnPhotoNeedsPassword])]', '(choices.length > 1 ? [] : [w.authorBoxImageMissing])')))
    check('P3: a choice of one draws no control to choose with',
      /\{choices\.length > 1 && \(\s*<Segmented/.test(card))
    const KEYS_P = ['authorBoxImageNeedsSite', 'authorBoxImageNotOnStore', 'authorBoxImageOwnPhotoNeedsPassword']
    const dictAll = (l: 'he' | 'en' | 'es' | 'pt-BR' | 'fr' | 'it') => getDashboardDictionary(l).projectSettings.writingGuidance as unknown as Record<string, string | undefined>
    check('P4: all three sentences exist in every dashboard language',
      (['he', 'en', 'es', 'pt-BR', 'fr', 'it'] as const).every((l) => KEYS_P.every((k) => {
        const v = dictAll(l)[k]
        return typeof v === 'string' && v.trim().length > 0
      })))
    check('P5: and the Hebrew one is Hebrew', /[\u0590-\u05FF]/.test(dictAll('he').authorBoxImageNeedsSite ?? ''))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })

export {}
