# ClickBank Instant Notification Service (INS) — from ClickBank's own page

Source, fetched directly on 2026-11-07, public and needing no seller account:
`https://support.clickbank.com/en/articles/10535147-instant-notification-service`
("Instant Notification Service (INS)", ClickBank Support, article dated
April 14, 2025).

`support.clickbank.com` IS reachable from a cloud session with plain curl.
`www.clickbank.com`, `accounts.clickbank.com` and `api.clickbank.com` all
answer 403 to a datacenter IP, which is why this looked unreachable before —
the same mistake made with jvzoo.com and digistore24.com. Re-test a vendor
host before believing it is blocked.

## What INS is, and what authenticates it

INS posts a notification to a URL the vendor sets, for every transaction on
the account. The current version is **8.0**.

The body is **not** signed. It is **encrypted**, and decryption is the whole
authentication:

> "ClickBank uses the CBC-AES-256 encryption algorithm to secure the payload
> of the notification. This helps prevent customer information from being
> passed in clear text, and allows the receiver of the notification to know
> that the message originated from ClickBank and was not altered during
> delivery. The notification is encrypted using a secret key, of up to 16
> characters, and an initialization vector."

> "The initial JSON message contains a string representation of the encrypted
> notification, and the initialization vector which you can use in parallel
> with your ClickBank secret key to decrypt the notification."

Their PHP sample states the consequence plainly: "If the decoding of the JSON
string wasn't successful, then you can assume the notification wasn't
encrypted with your secret key."

## The exact algorithm, from their own code samples

The outer body is JSON with two base64 fields:

```json
{ "notification": "<base64 ciphertext>", "iv": "<base64 initialization vector>" }
```

and the key is **not** the secret itself:

```
key = hex( SHA-1( secretKey ) ).slice(0, 32)        // 32 ASCII characters, used as the AES-256 key
plaintext = AES-256-CBC-decrypt( base64decode(notification), key, base64decode(iv) )  // PKCS#5/7 padding
```

Their four samples agree character for character on this. PHP:

```php
$decrypted = trim(openssl_decrypt(base64_decode($encrypted), 'AES-256-CBC',
  substr(sha1($secretKey), 0, 32), OPENSSL_RAW_DATA, base64_decode($iv)), "\0..\32");
```

Java: `new String(Hex.encodeHex(sha1.digest(secretKey))).substring(0, 32)` as
an `AES` `SecretKeySpec`, `AES/CBC/PKCS5Padding`. Ruby:
`Digest::SHA1.hexdigest(secret).slice(0, 32)`. Python: `sha1.hexdigest()[:32]`.

**The 32 characters are the HEX DIGITS, used as text.** `sha1()` returns 40
hex characters and the first 32 of them are the key's bytes — not the first 16
bytes of the raw digest. Getting this wrong decrypts nothing.

Their note, kept because it is a real limit: the samples "will fail if your
character set includes German, Greek, Eastern European, or Asian characters.
You must perform your own encoding before decrypting."

## Transaction types

`transactionType` in the decrypted body. The ones that mean money moved:

- `SALE` — purchase of a standard product, or the FIRST payment of a recurring one.
- `BILL` — a rebill for a recurring product.
- `RFND` — a refund. A refunded recurring product ALSO produces `CANCEL-REBILL`.
- `CGBK` — a chargeback. `INSF` is the eCheck equivalent.

And the ones that do not: `CANCEL-REBILL`, `UNCANCEL-REBILL`,
`SUBSCRIPTION-CHG`, `ABANDONED_ORDER`, `CUSTOMER_AUTH_FAILURE`,
`CUSTOMER_EMAIL_UPDATE`, `CUSTOMER_UPDATE_CC_NOTIFICATION`,
`PURCHASE_DETAILS_EMAIL_RESPONSE`, and the test family `TEST`, `TEST_SALE`,
`TEST_BILL`, `TEST_RFND`, `CANCEL-TEST-REBILL`, `UNCANCEL-TEST-REBILL`.

Their note: "Notifications for test transactions are only sent to the seller."

## The fields this repo reads

Header: `transactionTime` (ISO 8601), `receipt` (ClickBank receipt id, 8-21
characters), `transactionType`, `vendor`, `role`, `totalOrderAmount`,
`totalTaxAmount`, `currency`, `version`.

Line items, in `lineItems[]`: `itemNo` (**the product SKU**, which is what
maps a delivery to a plan), `productTitle`, `recurring`, `accountAmount`,
`taxAmount`.

Customer: `customer.billing.email` and `customer.shipping.email`.

**THERE IS NO NEXT-PAYMENT DATE IN VERSION 8.** The legacy v2 parameter list
has `cnextpaymentdate` ("Date of next payment (epoch time)"), and v8 dropped
it: a v8 line item says only `recurring: true|false`. So a ClickBank delivery
cannot tell us when the paid period ends, and this repo stores
`current_period_end` as null rather than inventing a date a month out. The
consequence is stated where it lands: such an order is recorded and mailed,
and its claim stops at `needs_operator / period_end_unknown` until a person
grants it. Removing that step needs the Orders API
(`api.clickbank.com`, a developer key from the account), which is follow-up
work and not a guess to be made here.

## Response code monitoring — they DO retry

> "If we receive a response code in the 200 range within 3 seconds, the
> notification delivery is considered successful."
>
> "If the response code is not in the 200 range, we attempt to resend the
> notification once every four hours. After a max of five failed attempts, it
> will no longer attempt to deliver the information. There is no way to
> resend the instant notification once it has reached the max attempts."

Two things follow. **Three seconds** is the budget, so the route answers
before it does anything slow — the claim email already goes in `after()`.
And unlike JVZoo, which never retries, a 5xx here is genuinely retryable:
five attempts over twenty hours, then the notification is gone for good.
The acknowledgement is an ordinary JSON body; nothing in their page asks for
literal text, which is Digistore24's requirement alone.

## Setting it up in the account

Secret Key and the notification URL live in the account's Advanced Tools; the
URL has to be tested from that screen before it is enabled, and the key is up
to 16 characters that the vendor chooses. Both are the account owner's to
enter — this repo only needs `MARKETPLACE_CLICKBANK_WEBHOOK_SECRET` to hold
the same value.
