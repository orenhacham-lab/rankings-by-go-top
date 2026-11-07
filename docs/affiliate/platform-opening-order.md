# Which affiliate platform to open next, and in what order

Written 2026-11-07. Every figure below was read from the platform's own pages,
not from a blog or from memory; where a platform's own page could not be
reached that is said rather than filled in.

## Where we already are

| Platform | State | Who is the seller | Commission |
| --- | --- | --- | --- |
| JVZoo | Live since 2026-11-04. 4 products approved. **0 sales.** | **We are.** Their vendor agreement s.11 leaves the tax with us. | 35% / 35% |
| Digistore24 | 4 products submitted 2026-11-02, **still pending** on 11-07 | **They are.** Merchant of record. | 35% |
| ClickBank | Account opened 2026-11-07. Nickname `gtopseo`, four products **submitted, Pending Review**. INS verifier landed (#346); INS itself **not yet requested**. | They are. | 50% first / 35% rebill |

The bottleneck is not the number of platforms. Two are open and both have sold
nothing, because at zero sales a product is invisible in JVZoo's affiliate
search (their 10-sale rule) and nobody is promoting it. A third account
produces the same zero unless affiliates are recruited in parallel. Open them
alongside the recruitment work, not instead of it.

## The order

### 1. ClickBank — do this one next

The only remaining platform that brings **both** an affiliate marketplace and
merchant-of-record status.

**Merchant of record: yes, confirmed in their words.** From
`support.clickbank.com/en/articles/10535140-what-taxes-does-clickbank-collect`:

> "Because ClickBank is considered the final retailer/reseller for all products
> sold through ClickBank, it is our responsibility to collect and remit various
> types of taxes based on the customer's location."

and, for the EU specifically:

> "ClickBank is responsible for remitting applicable sales tax since ClickBank
> resells the products to customers."

Their stated VAT coverage includes the whole EU plus the UK, Switzerland,
Norway, Iceland, Australia, Canada, New Zealand, Japan, South Korea, Singapore,
India, South Africa, UAE, Saudi Arabia, Serbia, Colombia and Taiwan. That is
the same protection Digistore24 gives us and the thing JVZoo does not.

**Costs, from `support.clickbank.com/en/articles/10535137-what-are-clickbank-s-fees`
(their page is dated 26 August 2026):**

- Signing up is free. **No monthly fee** — "ClickBank does not charge a monthly
  fee to its clients."
- **$49.95 one-time activation**, and only on success: "There is a one-time
  activation fee of $49.95 that must be paid when a ClickBank Seller's first
  product is approved… If your product is not approved, you are not responsible
  for the fee."
- **7.5% + $1.00 per sale** — they buy the product from us at 92.5% of the sale
  price minus $1.
- **Rebills under $40 are cheaper**: they buy at 90.1% of retail, so ~9.9% and
  no dollar. Their page does not state the rule for rebills of $40 or more, and
  all four of our plans are above $40 — so the recurring cost on our prices is
  **not confirmed** and should be asked before launch.
- **$5.00 per payout** ("pay period processing fee for every payment issued").
  Raising the payment threshold reduces how many payouts there are.
- Refund fee $0.50 or $1.00; chargeback penalties and dormant-account fees also
  exist (not read in detail).

**So it breaks Oren's "free only" rule by $49.95, once, and only if we are
approved.** That is the decision to make, and it is small against a $79-$649
monthly product.

**Not confirmed:** whether ClickBank hides a new product from its marketplace
until some number of sales, and how its "gravity" ranking treats a brand-new
listing. Their help centre pages we could read say nothing about it, and
`clickbank.com/pricing` refuses automated reads (HTTP 403). Worth asking their
support directly, because this is exactly the rule that has made JVZoo produce
nothing.

**Where the account actually got to, 2026-11-07.** The account exists and the
profile is saved: entity type **Business**, GO TOP DIGITAL MARKETING AND
ADVERTISING LTD, HaRehasim Street 24/2, Ramat Gan, TEL-AVIV, 5235524, Israel.
Two gates were hit on the way, and the second is still shut:

1. A blocking dialog with a single button, "Download Suppression List and
   Accept" — an undertaking under a U.S. District Court order not to send
   unsolicited marketing email to domains on an XMission LLC suppression list,
   on pain of breaching Section 6 of the Client Contract. Accepted on the
   owner's explicit instruction, not as a routine click-through. It is a live
   obligation: it constrains any email outreach promoting ClickBank products,
   and the list itself is contractually confidential.
2. **Identity verification, via Veriff** — requires a valid government ID
   document and a smartphone ("You need a smartphone in order to continue").
   Only the owner can complete it. Until it is done there is no **Accounts**
   tab, so no account nickname can be created, and the nickname IS the seller
   account: no products, prices or INS webhook can exist before it.

Both gates are now behind us: the owner completed Veriff in the browser, the
**Accounts** tab appeared, and the nickname `gtopseo` was created.

**Where it stands on 2026-11-07, after the products went in.** Four recurring
digital products exist, each one Website Membership, no trial, Monthly rebill,
unlimited subscription duration, billing descriptor `GOTOPSEO`, pitch page
`/go/clickbank` and thank-you page `/go/clickbank/thanks`:

| # (SKU) | Product | Price | Commission | Paylink |
| --- | --- | --- | --- | --- |
| 1 | Basic — 1 site | $79/mo | 50% first / 35% rebill | `…pay.clickbank.net/?cbitems=1` |
| 2 | Advanced — 1 site, 100 keywords | $179/mo | 50% / 35% | `?cbitems=2` |
| 3 | Premium — 10 sites | $329/mo | 50% / 35% | `?cbitems=3` |
| 4 | Agency — 100 sites | $649/mo | 50% / 35% | `?cbitems=4` |

All four read **Pending Review**: ClickBank's own dialog says an email arrives
in three to five business days. The $49.95 activation fee is charged on the
**first approval**, not on submission.

Two defaults had to be overridden on every product, and they are the kind that
would have shipped the wrong number silently: the account's **Default
Commission Rate is 25%**, applied through a switch that is ON by default, and a
second switch reuses the initial commission for rebills. Both had to be turned
off before the 50/35 split could be typed in. **Unlimited Subscription
Duration** is also off by default, which would have ended every subscription
after a fixed number of payments.

The submission form asked whether **login credentials are necessary to review
the product**, and it defaults to yes. It was answered **no** — truthfully: the
trial is seven days with no credit card and a reviewer can open one
unaided — rather than putting an account password into a vendor form.

**What is left, and why it is not done.** The Instant Notification URL cannot
be entered: the field is replaced by a `(request access)` link, and the request
requires accepting the separate **ClickBank Instant Notification Terms of
Use** — not the Client Contract, not the product terms. It is free today but
clause 4 reserves the right to charge later. That acceptance is the owner's to
give, so the Secret Key was also left empty rather than configuring one side of
a two-sided secret. Details in `clickbank-ins-docs.md`.

`MARKETPLACE_CLICKBANK_ENABLED` stays unset and the buy-URL variables stay
unset too, because a paylink for a product still in review is a button that
cannot take money.

### 2. WarriorPlus — only after a question is answered

Free to list, and a real audience of internet-marketing affiliates.

**But the seller is probably us, not them.** Their own help centre tells vendors
to connect their own payment account — "Accepted accounts for vendors include
PayPal and Stripe" — which is the JVZoo shape: money lands in our processor, so
the invoice and the EU VAT come back to us. A third-party guide mentions an
invite-only merchant-of-record pilot at 9.9% + $0.50, but that is **not
confirmed on WarriorPlus's own pages** and should not be relied on.

**Before opening anything there, get one answer in writing from their support:**
*is WarriorPlus the merchant of record and does it remit EU VAT, or is the
vendor the seller?* If the vendor is the seller, WarriorPlus adds the same tax
exposure JVZoo already gives us, for the same kind of audience — which makes it
a low-value third copy of a channel that is currently selling nothing.

### 3. Paddle / Lemon Squeezy — a different tool, not a competitor to the above

Both are merchants of record built for exactly our shape of product (monthly
SaaS) and cost nothing to start. **Neither has an affiliate marketplace.** They
solve tax and checkout; they bring no promoters. Worth considering as the
checkout for our *own* affiliate programme, never as a way to find affiliates.

### Not recommended

ShareASale, Impact, CJ, Awin, PartnerStack and Rakuten are real affiliate
networks with real advertisers, but all charge setup fees, monthly minimums or
both, which fails the brief's "commission only, no fixed cost" condition.

## The question that outranks all of this

Every platform above answers "where can affiliates find us". None answers "why
would an affiliate choose this product". At $79/month and 35% recurring an
affiliate earns about $28 a month per customer, and in these marketplaces
affiliates pick by earnings per click. A cheap front-end offer with an upsell is
the shape that market responds to, and it has been proposed twice without a
decision. Deciding it is worth more than opening a fourth account.
