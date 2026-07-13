# Recommendation QA harnesses

Deterministic, network-free harnesses for the recommendation post-processing
pipeline (quality repair/refill + grounding/entity validation). They inject the
Gemini repair/refill callbacks with stubs, so they run offline and are stable.

Run from the repo root:

```bash
npx tsx lib/content/recommendations/__qa__/quality.qa.ts     # repair / refill / count preservation / diversity
npx tsx lib/content/recommendations/__qa__/grounding.qa.ts   # entity identity / grounding / claims / cannibalization / reasons
```

Each prints `N passed, M failed` and exits non-zero on any failure.
