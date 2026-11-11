/**
 * The six figures of the 9 November per-site reading that a page may show.
 *
 * WHY A SEPARATE SUMMARY AND NOT THE DATASET ITSELF. The measurement lives in
 * `data/blocking-sites-2026-11-09.json`, and that file is 700 rows with a
 * deciding line each — roughly a quarter of a megabyte. The route serves it,
 * which is right; a client component must not import it, or every visitor to
 * /ai-crawlers downloads the whole dataset to read two percentages from it.
 *
 * So the handful of figures the page states are written here, and
 * `lib/ai-crawlers/__qa__/blocking-sites-dataset.qa.ts` recomputes every one of
 * them from the JSON and fails when the two disagree. The guard is what makes
 * this file safe: a summary nobody checks is a second source of truth, and the
 * whole point of publishing the rows was that the summary can be checked
 * against them.
 *
 * WHAT THE TWO HEADLINE FIGURES MEAN, because they are easy to misread. A
 * verdict records the robots.txt group that decided it. A group that names the
 * crawler is a rule somebody wrote about that crawler; the `*` group is a rule
 * aimed at every bot alike, which a site may never have thought about. So
 * `GPTBOT_DELIBERATE_PCT` is the share of GPTBot blocks that were a decision,
 * and `OAI_SEARCHBOT_INHERITED_PCT` is the share of OAI-SearchBot blocks that
 * were not. Presenting a blocking rate as an error rate without that split is
 * the objection a French SEO editor raised on 9 November, and he was right.
 *
 * THE READ RATE IS PART OF THE FINDING, not an apology for it. 145 of the 700
 * hosts answered 403 to this reader. A host that refuses an unknown automated
 * client is plausibly a host that restricts AI crawlers, so the subset that
 * could be read probably UNDER-states blocking. Any surface that shows the
 * percentages shows these three counts too.
 */

/** The dataset's own version, which is also how a consumer caches on it. */
export const BLOCKING_SITES_VERSION = '2026.11.09-sites'

/** The day the files were read. A dated reading never changes. */
export const BLOCKING_SITES_MEASURED_ON = '2026-11-09'

/** Where the rows are published, domain by domain. */
export const BLOCKING_SITES_PATH = '/api/public/ai-crawler-blocking/sites'

/** Domains asked for: the whole requested sample, not the part that answered. */
export const BLOCKING_SITES_REQUESTED = 700

/** The n every percentage below is of. */
export const BLOCKING_SITES_READ = 407

/** Hosts that answered 403 to this reader — the bias stated above. */
export const BLOCKING_SITES_REFUSED = 145

/** Of the sites blocking GPTBot, the share whose rule names GPTBot. */
export const GPTBOT_DELIBERATE_PCT = 80.3

/** Of the sites blocking OAI-SearchBot, the share that inherited it from `*`. */
export const OAI_SEARCHBOT_INHERITED_PCT = 43.6
