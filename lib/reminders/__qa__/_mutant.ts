/**
 * Mutation-control helper for the reminder guards: write a MUTATED copy of a source file next
 * to the original (so its relative imports still resolve), load it, and always delete it.
 * A guard that cannot fail tests nothing: each guard runs against the real module and must
 * pass, then against a deliberately broken one and must fail.
 */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
/** A fresh file name per mutant: the module cache would otherwise hand back an earlier one. */
let counter = 0

export async function withMutant<T, R>(rel: string, edits: Array<[string | RegExp, string]>, run: (mod: T) => Promise<R> | R): Promise<R> {
  const from = join(ROOT, rel)
  let src = readFileSync(from, 'utf8')
  for (const [needle, repl] of edits) {
    const next = src.replace(needle, repl)
    if (next === src) throw new Error(`mutation did not apply: ${String(needle)}`)
    src = next
  }
  const to = from.replace(/\.(tsx?)$/, `.mut${++counter}.$1`)
  writeFileSync(to, src)
  try {
    return await run((await import(to)) as T)
  } finally {
    unlinkSync(to)
  }
}
