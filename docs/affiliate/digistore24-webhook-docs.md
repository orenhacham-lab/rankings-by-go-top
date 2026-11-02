# Digistore24 IPN — the spec this repo implements against

Copied from Digistore24's own developer documentation and reference script on
**2026-11-02**, read on the owner's machine while signed in to the vendor
account. The cloud sessions this project is normally developed in cannot reach
`digistore24.com` (the egress proxy refuses it), which is why this file exists
at all: `lib/marketplace/config.ts` will not carry a signature scheme that was
not read from the platform, and this is the reading.

Sources, all first-party:

- `https://dev.digistore24.com/hc/en-us/articles/32480217565969-Quick-Integration-Guide`
- `https://dev.digistore24.com/hc/en-us/articles/32480561422353-Events`
- `https://www.digistore24.com/download/ipn/examples/ipn/ipn_receiver.php`
  — Digistore24's own reference receiver, © 2026 Digistore24 Inc. The
  signature function below is transcribed from it.

## Which connection type, and why not the other one

Digistore24's IPN settings (Settings → Integrations (IPN) → Add new
connection) offer two types that could point at our endpoint:

- **Webhook** — sends only the GET parameters you map in the UI, and carries
  no signature of any kind. Anything that can reach the URL can forge a paid
  order. Unusable here: `proxy.ts`'s matcher excludes `/api/*`, so the
  signature check is the route's only authentication.
- **Generic** — POSTs the full parameter set with an SHA-512 signature in
  `sha_sign`, keyed by the **IPN password** configured on the connection.
  This is the one we use.

The Generic form also offers a custom `X-` header, which could carry a shared
secret. That is a second, independent check and not a substitute: a header is
a bearer token on a URL, while `sha_sign` binds the secret to the specific
message.

## The signature

`sha_sign` is a **SHA-512** digest, **upper-case hex, full length (128
characters)**. Transcribed from `digistore_signature()` in the reference
receiver, with the defaults the script itself uses
(`$convert_keys_to_uppercase = false`, so `$sort_case_sensitive = true`):

```php
$algorythm           = 'sha512';
$sort_case_sensitive = true;

unset( $parameters[ 'sha_sign' ] );
unset( $parameters[ 'SHASIGN' ] );

array_multisort( $keys_to_sort, SORT_STRING, $keys );

$sha_string = "";
foreach ($keys as $key)
{
    $value = $parameters[$key];
    $is_empty = !isset($value) || $value === "" || $value === false;
    if ($is_empty)
    {
        continue;
    }
    $sha_string .= $upperkey . "=" . (string) $value . $sha_passphrase;
}

$sha_sign = strtoupper( hash( $algorythm, $sha_string) );
```

In words, and this is what `lib/marketplace/signature.ts` implements:

1. Take **every** posted parameter — not a fixed list, unlike JVZoo's
   `cverify`.
2. Drop `sha_sign` and `SHASIGN`.
3. Drop every parameter whose value is the empty string. (`"0"` is **not**
   empty and is included: the test is `=== ""`, not PHP's `empty()`.)
4. Sort the remaining keys as strings, **case-sensitively** (byte order; every
   documented key is ASCII `snake_case`, so a JavaScript default sort agrees).
5. Concatenate `key=value<IPN password>` for each key, in that order. The
   passphrase goes after **every** parameter, not once at the end.
6. SHA-512 the result; compare upper-case hex.

Two details worth stating because getting either wrong yields a silent
mismatch:

- **Duplicate keys.** PHP's `$_POST` keeps the *last* occurrence of a repeated
  scalar key. The verifier does the same. No documented parameter repeats, so
  this only matters for malformed input, which should fail closed anyway.
- **Bracketed array keys** (`a[]=1&a[]=2`) get their own branch in the
  reference script. No documented Digistore24 parameter uses them. The
  verifier treats a bracketed key as an ordinary scalar, so such a delivery
  would fail the check rather than be accepted on a guess.

The connection's **IPN password** is the passphrase, held here as
`MARKETPLACE_DIGISTORE24_WEBHOOK_SECRET`. The reference script disables
verification when the passphrase is blank; we never do — a provider whose
secret is unset is simply not ready (`providerReadiness`).

## The response Digistore24 expects

The connection's **Success validation** setting decides:

- *Default* — the response body must be the text `OK`.
- *HTTP code* — HTTP 200 is enough.

Our route answers JSON, so this connection must be configured as **HTTP
code (expects: 200)**. `connection_test` (the "Test connection" button) is not
an order event, so the parser returns `null` for it and the route answers 200
— which satisfies that setting.

**Digistore24 does retry.** The Generic form's *Retry failed ipn calls*
option: "in case of ipn call errors, the ipn call will retried up to 5 times
with in 2 days." That is the opposite of JVZoo, which does not retry at all,
and it means a 5xx from us is recoverable rather than a lost sale.

`IPN timing` is set to **Before forwarding to the thank you page**, as the
integration guide instructs.

## Events

`event` carries one of these. `event_label` carries the back-office wording.

| `event` | Meaning (documentation's own words, condensed) | What this repo does |
| --- | --- | --- |
| `on_payment` | "The buyer makes a successful payment." | `paid` |
| `on_refund` | A refund "has been successfully processed." | `refunded` |
| `on_chargeback` | "The credit card company processed a chargeback." | `refunded` |
| `on_payment_missed` | A subscription payment is missing; "use this to **temporarily** suspend access". Digistore24 retries and emails the buyer; if every retry fails it sends `last_paid_day`. | ignored — see below |
| `payment_denial` | "The payment was rejected", after the last attempt. | ignored |
| `on_rebill_cancelled` | Sent "immediately when the support clicks the 'stop rebilling' button". The buyer has still paid for the current period. | `cancelled` |
| `on_rebill_resumed` | The buyer asked to continue. "This event does not mean, that a payment has been completed." | ignored |
| `last_paid_day` | "The last paid billing period has ended... Use this event to **permanently revoke** access." | `cancelled` |
| `connection_test` | The "Test connection" button. "The response should always be 'OK'." | ignored (200) |
| `on_affiliation` | A new affiliate was accepted. | ignored |
| `eticket`, `custom form` | Not applicable to our products. | ignored |

`on_payment_missed` is deliberately **ignored** rather than mapped to
`cancelled`. The documentation is explicit that it means a *temporary*
suspension and that "an `on_payment` event may occur if the buyer succeeds in
payment after the `on_payment_missed` event. In that case, access should be
granted again." This repo has no suspend-and-restore state for a marketplace
order — an order is paid, refunded or cancelled — so treating a missed
payment as a cancellation would revoke a plan the buyer may still be paying
for. The permanent form of the same situation arrives as `last_paid_day`,
which is handled. The cost is that access continues for at most one unpaid
retry window, and the gain is that nobody loses a plan they kept.

## Fields this repo reads

From the "Order Events" parameter table. Every one of these is included in
the SHA-512 signature.

| Field | Type | Used as |
| --- | --- | --- |
| `event` | string | which of `paid` / `refunded` / `cancelled`, or ignore |
| `transaction_id` | int | `external_order_id` — "The transaction-ID", unique per transaction |
| `order_id` | string(15) | **not** the idempotency key; "Multiple transactions of the same order have the same order-ID" |
| `product_id` | int | mapped to a plan via `MARKETPLACE_DIGISTORE24_PRODUCT_<PLAN>` |
| `email` | string(63) | buyer email |
| `amount_brutto` | float | gross amount, in major units → minor |
| `currency` | string(3) | ISO-4217 |
| `amount_vat` | float | VAT Digistore24 charged and remits (see below) |
| `next_payment_at` | date | `current_period_end` for a subscription |
| `is_cancelled_for` | date | "the order is cancelled for this date. The product access should stop on this day." Used as the period end when there is no next payment. |
| `api_mode` | string(4) | `live` or `test` |
| `billing_type` | enum | `single_payment`, `subscription`, `installment` |
| `pay_sequence_no` | int | 0 for single payments, otherwise the payment number |

`transaction_id` and not `order_id` is the external order id, and that choice
is what makes `UNIQUE (provider, external_order_id)` correct for a
subscription: month two is a new transaction under the same order, so it has
to become a new row rather than collide with month one. This is the same
problem JVZoo solves by suffixing `-B001` onto its transaction id.

Amounts arrive in **major units** (`37.99`), like JVZoo's `total` and unlike
JVZoo v1's pennies.

## VAT is Digistore24's, and that is the whole point of this channel

`amount_vat` and `vat_rate` arrive populated, and that is **expected and
correct** here, unlike on JVZoo. Digistore24 is the merchant of record
(`sellerOfRecord: true`): it contracts with the buyer, issues the invoice, and
calculates and remits the tax. JVZoo on our own-payment-processor flow is not
— JVZoo support confirmed in writing on 2026-10-30 that the remittance
obligation is ours — which is why a tax figure arriving from **JVZoo** means
the published sales-page sentence may be false and is logged as an error.

So the route's tax-contradiction check is scoped to providers where we are the
seller (`!provider.sellerOfRecord`). Without that scoping, every single
Digistore24 sale would log an error saying our own page is wrong, which would
bury the one case where that is actually true.
