/**
 * Minimal in-memory Supabase admin fake for GSC QA. Applies real eq/is/gt filter
 * semantics so single-use / expiry / user-mismatch / ownership are genuinely exercised
 * (not mocked away). Supports the exact chains the GSC service + state-store use.
 */
type Row = Record<string, unknown>
interface Filter { kind: 'eq' | 'is' | 'gt' | 'lt' | 'in'; col: string; val: unknown }
/** Per-op DB-error injectors, keyed by mutation kind, to exercise fail-closed handling. */
export interface ErrorHooks { insert?: () => { code: string } | null; update?: () => { code?: string; message?: string } | null; upsert?: () => { code?: string; message?: string } | null; select?: () => { code?: string; message?: string } | null; delete?: () => { code?: string; message?: string } | null }

class FakeQuery {
  private filters: Filter[] = []
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
  in(col: string, vals: unknown[]) { this.filters.push({ kind: 'in', col, val: vals }); return this }
  is(col: string, val: unknown) { this.filters.push({ kind: 'is', col, val }); return this }
  gt(col: string, val: unknown) { this.filters.push({ kind: 'gt', col, val }); return this }
  lt(col: string, val: unknown) { this.filters.push({ kind: 'lt', col, val }); return this }
  order(col: string, opts?: { ascending?: boolean }) { this.orderSpec.push({ col, ascending: opts?.ascending !== false }); return this }
  limit(n: number) { this.limitN = n; return this }
  range(from: number, to: number) { this.rangeSpec = { from, to }; return this }

  private match(r: Row): boolean {
    return this.filters.every((f) =>
      f.kind === 'eq' ? r[f.col] === f.val
        : f.kind === 'in' ? (f.val as unknown[]).includes(r[f.col])
          : f.kind === 'is' ? (f.val === null ? r[f.col] == null : r[f.col] === f.val)
            : f.kind === 'gt' ? (r[f.col] as string | number) > (f.val as string | number)
              : (r[f.col] as string | number) < (f.val as string | number))
  }

  private run(): { data: Row[] | null; error: { code?: string; message?: string } | null; count?: number } {
    if (this.mutation?.type === 'insert') {
      const err = this.hooks?.insert?.() ?? null
      if (err) return { data: null, error: err }
      const items = Array.isArray(this.mutation.payload) ? this.mutation.payload : [this.mutation.payload!]
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

export class FakeAdmin {
  constructor(public tables: Record<string, Row[]> = {}, private hooks: Record<string, ErrorHooks> = {}) {}
  from(name: string) { this.tables[name] ??= []; return new FakeQuery(this.tables[name], this.hooks[name]) }
}
