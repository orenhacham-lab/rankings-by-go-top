# Verifying the `activeSubscription` app-ID GID namespace

**Status: VERIFIED (live).** The Partner API app-ID GID namespace question is
closed. No Partner API access token or Shopify access token was ever
requested, printed, logged, or committed as part of this verification.

## Verified values

- Partner organization ID: `4243054`
- Shopify app numeric ID: `397648429057`
- **Correct Partner API app GID: `gid://shopify/App/397648429057`**
- Development shop GID used for the test: `gid://shopify/Shop/77989445789`
- Development shop domain used for the test: `go-top-seo-test.myshopify.com`
- Partner API version: `2026-07`

## Live results

The `VerifyActiveSubscriptionAppId` query below was run twice in Partner
GraphiQL, against the real Partner API, once per candidate namespace:

```graphql
query VerifyActiveSubscriptionAppId($appId: ID!, $shopId: ID!) {
  activeSubscription(appId: $appId, shopId: $shopId) {
    shop { id myshopifyDomain }
    trialEndsAt
    cancelAtEndOfCycle
    currentBillingCycle { startTime endTime }
    items { handle }
  }
}
```

**Attempt A** — `{ "appId": "gid://partners/App/397648429057", "shopId": "gid://shopify/Shop/77989445789" }`

Result: **rejected**

```
Invalid GID app name 'partners'. Use 'shopify' instead.
```

**Attempt B** — `{ "appId": "gid://shopify/App/397648429057", "shopId": "gid://shopify/Shop/77989445789" }`

Result: **accepted**, clean `data`, no `errors`:

```json
{
  "data": {
    "activeSubscription": null
  }
}
```

The `null` result is expected and correct — no Shopify App Pricing
subscription has been activated on this development store yet (see Step 4
below: a malformed/wrong-namespace `appId` fails at argument-parsing time,
before Shopify ever looks at whether the shop has a plan, so `null` with no
`errors` is itself the positive "this namespace parses" signal — independent
of whether any plan is actually active).

## Conclusion

`gid://shopify/App/...` is the only namespace `activeSubscription(appId:,
shopId:)` accepts. `gid://partners/App/...` is rejected outright by the live
API with an explicit `Invalid GID app name 'partners'. Use 'shopify'
instead.` error — this is not ambiguous and required no further testing.

## What changed as a result (Blocker C)

- `lib/shopify/partner-client.ts` — `PARTNER_APP_GID_PATTERN` now matches
  ONLY `gid://shopify/App/\d+`; the `gid://partners/App/...` namespace is no
  longer accepted by `loadPartnerApiConfig` (a misconfigured env var in that
  namespace now fails closed as `missing_config`, exactly like any other
  invalid value — never silently converted).
- `.env.local.example` — `SHOPIFY_PARTNER_APP_GID` documented and set to
  `gid://shopify/App/397648429057`.
- All QA fixtures (`lib/shopify/__qa__/phase2-*.qa.ts`,
  `lib/content/__qa__/shopify-billing-gate.qa.ts`,
  `lib/ai-visibility/__qa__/keyword-research-auth.qa.ts`) updated to set
  `SHOPIFY_PARTNER_APP_GID` to the confirmed `gid://shopify/App/...` value.
- `lib/shopify/__qa__/phase2-billing.qa.ts` gained a regression test proving
  a `gid://partners/App/...` value now fails closed (`missing_config`) and a
  `gid://shopify/App/...` value is accepted.
- `lib/shopify/__qa__/phase2-source-contracts.qa.ts` gained a source-contract
  test proving the pattern only matches the `gid://shopify/App/...` form and
  that no other production file references the rejected namespace.

## Deployment note (not performed by Claude)

The real Vercel environment variable `SHOPIFY_PARTNER_APP_GID` must be set to
`gid://shopify/App/397648429057` (namespace prefix changed from
`gid://partners/App/...`; the numeric ID `397648429057` is unchanged) before
Shopify billing verification is trusted in production. This file's local
code/doc/test changes do not themselves touch Vercel config, per the
standing instruction not to change environment variables.
