/**
 * The browser's half of the research before sign-up: reading the API's
 * newline-delimited answer, and the run the progress and summary screens
 * render from it. Pure, so it runs under test without a browser.
 */
import type { SeedRunView } from '@/lib/seed-scan/types'
import { RESEARCH_ERROR_CODES, type ResearchErrorCode, type ResearchEvent, type ResearchStepView } from './types'

const TERMINAL = new Set(['done', 'skipped', 'failed'])

/** A code the screen knows, or 'internal' for anything else. */
export function knownResearchCode(v: unknown): ResearchErrorCode {
  return RESEARCH_ERROR_CODES.find((c) => c === v) ?? 'internal'
}

/**
 * Read the answer line by line, calling `onEvent` for each well-formed event.
 * A line that is not one is skipped. Returns once the answer ends.
 */
export async function readResearchStream(body: ReadableStream<Uint8Array>, onEvent: (event: ResearchEvent) => void): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const emit = (line: string) => {
    if (!line.trim()) return
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return
    }
    const type = (parsed as { type?: unknown } | null)?.type
    if (type === 'step' || type === 'result' || type === 'error') onEvent(parsed as ResearchEvent)
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl = buffer.indexOf('\n')
    while (nl >= 0) {
      emit(buffer.slice(0, nl))
      buffer = buffer.slice(nl + 1)
      nl = buffer.indexOf('\n')
    }
  }
  emit(buffer + decoder.decode())
}

/** The run the onboarding screens render, from the research's steps. */
export function researchRun(steps: ResearchStepView[]): SeedRunView {
  const finished = steps.length > 0 && steps.every((s) => TERMINAL.has(s.status))
  return {
    id: 'research',
    trigger: 'create',
    stage: 'a',
    status: finished ? (steps[0]?.status === 'failed' ? 'failed' : 'done') : 'running',
    errorCode: null,
    startedAt: '',
    finishedAt: null,
    stalled: false,
    steps: steps.map((s) => ({ step: s.step, status: s.status, itemCount: s.itemCount, errorCode: s.errorCode, startedAt: null, finishedAt: null })),
    summary: null,
  }
}

/** Replace one step's view in the list, keeping a1-a4's order. */
export function withStep(steps: ResearchStepView[], next: ResearchStepView): ResearchStepView[] {
  const known = steps.some((s) => s.step === next.step)
  return known ? steps.map((s) => (s.step === next.step ? next : s)) : [...steps, next]
}

export const INITIAL_STEPS: ResearchStepView[] = (['a1', 'a2', 'a3', 'a4'] as const).map((step) => ({ step, status: 'pending', errorCode: null, itemCount: null }))
