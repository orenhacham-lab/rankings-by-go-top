/**
 * ONE-ROW RECONCILIATION — mark a positively identified historical DIRECT
 * Shopify connection as permitted to hold a non-expiring credential.
 *
 * This is deliberately NOT a migration. A migration runs itself on deploy, and
 * an earlier revision of this repair carried a placeholder UUID: applied, it
 * would have marked zero rows, recorded itself as applied, and left the
 * connection blocked with no valid way to re-run. This command cannot do that —
 * it requires the exact identity on the command line and refuses to run without
 * every field.
 *
 * IT VERIFIES, THEN WRITES. All of the following must hold, on exactly ONE row:
 *   - connection id            matches --connection-id
 *   - project id               matches --project-id
 *   - shop domain              matches --shop-domain
 *   - owning user              matches --user-id
 *   - connection_status        = 'connected'
 *   - archived_at              IS NULL
 *   - access_token_encrypted   IS NOT NULL and non-empty
 *   - refresh_token_encrypted  IS NULL      (nothing to rotate with)
 *   - access_token_expires_at  IS NULL      (genuinely non-expiring)
 *   - oauth_app_edition        IS NULL      (never re-label a public-app grant)
 *   - connection_provenance    IS NULL      (not already marked)
 * Zero matches, more than one match, or any mismatch ABORTS without writing.
 *
 * It never prints, decrypts or transmits the credential — only whether one is
 * present.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Usage:
 *   npx tsx scripts/reconcile-shopify-provenance.ts \
 *     --connection-id <uuid> --project-id <uuid> \
 *     --shop-domain <shop>.myshopify.com --user-id <uuid> [--apply]
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js'

const PROVENANCE = 'direct_legacy_preapproval'

export interface ReconcileArgs {
  connectionId: string
  projectId: string
  shopDomain: string
  userId: string
  apply: boolean
}

export interface ReconcileCheck { name: string; ok: boolean; detail?: string }
export interface ReconcileResult {
  ok: boolean
  checks: ReconcileCheck[]
  matched: number
  applied: boolean
  abortReason?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000'

/** Parse and REJECT placeholders. PURE — exported for tests. */
export function parseArgs(argv: string[]): { ok: true; args: ReconcileArgs } | { ok: false; error: string } {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
  }
  const connectionId = get('--connection-id')
  const projectId = get('--project-id')
  const shopDomain = get('--shop-domain')
  const userId = get('--user-id')

  for (const [flag, v] of [['--connection-id', connectionId], ['--project-id', projectId], ['--shop-domain', shopDomain], ['--user-id', userId]] as const) {
    if (!v) return { ok: false, error: `${flag} is required` }
  }
  for (const [flag, v] of [['--connection-id', connectionId!], ['--project-id', projectId!], ['--user-id', userId!]] as const) {
    if (!UUID_RE.test(v)) return { ok: false, error: `${flag} is not a UUID` }
    // A placeholder is the exact failure mode this command exists to prevent.
    if (v === PLACEHOLDER) return { ok: false, error: `${flag} is the placeholder UUID — supply the real value` }
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shopDomain!)) {
    return { ok: false, error: '--shop-domain must be a *.myshopify.com domain' }
  }
  return { ok: true, args: { connectionId: connectionId!, projectId: projectId!, shopDomain: shopDomain!, userId: userId!, apply: argv.includes('--apply') } }
}

interface ConnectionRow {
  id: string; project_id: string; user_id: string; shop_domain: string
  connection_status: string | null; archived_at: string | null
  access_token_encrypted: string | null; refresh_token_encrypted: string | null
  access_token_expires_at: string | null; oauth_app_edition: string | null
  connection_provenance: string | null
}

/** Every condition, evaluated against the row. PURE — exported for tests. */
export function verifyRow(row: ConnectionRow | null, args: ReconcileArgs): ReconcileCheck[] {
  if (!row) return [{ name: 'row_exists', ok: false, detail: 'no connection with that id' }]
  return [
    { name: 'connection_id_matches', ok: row.id === args.connectionId },
    { name: 'project_id_matches', ok: row.project_id === args.projectId, detail: row.project_id },
    { name: 'shop_domain_matches', ok: row.shop_domain === args.shopDomain, detail: row.shop_domain },
    { name: 'owner_matches', ok: row.user_id === args.userId },
    { name: 'connection_is_connected', ok: row.connection_status === 'connected', detail: String(row.connection_status) },
    { name: 'not_archived', ok: row.archived_at === null },
    { name: 'credential_present', ok: !!row.access_token_encrypted && row.access_token_encrypted.length > 0 },
    { name: 'no_refresh_token', ok: row.refresh_token_encrypted === null },
    { name: 'no_access_token_expiry', ok: row.access_token_expires_at === null },
    { name: 'oauth_app_edition_is_null', ok: row.oauth_app_edition === null, detail: String(row.oauth_app_edition) },
    { name: 'not_already_marked', ok: row.connection_provenance === null, detail: String(row.connection_provenance) },
  ]
}

/** The reconciliation itself. `admin` is injected so this is testable. */
export async function reconcileProvenance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  args: ReconcileArgs,
): Promise<ReconcileResult> {
  const { data, error } = await admin
    .from('shopify_connections')
    .select('id, project_id, user_id, shop_domain, connection_status, archived_at, access_token_encrypted, refresh_token_encrypted, access_token_expires_at, oauth_app_edition, connection_provenance')
    .eq('id', args.connectionId)

  if (error) return { ok: false, checks: [], matched: 0, applied: false, abortReason: 'connection_query_failed' }
  const rows = (data ?? []) as ConnectionRow[]
  // EXACTLY ONE. Zero or several aborts — never "best effort".
  if (rows.length !== 1) {
    return { ok: false, checks: [], matched: rows.length, applied: false, abortReason: rows.length === 0 ? 'no_matching_connection' : 'multiple_matching_connections' }
  }

  const checks = verifyRow(rows[0], args)
  if (checks.some((c) => !c.ok)) {
    return { ok: false, checks, matched: 1, applied: false, abortReason: 'verification_failed' }
  }
  if (!args.apply) return { ok: true, checks, matched: 1, applied: false }

  // The UPDATE repeats every predicate, so a row that changed between the read
  // and the write is not marked.
  const { data: updated, error: updateError } = await admin
    .from('shopify_connections')
    .update({ connection_provenance: PROVENANCE, updated_at: new Date().toISOString() })
    .eq('id', args.connectionId)
    .eq('project_id', args.projectId)
    .eq('user_id', args.userId)
    .eq('shop_domain', args.shopDomain)
    .eq('connection_status', 'connected')
    .is('archived_at', null)
    .is('refresh_token_encrypted', null)
    .is('access_token_expires_at', null)
    .is('oauth_app_edition', null)
    .is('connection_provenance', null)
    // The credential must STILL be present at write time. Verifying it on the
    // read and omitting it here left a window in which the token could be
    // removed or emptied between the two, and the row would be marked
    // direct_legacy_preapproval anyway — permitting a credential that no longer
    // exists. Both halves are required: `neq('')` alone does not exclude NULL in
    // SQL (NULL != '' is unknown), and a NOT NULL test alone does not exclude ''.
    .not('access_token_encrypted', 'is', null)
    .neq('access_token_encrypted', '')
    .select('id')

  if (updateError) return { ok: false, checks, matched: 1, applied: false, abortReason: 'update_failed' }
  const affected = (updated ?? []).length
  if (affected !== 1) return { ok: false, checks, matched: 1, applied: false, abortReason: 'affected_rows_not_exactly_one' }
  return { ok: true, checks, matched: 1, applied: true }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed.ok) { console.error(`ABORT: ${parsed.error}`); process.exit(1) }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('ABORT: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'); process.exit(1) }

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const result = await reconcileProvenance(admin, parsed.args)
  for (const c of result.checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail && !c.ok ? ` — ${c.detail}` : ''}`)
  console.log(`matched=${result.matched} applied=${result.applied}`)
  if (!result.ok) { console.error(`ABORT: ${result.abortReason}`); process.exit(1) }
  if (!result.applied) console.log('DRY RUN — all checks passed. Re-run with --apply to write.')
  else console.log('APPLIED — connection marked direct_legacy_preapproval.')
}

if (require.main === module) void main()
