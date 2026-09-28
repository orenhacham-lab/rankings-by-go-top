'use client'

/**
 * What the content strategy tab reads, and nothing else. Three GETs, all read-only,
 * none of which calls a model or a third party, so opening the tab costs nothing:
 *
 *   /api/content/strategy              ideas, topics and articles (this tab's route)
 *   /api/content/automation/pools      the publishing queue with its projected slots;
 *                                      404 when automation is off, which reads as no queue
 *   /api/projects/[id]/seed            the seeding scan; 404 when the feature is off for
 *                                      this account, which reads as "no scan" (and means
 *                                      the mapping cannot be offered here either)
 *
 * While the scan is still building the plan, only the scan is asked again, every
 * POLL_MS; the moment its plan is ready the board is read again once.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  NO_SEED_PLAN, seedPlanFromRun,
  type SeedPlan, type SeedRunLike, type StrategyData, type StrategyQueueItem,
} from '@/lib/content/strategy/board'

export const STRATEGY_ENDPOINTS = {
  board: (projectId: string) => `/api/content/strategy?projectId=${encodeURIComponent(projectId)}`,
  queue: (projectId: string) => `/api/content/automation/pools?projectId=${encodeURIComponent(projectId)}`,
  seed: (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/seed`,
} as const

const POLL_MS = 20_000

export type StrategyLoad = {
  status: 'loading' | 'ready' | 'error'
  data: StrategyData | null
  queue: StrategyQueueItem[] | null
  seed: SeedPlan
  /** The scan's route answered: the mapping can be offered for this project (its flag, or an admin). */
  mappingAvailable: boolean
  reload: () => void
}

async function readJson(url: string): Promise<{ ok: boolean; body: unknown }> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, body }
}

function readQueue(body: unknown): StrategyQueueItem[] | null {
  const items = body && typeof body === 'object' ? (body as { items?: unknown }).items : null
  if (!Array.isArray(items)) return null
  return items.flatMap((raw): StrategyQueueItem[] => {
    if (!raw || typeof raw !== 'object') return []
    const r = raw as Record<string, unknown>
    if (typeof r.id !== 'string' || typeof r.status !== 'string') return []
    return [{
      id: r.id,
      topicId: typeof r.topicId === 'string' ? r.topicId : null,
      articleId: typeof r.articleId === 'string' ? r.articleId : null,
      status: r.status,
      position: typeof r.position === 'number' ? r.position : 0,
      projectedPublishAt: typeof r.projectedPublishAt === 'string' ? r.projectedPublishAt : null,
      topicTitle: typeof r.topicTitle === 'string' ? r.topicTitle : null,
    }]
  })
}

function readSeed(ok: boolean, body: unknown): SeedPlan {
  if (!ok || !body || typeof body !== 'object') return NO_SEED_PLAN
  const run = (body as { run?: unknown }).run
  return run && typeof run === 'object' ? seedPlanFromRun(run as SeedRunLike) : NO_SEED_PLAN
}

function readBoard(ok: boolean, body: unknown): StrategyData | null {
  if (!ok || !body || typeof body !== 'object') return null
  const b = body as Partial<StrategyData> & { ok?: unknown }
  if (b.ok !== true || !Array.isArray(b.ideas) || !Array.isArray(b.topics) || !Array.isArray(b.articles)) return null
  return { ideas: b.ideas, topics: b.topics, articles: b.articles }
}

/**
 * @param refreshKey changes whenever the workspace reloads its topics, articles or
 *   queue (an approval, a generation, a publish), so the board follows every control
 *   of the list view without a second source of truth.
 */
export function useStrategyData(projectId: string, refreshKey: unknown): StrategyLoad {
  // Tagged with the project it belongs to: a new project reads as loading until its own
  // answer lands, so the previous project's plan is never shown under the new one.
  const [state, setState] = useState<Omit<StrategyLoad, 'reload'> & { projectId: string }>({ projectId: '', status: 'loading', data: null, queue: null, seed: NO_SEED_PLAN, mappingAvailable: false })
  const request = useRef(0)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!projectId) return
    const mine = ++request.current
    // A burst of workspace reloads (focus refetches both lists) becomes one read.
    const timer = window.setTimeout(async () => {
      try {
        const [board, queue, seed] = await Promise.all([
          readJson(STRATEGY_ENDPOINTS.board(projectId)),
          readJson(STRATEGY_ENDPOINTS.queue(projectId)).catch(() => ({ ok: false, body: null })),
          readJson(STRATEGY_ENDPOINTS.seed(projectId)).catch(() => ({ ok: false, body: null })),
        ])
        if (mine !== request.current) return
        const data = readBoard(board.ok, board.body)
        setState((prev) => ({
          projectId,
          status: data ? 'ready' : 'error',
          // A failed refresh keeps what was already on screen, for the same project.
          data: data ?? (prev.projectId === projectId ? prev.data : null),
          queue: queue.ok ? readQueue(queue.body) : null,
          seed: readSeed(seed.ok, seed.body),
          mappingAvailable: seed.ok && !!seed.body && typeof seed.body === 'object' && (seed.body as { ok?: unknown }).ok === true,
        }))
      } catch {
        if (mine === request.current) {
          setState((prev) => (prev.projectId === projectId && prev.data
            ? { ...prev, status: 'ready' }
            : { projectId, status: 'error', data: null, queue: null, seed: NO_SEED_PLAN, mappingAvailable: false }))
        }
      }
    }, 120)
    return () => window.clearTimeout(timer)
  }, [projectId, refreshKey, tick])

  // The plan is being built: ask the scan again until it is ready, then read the board once.
  const current = state.projectId === projectId
  const building = current && state.seed.state === 'building'
  useEffect(() => {
    if (!projectId || !building) return
    const id = window.setInterval(async () => {
      try {
        const seed = await readJson(STRATEGY_ENDPOINTS.seed(projectId))
        const next = readSeed(seed.ok, seed.body)
        if (next.state !== 'building') reload()
        else setState((prev) => (prev.projectId === projectId ? { ...prev, seed: next } : prev))
      } catch { /* the next tick tries again */ }
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [projectId, building, reload])

  if (!current) return { status: 'loading', data: null, queue: null, seed: NO_SEED_PLAN, mappingAvailable: false, reload }
  return { status: state.status, data: state.data, queue: state.queue, seed: state.seed, mappingAvailable: state.mappingAvailable, reload }
}
