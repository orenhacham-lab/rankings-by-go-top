# Recommendation QA (prompt-only replacement)

Offline, deterministic checks for the minimal prompt+model+validation approach.

```bash
# Non-destructive validation + prompt-snapshot assertions (no network):
npx tsx lib/content/recommendations/__qa__/reco-prompt-only.qa.ts

# Live model benchmark (requires GEMINI_API_KEY + outbound access — Preview/prod):
GEMINI_API_KEY=… npx tsx lib/content/recommendations/__qa__/benchmark.ts
# optional: RECO_BENCH_MODELS="gemini-2.5-pro,gemini-2.5-flash,<preview-id>"
```

`reco-prompt-only.qa.ts` proves the application never mutates Hebrew (validation
is drop-only, titles pass through byte-identical) and that the prompts carry the
required instructions. It uses mocked model objects — it cannot prove live Gemini
quality; that is the Preview smoke. `benchmark.ts` is measurement only (it does
not choose a model or write anything).
