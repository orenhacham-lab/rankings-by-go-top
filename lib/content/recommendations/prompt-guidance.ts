/**
 * Shared recommendation PROMPT guidance + structured-output contract.
 *
 * Prompt-only quality lever: every route injects the same instruction block so a
 * strong Gemini model produces natural Hebrew, grounded, diverse topic ideas — and
 * returns them in one strict JSON schema. NOTHING here rewrites or post-processes
 * the model output; it only shapes the request. Concise on purpose so the rules
 * stay salient.
 */

/** The reasoning + quality instructions shared by all recommendation prompts. */
export function recommendationGuidance(langLabel: string, year: number, count: number): string {
  const he = /hebrew/i.test(langLabel)
  return [
    `Produce ${count} DISTINCT, specific article topics. Return ALL text in ${langLabel}.`,
    ``,
    `NATURAL LANGUAGE (critical):`,
    he
      ? `- Write fluent, native Hebrew. NEVER invent, shorten, abbreviate or corrupt a Hebrew word. Keep real words intact, e.g. דוגמיות (samples), רכישה (purchase), מאמר (article), בשמים (perfumes), קנייה, מבצע. Never output a corrupted form such as "דגים" for "דוגמיות", "שוקינג" for "רכישה/קנייה", or "ממואיר" for "מאמר".`
      : `- Write fluent, natural ${langLabel}. Never corrupt or abbreviate words.`,
    `- Preserve every product and brand name EXACTLY as supplied in the input. Do not invent a new transliteration; use the supplied Hebrew form when given, and the English form only where the name naturally requires it.`,
    `- All reasons and evidence summaries must be in ${langLabel}.`,
    ``,
    `ENTITY AWARENESS: classify each source as product | brand | collection/category | existing article | informational page | keyword opportunity, then choose a fitting topic type. Do NOT apply the same formula to every entity. Do NOT output "[brand]: generic title", "[brand] — טעויות נפוצות וטיפים", a broad brand article for a brand NOT present in the supplied corpus, or a product comparison unless BOTH products appear in the input.`,
    ``,
    `DIVERSITY: balance the set across brands, products, categories, comparisons, commercial guides, informational gaps, use-cases and audiences that the corpus actually supports. Avoid many slight variations of one brand, many identical search intents, and repeated title structures (especially "brand + colon"). A genuinely distinct second topic for the same brand is fine.`,
    ``,
    `EXISTING CONTENT: never propose a paraphrase of an existing article. Compare core question, intended answer, entity, search intent, audience and structure — a new topic needs a clearly different angle. E.g. given existing "המסע של וניל ממדגסקר לבקבוק הבושם שלך", "המסע של ניחוחות וניל והשפעתם על עולם הבישום" is NOT distinct, but "השוואה בין סוגי וניל בבישום" or "כיצד מפיקים תמצית וניל לבשמים" can be, when supported.`,
    ``,
    `GROUNDING: use ONLY facts and entities supplied in the input. Do NOT invent products for children, safety, limited editions, rarity, popularity, trends, historical impact, iconic status, seasonal suitability, longevity, ingredients, EDP/EDT variants, gender positioning, or comparisons unless the supplied corpus/keyword data supports them. Do NOT propose a topic merely because it could attract a new audience, the brand is generally popular, it is a common industry topic, or it sounds commercially useful. If there is no concrete supplied evidence, omit the idea.`,
    ``,
    `BRAND PRECISION: never match brands by one shared generic word (e.g. "Acqua di Parma" is NOT "Profumum Roma" just because a product contains "Acqua"). Keep "Tom Ford"/"טום פורד", "Borouj", "Ex Nihilo" exactly as supplied. Use only the exact entity data in the prompt.`,
    ``,
    `EDITORIAL QUALITY: do not let clichés become repeated templates — "המדריך המלא", "כל מה שצריך לדעת", "גלו את הסודות", "המסע אל", "הטרנד החם ביותר", "הטובים ביותר", "הבחירה המושלמת". Prefer a specific user question, a concrete comparison, clear selection criteria, or a specific content gap.`,
    ``,
    `YEAR & FRESHNESS: the current year is ${year}. Do NOT use ${year - 2} or any past year as a "current" recommendation year; prefer evergreen titles; use ${year} only when genuinely time-sensitive. Keep legitimate historical years intact (e.g. שנות ה-90, בין 2000 ל-2010, הושק בשנת 1985).`,
    ``,
    `REASONS & EVIDENCE: each reason must cite the REAL supplied evidence, in ${langLabel}. Good: "באתר קיימת קטגוריית טום פורד ומספר מוצרים של המותג, אך אין מאמר השוואתי ייעודי." NEVER expose internal labels: no "cluster 8", "popular brands", "multiple brands", "new audience", internal seed names, sourceContext, internal IDs or raw GIDs. If no concrete evidence exists, do not return the idea.`,
  ].join('\n')
}

/** The strict JSON output contract appended to every recommendation prompt. */
export function structuredOutputContract(langLabel: string, count: number): string {
  return [
    `Return ONLY valid JSON — no markdown, no code fences, no commentary outside the JSON.`,
    `Shape: {"topics":[{`,
    `  "title": string (non-empty, natural ${langLabel}),`,
    `  "primaryKeyword": string (non-empty),`,
    `  "intent": "informational"|"commercial"|"comparison"|"transactional"|"local"|"other",`,
    `  "secondaryKeywords": string[],`,
    `  "reason": string (non-empty, ${langLabel}, cites supplied evidence),`,
    `  "sourceEntityName": string (the exact supplied entity this topic is about, or ""),`,
    `  "sourceEntityType": "product"|"brand"|"category"|"article"|"page"|"keyword"|"",`,
    `  "evidenceSummary": string (${langLabel}, one sentence referencing the supplied input)`,
    `}]}.`,
    `Return ${count} topics when the supplied corpus supports it; if it genuinely cannot support that many distinct grounded topics, return fewer — never invent filler.`,
  ].join('\n')
}
