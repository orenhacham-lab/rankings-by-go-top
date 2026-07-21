/**
 * Minimal in-memory Supabase admin fake for GSC QA. Applies real eq/is/gt filter
 * semantics so single-use / expiry / user-mismatch / ownership are genuinely exercised
 * (not mocked away). Supports the exact chains the GSC service + state-store use.
 */
type Row = Record<string, unknown>
interface Filter { kind: 'eq' | 'is' | 'gt'; col: string; val: unknown }

class FakeQuery {
  private filters: Filter[] = []
  private mutation: null | { type: 'insert' | 'update' | 'delete'; payload?: Row | Row[] } = null
  private wantSelect = false
  private wantCount = false
  constructor(private rows: Row[], private onInsert?: (items: Row[]) => { code: string } | null) {}

  select(_cols?: string, opts?: { count?: string }) { this.wantSelect = true; if (opts?.count) this.wantCount = true; return this }
  insert(payload: Row | Row[]) { this.mutation = { type: 'insert', payload }; return this }
  update(payload: Row) { this.mutation = { type: 'update', payload }; return this }
  delete() { this.mutation = { type: 'delete' }; return this }
  eq(col: string, val: unknown) { this.filters.push({ kind: 'eq', col, val }); return this }
  is(col: string, val: unknown) { this.filters.push({ kind: 'is', col, val }); return this }
  gt(col: string, val: unknown) { this.filters.push({ kind: 'gt', col, val }); return this }
  order() { return this }
  limit() { return this }

  private match(r: Row): boolean {
    return this.filters.every((f) =>
      f.kind === 'eq' ? r[f.col] === f.val
        : f.kind === 'is' ? (f.val === null ? r[f.col] == null : r[f.col] === f.val)
          : (r[f.col] as string | number) > (f.val as string | number))
  }

  private run(): { data: Row[] | null; error: { code?: string; message?: string } | null; count?: number } {
    if (this.mutation?.type === 'insert') {
      const items = Array.isArray(this.mutation.payload) ? this.mutation.payload : [this.mutation.payload!]
      const err = this.onInsert?.(items) ?? null
      if (err) return { data: null, error: err }
      for (const it of items) this.rows.push({ ...it })
      return { data: this.wantSelect ? items.map((r) => ({ ...r })) : null, error: null }
    }
    const matched = this.rows.filter((r) => this.match(r))
    if (this.mutation?.type === 'update') {
      for (const r of matched) Object.assign(r, this.mutation.payload)
      return { data: this.wantSelect ? matched.map((r) => ({ ...r })) : null, error: null }
    }
    if (this.mutation?.type === 'delete') {
      for (const r of matched) this.rows.splice(this.rows.indexOf(r), 1)
      return { data: null, error: null }
    }
    return { data: matched.map((r) => ({ ...r })), error: null, count: this.wantCount ? matched.length : undefined }
  }

  async maybeSingle() { const { data, error } = this.run(); return { data: (data && data[0]) ?? null, error } }
  async single() { const { data, error } = this.run(); const d = data && data[0]; return { data: d ?? null, error: d ? error : (error ?? { message: 'no rows' }) } }
  // Thenable so `await query...select()` resolves to {data,error,count}.
  then<T>(resolve: (v: { data: Row[] | null; error: unknown; count?: number }) => T) { return Promise.resolve(this.run()).then(resolve) }
}

export class FakeAdmin {
  constructor(public tables: Record<string, Row[]> = {}, private inserters: Record<string, (items: Row[]) => { code: string } | null> = {}) {}
  from(name: string) { this.tables[name] ??= []; return new FakeQuery(this.tables[name], this.inserters[name]) }
}
