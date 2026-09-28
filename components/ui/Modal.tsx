'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  // The close control's accessible name was the hard-coded Hebrew "סגור", so an
  // English dashboard announced a Hebrew word to a screen reader — the same
  // defect as a Hebrew label, just only audible. Every Modal call site is inside
  // the dashboard provider, so the resolved language is available here.
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
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
        'rounded-card shadow-pop border border-line p-0 m-auto bg-surface text-body max-w-[calc(100vw-2rem)] open:animate-pop-in',
        // The backdrop is the one `backdrop` token (globals.css), dimmer in dark mode.
        'backdrop:bg-backdrop backdrop:backdrop-blur-[3px]',
        {
          'w-full max-w-sm': size === 'sm',
          'w-full max-w-lg': size === 'md',
          'w-full max-w-2xl': size === 'lg',
          'w-full max-w-4xl': size === 'xl',
        }
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4 border-b border-line">
        <h2 className="text-section font-semibold text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="-me-2 size-8 shrink-0 flex items-center justify-center rounded-control text-muted hover:text-ink hover:bg-sunk transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
          aria-label={dict.common.close}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="px-6 py-5">{children}</div>
    </dialog>
  )
}
