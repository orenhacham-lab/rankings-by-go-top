'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadProjectSettingsAction } from '@/app/(dashboard)/settings/actions'
import { withDeadline } from '@/lib/active-project/useProjectRow'
import type { LoadErrorCode, LoadResult } from '@/lib/project-settings/data'
import type { SettingsData } from '@/lib/project-settings/types'

/** How long the screen waits for its settings before it shows what it has without them. */
export const SETTINGS_LOAD_DEADLINE_MS = 8_000

export type SettingsState =
  | { status: 'loading' }
  | { status: 'ready'; data: SettingsData }
  | { status: 'failed'; code: LoadErrorCode }

/** One load. An answer that never comes reads as a failed load, so the screen never waits on it forever. */
async function fetchSettings(projectId: string): Promise<LoadResult> {
  return (await withDeadline(loadProjectSettingsAction(projectId), SETTINGS_LOAD_DEADLINE_MS)) ?? { ok: false, code: 'unavailable' }
}

/**
 * The settings screen's data beyond the project row: the profile, the
 * audiences and the state of the site scan. Loaded once per project, reloaded
 * after a scan finishes, and replaced by whatever a save answers.
 *
 * A reload that fails once the screen has data keeps the data it has: a
 * network blip after a scan must not blank four cards the owner is reading.
 * Only the most recent request may write, so a slow load can never overwrite
 * a save that answered after it was sent.
 */
export function useProjectSettings(projectId: string) {
  const [state, setState] = useState<SettingsState>({ status: 'loading' })
  const latest = useRef(0)

  const take = useCallback((mine: number, result: LoadResult) => {
    if (mine !== latest.current) return
    setState((prev) => {
      if (result.ok) return { status: 'ready', data: result.data }
      return prev.status === 'ready' ? prev : { status: 'failed', code: result.code }
    })
  }, [])

  const reload = useCallback(async () => {
    const mine = ++latest.current
    take(mine, await fetchSettings(projectId))
  }, [projectId, take])

  /** A save answered with the fresh data: it wins over any load still in flight. */
  const setData = useCallback((data: SettingsData) => {
    latest.current++
    setState({ status: 'ready', data })
  }, [])

  useEffect(() => {
    const mine = ++latest.current
    void fetchSettings(projectId).then((result) => take(mine, result))
  }, [projectId, take])

  return { state, reload, setData }
}
