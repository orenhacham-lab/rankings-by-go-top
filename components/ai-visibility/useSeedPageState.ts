'use client'

/**
 * The seeding scan as the AI-visibility tab needs it: one read of
 * GET /api/projects/[id]/seed (a database read; it starts nothing and calls no
 * model), and more reads only while the scan is still preparing the AI
 * questions, so they appear without a refresh.
 *
 * A read that fails, is refused (the scan's flag off answers 404) or does not
 * answer within SEED_READ_DEADLINE_MS leaves the page on `none`: today's tool,
 * unchanged. The overview is an addition; it never stands between the merchant
 * and the tool.
 */
import { useEffect, useRef, useState } from 'react'
import { readSeedState, shouldPollSeed, type SeedPageState } from './overview-model'

export const SEED_READ_DEADLINE_MS = 5_000
export const SEED_POLL_MS = 8_000
/** About eight minutes of polling at most; a scan that takes longer shows its questions on the next visit. */
export const SEED_POLL_MAX = 60

async function readSeed(projectId: string): Promise<SeedPageState> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEED_READ_DEADLINE_MS)
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/seed`, { cache: 'no-store', signal: controller.signal })
    const body = res.ok ? await res.json().catch(() => null) : null
    return readSeedState(res.status, body)
  } catch {
    return { kind: 'none' }
  } finally {
    clearTimeout(timer)
  }
}

export function useSeedPageState(projectId: string): { state: SeedPageState; questionsArrived: number } {
  const [state, setState] = useState<SeedPageState>({ kind: 'loading' })
  // Bumped each time the scan stops preparing questions, so the tool reloads them.
  const [questionsArrived, setQuestionsArrived] = useState(0)
  const polls = useRef(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    polls.current = 0
    let previous: SeedPageState['kind'] = 'loading'

    const tick = async () => {
      const next = await readSeed(projectId)
      if (cancelled) return
      // A later poll that fails keeps what the first read showed.
      if (previous !== 'loading' && next.kind === 'none') {
        schedule()
        return
      }
      if (previous === 'questions_pending' && next.kind !== 'questions_pending') setQuestionsArrived((n) => n + 1)
      previous = next.kind
      setState(next)
      if (shouldPollSeed(next)) schedule()
    }
    const schedule = () => {
      if (polls.current >= SEED_POLL_MAX) return
      polls.current++
      timer = setTimeout(() => void tick(), SEED_POLL_MS)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [projectId])

  return { state, questionsArrived }
}
