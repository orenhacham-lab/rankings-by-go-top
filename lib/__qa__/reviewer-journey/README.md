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

## The keyword workflow

`keyword-workflow.js` drives the same stub through the reviewer's second
journey: add the keyword `shopify`, watch the automatic search-volume refresh,
click "Update search volumes", then click "Scan". Both providers are
unreachable from the container by design — that is the case under test.

    node lib/__qa__/reviewer-journey/supabase-stub.js &
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5555 … npx next build
    QA_SCREENSHOT_DIR=/tmp/kw node lib/__qa__/reviewer-journey/keyword-workflow.js

Measured at the time of commit, same stub, fresh database each run:

| | on `origin/main` | with this change |
|---|---|---|
| automatic volume refresh after adding a keyword | **none** | exactly one |
| volume answer | `{"success":false,"error":"Failed to obtain access token"}` | coded, `retryable`, with a `requestId` |
| scan answer | **HTTP 200** `status:"failed", completed:0` — a success shape for a scan that checked nothing, with the raw provider string in `results[].error` | HTTP 500 `SCAN_FAILED`, localized in both languages, retryable |
| **totals** | **12 passed, 1 failed** | **13 passed, 0 failed** |

The ~60-second waits do not reproduce here, because this container's egress
proxy refuses both providers immediately rather than accepting the connection
and going silent. That timing was measured directly at the module boundary
instead — see `lib/ops/__qa__/keyword-scan-and-volume.qa.ts`.

## The language journey

`shopify-language-journey.js` drives the handoff the Shopify reviewer takes:
embedded app → Open dashboard → login → project page, with
`dashboard-language=he` already on the browser (the production condition) and an
`en-US` Accept-Language. It reads the RAW server responses as well as the settled
DOM, so nothing can pass because hydration corrected it.

    node lib/__qa__/reviewer-journey/supabase-stub.js &
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5555 … npx next build
    QA_SCREENSHOT_DIR=/tmp/lang node lib/__qa__/reviewer-journey/shopify-language-journey.js

Measured at the time of commit, same stub, fresh database each run:

| | on `origin/main` | with this change |
|---|---|---|
| raw `/login` response | `lang="he" dir="rtl"` | `lang="en" dir="ltr"` |
| `?lang=he` on an English browser | ignored — stayed English | Hebrew, as asked |
| destination after sign-in | `lang="he" dir="rtl"`, Hebrew sidebar | `lang="en" dir="ltr"`, English |
| reload of the destination | Hebrew | English |
| `next=https://evil.com` / `//evil.com` / `/\evil.com` | followed | replaced with a safe internal page |
| cookie persisted through the redirect | no | yes |
| **totals** | **12 passed, 10 failed** | **22 passed, 0 failed** |

## Search Console, connected or not

Search Console feeds widgets on the dashboard, reports, keywords and Topics.
Keyword research's raw opportunity browser is a dev-only diagnostic behind
`NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED`, which the journey build does not set, so
merchants never see it. The stub starts every journey with Search Console NOT
connected (every GSC table empty) and switches to a connected fixture on request,
leaving every other table alone: one Google connection, a property on the
project, ten weekly 28-day syncs with their property totals (stored newest first,
because the stub ignores `order`), and the query+page rows of the latest sync.

    curl http://127.0.0.1:5555/__stub/fixture?gsc=connected      # or gsc=disconnected

`journey.js` checks the retired `/content/search-console` address (a 307 to the
Search Console section of settings, `#search-console`, with every parameter, for a
connection result too; a browser following it lands there), then visits each
screen in both states: without a connection every widget keeps its title and
offers one link to settings; with one it shows its figures; keyword research
shows no Search Console section and asks for no Search Console data in either
state; and no screen logs a console error.
