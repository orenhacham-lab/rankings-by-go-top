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
   */
  async rpc(name: string, params: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
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

    return { data: null, error: { message: `unknown rpc: ${name}` } }
  }
}
