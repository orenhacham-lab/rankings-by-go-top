/** The real text-model call for lib/video-studio/improve.ts. Server-only. The key is never logged. */
import type { ImproveDeps } from './improve'

const MODEL = () => process.env.VIDEO_PROMPT_MODEL?.trim() || 'gemini-3.8-flash'

export const realImproveDeps: ImproveDeps = {
  async callModel(body) {
    const key = process.env.GEMINI_API_KEY?.trim()
    if (!key) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 22_000)
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!res.ok) return null
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || null
    } catch { return null } finally { clearTimeout(timer) }
  },
}
