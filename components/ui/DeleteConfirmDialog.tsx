'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

/**
 * Area I — reusable permanent-delete confirmation. Shows the EXACT record name,
 * prevents double-submission (the confirm handler is guarded and disabled while
 * running), and shows a clear result: on success it refreshes + closes; on failure
 * it surfaces the error inline and re-enables. Deletion is irreversible — visually
 * distinct (danger) from the reversible deactivate action.
 */
export interface DeleteConfirmLabels {
  title: string
  /** Body copy; the literal token {name} is replaced with the record name. */
  body: string
  confirm: string
  cancel: string
  deleting: string
  error: string
}

export default function DeleteConfirmDialog({
  open,
  name,
  labels,
  onConfirm,
  onClose,
  onDeleted,
}: {
  open: boolean
  name: string
  labels: DeleteConfirmLabels
  onConfirm: () => Promise<{ ok: boolean }>
  onClose: () => void
  onDeleted: () => void | Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleConfirm() {
    if (deleting) return // prevent double-submission
    setDeleting(true)
    setFailed(false)
    try {
      const res = await onConfirm()
      if (res.ok) {
        await onDeleted()
        onClose()
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    } finally {
      setDeleting(false)
    }
  }

  function handleClose() {
    if (deleting) return // don't allow closing mid-delete
    setFailed(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title={labels.title} size="sm">
      <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
        {labels.body.replace('{name}', name)}
      </p>

      {failed && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {labels.error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={handleClose} disabled={deleting}>
          {labels.cancel}
        </Button>
        <Button variant="danger" onClick={handleConfirm} loading={deleting} disabled={deleting}>
          {deleting ? labels.deleting : labels.confirm}
        </Button>
      </div>
    </Modal>
  )
}
