import { after } from 'next/server'

/**
 * Run best-effort work once the response has been sent, so it can never slow or
 * fail the request that triggered it. Outside a request scope (where `after`
 * throws) the work simply starts detached; either way its failure is swallowed.
 */
export function runAfterResponse(work: () => Promise<unknown>): void {
  const safe = async () => {
    try { await work() } catch { /* alerts are best-effort */ }
  }
  try {
    after(safe)
  } catch {
    void safe()
  }
}
