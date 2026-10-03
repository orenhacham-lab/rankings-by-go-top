/**
 * The Spanish dashboard dictionary is PARTIAL on purpose, and this is what makes
 * that safe.
 *
 * The Hebrew and English dictionaries are ~6,200 lines each. Translating them in
 * one commit would mean one unreviewable diff and one screen-by-screen check at
 * the very end; translating them section by section means every commit is
 * reviewable and every screen is verified the day it is written. So `es.ts` is a
 * DeepPartial and anything it has not translated yet falls back to ENGLISH, not
 * to Hebrew: an untranslated Spanish screen shows English words in a
 * left-to-right layout, which a Spanish reader can use, instead of Hebrew words
 * in a right-to-left one, which they cannot.
 *
 * The merge is structural and runs ONCE at module load, so no screen pays for it
 * per render. It only walks plain objects: a function (a dictionary entry that
 * takes a plan code or a count) and an array are values, replaced whole, because
 * merging either one key-by-key would produce something that is neither.
 */

/**
 * Partial all the way down, stopping at functions and arrays, which are values.
 *
 * It also WIDENS the leaves. `DashboardDictionary` is `typeof dashboardHe` on an
 * `as const` object, so every one of its strings is the literal Hebrew text:
 * without widening, `logoAlt: 'Logotipo de Go Top SEO'` is an error saying it is
 * not assignable to `'הלוגו של Go Top SEO'`, which is every translated string in
 * the file. English escapes this with a blanket `as unknown as` cast, which
 * checks nothing at all; widening the leaves keeps the real check — the shape,
 * the key names, and whether an entry is a string or a function of a count — and
 * gives up only the one thing that cannot hold for a translation.
 */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T extends string
        ? string
        : T extends number
          ? number
          : T extends boolean
            ? boolean
            : T

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * `overlay` over `base`, recursively. `base` is never mutated — the English
 * dictionary is a live object every English screen reads, so writing into it
 * while building the Spanish one would translate English too.
 */
export function deepMergeDictionary<T>(base: T, overlay: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(overlay)) return (overlay === undefined ? base : overlay) as T
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(overlay)) {
    const next = overlay[key]
    if (next === undefined) continue
    out[key] = isPlainObject(out[key]) && isPlainObject(next) ? deepMergeDictionary(out[key], next) : next
  }
  return out as T
}
