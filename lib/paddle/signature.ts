/**
 * w21 — Paddle webhook signature verification.
 *
 * Header: `Paddle-Signature: ts=<unix seconds>;h1=<hex HMAC-SHA256>` (Paddle
 * may send more than one h1 while a secret is being rotated; any one valid
 * h1 is enough). Signed payload: `${ts}:${rawBody}` with the endpoint's secret
 * key, hex digest — the same construction as Paddle's own SDK
 * (@paddle/paddle-node-sdk WebhooksValidator). Compared in constant time.
 * A timestamp more than 5 minutes away from now (stale or future) is refused,
 * so a captured delivery cannot be replayed later.
 *
 * FAILS CLOSED: no secret, no header, a malformed header, a bad or stale
 * signature all answer { ok: false } and the caller writes nothing.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const PADDLE_SIGNATURE_HEADER = 'paddle-signature'
export const PADDLE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60

export type PaddleSignatureResult =
  | { ok: true; ts: number }
  | { ok: false; reason: 'not_configured' | 'missing_header' | 'malformed_header' | 'stale_timestamp' | 'bad_signature' }

export function parsePaddleSignatureHeader(header: string): { ts: number; h1: string[] } | null {
  let ts: number | null = null
  const h1: string[] = []
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!value) continue
    if (key === 'ts') {
      if (!/^\d{1,12}$/.test(value)) return null
      ts = Number(value)
    } else if (key === 'h1') {
      if (!/^[0-9a-f]{64}$/i.test(value)) continue
      h1.push(value.toLowerCase())
    }
  }
  if (ts === null || h1.length === 0) return null
  return { ts, h1 }
}

export function computePaddleSignature(secret: string, ts: number | string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${ts}:${rawBody}`, 'utf8').digest('hex')
}

export function verifyPaddleSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | null | undefined,
  nowMs: number = Date.now(),
): PaddleSignatureResult {
  if (!secret || !secret.trim()) return { ok: false, reason: 'not_configured' }
  if (!header) return { ok: false, reason: 'missing_header' }
  const parsed = parsePaddleSignatureHeader(header)
  if (!parsed) return { ok: false, reason: 'malformed_header' }
  if (Math.abs(nowMs / 1000 - parsed.ts) > PADDLE_SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: 'stale_timestamp' }
  const expected = Buffer.from(computePaddleSignature(secret, parsed.ts, rawBody), 'hex')
  for (const candidate of parsed.h1) {
    const given = Buffer.from(candidate, 'hex')
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true, ts: parsed.ts }
  }
  return { ok: false, reason: 'bad_signature' }
}
