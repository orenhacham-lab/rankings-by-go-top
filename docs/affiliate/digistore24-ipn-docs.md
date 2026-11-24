# Digistore24 IPN documentation (from Digistore24's own published sources)

Sources, both fetched directly on 2026-11-02 and both public — no seller account needed:

- `https://www.digistore24.com/download/ipn/examples/ipn/digistore_ipn.pdf`
  — "Instant Payment Notification Guide", © 2018 Digistore24 GmbH.
- `https://www.digistore24.com/download/ipn/examples/ipn/sha_sign.php`
  — the reference signature implementation, © 2026 Digistore24 Inc.

`www.digistore24.com` IS reachable from a cloud session. Their Zendesk help
centre (`help.digistore24.com`, `dev.digistore24.com`) answers 403 to a
datacenter IP, which is what made this look unreachable before.

## Which connection type — and the one that has NO signature

Everything below describes the connection type Digistore24 calls **Generic**
(Settings → Integrations (IPN) → Add new connection → Generic). That is the
one this repo implements and the one the live connection uses.

The same screen offers a type literally named **Webhook**, and it is a trap
worth naming here so nobody switches to it later for the friendlier-looking
form. Read inside the seller account on 2026-11-02: it sends only the GET
parameters you hand-map in its UI, and it carries **no signature of any
kind** — no `sha_sign`, no passphrase field. Its only optional protection is
a custom `X-` header, which is a bearer token in a URL rather than something
bound to the message.

`proxy.ts`'s matcher excludes `/api/*`, so the signature check in
`lib/marketplace/signature.ts` is this route's ONLY authentication. Pointed at
a "Webhook" connection, anything that could reach the URL could post a paid
order for any product and any email address. `verifyMarketplaceSignature`
would refuse those deliveries anyway, since the provider's scheme expects
`sha_sign` — so the practical result of switching is not a security hole but a
channel that silently refuses every real sale. Either way: Generic.

The live connection is **357299** ("Go Top SEO"), POST, IPN timing "Before
forwarding to the thank you page", retries on, and success validation left on
their **Default (expects text: OK)** rather than the laxer "HTTP code"
option — because this route really does answer the literal `OK`
(`acknowledgement: 'ok_text'`), and the default setting is the one that
actually checks it. "HTTP code" would count any 2xx as handled, including a
2xx carrying the wrong body.

## The signature, and how it was verified

Every IPN call carries a SHA-512 digest in the parameter `sha_sign`. The
algorithm, from the reference implementation:

1. Take the POST parameters. Remove `sha_sign` and `SHASIGN`.
2. Sort the keys as byte strings. The reference sorts CASE-SENSITIVELY by
   default (`$sort_case_sensitive = true`); the 2018 PDF says "not case
   sensitive". Every documented parameter name is lower-case, so the two agree
   on real traffic — but the newer reference implementation is what we follow.
3. Skip any parameter whose value is absent or the empty string.
4. Concatenate `key=value` followed by the passphrase, once per parameter.
5. SHA-512 the result and upper-case the hex.

**Verified against Digistore24's own published digest.** The guide prints a
worked example: passphrase `xxxxx`, parameters `buyer_email`,
`order_id`, `payment_id`, `transaction_amount`, `transaction_currency`, and the
expected signature

```
342770076245D14ED7DF4D2E5D82216D7EDF8F9E7969B5964C9C5DCB53E962BBECD545E90422B5329C69554FD8B1A7E7410736615FCA7FB5CBB3624CC016E4BC
```

Computing it outside this repository reproduces that string exactly. This is
the external check the JVZoo scheme never had before its first sale.

### The passphrase is the IPN setting's, NOT the thank-you page key

Third-party libraries disagree about this and the public example script is
misleading on it: that script is about validating the redirect to the
thank-you page, so it uses the thank-you page key. For IPN the guide is
explicit (setup steps A3 and B6): you choose a "unique, non-guessable value"
and enter it as the SHA512 passphrase in Settings → IPN. That value is what
signs the notifications, and it is what `MARKETPLACE_DIGISTORE24_WEBHOOK_SECRET`
must hold.

### PHP semantics worth replicating exactly

- `$_POST` keeps the LAST value of a repeated bracket-free key, while
  `URLSearchParams.get()` returns the first. The digest and the parser must
  agree on which one they read, or a body could be signed over one product id
  and granted on another.
- A bracketed key (`addons[0][id]`) becomes a nested array. The reference
  re-serialises it with `http_build_query` and appends each decoded
  `key=value` pair with the passphrase, so sorting is by the TOP-LEVEL key and
  the parts of one array stay in body order.

## The response Digistore24 requires

> An IPN call is considered a success, if the DigiStore server receives the
> text "OK" (upper case, without the quotes) from your server.

A JSON body is therefore logged as a failure even when the delivery was
processed correctly. `connection_test` must answer `OK` too — that is what the
"Test connection" button in the IPN settings checks.

Unlike JVZoo, Digistore24 keeps an IPN log of every call, successful and
failed, under Settings → IPN, which is a reconciliation surface.

## Events (`event`)

| Event | Meaning |
|---|---|
| `on_payment` | A successful payment. The one that pays for access. |
| `on_refund` | A refund was processed. |
| `on_chargeback` | A card chargeback was processed. |
| `on_payment_missed` | A subscription or installment payment is missing. |
| `on_rebill_cancelled` | The buyer cancelled the rebilling. |
| `on_rebill_resumed` | The buyer resumed the rebilling. |
| `last_paid_day` | The order's last paid day has passed. |
| `connection_test` | Sent by their "Test connection" button. |
| `on_affiliation` | An affiliate was accepted for the product. |

`on_rebill_cancelled` is sent when the buyer cancels; `on_payment_missed` only
later, when the payment would have been due. So a cancellation does NOT end
paid access, and the paid period runs to `next_payment_at`.

## Parameters this integration reads

| Parameter | Note |
|---|---|
| `order_id` | Unique per order; every transaction of one order shares it. |
| `transaction_id` | Unique per transaction, so a rebill differs from the first payment. |
| `product_id` | Which product was bought. `product_id_2`, `_3`, … for further items. |
| `email` / `buyer_email` | The buyer's address. |
| `amount_brutto` | Gross amount of this payment. `amount_vat` is the VAT inside it. |
| `currency` | Currency code. |
| `billing_type` | `single_payment`, `subscription` or `installment`. |
| `next_payment_at` | Date of the next expected payment: the end of the paid period. |
| `api_mode` | `live` or `test`. A test order must never grant a real plan. |
| `ipn_version` | Interface version, 1.2 in the guide. |

`product_code` is deprecated; `product_id` replaces it.

## The thank-you page redirect, which is signed too and with a different key

Read from Digistore24's own example at
`https://www.digistore24.com/download/ipn/examples/ipn/thankyou_page.php`
(fetched 2026-11-14) and from the two settings that control it in the vendor
backend.

When a product is set to pass the order data on, Digistore24 append it to the
thank-you page URL as GET parameters and sign the set with `sha_sign`, using
**exactly the IPN algorithm** — SHA-512, every parameter sorted
case-sensitively, each non-empty `name=value` followed by the passphrase, the
hex upper-cased. Their script calls the same `digistore_signature` function
with the default arguments, so `$convert_keys_to_uppercase` is false and
`do_html_decode` does not appear. The signature is computed over `$_GET`
**as received**, before any decryption.

**The key is not the IPN passphrase.** It is the account-level *thank-you page
key*, the field whose own help text in Account → Details reads "This is used
to protect the GET parameters sent to your thank you page". It is held here as
`MARKETPLACE_DIGISTORE24_THANKYOU_KEY`, separately from
`MARKETPLACE_DIGISTORE24_WEBHOOK_SECRET`, because they are two values in two
screens and the vendor may rotate either alone.

Two per-product settings decide whether any of this happens:

- `add order data to thank-you page URL` — Yes/No. **No** means no parameters
  at all, and then there is nothing to verify and no one-click button.
- `encrypt order data of thank-you page URL` — set to "No, transfer data in
  plain language" on all four products, which is why the ids arrive
  readable. With encryption on, each value arrives as ciphertext beginning
  `ds24` while the digest still verifies; `lib/marketplace/thankyou-handoff.ts`
  refuses such an id rather than decrypting, because their cipher has not been
  checked against their reference here.

Which id the button looks up: **`order_item_id`**, the number the webhook
records receipts under, and not `order_id`, the short alphanumeric code the
buyer sees. A real redirect carries both (24.11.2026 test order: `order_id`
LXUK7F2E, `order_item_id` 79461645). The first version read `order_id`, passed
the signature check and found no receipt, so the button never appeared.

Why it matters at all: the IPN connection fires **before** the buyer is
forwarded to the thank-you page, so the receipt already exists when the page
renders. That is what lets the page offer an activation button for a verified
redirect instead of relying on the buyer opening the delivery email — the
failure Digistore24's own reviewer hit on 2026-11-14.
