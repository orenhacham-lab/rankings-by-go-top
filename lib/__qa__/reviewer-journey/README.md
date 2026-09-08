# The Shopify reviewer journey, in a real browser, with no network

Two files that reproduce the zero-allocation incident end to end and prove the
fix, without Supabase, without egress and without any production data.

`supabase-stub.js` is a stand-in for the Supabase Auth + REST API. It exists for
one reason: it decides the database ROLE from the bearer key exactly as Supabase
does, so a request-scoped (anon) caller reading `public.billing_governance` gets
`42501 permission denied` while the service key reads the row. That single
asymmetry is the whole incident. Every other table is readable by both — which
is why page reads stayed healthy in Production while every mutation reported a
zero allowance.

`journey.js` drives real Chromium over a real `next start` build: log in through
the actual login form, open the reviewer's project, measure the page's client
request graph and whether it settles, add the keyword `shopify`, and POST the AI
visibility run. It asserts on the stub's database, not on the UI's optimism.

    node lib/__qa__/reviewer-journey/supabase-stub.js &
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5555 \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=stub-anon-key \
    SUPABASE_SERVICE_ROLE_KEY=stub-service-key \
    NEXT_PUBLIC_ENABLE_AI_VISIBILITY=true ENABLE_AI_VISIBILITY=true \
      npx next build
    QA_SCREENSHOT_DIR=/tmp/journey node lib/__qa__/reviewer-journey/journey.js

Measured at the time of commit, same stub, fresh database each run:

| | on `origin/main` | with this change |
|---|---|---|
| Add keyword `shopify` | "An error occurred in the Server Components render…" — the reviewer's screenshot, verbatim | no error |
| `tracking_targets` rows | 0 | 1 |
| `POST /api/ai-visibility/runs` | 403 `QUOTA_AI_SCANS`, `limit: 0` | reservation granted |
| `usage_reservations` rows | 0 | 1 |
| project page | settles in 358ms, 4 client calls | settles in 427ms, 4 client calls |
| **totals** | **4 passed, 5 failed** | **9 passed, 0 failed** |
