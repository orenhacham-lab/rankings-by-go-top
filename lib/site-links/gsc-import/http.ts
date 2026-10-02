/**
 * /api/projects/[id]/site-links/gsc-import — the Search Console Links file the
 * owner imported for one project.
 *
 *   GET   → { ok, available, snapshot | null }   what was imported last
 *   POST  → multipart "file" (zip / csv / xlsx)  parse, replace the snapshot
 *
 * proxy.ts does not cover /api/*, so each method authenticates the caller and
 * proves ownership itself. The table is read and written with the service role,
 * which bypasses RLS, so the project is read with `.eq('user_id', <the session's
 * user>)` first (anyone else's project is a 404, the same as none) and every
 * later query on the table is filtered by that project AND that owner. The user
 * id written is the project row's owner, never anything from the request.
 *
 * The upload is capped (MAX_UPLOAD_BYTES) before and after it is read, parsed
 * strictly (parse.ts) and stored as capped lists. A re-import REPLACES the
 * project's snapshot (one row per project). Answers carry stable codes only,
 * never a parser's or a database's text. A database without the table yet (an
 * older migration state) answers `available: false` on GET and `unavailable` on
 * POST, not an error, so the screen keeps working before the migration is applied.
 *
 * Guarded (with mutation controls) by lib/site-links/gsc-import/__qa__/gsc-import.qa.ts.
 */
import { parseLinksExport } from './parse'
import { MAX_UPLOAD_BYTES, cleanCell, readSnapshot, type GscImportSnapshot, type ImportErrorCode } from './snapshot'

/* eslint-disable @typescript-eslint/no-explicit-any -- the handler takes the service-role client or the QA fake */
export type GscImportDb = { from: (table: string) => any }

export interface GscImportDeps {
  session: () => Promise<{ userId: string | null }>
  admin: () => GscImportDb
  now?: () => Date
}

export type GscImportAnswer =
  | { ok: true; available: boolean; snapshot: GscImportSnapshot | null }
  | { ok: false; code: ImportErrorCode }

export const GSC_IMPORT_TABLE = 'site_links_gsc_imports'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'cache-control': 'no-store' }
const refuse = (status: number, code: ImportErrorCode) => Response.json({ ok: false, code } satisfies GscImportAnswer, { status, headers: NO_STORE })

function missingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}

/** Session + project ownership. Returns the owner's id, or the response to send. */
async function owner(projectId: string, deps: GscImportDeps): Promise<{ userId: string } | { response: Response }> {
  let userId: string | null
  try {
    userId = (await deps.session()).userId
  } catch {
    return { response: refuse(503, 'unavailable') }
  }
  if (!userId) return { response: refuse(401, 'unauthorized') }
  if (!UUID.test(projectId)) return { response: refuse(404, 'not_found') }
  const { data, error } = await deps.admin().from('projects').select('id, user_id').eq('id', projectId).eq('user_id', userId).limit(1)
  if (error) return { response: refuse(500, 'internal') }
  const project = Array.isArray(data) ? data[0] : null
  // Belt and braces: the filter said so, and so must the row.
  if (!project || project.user_id !== userId) return { response: refuse(404, 'not_found') }
  return { userId }
}

export async function handleGscImportGet(projectId: string, deps: GscImportDeps): Promise<Response> {
  const who = await owner(projectId, deps)
  if ('response' in who) return who.response
  const { data, error } = await deps.admin().from(GSC_IMPORT_TABLE)
    .select('imported_at, file_name, linking_sites, target_pages, latest_links, linking_sites_total, target_pages_total, latest_links_total')
    .eq('project_id', projectId).eq('user_id', who.userId).limit(1)
  if (error) {
    if (missingTable(error)) return Response.json({ ok: true, available: false, snapshot: null } satisfies GscImportAnswer, { headers: NO_STORE })
    console.error('[gsc-import] read failed', { projectId, code: (error as { code?: string }).code ?? 'unknown' })
    return refuse(500, 'internal')
  }
  const snapshot = Array.isArray(data) && data[0] ? readSnapshot(data[0]) : null
  return Response.json({ ok: true, available: true, snapshot } satisfies GscImportAnswer, { headers: NO_STORE })
}

export async function handleGscImportPost(projectId: string, request: Request, deps: GscImportDeps): Promise<Response> {
  const who = await owner(projectId, deps)
  if ('response' in who) return who.response

  // The declared size first, so an oversize body is not read at all.
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 64 * 1024) return refuse(413, 'too_big')

  let file: unknown
  try {
    file = (await request.formData()).get('file')
  } catch {
    return refuse(400, 'no_file')
  }
  if (!file || typeof file !== 'object' || typeof (file as File).arrayBuffer !== 'function' || typeof (file as File).size !== 'number') return refuse(400, 'no_file')
  const upload = file as File
  if (upload.size === 0) return refuse(422, 'empty')
  if (upload.size > MAX_UPLOAD_BYTES) return refuse(413, 'too_big')
  const bytes = new Uint8Array(await upload.arrayBuffer())
  if (bytes.length > MAX_UPLOAD_BYTES) return refuse(413, 'too_big')

  const fileName = cleanCell(upload.name, 200)
  const parsed = await parseLinksExport(fileName, bytes)
  if (!parsed.ok) return refuse(parsed.code === 'too_big' ? 413 : 422, parsed.code)

  const importedAt = (deps.now?.() ?? new Date()).toISOString()
  const row = {
    imported_at: importedAt,
    file_name: fileName || null,
    linking_sites: parsed.data.linkingSites,
    target_pages: parsed.data.targetPages,
    latest_links: parsed.data.latestLinks,
    linking_sites_total: parsed.data.totals.linkingSites,
    target_pages_total: parsed.data.totals.targetPages,
    latest_links_total: parsed.data.totals.latestLinks,
  }
  const db = deps.admin()
  // Replace this project's snapshot: update it, or insert the first one. Every query names the project AND the owner.
  const update = () => db.from(GSC_IMPORT_TABLE).update(row).eq('project_id', projectId).eq('user_id', who.userId).select('id')
  const first = await update()
  let error: unknown = first.error
  if (!error && !(Array.isArray(first.data) && first.data.length > 0)) {
    error = (await db.from(GSC_IMPORT_TABLE).insert({ project_id: projectId, user_id: who.userId, ...row })).error
    // Two first imports at once: the other one won the insert; ours replaces it.
    if ((error as { code?: string } | null)?.code === '23505') error = (await update()).error
  }
  if (error) {
    if (missingTable(error)) return refuse(503, 'unavailable')
    console.error('[gsc-import] write failed', { projectId, code: (error as { code?: string }).code ?? 'unknown' })
    return refuse(500, 'internal')
  }
  const snapshot = readSnapshot(row)
  return Response.json({ ok: true, available: true, snapshot } satisfies GscImportAnswer, { headers: NO_STORE })
}
