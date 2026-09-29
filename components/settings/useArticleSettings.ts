'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadArticleStyleAction, readSiteSignalsAction } from '@/app/(dashboard)/settings/article-style-actions'
import { withDeadline } from '@/lib/active-project/useProjectRow'
import type { ArticleStyleView } from '@/lib/content/article-style/data'
import type { SampledColor } from '@/lib/content/article-style/colors'
import type { OfficialProfiles } from '@/lib/content/article-style/profiles'

export type ArticleSettingsState = { status: 'loading' } | { status: 'ready'; data: ArticleStyleView } | { status: 'failed' }
export type SiteSignals =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'ready'; colors: SampledColor[]; profiles: OfficialProfiles }
  | { status: 'failed' }

/**
 * The article-design and official-profiles cards' shared data: the project's
 * saved settings (one load), and what its home page says (its colours and the
 * profiles it links to), read once for both cards: automatically when the
 * owner has neither colours nor profiles yet, and again on "read from site".
 */
export function useArticleSettings(projectId: string) {
  const [state, setState] = useState<ArticleSettingsState>({ status: 'loading' })
  const [signals, setSignals] = useState<SiteSignals>({ status: 'idle' })
  const latest = useRef(0)
  const autoRead = useRef(false)

  const load = useCallback((): Promise<void> => {
    const mine = ++latest.current
    return withDeadline(loadArticleStyleAction(projectId), 8_000).then((res) => {
      if (mine !== latest.current) return
      setState((prev) => (res?.ok ? { status: 'ready', data: res.data } : prev.status === 'ready' ? prev : { status: 'failed' }))
    })
  }, [projectId])
  const reload = useCallback(() => {
    setState((prev) => (prev.status === 'failed' ? { status: 'loading' } : prev))
    return load()
  }, [load])

  const setData = useCallback((data: ArticleStyleView) => {
    latest.current++
    setState({ status: 'ready', data })
  }, [])

  const fetchSignals = useCallback(
    (): Promise<SiteSignals> =>
      withDeadline(readSiteSignalsAction(projectId), 20_000).then((res) =>
        res?.ok ? { status: 'ready', colors: res.colors, profiles: res.profiles } : { status: 'failed' }),
    [projectId],
  )
  const readSignals = useCallback(() => {
    setSignals({ status: 'reading' })
    void fetchSignals().then(setSignals)
  }, [fetchSignals])

  useEffect(() => { void load() }, [load])

  // Read the site by itself once, when the owner has neither colours nor profiles yet.
  const wantsAutoRead = state.status === 'ready' && state.data.editable && !!state.data.domain &&
    (state.data.style.brandColors.length === 0 || Object.keys(state.data.profiles).length === 0)
  useEffect(() => {
    if (!wantsAutoRead || autoRead.current) return
    autoRead.current = true
    void fetchSignals().then(setSignals)
  }, [wantsAutoRead, fetchSignals])

  // While that first read runs, the cards show it as reading.
  const shown: SiteSignals = signals.status === 'idle' && wantsAutoRead ? { status: 'reading' } : signals

  return { state, reload, setData, signals: shown, readSignals }
}
