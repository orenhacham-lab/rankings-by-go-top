/**
 * Opportunity synthesis — turns RANKED evidence clusters into ContentOpportunity
 * candidates via ONE model call (cluster-first, not source-first). The prompt
 * describes the clusters (demand + entities + coverage gaps) and asks for real
 * user-need opportunities with an expected answer + format; entity names are given
 * as link targets/context, never as article keywords. Parsing is defensive.
 */

import type { EvidenceCluster } from './evidence-cluster'
import { recommendationGuidance, structuredOutputContract, type ProjectContext, projectContextBlock } from './prompt-guidance'

/** Compact, safe cluster payload for the model (no raw prompts/PII beyond names). */
function clusterPayload(clusters: EvidenceCluster[]) {
  return clusters.map((c) => ({
    id: c.cluster_id,
    theme: c.canonical_topic,
    demand_queries: c.keyword_research_queries.slice(0, 12).map((q) => ({ q: q.query, v: q.volume ?? null })),
    tracked_keywords: c.tracked_keywords.slice(0, 8),
    project_focus: c.project_focus.slice(0, 4),
    commercial_entities: c.commercial_entities.slice(0, 10).map((e) => ({ name: e.name, type: e.type ?? 'unknown' })),
    existing_coverage: c.existing_coverage.slice(0, 8).map((x) => x.title),
    missing_coverage: c.missing_coverage,
    source_composition: c.source_composition,
  }))
}

/**
 * Build the single cluster-first synthesis prompt. The model proposes up to `count`
 * DISTINCT content opportunities across the clusters — combining several entities in
 * a cluster into ONE broader guide when they share a theme, and NEVER using an
 * entity's bare name as the primaryKeyword.
 */
export function buildOpportunityPrompt(clusters: EvidenceCluster[], ctx: ProjectContext, langLabel: string, year: number, count: number): string {
  return [
    `You are an SEO content strategist. Today's year is ${year}. Return ALL text in ${langLabel}.`,
    projectContextBlock(ctx),
    ``,
    `RANKED EVIDENCE CLUSTERS (already grouped across sources — demand queries, tracked keywords, existing commercial entities, and coverage gaps):`,
    JSON.stringify(clusterPayload(clusters)),
    ``,
    `From these clusters, propose up to ${count} DISTINCT CONTENT OPPORTUNITIES. Each must be a real user need / search question / decision / problem / comparison / care or use-case need — grounded in a cluster's demand_queries or project_focus. When a cluster has several commercial_entities sharing the theme, prefer ONE broader guide that references them as targets rather than one article per entity. NEVER use a commercial entity's bare name as primaryKeyword — entity names are link targets and context only. Do not propose a topic a listed existing_coverage title already answers. Prefer clusters with missing_coverage and real demand; skip clusters with no defensible independent need.`,
    recommendationGuidance(langLabel, year, count),
    structuredOutputContract(langLabel, count),
  ].filter(Boolean).join('\n')
}

/** Compact, safe combined-evidence payload for Tier 3 controlled discovery. */
export interface DiscoveryEvidence {
  projectFocus: string[]
  trackedKeywords: string[]
  demandQueries: { q: string; v: number | null }[]
  commercialEntities: { name: string; type: string }[]
  existingCoverage: string[]
}

/**
 * Tier 3 — CONTROLLED DISCOVERY prompt. Runs only when Tiers 1–2 cannot supply
 * enough defensible opportunities. ONE synthesis step over the COMBINED project
 * evidence that identifies broad, domain-relevant user needs (questions, comparisons,
 * selection criteria, troubleshooting, care, mistakes, audiences, scenarios, seasonal
 * needs, category guides, educational topics, content-cluster gaps). Product/service/
 * category names are context + commercial targets ONLY — never the primary keyword or
 * article subject. Demand must never be claimed unless real volume is present.
 */
export function buildDiscoveryPrompt(ev: DiscoveryEvidence, ctx: ProjectContext, langLabel: string, year: number, count: number): string {
  const withVol = ev.demandQueries.filter((d) => (d.v ?? 0) > 0)
  return [
    `You are an SEO content strategist doing CONTROLLED DISCOVERY. Today's year is ${year}. Return ALL text in ${langLabel}.`,
    projectContextBlock(ctx),
    ``,
    `COMBINED PROJECT EVIDENCE (use as context — do NOT turn any single item into an article by itself):`,
    `- Project focus: ${JSON.stringify(ev.projectFocus.slice(0, 8))}`,
    `- Tracked keywords: ${JSON.stringify(ev.trackedKeywords.slice(0, 12))}`,
    `- Keyword-research queries WITH real demand: ${JSON.stringify(withVol.slice(0, 15).map((d) => ({ q: d.q, v: d.v })))}`,
    `- Keyword-research queries with unknown/zero demand (context only, do NOT claim volume): ${JSON.stringify(ev.demandQueries.filter((d) => !((d.v ?? 0) > 0)).slice(0, 15).map((d) => d.q))}`,
    `- Commercial entities (LINK TARGETS / examples of available solutions — never a primary keyword): ${JSON.stringify(ev.commercialEntities.slice(0, 20))}`,
    `- Already-covered titles (do NOT duplicate): ${JSON.stringify(ev.existingCoverage.slice(0, 20))}`,
    ``,
    `Propose up to ${count} BROAD, domain-relevant CONTENT OPPORTUNITIES grounded in this project's actual subject matter: questions, comparisons, selection criteria, troubleshooting, care & maintenance, common mistakes, audience-specific needs, scenarios, seasonal needs, category guides, educational explainers, or content-cluster gaps. Each must be a real independent user need with a distinct expected answer. NEVER use a commercial entity's bare name (or entity + a weak location/use/occasion modifier) as the primaryKeyword. Do not fabricate search demand — only reference demand that appears in the real-demand list above. Skip anything an existing title already answers.`,
    recommendationGuidance(langLabel, year, count),
    structuredOutputContract(langLabel, count),
  ].filter(Boolean).join('\n')
}

export interface SynthOpportunity {
  title: string
  primaryKeyword: string
  secondaryKeywords: string[]
  intent: string
  reason: string
  clusterId?: string
}

/** Defensive parse of the model's JSON into opportunity candidates. */
export function parseOpportunities(text: string): SynthOpportunity[] {
  let parsed: { topics?: unknown }
  try { parsed = JSON.parse(text) } catch {
    const m = (text || '').match(/\{[\s\S]*\}/)
    if (!m) return []
    try { parsed = JSON.parse(m[0]) } catch { return [] }
  }
  const arr = Array.isArray((parsed as { topics?: unknown }).topics) ? (parsed as { topics: unknown[] }).topics : []
  const out: SynthOpportunity[] = []
  for (const t of arr) {
    const o = t as Record<string, unknown>
    const title = String(o.title ?? '').trim()
    const primaryKeyword = String(o.primaryKeyword ?? '').trim()
    if (!title || !primaryKeyword) continue
    out.push({
      title, primaryKeyword,
      secondaryKeywords: Array.isArray(o.secondaryKeywords) ? o.secondaryKeywords.filter((s): s is string => typeof s === 'string' && !!s.trim()).slice(0, 4) : [],
      intent: typeof o.intent === 'string' ? o.intent : 'informational',
      reason: typeof o.reason === 'string' ? o.reason : (typeof o.evidenceSummary === 'string' ? o.evidenceSummary : ''),
      clusterId: typeof o.clusterId === 'string' ? o.clusterId : undefined,
    })
  }
  return out
}
