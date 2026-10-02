'use client'

import { Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import type { SaveErrorCode } from '@/lib/project-settings/types'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

export type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; code: SaveErrorCode }

/**
 * A card's footer: what is unsaved, saved or wrong on the one side, and the
 * card's own discard and save on the other. The save button is there only
 * while there is something to save (UX review P1-19: with a disabled save on
 * every card's sticky footer, two or three "save" buttons showed at once and
 * none said which card it saved). A card shows this bar only while it has
 * something to say: see `showSaveBar`.
 */
export function showSaveBar(dirty: boolean, state: SaveState): boolean {
  return dirty || state.kind !== 'idle'
}

export default function SaveBar({
  dirty,
  state,
  note,
  onSave,
  onDiscard,
  t,
}: {
  dirty: boolean
  state: SaveState
  /** Replaces "unsaved changes" while dirty, e.g. after AI suggestions were put into the form. */
  note?: string | null
  onSave: () => void
  onDiscard: () => void
  t: DashboardDictionary['projectSettings']
}) {
  const saving = state.kind === 'saving'
  return (
    <>
      <p className="min-w-0 flex-1 basis-48 text-caption" aria-live="polite" data-dirty={dirty || undefined}>
        {state.kind === 'error' ? (
          <span role="alert" className="font-medium text-bad">{t.save.errors[state.code]}</span>
        ) : dirty ? (
          <span className="inline-flex items-center gap-2 font-semibold text-ink">
            <span aria-hidden className="size-2 shrink-0 rounded-pill bg-action" />
            {note || t.save.dirty}
          </span>
        ) : state.kind === 'saved' ? (
          <span className="inline-flex items-center gap-1 font-medium text-ok animate-pop-in">
            <Check aria-hidden className="size-4" />
            {t.save.saved}
          </span>
        ) : null}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {dirty && !saving && (
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            {t.save.discard}
          </Button>
        )}
        {(dirty || saving) && (
          <Button size="sm" onClick={onSave} disabled={!dirty} loading={saving}>
            {saving ? t.save.saving : t.save.save}
          </Button>
        )}
      </div>
    </>
  )
}
