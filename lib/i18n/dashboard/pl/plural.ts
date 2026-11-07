/**
 * Polish plural agreement, for the dictionary parts beside this file.
 *
 * Every other locale in this tree gets away with a two-way ternary, because
 * one/many is the whole of their plural system. Polish has THREE agreement
 * classes and they are not a matter of style:
 *
 *   1            → nominative singular      "1 artykuł"
 *   2-4          → nominative plural        "2 artykuły"
 *   0, 5-21, …   → genitive plural          "5 artykułów", "0 artykułów"
 *
 * and the teens are the trap: 12, 13 and 14 take the GENITIVE plural
 * ("12 artykułów") even though 2, 3 and 4 take the nominative, so a rule
 * written on the last digit alone is wrong for exactly those three numbers in
 * every hundred. 112 is wrong the same way. A two-way ternary copied from the
 * Dutch file would print "12 artykuły", which reads to a Polish user the way
 * "12 article" reads to an English one.
 *
 * `plForm` returns the index of the form to use, and `plPick` is the shorthand
 * the parts actually call. Both are pure and allocation-free, so they are safe
 * to call inside a render.
 */

/** 0 for the singular, 1 for the 2-4 plural, 2 for the genitive plural. */
export function plForm(n: number): 0 | 1 | 2 {
  const abs = Math.abs(Math.trunc(n))
  const last = abs % 10
  const lastTwo = abs % 100
  if (abs === 1) return 0
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 1
  return 2
}

/** `plPick(n, 'artykuł', 'artykuły', 'artykułów')` → the form that agrees with n. */
export function plPick(n: number, one: string, few: string, many: string): string {
  const f = plForm(n)
  return f === 0 ? one : f === 1 ? few : many
}

export {}
