# PR #30 — System-Wide Generalization Audit

The recommendation engine must work for **every** existing and future project with
no project-id, domain-name, customer, URL, or industry-specific exception. This
audit enumerates every hardcoded rule introduced in PR #30, classifies each as
**grammatical/domain-neutral**, **data-derived from the active project**, or
**covered by cross-domain regression tests**, and records the one documented
product limitation.

Offline proof: `lib/content/__qa__/reco-generalization.qa.ts` runs the **real
`generateFromBriefs` pipeline** across a 12-domain matrix + a true cold start +
explicit tenant isolation (99 assertions).

---

## 1. Classification of every hardcoded rule

### A. Grammatical / domain-neutral (Hebrew grammar & universal modifiers)

These are language-level, not industry content. They apply identically to a flower
shop, a law firm, or a SaaS. None references a customer, brand, product, or vertical.

| Rule | File | What it is | Why domain-neutral |
|---|---|---|---|
| `ATTRIBUTE_LEXICON_RAW` (colours, sizes, quality words, generic design/type/container nouns, price words, evaluative/framing/action words) | `link-relevance.ts` | Modifiers that never form a subject on their own | Colours (`ורוד`), sizes (`גדול`), quality (`מומלץ`), price (`מחיר`), framing (`חשוב`,`עדיף`), action nouns (`יצירת`) are grammar, not a product line |
| `LINK_PROCLITICS` / `HEB_PROCLITICS` / `deproc` | `link-relevance.ts`, `coverage.ts`, `brand-safety.ts` | Strip leading ו/ה/ב/ל/מ/ש/כ | Hebrew clitics — universal |
| `TEMPORAL_RE` (`שנת`,`שנה`,`חודש`,`יום`,`2026`…) | `search-phrase.ts` | Year/date/temporal residue words | A year is never a subject in any vertical |
| `OPENERS_RE`, `GUIDE_OPENER_RE`, `GUIDE_ABOUT_RE`, `ACTION_OPENER_RE`, `HOW_MUCH_RE`, `SECOND_CLAUSE_RE`, `HEADLINE_TAIL_RE`, `DANGLING_TAIL_RE` | `search-phrase.ts` | Headline-frame / guide / question openers | Question words (`מהי`,`איך`), guide words (`המדריך`), connectives — grammar |
| `PRICE_FRAMING`, `COST_RE`/`HOWTO_RE`/`COMPARE_RE`/`SELECT_RE`/`LOCAL_RE` | `coverage.ts` | Coarse search-NEED classifier (cost/howto/compare/…) | Intent grammar (`כמה עולה`,`איך`,`לעומת`) — no industry terms |
| `BUILD_ACTIONS` / `PROMOTE_ACTIONS` (`הקמת`/`בניית`/… vs `קידום`/`שיווק`/…) | `coverage.ts` | Action/need class (build ≠ promote) | Verbs of doing vs marketing — apply to any entity ("build a store" vs "promote a store") |
| `BUSINESS_SUFFIX_RE` (`בע"מ`/`Ltd`/`Inc`/`LLC`/`Corp`/`group`) | `brand-safety.ts` | Legal-entity suffixes | Legal grammar — never a customer list |
| `DESCRIPTOR_TOKENS` (colours/sizes/quality) | `brand-safety.ts` | Exempt a 1-edit descriptor coincidence from name-mutation | Same colour/size grammar as above |
| `COMPARISON_CONNECTORS`, `COMMERCIAL_MODIFIERS` | `opportunity-validation.ts` | vs/מול, price/buy modifiers | Function words |
| Final-letter folding, plural fold, synonym-group representatives | `semantic-dup.ts`, `coverage.ts` | Hebrew morphology | Morphology, not content |

**Curated cross-domain synonym map** (`SYNONYM_GROUPS` in `coverage.ts`): a small,
grammar-level equivalence set (`מזון≈תזונה`, `מחיר≈עלות`, `רכב≈מכונית`,
`רופא≈דוקטור`, …). These are language synonyms, not one project's vocabulary; each
is exercised by cross-domain tests. New groups must remain generic language
synonyms — never a customer's brand or a single vertical's jargon.

### B. Data-derived from the active project (no literals)

Everything industry-specific is derived at runtime from the **current project's own
evidence** — entity names, project focus, tracked keywords, keyword research — and
therefore adapts to any vertical automatically:

| Signal | Source | Derivation |
|---|---|---|
| `corpusTypeWords`, `domainTypeWords` | `deriveCorpusTypeWords(entity names, coverage, KR, focus)` | Tokens frequent across the project's own docs |
| `attributeTokens` | `deriveAttributeTokens(entity names)` | Tokens co-occurring with many distinct heads |
| `commercialEntityTokens`, `businessEvidenceTokens` (`projectVocab`) | `contentTokens(entity names + focus + tracked + KR)` | The project's own subject vocabulary |
| `projectFocus` | `deriveProjectFocus(name, domain, categories, topics)` | Derived per project |
| `ownVocab`, `typeVocab`, `namePhrases`, `ownBrandTerms` | `buildBrandSafety(businessName, entityNames, ownEvidence)` | The project's own brand/type evidence |
| `existingCoverageDocs`, `existingPageTitles`, `pendingCoverageDocs`, `linkCandidates` | the project's published/pending/indexed pages | Per-tenant, filtered by `project_id` |

### C. Coverage thresholds (numeric, domain-neutral)

`owns_need`/`improve` thresholds (`covTopic ≥ 0.75`, `shared ≥ 2`, `covTopic ≥ 0.6 &&
uncovered ≤ 1`, local `shared ≥ 2`) and `MAX_SEARCH_TOKENS = 7` are proportion/count
gates on *derived* token sets — they carry no vocabulary and are unchanged across
domains. They are covered by the multi-domain matrix and the cannibalization tests.

No fixture-tuned magic number was introduced (the one place a count-threshold would
have been required — the foreign-entity block — was **rejected** for that reason; see
§3).

---

## 2. Multi-domain, cold-start & tenant-isolation coverage

`reco-generalization.qa.ts` (99 assertions, real pipeline):

- **12-domain matrix**: ecommerce, local service, B2B/SaaS, health, legal, fashion,
  sports, cleaning, content publisher, multi-location, sparse inventory, new project.
  Each asserts: truthful typed `stop_reason`; grounded topics **or** a truthful
  `insufficient_inventory`; every accepted keyword carries a real subject and is a
  clean search phrase; no external business in accepted output; no invented demand /
  malformed reason; ≤2 paid calls.
- **True cold start**: only business name + URL + services (no KR / pending / posts)
  → grounded-from-services or truthful insufficient; **never a fabricated off-domain
  topic**. Empty project → 0 suggestions + `insufficient_inventory` (never filler).
- **Tenant isolation**: two tenants (health + legal) merged into one admin store;
  each run is filtered by `project_id`; a health run contains **no** legal
  keyword/page/pending/link and vice-versa; KR counts are per-tenant.

---

## 3. Documented product limitation (foreign-vertical vs on-domain concept)

**Where**: `unmatchedDocEntities` / `assessNeedCannibalization` (`coverage.ts`).

An existing page can share a topic's generic need yet really be about a different
vertical (a wellness-lifestyle topic vs a page whose real subject is *horse care*,
`סוסים`). Distinguishing a **foreign vertical** (`סוסים`) from an **on-domain extra
concept** (`body & soul` on a wellness page) cannot be done by token overlap without
either a hardcoded word list or a fixture-tuned count threshold — **both forbidden by
this generalization contract** (auto-blocking regressed legitimate near-identical
ownership at counts 5 / 3 / 1 for horses / body-soul / wedding-floral respectively).

**Decision**: the engine **exposes** `unmatchedEntities` on each `CoverageMatch`
(proclitic/stem/synonym-folded, modifier-stripped, corroborated against project
evidence) as a diagnostic for the acceptance runner / operator, and does **not**
silently reject on it. A page's extra entity is flagged foreign only when neither the
topic nor project evidence corroborates it — so `סוסים` surfaces for a health project
and not for a horse project (`reco-quality-gates.qa.ts` NS3). Reliable
auto-rejection requires a semantic signal beyond the offline token engine; that is a
real product limitation, surfaced rather than faked.

---

## 4. Guarantees

- Grounded safe opportunities when evidence supports them; otherwise a truthful typed
  `insufficient_inventory`.
- Never invented evidence, never another project's data (structural `project_id`
  isolation + assertions).
- No project-specific exceptions: Natural Shop / Flowers / Matalon are acceptance
  fixtures only; every fix is a shared grammatical or data-derived mechanism.
