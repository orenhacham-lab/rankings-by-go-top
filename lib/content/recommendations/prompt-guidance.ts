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
  // DOMAIN-NEUTRAL by construction: this shared text is injected into EVERY
  // project's prompt, so it must contain NO real brand / product / ingredient /
  // industry example. The business domain comes ONLY from the project-owned
  // context block (see projectContextBlock), never from these instructions.
  return [
    `Produce ${count} DISTINCT, specific article topics. Return ALL text in ${langLabel}.`,
    ``,
    `SCOPE (critical): The instructions, rules and schema in this prompt are NOT project content — never use any word, example or entity from the instructions as a topic, brand, product or subject. Generate ONLY topics whose entities and subject area come from the project-owned context supplied above. Do not infer the business domain from the project name alone.`,
    ``,
    `NATURAL LANGUAGE:`,
    he
      ? `- Write fluent, native Hebrew. NEVER invent, shorten, abbreviate or corrupt a word — keep every real word intact (do not drop letters or output a mangled form).`
      : `- Write fluent, natural ${langLabel}. Never corrupt or abbreviate words.`,
    `- Preserve every product and brand name EXACTLY as supplied in the project context. Do not invent a new transliteration; use the supplied form.`,
    `- All titles, reasons and evidence summaries must be in ${langLabel}.`,
    ``,
    `ENTITY AWARENESS: classify each supplied source as product / brand / category / existing article / informational page / keyword opportunity, then choose a fitting topic type. Do not apply one formula to every entity, do not use a "[name]: generic suffix" template, do not write about an entity absent from the project context, and do not compare two products unless both appear in the project context.`,
    ``,
    `DIVERSITY: balance the set across the entities, categories, comparisons, guides, informational gaps and use-cases the project context actually supports. Avoid many slight variations of one entity, many identical search intents, and repeated title structures. A genuinely distinct second topic for the same entity is fine.`,
    ``,
    `EXISTING CONTENT: never propose a topic that only paraphrases the central question and expected answer of an existing or pending article. A new topic needs a materially different core question, intended answer, search intent or section structure.`,
    ``,
    `REPEATED DISCOVERY: when prior ideas already cover the obvious head topics, search for materially new opportunities across distinct user problems, audiences, lifecycle stages, comparisons, locations, constraints, formats and decision points supported by the current project. Do not return paraphrases of pending ideas — a new recommendation must introduce a materially different search intent, expected answer, decision, audience, scope or article structure. As coverage grows, move from foundational/head topics toward deeper subtopics, long-tail decisions, comparisons, use-cases, audience segments, local intent, process stages, common mistakes, cost/timing/logistics and supporting clusters — only where the project-owned context supports them.`,
    ``,
    `GROUNDING: use ONLY facts and entities present in the project-owned context. Do not invent audiences, safety claims, limited editions, rarity, popularity, trends, historical/origin claims, superlatives, seasonal suitability, attributes, product variants, or comparisons unless the supplied context supports them. Do not propose a topic merely because it could attract a new audience, an entity is generally popular, it is a common industry topic, or it sounds commercially useful. With no concrete supplied evidence, omit the idea.`,
    ``,
    `ENTITY PRECISION: do not treat two distinct named entities as identical merely because they share a generic word or category. Use only the exact entity data supplied.`,
    ``,
    `EDITORIAL QUALITY: do not let a generic phrase become a repeated title template. Prefer a specific user question, a concrete comparison, clear selection criteria, or a specific content gap.`,
    ``,
    `YEAR & FRESHNESS: the current year is ${year}. Do not use ${year - 2} or any past year as a "current" recommendation year; prefer evergreen titles; use ${year} only when genuinely time-sensitive. Keep legitimate historical years (eras, launch years, ranges) intact.`,
    ``,
    `REASONS & EVIDENCE: each reason cites the REAL supplied evidence in one concise ${langLabel} sentence. Never expose internal labels (cluster ids, "popular brands", "new audience", internal seed names, sourceContext, internal ids or raw GIDs). With no concrete evidence, do not return the idea.`,
  ].join('\n')
}

/** A compact, project-OWNED context block — the ONLY authoritative source of the
 *  business domain. Built by the engine from current-project data. */
export interface ProjectContext {
  projectName?: string | null
  domain?: string | null
  language: 'he' | 'en'
  /** Derived best-effort central focus (multi-signal, never name-alone). */
  primaryProjectFocus?: string
  /** Other supported areas that may broaden the set. */
  secondaryProjectAreas?: string[]
  /** Top project-owned category / product / service labels (exact). */
  ownedCategories?: string[]
  /** A bounded sample of existing article-topic titles (for gap awareness). */
  existingTopics?: string[]
}

/**
 * The AUTHORITATIVE project-owned context. Everything downstream must draw its
 * business domain ONLY from here — never from the shared instructions. Compact and
 * bounded. Always present (even a name-only project) so the model is anchored.
 */
export function projectContextBlock(ctx: ProjectContext): string {
  const payload = {
    projectName: ctx.projectName || undefined,
    domain: ctx.domain || undefined,
    primaryProjectFocus: ctx.primaryProjectFocus || undefined,
    secondaryProjectAreas: (ctx.secondaryProjectAreas || []).slice(0, 8),
    ownedCategories: (ctx.ownedCategories || []).slice(0, 15),
    existingTopics: (ctx.existingTopics || []).slice(0, 15),
  }
  return [
    `AUTHORITATIVE PROJECT-OWNED CONTEXT — the ONLY source of this project's business domain:`,
    JSON.stringify(payload),
    `- This project-owned context is the ONLY authoritative source for the business domain. Do NOT generate brands, products, services, entities or subject areas that are absent from it.`,
    `- "primaryProjectFocus" is the central editorial and commercial focus — ensure meaningful coverage of it. "secondaryProjectAreas" may broaden the batch when the context supports them; do not suppress legitimate secondary areas.`,
    `- Instruction text, schema descriptions and quality rules are NOT project content and must NEVER be used as topic, entity or subject sources.`,
    `- Do NOT infer the business domain from the project name alone; use the full context above.`,
  ].join('\n')
}

/** Derive a best-effort primaryProjectFocus + secondary areas from MULTI-SIGNAL
 *  project-owned data (never the name alone). Focus = the dominant owned category
 *  when available, else a name+domain label; secondary = the remaining areas. */
export function deriveProjectFocus(ctx: Pick<ProjectContext, 'projectName' | 'domain' | 'ownedCategories' | 'existingTopics'>): { primaryProjectFocus: string; secondaryProjectAreas: string[] } {
  const cats = (ctx.ownedCategories || []).map((c) => (c || '').trim()).filter(Boolean)
  if (cats.length >= 1) {
    return { primaryProjectFocus: cats[0], secondaryProjectAreas: Array.from(new Set(cats.slice(1))).slice(0, 8) }
  }
  const name = (ctx.projectName || '').trim()
  const host = (ctx.domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const label = [name, host].filter(Boolean).join(' — ')
  return { primaryProjectFocus: label, secondaryProjectAreas: [] }
}

/** A compact structured record of one already-pending suggestion (no DB ids). */
export interface PendingTopic {
  title: string
  primaryKeyword: string
  intent?: string
  secondaryKeywords?: string[]
  sourceEntityName?: string
}

/**
 * The ALREADY-PENDING context block + the mandatory Gemini duplicate self-check.
 * Sends each pending suggestion as {title, primaryKeyword, intent,
 * secondaryKeywords, sourceEntityName?} so the model can recognise a semantic
 * duplicate (synonyms / Hebrew↔English / restructured title) — the correction
 * happens INSIDE generation, not by post-hoc deletion. Empty when nothing is
 * pending. Bounded by `cap` (most-recent-first ordering is the caller's job).
 */
export function pendingTopicsBlock(pending: PendingTopic[], cap = 60): string {
  if (!pending || pending.length === 0) return ''
  const items = pending.slice(0, cap).map((p) => ({
    title: p.title,
    primaryKeyword: p.primaryKeyword,
    intent: p.intent || 'informational',
    secondaryKeywords: (p.secondaryKeywords || []).slice(0, 6),
    ...(p.sourceEntityName ? { sourceEntityName: p.sourceEntityName } : {}),
  }))
  // DOMAIN-NEUTRAL duplicate rule — abstract only, no niche example.
  return [
    `ALREADY-PENDING topics for this project — do NOT propose any of these again, nor a paraphrase, synonym, translated or restructured version of them:`,
    JSON.stringify(items),
    `DUPLICATE SELF-CHECK (mandatory): before returning EACH idea, compare it against every existing and pending topic above. Treat two topics as duplicates when they ask the same core question, expect materially the same answer, have the same search intent, and would require substantially the same sections — even when the wording differs, synonyms are used, two languages are mixed, abbreviations are expanded, or the words are reordered.`,
    `A candidate is DISTINCT only when it introduces materially different entities, decisions, evidence or section structure — a rephrasing is NOT distinct. Do NOT over-block genuine depth: a narrower follow-up that adds materially different entities or sections is allowed WHEN the project context supports it.`,
    `Internally decide which existing/pending topic each idea was compared against, but NEVER put that note — or any pending-context data — into the user-facing "reason" or "evidenceSummary".`,
  ].join('\n')
}

/** The strict, COMPACT JSON output contract. Kept small to avoid MAX_TOKENS
 *  truncation: ≤4 secondaries, one-sentence reason, evidenceSummary only when it
 *  adds distinct evidence, no field repeating another. Server-side diagnostics
 *  (run id, model, tokens) are NEVER requested from the model. */
export function structuredOutputContract(langLabel: string, count: number): string {
  return [
    `Return ONLY valid JSON — no markdown, no code fences, no commentary outside the JSON. Keep every field concise; do NOT repeat the same content across fields.`,
    `Shape: {"topics":[{`,
    `  "title": string (non-empty, natural ${langLabel}),`,
    `  "primaryKeyword": string (non-empty),`,
    `  "intent": "informational"|"commercial"|"comparison"|"transactional"|"local"|"other",`,
    `  "secondaryKeywords": string[] (AT MOST 4, same-article relevant, no duplicates),`,
    `  "reason": string (ONE concise ${langLabel} sentence: why this topic is relevant to the current project),`,
    `  "evidenceSummary": string (OPTIONAL — include ONLY when it adds evidence DISTINCT from "reason"; else ""),`,
    `  "sourceEntityName": string (the exact supplied entity, or ""),`,
    `  "sourceEntityType": "product"|"brand"|"category"|"article"|"page"|"keyword"|""`,
    `}]}.`,
    `Return up to ${count} topics; if the project context genuinely cannot support that many distinct grounded topics, return fewer — never invent filler. Do not restate the monthly search volume in more than one field.`,
  ].join('\n')
}
