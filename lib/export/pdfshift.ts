/**
 * HTML to PDF, through PDFShift — the one step of a download that leaves the
 * process. PDFShift is already how the ranking report is produced
 * (app/api/reports/export-pdf) and is named as a sub-processor in both privacy
 * policies; this is the same call, in one place, so a second download does not
 * copy it.
 *
 * It answers null for everything a caller can do nothing about: no API key, a
 * refusal, a network failure. The caller's route then returns its own stable
 * code — a merchant is never shown a provider's message.
 *
 * The API key is read from the environment at call time and never logged.
 *
 * A document with Japanese text in it gets a Japanese face declared first
 * (lib/export/cjk-font.ts): PDFShift's renderer has no Japanese glyph in the
 * Latin stack these documents ask for, and a missing glyph is a printed box.
 */
import { withJapaneseFont } from './cjk-font'
const ENDPOINT = 'https://api.pdfshift.io/v3/convert/pdf'

export async function renderPdfFromHtml(html: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.PDFSHIFT_API_KEY
  if (!apiKey) {
    console.error('[pdfshift] PDFSHIFT_API_KEY is not set')
    return null
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      // Never log the headers: they carry the API key.
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: withJapaneseFont(html), landscape: false }),
    })
    if (!res.ok) {
      console.error('[pdfshift] refused', { status: res.status, bytes: html.length })
      return null
    }
    return await res.arrayBuffer()
  } catch (e) {
    console.error('[pdfshift] failed', (e as Error).message)
    return null
  }
}
