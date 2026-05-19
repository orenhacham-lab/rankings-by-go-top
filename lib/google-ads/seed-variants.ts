// Builds a small set of seed keyword variants to broaden Google Ads results.
// The goal is to give Google more anchors so it returns more diverse keyword ideas.

// Hebrew final-letter form mapping (sofit ↔ regular).
const FINAL_TO_REGULAR: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }
const REGULAR_TO_FINAL: Record<string, string> = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' }

function toRegularLastLetter(s: string): string {
  if (!s) return s
  const last = s[s.length - 1]
  const reg = FINAL_TO_REGULAR[last]
  return reg ? s.slice(0, -1) + reg : s
}

function toFinalLastLetter(s: string): string {
  if (!s) return s
  const last = s[s.length - 1]
  const fin = REGULAR_TO_FINAL[last]
  return fin ? s.slice(0, -1) + fin : s
}

export function buildKeywordSeedVariants(keyword: string, language: string): string[] {
  const seed = keyword.trim()
  if (!seed) return []

  const variants: string[] = [seed]

  // Progressive truncation by words (right-to-left).
  const words = seed.split(/\s+/).filter(Boolean)
  for (let i = words.length - 1; i >= 1; i--) {
    variants.push(words.slice(0, i).join(' '))
  }

  // Hebrew plural/singular toggle on the root (shortest 1-word seed).
  if (language === 'he' && words.length > 0) {
    const root = words[0]
    if (root.endsWith('ים') && root.length > 3) {
      // Plural → singular: drop "ים" then convert last letter to final form.
      variants.push(toFinalLastLetter(root.slice(0, -2)))
    } else if (root.endsWith('ות') && root.length > 3) {
      variants.push(toFinalLastLetter(root.slice(0, -2)))
    } else if (root.length >= 3) {
      // Singular → plural: convert final letter to regular, then add "ים".
      variants.push(`${toRegularLastLetter(root)}ים`)
    }
  }

  // Deduplicate while preserving order, cap to 5.
  const seen = new Set<string>()
  const unique: string[] = []
  for (const v of variants) {
    const t = v.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    unique.push(t)
    if (unique.length >= 5) break
  }

  return unique
}
