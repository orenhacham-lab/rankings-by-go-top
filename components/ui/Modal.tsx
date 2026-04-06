'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [open])

  // Backdrop click — detect click outside the dialog box
  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current
    if (!dialog) return
    const rect = dialog.getBoundingClientRect()
    const outsideDialog =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    if (outsideDialog) onClose()
  }

  // Escape key: intercept the native cancel event and delegate to onClose.
  // We prevent default so the dialog doesn't close itself (our useEffect handles it),
  // avoiding the double-fire that would occur if we let the native close proceed
  // while also having our own state update in flight.
  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleDialogClick}
      onCancel={handleCancel}
      // No onClose binding here — we manage state ourselves
      className={cn(
        'rounded-xl shadow-2xl border border-slate-200 p-0 m-auto',
        // Backdrop styled via globals.css (dialog::backdrop)
        'backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm',
        {
          'w-full max-w-sm': size === 'sm',
          'w-full max-w-lg': size === 'md',
          'w-full max-w-2xl': size === 'lg',
          'w-full max-w-4xl': size === 'xl',
        }
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-sm leading-none"
          aria-label="סגור"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="p-5">{children}</div>
    </dialog>
  )
}
