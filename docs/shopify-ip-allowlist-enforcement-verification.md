# Shopify IP allowlist: enforcement verified against Shopify's own records

**Status: VERIFIED (live), 2026-11-09.** The question is closed. Read-only
check: nothing was saved, no toggle was moved, no credential was entered.

## Why this needed a second look

The allowlist was set on 2026-11-05 and Enforcement was switched on the same
day. Three days later our production logs showed no Shopify 403s — but the one
live merchant connection had been quiet, so that was absence of evidence, not
evidence of absence. Shopify's own dashboard is the decisive source, because it
re-validates the policy against the traffic Shopify actually saw.

## Persisted configuration

Dev Dashboard → Go Top SEO → Settings → IP allowlist
(`/dashboard/163879745/apps/397648429057/settings/ip_restrictions`),
header badge **Enabled**, Save and Discard both greyed out — so the screen
reflects stored state, not an unsaved edit.

- Enforcement: **ON**
- Policy mode: **Networks (ASN)** (not "IP addresses")
- ASN: `16509`
- Countries: **India**, **Singapore**

## "Run test" against the last 30 days

Run once on 2026-11-09 at 12:51 pm. The window spans the three days under
enforcement.

```
Test results — Last 30 days — Oct 17 – Nov 9, 2026

No Admin API requests would be blocked

0 of 21 requests would be blocked
Results can take a few minutes to include your most recent requests.
```

No ASN is listed in the results: the blocked list is empty, so there is nothing
to enumerate.

## App request logs

The Logs page (filtered by request type) is the app's API request log.

- **GraphQL requests, last 7 days** (Nov 2–9, covering the whole enforcement
  period): 5 events, 2 logged rows — both `mutation · articleCreate` for
  `afroditedecants-co-il.myshopify.com`, at Nov 8 09:03:43 and Nov 4 09:17:42.
  Both carry the green success status. **No rejected or 403 entry.**
- **REST requests, last 7 days**: `No logs found`.

The Nov 8 call is the one that matters: it ran under enforcement and succeeded.

## The honest caveat

Traffic is thin — 21 Admin API calls in 30 days, and one successful call since
enforcement began. This is a real pass on real traffic, not a high-volume one.
What changed is the source: it is now Shopify's own record of what its policy
would do, rather than our inference from quiet logs.
