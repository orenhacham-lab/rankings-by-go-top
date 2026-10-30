# JVZoo JVZIPN webhook documentation (copied from the JVZoo seller account)

Source: JVZoo product editor → Advanced Settings → "JVZIPN v1 / JVZIPN v2 / KeyGen / External Program" → Documentation
URL: https://support.jvzoo.com/hc/en-us/articles/49387230478235-JVZIPN-v2-How-to-Receive-JVZoo-Order-Data-in-Your-Script-Updated-for-Payouts
Captured: 2026-10-29

This is what we need to register the JVZoo provider with a real `signature` verifier
instead of `signature: null`.

## How it works

JVZoo POSTs to the IPN v2 URL configured per product (Advanced Settings → JVZIPN V2 URL).
Content type: `application/x-www-form-urlencoded`. Endpoint must be HTTPS and answer
within 30 seconds. Multiple URLs can be comma-separated.

- Must return HTTP 200 to acknowledge.
- **No retry on failure** — if the endpoint is down the notification is lost.
  Recovery: poll the JVZoo REST API to reconcile, or ask JVZoo support to resend.
- v1 and v2 are independent; either, both or neither can be configured per product.

## Secret key

Set once at account level: My Account → Seller Settings. Same key for v1 and v2;
only the hashing differs (v1 hashes all fields alphabetically, v2 hashes 5 fields).

## Signature verification (v2) — this is the part we are missing

Concatenate these 5 POST fields in this exact order, pipe-separated, with a trailing
pipe after the last one, then append the secret key (no pipe after the secret):

```
paykey|customer_email|product_name|transaction_type|date|<SECRET_KEY>
```

Then: encode UTF-8 → SHA-1 → take the **first 8 hex characters, uppercased**.
Compare against the `cverify` POST field. Reject (403) on mismatch.

Node/TypeScript equivalent of the documented PHP/Python examples:

```ts
import { createHash, timingSafeEqual } from 'node:crypto'

export function verifyJvzooV2(body: Record<string, string>, secret: string): boolean {
  const base = [
    body.paykey ?? '',
    body.customer_email ?? '',
    body.product_name ?? '',
    body.transaction_type ?? '',
    body.date ?? '',
  ].join('|') + '|' + secret

  const calculated = createHash('sha1').update(base, 'utf8').digest('hex').slice(0, 8).toUpperCase()
  const incoming = (body.cverify ?? '').toUpperCase()
  if (calculated.length !== incoming.length) return false
  return timingSafeEqual(Buffer.from(calculated), Buffer.from(incoming))
}
```

Notes that matter for the verifier:
- `date` must be used exactly as received — do not reformat it.
- Verification is mandatory; without it anyone can POST fake transactions.

## Transaction types

| transaction_type | Meaning | Action |
|---|---|---|
| `SALE` | New purchase completed | Grant access |
| `BILL` | Recurring subscription rebilled | Extend access period |
| `RFND` | Refund **or chargeback** | Revoke access |

Optional per-product toggle: "Send DISPUTE and ALERT instead of RFND" — off by default.
Chargebacks and dispute alerts arrive as `RFND` unless it is turned on. Only turn it on
once the handler understands `DISPUTE` and `ALERT`, otherwise chargebacks stop revoking
access.

## POST fields

Amounts are in **dollars** (v1 used pennies).

### Transaction
| Field | Description | Example |
|---|---|---|
| `paykey` | Unique JVZoo payment key | `AP-ABC123XYZ` |
| `prekey` | Pre-approval key (recurring only) | `PRE-XYZ789` |
| `transaction_id` | Receipt number; rebills append `-B001`, `-B002`, … | `ABC123XYZ` |
| `transaction_type` | `SALE`, `BILL` or `RFND` | `SALE` |
| `total` | Amount in dollars | `47.00` |
| `status` | Transaction status | `Completed` |
| `date` | Transaction date (used in verification) | `2024-04-06 14:30:00` |
| `payment_method` | Payment processor code | `PYPL` |
| `cverify` | Verification hash — always validate | `A1B2C3D4` |

### Product
`product_id`, `product_name`, `product_type` (`STANDARD` or `RECURRING`).

### Customer
`customer_email`, `customer_first_name`, `customer_last_name`, `customer_ip`, `customer_phone`.

### Vendor
`vendor_id`, `vendor_name`, `vendor_email`, `paypal_email`.

### Affiliate
`affiliate_id` (0 if none), `affiliate_name`, `affiliate_email`, `tid` (affiliate tracking id),
`other_params` (custom data from the buy link — the v2 equivalent of v1's `cvendthru`).

### Tax & fees
`tax_total`, `vat_tax` (EU VAT), `national_sales_tax`, `international_sales_tax`, `shipping_fee`.

### Recurring (RECURRING products only)
`start_date`, `end_date` (empty if open-ended), `next_payment_date`.

### Delivery address (only when the product collects shipping)
`delivery_name`, `delivery_phone`, `delivery_address_line_1`, `delivery_address_line_2`,
`delivery_city`, `delivery_region`, `delivery_country`, `delivery_postal_code`.

### transactionPayouts
A **JSON-encoded string inside the form body**, present only when payout data exists —
always check before parsing.

```json
[
  { "payee_amount": 33.60, "payee_user_id": 11111, "payee_name": "ACME Corp",  "payout_type": "VENDOR",     "payment_processor": "PayPal", "payout_status": "Settled" },
  { "payee_amount": 9.40,  "payee_user_id": 67890, "payee_name": "Jane Smith", "payout_type": "AFFILIATES", "payment_processor": "PayPal", "payout_status": "Settled" },
  { "payee_amount": 4.00,  "payee_user_id": 1,     "payee_name": "JVZoo",      "payout_type": "JVZOO",      "payment_processor": "JVZoo",  "payout_status": "Settled" }
]
```

## v1 → v2 field map

| v1 | v2 | Note |
|---|---|---|
| `cproditem` | `product_id` | |
| `cprodtitle` | `product_name` | |
| `cprodtype` | `product_type` | |
| `ctransaction` | `transaction_type` | |
| `ctransreceipt` | `transaction_id` | |
| `ctransamount` | `total` | v1 pennies, v2 dollars |
| `ctranspaymentmethod` | `payment_method` | |
| `ctranstime` | `date` | v1 Unix epoch, v2 formatted string |
| `ctransvendor` | `vendor_id` | |
| `ctransaffiliate` | `affiliate_id` | |
| `caffitid` | `tid` | |
| `cvendthru` | `other_params` | |
| `ccustemail` | `customer_email` | |
| `ccustname` | `customer_first_name` + `customer_last_name` | split in v2 |
| — | `transactionPayouts` | new in v2 |

## Other points worth keeping

- Funnel products fire independently — each step sends its own IPN, there is no `funnel_id`.
- Always return HTTP 200; JVZoo emails on failure but does not retry.
