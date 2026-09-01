/**
 * Minimal in-memory Supabase admin fake. Applies real eq/is/gt/in/order/limit
 * filter semantics so filtering, ordering, and error-path behavior are
 * genuinely exercised (not mocked away). Copied from lib/gsc/__qa__/_fake-admin.ts
 * (same shape needed here — entitlement/PayPal QA use the same select/update/
 * insert/maybeSingle chains).
 */
type Row = Record<string, unknown>
/** Shared counter for auto-assigned ids on plain inserts (mirrors a real
 *  Postgres `DEFAULT gen_random_uuid()` id column). */
let fakeRowIdCounter = 0
interface Filter { kind: 'eq' | 'neq' | 'is' | 'gt' | 'lt' | 'in'; col: string; val: unknown }
/** Per-op DB-error injectors, keyed by mutation kind, to exercise fail-closed handling. */
export interface ErrorHooks { insert?: () => { code: string } | null; update?: () => { code?: string; message?: string } | null; upsert?: () => { code?: string; message?: string } | null; select?: () => { code?: string; message?: string } | null; delete?: () => { code?: string; message?: string } | null }

class FakeQuery {
  private filters: Filter[] = []
  // Each .or(...) call contributes one OR-group (a set of clauses, any ONE
  // of which must match); multiple .or() calls AND their groups together —
  // matches PostgREST/Supabase .or() semantics closely enough for QA use.
  private orGroups: Filter[][] = []
  private mutation: null | { type: 'insert' | 'update' | 'delete' | 'upsert'; payload?: Row | Row[]; conflict?: string } = null
  private wantSelect = false
  private wantCount = false
  private orderSpec: { col: string; ascending: boolean }[] = []
  private limitN: number | null = null
  private rangeSpec: { from: number; to: number } | null = null
  constructor(private rows: Row[], private hooks?: ErrorHooks) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) { this.wantSelect = true; if (opts?.count) this.wantCount = true; return this }
  insert(payload: Row | Row[]) { this.mutation = { type: 'insert', payload }; return this }
  update(payload: Row) { this.mutation = { type: 'update', payload }; return this }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) { this.mutation = { type: 'upsert', payload, conflict: opts?.onConflict }; return this }
  delete() { this.mutation = { type: 'delete' }; return this }
  eq(col: string, val: unknown) { this.filters.push({ kind: 'eq', col, val }); return this }
  neq(col: string, val: unknown) { this.filters.push({ kind: 'neq', col, val }); return this }
  in(col: string, vals: unknown[]) { this.filters.push({ kind: 'in', col, val: vals }); return this }
  is(col: string, val: unknown) { this.filters.push({ kind: 'is', col, val }); return this }
  gt(col: string, val: unknown) { this.filters.push({ kind: 'gt', col, val }); return this }
  lt(col: string, val: unknown) { this.filters.push({ kind: 'lt', col, val }); return this }
  order(col: string, opts?: { ascending?: boolean }) { this.orderSpec.push({ col, ascending: opts?.ascending !== false }); return this }
  limit(n: number) { this.limitN = n; return this }
  range(from: number, to: number) { this.rangeSpec = { from, to }; return this }
  /** PostgREST-style `.or("col.is.null,col2.lt.value")` — comma-separated
   *  `col.op.value` clauses, ORed together as one group. */
  or(expr: string) {
    const clauses: Filter[] = expr.split(',').map((clause) => {
      const [col, op, ...rest] = clause.split('.')
      const rawVal = rest.join('.')
      const val = rawVal === 'null' ? null : rawVal
      const kind = (op === 'is' ? 'is' : op === 'lt' ? 'lt' : op === 'gt' ? 'gt' : op === 'neq' ? 'neq' : op === 'in' ? 'in' : 'eq') as Filter['kind']
      return { kind, col, val }
    })
    this.orGroups.push(clauses)
    return this
  }

  private matchOne(r: Row, f: Filter): boolean {
    return f.kind === 'eq' ? r[f.col] === f.val
      : f.kind === 'neq' ? r[f.col] !== f.val
        : f.kind === 'in' ? (f.val as unknown[]).includes(r[f.col])
          : f.kind === 'is' ? (f.val === null ? r[f.col] == null : r[f.col] === f.val)
            : f.kind === 'gt' ? (r[f.col] as string | number) > (f.val as string | number)
              : (r[f.col] as string | number) < (f.val as string | number)
  }

  private match(r: Row): boolean {
    return this.filters.every((f) => this.matchOne(r, f))
      && this.orGroups.every((group) => group.some((f) => this.matchOne(r, f)))
  }

  private run(): { data: Row[] | null; error: { code?: string; message?: string } | null; count?: number } {
    if (this.mutation?.type === 'insert') {
      const err = this.hooks?.insert?.() ?? null
      if (err) return { data: null, error: err }
      const rawItems = Array.isArray(this.mutation.payload) ? this.mutation.payload : [this.mutation.payload!]
      // Auto-assign `id` like a real Postgres `DEFAULT gen_random_uuid()`
      // column when the payload doesn't already provide one — a plain
      // `.insert({...}).select().single()` with no explicit id must still
      // come back with a real, usable id (tests that DO provide their own
      // id keep it: the payload's own value wins via the spread order).
      const items = rawItems.map((it) => ({ id: `fake-row-${++fakeRowIdCounter}`, ...it }))
      for (const it of items) this.rows.push({ ...it })
      return { data: this.wantSelect ? items.map((r) => ({ ...r })) : null, error: null }
    }
    if (this.mutation?.type === 'upsert') {
      const err = this.hooks?.upsert?.() ?? null
      if (err) return { data: null, error: err }
      const items = Array.isArray(this.mutation.payload) ? this.mutation.payload : [this.mutation.payload!]
      const cols = this.mutation.conflict ? this.mutation.conflict.split(',').map((c) => c.trim()) : []
      for (const it of items) {
        const existing = cols.length ? this.rows.find((r) => cols.every((c) => r[c] === it[c])) : undefined
        if (existing) Object.assign(existing, it); else this.rows.push({ ...it })
      }
      return { data: this.wantSelect ? items.map((r) => ({ ...r })) : null, error: null }
    }
    const matched = this.rows.filter((r) => this.match(r))
    if (this.mutation?.type === 'update') {
      const err = this.hooks?.update?.() ?? null
      if (err) return { data: null, error: err }
      for (const r of matched) Object.assign(r, this.mutation.payload)
      return { data: this.wantSelect ? matched.map((r) => ({ ...r })) : null, error: null }
    }
    if (this.mutation?.type === 'delete') {
      const err = this.hooks?.delete?.() ?? null
      if (err) return { data: null, error: err }
      const deleted = matched.map((r) => ({ ...r }))
      for (const r of matched) this.rows.splice(this.rows.indexOf(r), 1)
      return { data: this.wantSelect ? deleted : null, error: null }
    }
    const selErr = this.hooks?.select?.() ?? null
    if (selErr) return { data: null, error: selErr }
    let out = matched.map((r) => ({ ...r }))
    // Apply ordering (stable, multi-key), then range, then limit — mirroring PostgREST.
    for (const spec of this.orderSpec.slice().reverse()) {
      out = out.slice().sort((a, b) => {
        const av = a[spec.col] as string | number, bv = b[spec.col] as string | number
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return spec.ascending ? cmp : -cmp
      })
    }
    const count = this.wantCount ? out.length : undefined
    if (this.rangeSpec) out = out.slice(this.rangeSpec.from, this.rangeSpec.to + 1)
    if (this.limitN != null) out = out.slice(0, this.limitN)
    return { data: out, error: null, count }
  }

  async maybeSingle() { const { data, error } = this.run(); return { data: (data && data[0]) ?? null, error } }
  async single() { const { data, error } = this.run(); const d = data && data[0]; return { data: d ?? null, error: d ? error : (error ?? { message: 'no rows' }) } }
  // Thenable so `await query...select()` resolves to {data,error,count}.
  then<T>(resolve: (v: { data: Row[] | null; error: unknown; count?: number }) => T) { return Promise.resolve(this.run()).then(resolve) }
}

let fakeRpcIdCounter = 0

export class FakeAdmin {
  constructor(
    public tables: Record<string, Row[]> = {},
    private hooks: Record<string, ErrorHooks> = {},
    /** Injectable clock — same convention as lib/subscription.ts's nowFn — so
     *  reservation-expiry (30-minute TTL) tests are deterministic. */
    private now: () => number = () => Date.now(),
  ) {}
  from(name: string) { this.tables[name] ??= []; return new FakeQuery(this.tables[name], this.hooks[name]) }

  /**
   * Faithful JS simulation of the 4 usage_reservations RPCs
   * (supabase/migrations/20260829000000_add_usage_reservations_and_billing_periods.sql),
   * mirroring the SQL branch-for-branch. This proves the CONTRACT (outcomes,
   * idempotency-key reuse, expiry, capacity math) and every call site's
   * handling of each outcome — it does NOT prove true concurrent-transaction
   * safety under real parallel Postgres connections (that guarantee comes
   * from pg_advisory_xact_lock + the single-statement count+write in the
   * real SQL, which requires a live database to verify and is out of reach
   * in this environment). JS is single-threaded, so this mock is trivially
   * "atomic" by construction — that does not by itself validate the SQL.
   *
   * 3rd review correction — the reservation-instance identity guard is now
   * an EXPLICIT `reservation_token` (a fresh, opaque id generated on every
   * grant/reuse), never a timestamp. `reserve_usage` returns it;
   * `finalize_usage_reservation` / `finalize_article_generation` /
   * `release_usage_reservation` all require `p_reservation_token` to still
   * match the row's CURRENT token (in addition to status='reserved') before
   * acting. `created_at` is set ONCE at row creation and never touched again
   * (a pure audit timestamp); `reserved_at` is the SEPARATE, TTL-relevant
   * timestamp updated on every grant/reuse — the 30-minute abandoned-
   * reservation window is computed against reserved_at, never created_at.
   * This mirrors the real RPCs' fix for a genuine gap: reserve_usage REUSES
   * the same row (UPDATE, not INSERT) when an idempotency key's prior
   * 'reserved' row has expired — without an explicit token, a caller holding
   * a stale reservationId from BEFORE that reuse could finalize/release
   * against what is now a different logical reservation. See
   * lib/scan-scheduler/__qa__/process-scheduled-scan.qa.ts scenario 9b for
   * the exact race this closes.
   *
   * Corrective migration
   * (20260829010000_fix_reserve_usage_ambiguous_column_and_idempotency_lock.sql)
   * fixed two bugs in the REAL SQL that this JS mock was never capable of
   * exercising in the first place, and this mock is DELIBERATELY NOT changed
   * for either of them:
   *   (a) an unqualified `reservation_token` column reference in
   *       reserve_usage's idempotency-lookup SELECT was ambiguous against the
   *       RETURNS TABLE OUT variable of the same name — a pure PL/pgSQL
   *       variable-scoping rule with no JS equivalent; every column
   *       reference in all four real RPCs is now qualified with a `ur` table
   *       alias.
   *   (b) the idempotency-key lookup SELECT ran with NO lock held, before
   *       even the pre-existing per-(user,usage_type,period) capacity
   *       advisory lock — two genuinely concurrent Postgres connections
   *       calling reserve_usage for the SAME idempotency key could both
   *       observe no row and both attempt an INSERT, the loser raising a raw
   *       unique_violation instead of a clean already_reserved outcome. A
   *       NEW idempotency-scoped pg_advisory_xact_lock is now acquired FIRST
   *       in the real SQL. This mock's rpc() method runs its ENTIRE
   *       reserve_usage branch synchronously (no `await` inside it), so two
   *       calls issued via Promise.all() here already can never interleave —
   *       proving this specific fix requires either a live Postgres
   *       connection (out of reach in this environment) or static analysis
   *       of the migration SQL text itself. See
   *       supabase/migrations/__qa__/phase3-reserve-usage-ambiguity-fix.qa.ts
   *       for that source-contract proof — do not treat any FakeAdmin-based
   *       "concurrent same-key" test as proof this class of bug is fixed.
   *
   * Corrective migration (20260829020000_fix_finalize_lost_update_race.sql)
   * fixed a SECOND, DIFFERENT real-Postgres bug this mock is likewise
   * incapable of reproducing OR disproving: finalize_article_generation's
   * (and finalize_usage_reservation's) guard was a plain unlocked SELECT
   * followed by an UPDATE guarded only by `id` — two concurrent real
   * transactions holding the SAME valid token could both pass the check and
   * both successfully write, the second silently clobbering the first
   * (lost update). The fix is `SELECT ... FOR UPDATE` before the guard,
   * re-validated against the WHERE clause after any blocking wait, plus a
   * defense-in-depth fully-guarded final UPDATE with a ROW_COUNT check. This
   * mock's finalize_article_generation / finalize_usage_reservation
   * branches, like reserve_usage's, run entirely synchronously — two calls
   * issued via Promise.all() here can never truly interleave, so this mock
   * ALREADY cannot lose an update regardless of whether the real SQL fix
   * exists. See
   * supabase/migrations/__qa__/phase3-finalize-lost-update-fix.qa.ts for the
   * actual source-contract proof (FOR UPDATE presence, guarded final
   * UPDATE predicates, ROW_COUNT verification) — the ONE genuinely new
   * LOGICAL behavior this mock DOES faithfully model is the new
   * project-integrity guard in finalize_article_generation below (a real
   * guard, not a locking artifact — JS can and does reproduce it exactly).
   */
  /** Per-RPC error injectors, so atomic-transition failure paths are testable. */
  public rpcHooks: Record<string, () => { message: string; code?: string } | null> = {}

  async rpc(name: string, params: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
    const injected = this.rpcHooks[name]?.() ?? null
    if (injected) return { data: null, error: injected }
    const reservations = (this.tables.usage_reservations ??= [])
    const TTL_MS = 30 * 60 * 1000
    const nowIso = () => new Date(this.now()).toISOString()
    const newToken = () => `fake-token-${++fakeRpcIdCounter}`

    if (name === 'reserve_usage') {
      const userId = params.p_user_id as string
      const projectId = (params.p_project_id ?? null) as string | null
      const usageType = params.p_usage_type as string
      const amount = params.p_amount as number
      const periodStart = params.p_period_start as string
      const periodEnd = params.p_period_end as string
      const limit = params.p_limit as number
      const idemKey = params.p_idempotency_key as string

      if (projectId) {
        const projects = this.tables.projects ?? []
        const owned = projects.some((p) => p.id === projectId && p.user_id === userId)
        if (!owned) return { data: [{ outcome: 'project_not_owned', reservation_id: null, article_id: null, reservation_token: null }], error: null }
      }

      let row = reservations.find((r) => r.user_id === userId && r.idempotency_key === idemKey)
      if (row) {
        if (row.status === 'consumed' || row.status === 'partially_consumed') {
          return { data: [{ outcome: 'already_consumed', reservation_id: row.id, article_id: row.related_ref ?? null, reservation_token: null }], error: null }
        }
        if (row.status === 'reserved' && this.now() - new Date(row.reserved_at as string).getTime() < TTL_MS) {
          // Still live — the CURRENT token (not regenerated) is returned.
          return { data: [{ outcome: 'already_reserved', reservation_id: row.id, article_id: null, reservation_token: row.reservation_token }], error: null }
        }
        if (row.status === 'reserved') {
          row.status = 'released'; row.released_at = nowIso(); row.released_amount = row.reserved_amount; row.release_reason = 'expired'
        }
      }

      const used = reservations
        .filter((r) => r.user_id === userId && r.usage_type === usageType && r.period_start === periodStart && r !== row)
        .reduce((sum, r) => {
          if (r.status === 'consumed' || r.status === 'partially_consumed') return sum + (r.consumed_amount as number)
          if (r.status === 'reserved' && this.now() - new Date(r.reserved_at as string).getTime() < TTL_MS) return sum + (r.reserved_amount as number)
          return sum
        }, 0)

      if (used + amount > limit) return { data: [{ outcome: 'quota_exceeded', reservation_id: null, article_id: null, reservation_token: null }], error: null }

      const grantedAt = nowIso()
      const token = newToken()
      if (row) {
        Object.assign(row, {
          status: 'reserved', reserved_amount: amount, consumed_amount: 0, released_amount: 0,
          period_start: periodStart, period_end: periodEnd, project_id: projectId,
          dispatched_at: null, related_ref: null, release_reason: null,
          reservation_token: token, reserved_at: grantedAt, consumed_at: null, released_at: null,
          // created_at is deliberately NOT touched — stays the row's original creation time across reuse.
        })
      } else {
        row = {
          id: `fake-rpc-res-${++fakeRpcIdCounter}`, user_id: userId, project_id: projectId, usage_type: usageType,
          reserved_amount: amount, consumed_amount: 0, released_amount: 0,
          period_start: periodStart, period_end: periodEnd, idempotency_key: idemKey,
          status: 'reserved', dispatched_at: null, related_ref: null, release_reason: null,
          reservation_token: token, created_at: grantedAt, reserved_at: grantedAt, consumed_at: null, released_at: null,
        }
        reservations.push(row)
      }
      return { data: [{ outcome: 'reserved', reservation_id: row.id, article_id: null, reservation_token: token }], error: null }
    }

    if (name === 'finalize_usage_reservation') {
      const row = reservations.find((r) => r.id === params.p_reservation_id && r.user_id === params.p_user_id && r.status === 'reserved' && r.reservation_token === params.p_reservation_token)
      if (!row) return { data: [{ outcome: 'not_reserved' }], error: null }
      const consumed = params.p_consumed as number
      const reservedAmount = row.reserved_amount as number
      if (consumed <= 0) {
        Object.assign(row, { status: 'released', released_amount: reservedAmount, released_at: nowIso(), release_reason: params.p_reason ?? 'no_provider_call' })
        return { data: [{ outcome: 'released' }], error: null }
      }
      const clamped = Math.min(consumed, reservedAmount)
      Object.assign(row, {
        status: consumed >= reservedAmount ? 'consumed' : 'partially_consumed',
        consumed_amount: clamped, released_amount: Math.max(reservedAmount - consumed, 0),
        related_ref: params.p_related_ref ?? null, dispatched_at: nowIso(), consumed_at: nowIso(),
        released_at: consumed < reservedAmount ? nowIso() : null,
        release_reason: consumed < reservedAmount ? (params.p_reason ?? null) : null,
      })
      return { data: [{ outcome: 'finalized' }], error: null }
    }

    if (name === 'finalize_article_generation') {
      const row = reservations.find((r) => r.id === params.p_reservation_id && r.user_id === params.p_user_id && r.usage_type === 'article' && r.status === 'reserved' && r.reservation_token === params.p_reservation_token)
      if (!row) return { data: [{ outcome: 'not_reserved', article_id: null }], error: null }
      const article = params.p_article as Record<string, unknown>
      // Corrective migration (20260829020000_fix_finalize_lost_update_race.sql)
      // — project-integrity guard: a reservation that DOES carry a project
      // scope must never be consumed by an article for a DIFFERENT project.
      // No-op for today's real article reservations (always project_id=null
      // at the ledger level) — pure defense-in-depth, mirrored here for
      // parity with the real SQL's new guard.
      if (row.project_id != null && row.project_id !== article.project_id) {
        return { data: [{ outcome: 'not_reserved', article_id: null }], error: null }
      }
      const articles = (this.tables.generated_articles ??= [])
      const slugConflict = articles.some((a) => a.slug === article.slug)
      if (slugConflict) return { data: [{ outcome: 'slug_conflict', article_id: null }], error: null }
      const articleId = `fake-rpc-article-${++fakeRpcIdCounter}`
      articles.push({
        id: articleId, user_id: params.p_user_id, project_id: article.project_id, topic_id: article.topic_id ?? null,
        title: article.title, meta_title: article.meta_title ?? null, meta_description: article.meta_description ?? null,
        excerpt: article.excerpt ?? null, content_html: article.content_html ?? null, content_markdown: article.content_markdown ?? null,
        faq_json: article.faq_json ?? null, image_prompt: article.image_prompt ?? null, status: 'draft',
        wp_connection_id: article.wp_connection_id ?? null, slug: article.slug, updated_at: nowIso(), created_at: nowIso(),
      })
      Object.assign(row, { status: 'consumed', consumed_amount: 1, related_ref: articleId, dispatched_at: nowIso(), consumed_at: nowIso() })
      return { data: [{ outcome: 'consumed', article_id: articleId }], error: null }
    }

    if (name === 'release_usage_reservation') {
      const row = reservations.find((r) => r.id === params.p_reservation_id && r.user_id === params.p_user_id && r.status === 'reserved' && r.reservation_token === params.p_reservation_token)
      if (!row) return { data: [{ outcome: 'not_reserved' }], error: null }
      Object.assign(row, { status: 'released', released_amount: row.reserved_amount, released_at: nowIso(), release_reason: params.p_reason ?? null })
      return { data: [{ outcome: 'released' }], error: null }
    }

    if (name === 'claim_shopify_shop_ownership') {
      // Faithful model of the DECISION TABLE in
      // supabase/migrations/20260830000000_shopify_reconnect_after_uninstall.sql.
      // As with reserve_usage above, this mock CANNOT prove the advisory lock,
      // SELECT ... FOR UPDATE, or transactional rollback — every branch below
      // runs synchronously, so no two calls can interleave here regardless of
      // whether the real SQL locks. Those properties are proved by
      // source-contract assertions in
      // supabase/migrations/__qa__/phase3-shopify-reconnect-ownership.qa.ts.
      // What this DOES model exactly is the eligibility predicate, the
      // same-project vs cross-project split, and the no-carry-over policy.
      const rows = (this.tables.shopify_connections ??= [])
      const p = params as Record<string, string | string[] | null>
      const shopDomain = p.p_shop_domain as string
      const projectId = p.p_project_id as string
      const shopGid = (p.p_shop_gid as string | null) ?? null
      const now = nowIso()

      const live = rows.find((r) => r.shop_domain === shopDomain && !r.archived_at)

      const finish = (outcome: string, connectionId: string | null) =>
        ({ data: [{ outcome, connection_id: connectionId }], error: null })

      if (live) {
        if (live.project_id === projectId) {
          live.user_id = p.p_user_id
          live.shop_gid = shopGid ?? live.shop_gid
          live.storefront_domain = p.p_storefront_domain
          live.access_token_encrypted = p.p_access_token_encrypted
          live.refresh_token_encrypted = p.p_refresh_token_encrypted ?? null
          live.oauth_app_edition = p.p_oauth_app_edition ?? null
          live.access_token_expires_at = p.p_access_token_expires_at ?? null
          live.refresh_token_expires_at = p.p_refresh_token_expires_at ?? null
          live.api_version = p.p_api_version
          live.granted_scopes = p.p_granted_scopes
          live.connection_status = p.p_connection_status
          live.last_error = p.p_last_error
          live.last_tested_at = now
          live.updated_at = now
          return finish('reactivated', String(live.id))
        }
        const scopes = (live.granted_scopes ?? []) as string[]
        const eligible = live.connection_status === 'failed'
          && live.last_error === 'app_uninstalled'
          && scopes.length === 0
          && live.shopify_subscription_status !== 'active'
        if (!eligible) {
          return finish(live.connection_status === 'connected' ? 'shop_already_connected' : 'blocked_not_eligible', null)
        }
        live.archived_at = now
        live.archived_reason = 'superseded_after_uninstall'
        live.shopify_plan_handle = null
        live.shopify_subscription_status = null
        live.shopify_billing_verified_at = null
        live.shopify_current_period_end = null
        live.shopify_current_period_start = null
        live.shopify_trial_ends_at = null
        live.shopify_cancel_at_end_of_cycle = false
        live.shopify_billing_last_error = null
        live.updated_at = now
      }

      if (shopGid) {
        const gidConflict = rows.find((r) => r.shop_gid === shopGid && !r.archived_at && r.project_id !== projectId)
        if (gidConflict) {
          return finish(gidConflict.connection_status === 'connected' ? 'shop_already_connected' : 'blocked_not_eligible', null)
        }
      }

      const existingForProject = rows.find((r) => r.project_id === projectId && !r.archived_at)
      if (existingForProject) {
        Object.assign(existingForProject, {
          shop_domain: shopDomain, shop_gid: shopGid, storefront_domain: p.p_storefront_domain,
          access_token_encrypted: p.p_access_token_encrypted,
          refresh_token_encrypted: p.p_refresh_token_encrypted ?? null,
          access_token_expires_at: p.p_access_token_expires_at ?? null,
          refresh_token_expires_at: p.p_refresh_token_expires_at ?? null,
          oauth_app_edition: p.p_oauth_app_edition ?? null,
          api_version: p.p_api_version,
          granted_scopes: p.p_granted_scopes, connection_status: p.p_connection_status,
          last_error: p.p_last_error, last_tested_at: now, updated_at: now,
        })
        return finish('claimed', String(existingForProject.id))
      }

      // A CLEAN row: no billing/plan/subscription/entitlement field is copied
      // from the archived row — they simply are not set.
      const id = `fake-conn-${++fakeRpcIdCounter}`
      rows.push({
        id, user_id: p.p_user_id, project_id: projectId, shop_domain: shopDomain, shop_gid: shopGid,
        storefront_domain: p.p_storefront_domain, access_token_encrypted: p.p_access_token_encrypted,
        refresh_token_encrypted: p.p_refresh_token_encrypted ?? null,
        access_token_expires_at: p.p_access_token_expires_at ?? null,
        refresh_token_expires_at: p.p_refresh_token_expires_at ?? null,
        oauth_app_edition: p.p_oauth_app_edition ?? null,
        api_version: p.p_api_version, granted_scopes: p.p_granted_scopes,
        connection_status: p.p_connection_status, last_error: p.p_last_error,
        last_tested_at: now, created_at: now, updated_at: now, archived_at: null, archived_reason: null,
      })
      return finish('claimed', id)
    }

    // ── Refresh lease (20260901010000) ────────────────────────────────────
    // Mirrors the SQL branch for branch: serialize BEFORE the external call,
    // and let only the lease owner holding the expected ciphertext store a
    // rotated pair.
    if (name === 'begin_shopify_token_refresh') {
      const rows = (this.tables.shopify_connections ??= [])
      const p = params as Record<string, string | number>
      const row = rows.find((r) => r.id === p.p_connection_id && !r.archived_at)
      const nowMs = this.now()
      const one = (o: Record<string, unknown>) => ({ data: [o], error: null })
      const base = (r: Row) => ({
        access_token_encrypted: r.access_token_encrypted ?? null,
        oauth_app_edition: r.oauth_app_edition ?? null,
      })
      if (!row) return one({ outcome: 'not_found', lease_token: null, access_token_encrypted: null, refresh_token_encrypted: null, oauth_app_edition: null })
      if (row.last_error === 'app_uninstalled') return one({ outcome: 'uninstalled', lease_token: null, refresh_token_encrypted: null, ...base(row) })
      const minValid = Number(p.p_min_valid_seconds ?? 300)
      const exp = row.access_token_expires_at ? new Date(String(row.access_token_expires_at)).getTime() : null
      if (exp !== null && exp > nowMs + minValid * 1000) {
        return one({ outcome: 'fresh', lease_token: null, refresh_token_encrypted: null, ...base(row) })
      }
      if (!row.refresh_token_encrypted) return one({ outcome: 'no_refresh_material', lease_token: null, refresh_token_encrypted: null, ...base(row) })
      if (!row.oauth_app_edition) return one({ outcome: 'unknown_edition', lease_token: null, refresh_token_encrypted: null, access_token_encrypted: row.access_token_encrypted ?? null, oauth_app_edition: null })
      const leaseUntil = row.token_refresh_lease_until ? new Date(String(row.token_refresh_lease_until)).getTime() : null
      if (row.token_refresh_lease_token && leaseUntil !== null && leaseUntil > nowMs) {
        return one({ outcome: 'locked', lease_token: null, refresh_token_encrypted: null, ...base(row) })
      }
      const lease = `fake-lease-${++fakeRpcIdCounter}`
      row.token_refresh_lease_token = lease
      row.token_refresh_lease_until = new Date(nowMs + Number(p.p_lease_seconds ?? 60) * 1000).toISOString()
      row.updated_at = nowIso()
      return one({ outcome: 'granted', lease_token: lease, refresh_token_encrypted: row.refresh_token_encrypted, ...base(row) })
    }

    if (name === 'complete_shopify_token_refresh') {
      const rows = (this.tables.shopify_connections ??= [])
      const p = params as Record<string, string | null>
      const row = rows.find((r) => r.id === p.p_connection_id && !r.archived_at)
      const one = (outcome: string) => ({ data: [{ outcome }], error: null })
      if (!p.p_lease_token || !p.p_access_token_encrypted || !p.p_refresh_token_encrypted || !p.p_access_token_expires_at) return one('invalid_rotation')
      if (!row) return one('lease_lost')
      // THE anti-clobber rule: still the lease owner AND the credential is
      // still the one this caller was given, and never over an uninstall.
      if (row.last_error === 'app_uninstalled') return one('lease_lost')
      if (row.token_refresh_lease_token !== p.p_lease_token) return one('lease_lost')
      if (row.access_token_encrypted !== p.p_expected_access_token_encrypted) return one('lease_lost')
      row.access_token_encrypted = p.p_access_token_encrypted
      row.refresh_token_encrypted = p.p_refresh_token_encrypted
      row.access_token_expires_at = p.p_access_token_expires_at
      row.refresh_token_expires_at = p.p_refresh_token_expires_at
      row.token_refresh_lease_token = null
      row.token_refresh_lease_until = null
      row.connection_status = 'connected'
      if (row.last_error === 'invalid_token' || row.last_error === 'refresh_token_invalid') row.last_error = null
      row.updated_at = nowIso()
      return one('rotated')
    }

    if (name === 'fail_shopify_token_refresh') {
      const rows = (this.tables.shopify_connections ??= [])
      const p = params as Record<string, string | boolean | null>
      const row = rows.find((r) => r.id === p.p_connection_id && !r.archived_at)
      const one = (outcome: string) => ({ data: [{ outcome }], error: null })
      if (!row) return one('lease_lost')
      if (row.token_refresh_lease_token !== p.p_lease_token) return one('lease_lost')
      row.token_refresh_lease_token = null
      row.token_refresh_lease_until = null
      row.updated_at = nowIso()
      if (p.p_terminal !== true) return one('released')
      if (row.last_error === 'app_uninstalled' || row.access_token_encrypted !== p.p_expected_access_token_encrypted) {
        return one('stale_terminal_ignored')
      }
      row.connection_status = 'failed'
      row.last_error = (p.p_last_error as string) ?? 'refresh_token_invalid'
      return one('terminal')
    }

    // ── Atomic billing transitions (20260901020000) ───────────────────────
    if (name === 'complete_shopify_app_store_link') {
      const p = params as Record<string, string>
      const pendings = (this.tables.shopify_pending_installs ??= [])
      const now = nowIso()
      const one = (o: Record<string, unknown>) => ({ data: [o], error: null })
      const pending = pendings.find((r) => r.token === p.p_pending_token && !r.consumed_at
        && new Date(String(r.expires_at)).getTime() > this.now())
      if (!pending) return one({ outcome: 'pending_invalid', connection_id: null, billing_authority: null, migration_created: false })

      // Snapshot for rollback: everything below either all lands or none does.
      const connSnapshot = JSON.parse(JSON.stringify(this.tables.shopify_connections ?? []))
      const govSnapshot = JSON.parse(JSON.stringify(this.tables.billing_governance ?? []))
      const migSnapshot = JSON.parse(JSON.stringify(this.tables.shopify_billing_migrations ?? []))
      pending.consumed_at = now

      const claim = await this.rpc('claim_shopify_shop_ownership', {
        p_user_id: p.p_user_id, p_project_id: p.p_project_id,
        p_shop_domain: pending.shop_domain, p_shop_gid: pending.shop_gid,
        p_access_token_encrypted: pending.access_token_encrypted, p_api_version: pending.api_version,
        p_granted_scopes: pending.granted_scopes, p_storefront_domain: pending.storefront_domain,
        p_connection_status: p.p_connection_status, p_last_error: p.p_last_error,
        p_refresh_token_encrypted: pending.refresh_token_encrypted,
        p_access_token_expires_at: pending.access_token_expires_at,
        p_refresh_token_expires_at: pending.refresh_token_expires_at,
        p_oauth_app_edition: pending.oauth_app_edition,
      })
      const claimRow = (claim.data as { outcome?: string; connection_id?: string }[] | null)?.[0]
      const rollback = () => {
        pending.consumed_at = null
        this.tables.shopify_connections = connSnapshot
        this.tables.billing_governance = govSnapshot
        this.tables.shopify_billing_migrations = migSnapshot
      }
      if (!claimRow || (claimRow.outcome !== 'claimed' && claimRow.outcome !== 'reactivated') || !claimRow.connection_id) {
        rollback()
        return { data: null, error: { message: `shopify_link_blocked:${claimRow?.outcome ?? 'save_failed'}` } }
      }

      // Billing moves ONLY for verified App Store provenance.
      if (pending.install_origin !== 'shopify_app_store') {
        return one({ outcome: 'linked', connection_id: claimRow.connection_id, billing_authority: null, migration_created: false })
      }

      const subs = (this.tables.subscriptions ??= [])
      const paypal = subs.find((r) => r.user_id === p.p_user_id && r.status === 'active' && r.paypal_subscription_id)
      const gov = (this.tables.billing_governance ??= [])
      const existing = gov.find((r) => r.user_id === p.p_user_id)
      // PROVENANCE IS NEVER REWRITTEN.
      const origin = (existing?.signup_origin as string | undefined) ?? 'unknown'
      let authority: string
      let reason: string
      let migrationCreated = false
      if (paypal) {
        authority = (existing?.billing_authority as string | undefined) ?? 'website'
        reason = 'shopify_app_store_install_deferred_paypal_migration'
        const migs = (this.tables.shopify_billing_migrations ??= [])
        const active = migs.find((m) => m.user_id === p.p_user_id
          && ['pending', 'shopify_confirmed', 'paypal_cancel_failed'].includes(String(m.status)))
        if (!active) {
          migs.push({ id: `fake-mig-${++fakeRpcIdCounter}`, user_id: p.p_user_id, project_id: p.p_project_id,
            shopify_connection_id: claimRow.connection_id, paypal_subscription_id: paypal.paypal_subscription_id,
            status: 'pending', created_at: now, updated_at: now })
          migrationCreated = true
        } else {
          active.project_id = p.p_project_id
          active.shopify_connection_id = claimRow.connection_id
          active.updated_at = now
        }
      } else {
        authority = 'shopify'
        reason = 'shopify_app_store_install'
      }
      if (existing) {
        existing.billing_authority = authority
        existing.authority_reason = reason
        existing.updated_at = now
      } else {
        gov.push({ user_id: p.p_user_id, signup_origin: origin, billing_authority: authority,
          authority_reason: reason, authority_changed_at: now, created_at: now, updated_at: now })
      }
      return one({ outcome: 'linked', connection_id: claimRow.connection_id, billing_authority: authority, migration_created: migrationCreated })
    }

    if (name === 'complete_shopify_paypal_migration') {
      const p = params as Record<string, string>
      const migs = (this.tables.shopify_billing_migrations ??= [])
      const now = nowIso()
      const one = (outcome: string) => ({ data: [{ outcome }], error: null })
      // The (migration, user) pair must match, and the subscription id comes
      // from the locked row — never from a parameter.
      const mig = migs.find((m) => m.id === p.p_migration_id && m.user_id === p.p_user_id
        && ['pending', 'shopify_confirmed', 'paypal_cancel_failed'].includes(String(m.status)))
      if (!mig) return one('unexpected_status')
      const boundSubscriptionId = mig.paypal_subscription_id as string | null
      mig.status = 'completed'
      mig.last_error = null
      mig.updated_at = now
      const gov = (this.tables.billing_governance ??= [])
      const existing = gov.find((r) => r.user_id === p.p_user_id)
      if (existing) {
        existing.billing_authority = 'shopify'
        existing.authority_reason = 'paypal_migration_completed'
        existing.authority_changed_at = now
        existing.updated_at = now
      } else {
        gov.push({ user_id: p.p_user_id, signup_origin: 'unknown', billing_authority: 'shopify',
          authority_reason: 'paypal_migration_completed', authority_changed_at: now, created_at: now, updated_at: now })
      }
      if (boundSubscriptionId) {
        for (const sub of (this.tables.subscriptions ??= [])) {
          // Double-scoped: the bound id AND the same user.
          if (sub.paypal_subscription_id === boundSubscriptionId && sub.user_id === p.p_user_id && sub.status !== 'cancelled') {
            sub.status = 'cancelled'; sub.updated_at = now
          }
        }
      }
      return one('completed')
    }

    return { data: null, error: { message: `unknown rpc: ${name}` } }
  }
}
