/**
 * THE PLACEMENT STEP: after an article is generated for a member project, place
 * at most one network link in it, or skip. Called once, from the one call site
 * in lib/content/article-generation.ts (through step.ts, which never throws).
 *
 *   1. The feature exists (tables), the source joined, the article is a fresh
 *      draft of this owner's project and carries no network link yet.
 *   2. The source qualifies (rules.sourceExclusion): not Shopify, not thin/new,
 *      under its monthly giving cap.
 *   3. The candidates: every other active member, through the rules (no
 *      competitor, no same category, no reciprocal / loop / already linked, no
 *      same owner, client or server address, caps with the ramp for new members).
 *   4. The body paragraphs a link may live in (anchor.bodyParagraphs).
 *   5. ONE model question (choose.ts); its answer is checked, and anything below
 *      the relevance threshold, not complementary or not literally in the
 *      paragraph is a skip.
 *   6. The anchor's kind; an exact-match anchor over the target's share is a skip.
 *   7. The log row first (the database refuses a reciprocal pair even under a
 *      race), then the draft's HTML; if the draft cannot be written the log row
 *      is removed again.
 *
 * Nothing here publishes anything: the link sits in the DRAFT, and the giving
 * side sees it in the log and can take it out before publishing.
 */
import { bareDomain } from '@/lib/site-links/classify'
import { bodyParagraphs, classifyAnchor, insertLink } from './anchor'
import { buildChoicePrompt, CHOICE_SCHEMA, MAX_TARGETS_SHOWN, readChoice, type AskJson, type CandidateTarget } from './choose'
import { eligibleTargets, exactAnchorAllowed, exclusionFor, sourceExclusion, type NetworkSite } from './rules'
import {
  activeMemberIds, linkedDomainsOf, loadSites, networkRows, NetworkUnavailable, placedEdges, readKeywords, readLinkedDomains, readLinkRel, rows,
  type NetworkDb,
} from './store'

export interface PlaceDeps {
  ask: AskJson
  /** IPv4 addresses a host resolves to; [] when it cannot be resolved (never throws). */
  resolve: (host: string) => Promise<string[]>
  now: () => Date
  env: Record<string, string | undefined>
}

export interface PlaceInput { projectId: string; userId: string; articleId: string }

export type PlaceResult =
  | { outcome: 'placed'; placementId: string; targetProjectId: string; anchorKind: string }
  | { outcome: 'skipped'; reason: string }

/** How many eligible members go through the expensive checks (article text, DNS) before the model. */
export const DEEP_CHECK_LIMIT = 8

const skipped = (reason: string): PlaceResult => ({ outcome: 'skipped', reason })

async function addresses(deps: PlaceDeps, domains: string[]): Promise<string[]> {
  const hosts = domains.slice(0, 2).flatMap((d) => [d, `www.${d}`])
  const all = await Promise.all(hosts.map((h) => deps.resolve(h).catch(() => [] as string[])))
  return [...new Set(all.flat())]
}

export async function placeNetworkLink(db: NetworkDb, input: PlaceInput, deps: PlaceDeps): Promise<PlaceResult> {
  if (deps.env.LINK_NETWORK_DISABLED === 'true') return skipped('disabled')
  const now = deps.now()
  let rel: Awaited<ReturnType<typeof readLinkRel>>
  try {
    rel = await readLinkRel(db)
  } catch (err) {
    return skipped(err instanceof NetworkUnavailable ? 'unavailable' : 'read_failed')
  }

  // 1. The source joined, and this is a fresh draft of this owner's project.
  const membership = await networkRows<{ active: boolean }>(db.from('link_network_members').select('active')
    .eq('project_id', input.projectId).eq('user_id', input.userId).limit(1))
  if (!membership[0]?.active) return skipped('not_member')
  const article = (await rows<{ id: string; title: string | null; content_html: string | null; status: string | null; wp_post_url: string | null }>(
    db.from('generated_articles').select('id, title, content_html, status, wp_post_url')
      .eq('id', input.articleId).eq('project_id', input.projectId).eq('user_id', input.userId).limit(1)))[0]
  if (!article?.content_html) return skipped('article_not_found')
  if (article.wp_post_url || article.status === 'published' || article.status === 'publishing') return skipped('already_published')
  const already = await networkRows<{ id: string }>(db.from('link_network_placements').select('id')
    .eq('source_article_id', input.articleId).eq('status', 'placed').limit(1))
  if (already.length) return skipped('article_cap')

  // 2 + 3. The source and the candidates, through the rules.
  const memberIds = (await activeMemberIds(db)).filter((id) => id !== input.projectId)
  if (!memberIds.length) return skipped('no_candidates')
  const sites = await loadSites(db, [input.projectId, ...memberIds])
  const src = sites.get(input.projectId)
  if (!src || src.site.userId !== input.userId) return skipped('article_not_found')
  const edges = await placedEdges(db)
  const sourceReason = sourceExclusion(src.site, edges, now)
  if (sourceReason) return skipped(`source_${sourceReason}`)
  const candidates = memberIds.map((id) => sites.get(id)?.site).filter((s): s is NetworkSite => !!s)
  const first = eligibleTargets(src.site, candidates, edges, now).eligible.slice(0, DEEP_CHECK_LIMIT)
  if (!first.length) return skipped('no_eligible_member')

  // The expensive checks, for the few that passed: links already in either side's
  // articles, and the server address of each side.
  const linked = await readLinkedDomains(db, [src.site.projectId, ...first.map((s) => s.projectId)])
  const source: NetworkSite = {
    ...src.site,
    linkedDomains: [...new Set([...(linked.get(src.site.projectId) ?? []), ...linkedDomainsOf(article.content_html)])],
    addresses: await addresses(deps, src.site.domains),
  }
  const finalists: NetworkSite[] = []
  for (const s of first) {
    const deep: NetworkSite = { ...s, linkedDomains: linked.get(s.projectId) ?? [], addresses: await addresses(deps, s.domains) }
    if (!exclusionFor(source, deep, edges, now)) finalists.push(deep)
    if (finalists.length >= MAX_TARGETS_SHOWN) break
  }
  const targets: CandidateTarget[] = finalists
    .map((s) => {
      const extras = sites.get(s.projectId)!.extras
      return { projectId: s.projectId, businessName: extras.businessName, domain: s.domains[0], category: s.category!, description: extras.description, pages: extras.pages }
    })
    .filter((t) => t.pages.length > 0)
  if (!targets.length) return skipped('no_eligible_member')

  // 4 + 5. Where, and the one question.
  const paragraphs = bodyParagraphs(article.content_html)
  if (!paragraphs.length) return skipped('no_body_paragraph')
  const prompt = buildChoicePrompt(
    { businessName: src.extras.businessName, domain: src.site.domains[0], category: src.site.category ?? '', language: src.site.language, articleTitle: article.title ?? '' },
    paragraphs, targets)
  const answer = readChoice(await deps.ask(prompt, CHOICE_SCHEMA), paragraphs, targets)
  if (!answer.ok) return skipped(answer.skip)
  const { choice } = answer

  // 6. The anchor's kind, and the exact-match share.
  const targetSite = finalists.find((s) => s.projectId === choice.target.projectId)!
  const keywords = await readKeywords(db, targetSite.projectId)
  const brandTerms = [choice.target.businessName ?? '', ...targetSite.domains.map((d) => d.split('.')[0])].filter(Boolean)
  const anchorKind = classifyAnchor(choice.anchor, { brandTerms, keywords: [...keywords, choice.page.title] })
  if (anchorKind === 'exact' && !exactAnchorAllowed(targetSite.projectId, edges)) return skipped('exact_anchor_share')

  const html = insertLink(article.content_html, choice.paragraph, choice.anchor, choice.page.url, rel)
  if (!html) return skipped('anchor_not_in_paragraph')

  // 7. The log row first, then the draft.
  const { data: placed, error: insertError } = await db.from('link_network_placements').insert({
    source_project_id: input.projectId,
    source_user_id: input.userId,
    source_article_id: input.articleId,
    source_domain: bareDomain(src.site.domains[0]),
    target_project_id: targetSite.projectId,
    target_user_id: targetSite.userId,
    target_url: choice.page.url,
    anchor_text: choice.anchor,
    link_rel: rel,
    anchor_kind: anchorKind,
    relevance: choice.relevance,
    status: 'placed',
    placed_at: now.toISOString(),
  }).select('id').single()
  if (insertError || !placed?.id) return skipped((insertError as { code?: string } | null)?.code === '23514' ? 'db_rule' : 'log_failed')

  const { data: written, error: writeError } = await db.from('generated_articles')
    .update({ content_html: html, updated_at: now.toISOString() })
    .eq('id', input.articleId).eq('project_id', input.projectId).eq('user_id', input.userId)
    .select('id')
  if (writeError || !Array.isArray(written) || written.length !== 1) {
    await db.from('link_network_placements').delete().eq('id', placed.id).eq('source_project_id', input.projectId)
    return skipped('article_write_failed')
  }
  return { outcome: 'placed', placementId: placed.id as string, targetProjectId: targetSite.projectId, anchorKind }
}
