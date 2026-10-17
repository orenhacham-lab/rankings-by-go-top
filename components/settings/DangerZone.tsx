'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Power, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import DeleteConfirmDialog, { type DeleteConfirmLabels } from '@/components/ui/DeleteConfirmDialog'
import { deleteProjectAction, toggleProjectActiveAction } from '@/app/actions/projects'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { fill } from '@/lib/project-settings/view'
import type { Project } from '@/lib/supabase/types'
import SettingsCard from './SettingsCard'
import { SECTION } from './anchors'

type Copy = DashboardDictionary['projectSettings']

/**
 * Row 12: deactivating and deleting the project, moved here from the projects
 * list with the same actions (app/actions/projects.ts) and, for the delete, the
 * same confirmation dialog and copy. Nothing new decides what a delete removes.
 *
 * Either way the project leaves the workspace switcher, so the owner lands on
 * the projects list, where a deactivated project can be switched back on.
 */
export default function DangerZone({
  project,
  deleteLabels,
  t,
}: {
  project: Project
  deleteLabels: DeleteConfirmLabels
  t: Copy
}) {
  const router = useRouter()
  const { reloadProjects } = useActiveProject()
  const [confirm, setConfirm] = useState<'deactivate' | 'delete' | null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [failed, setFailed] = useState(false)

  const leave = () => {
    reloadProjects()
    router.push('/projects')
  }

  async function deactivate() {
    if (deactivating) return
    setDeactivating(true)
    setFailed(false)
    try {
      // `true` is the state it is switched FROM: this always switches it off.
      await toggleProjectActiveAction(project.id, true)
      setConfirm(null)
      leave()
    } catch {
      setFailed(true)
    } finally {
      setDeactivating(false)
    }
  }

  const closeDeactivate = () => {
    if (deactivating) return
    setFailed(false)
    setConfirm(null)
  }

  return (
    <SettingsCard id={SECTION.danger} icon={AlertTriangle} tone="danger" title={t.danger.title} description={t.danger.body}>
      <div className="divide-y divide-line">
        <div className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="text-copy font-semibold text-ink">{t.danger.deactivateTitle}</p>
            <p className="mt-0.5 text-copy text-muted">{t.danger.deactivateBody}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setConfirm('deactivate')} className="shrink-0 self-start sm:self-auto">
            <Power aria-hidden className="size-4" />
            {t.danger.deactivate}
          </Button>
        </div>
        <div className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="text-copy font-semibold text-ink">{t.danger.deleteTitle}</p>
            <p className="mt-0.5 text-copy text-muted">{t.danger.deleteBody}</p>
          </div>
          {/* A ghost in the bad tone: the filled red button belongs to the confirmation dialog, not the page. */}
          <Button variant="ghost" size="sm" onClick={() => setConfirm('delete')} className="shrink-0 self-start text-bad hover:bg-bad-soft hover:text-bad sm:self-auto">
            <Trash2 aria-hidden className="size-4" />
            {t.danger.delete}
          </Button>
        </div>
      </div>

      <Modal open={confirm === 'deactivate'} onClose={closeDeactivate} title={t.danger.deactivateConfirmTitle} size="sm">
        <p className="text-copy text-body">{fill(t.danger.deactivateConfirmBody, { name: project.name })}</p>
        {failed && (
          <p role="alert" className="mt-3 text-copy text-bad">
            {t.danger.deactivateError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={closeDeactivate} disabled={deactivating}>
            {t.danger.cancel}
          </Button>
          <Button onClick={() => void deactivate()} loading={deactivating}>
            {deactivating ? t.danger.deactivating : t.danger.deactivateConfirm}
          </Button>
        </div>
      </Modal>

      <DeleteConfirmDialog
        open={confirm === 'delete'}
        name={project.name}
        labels={deleteLabels}
        onConfirm={() => deleteProjectAction(project.id)}
        onClose={() => setConfirm(null)}
        onDeleted={leave}
      />
    </SettingsCard>
  )
}
