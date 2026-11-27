'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ImagePlus, Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VideoUiCopy } from '@/lib/video-studio/copy-ui'

export interface Photo { id: number; data: string; mimeType: 'image/jpeg'; preview: string }

/** A numbered step: the number sits in a round chip so the page reads as one short path. */
export function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4" aria-labelledby={`vs-step-${n}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-contrast text-caption font-bold text-contrast-ink">{n}</span>
        <div className="min-w-0">
          <h2 id={`vs-step-${n}`} className="text-lead font-bold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-copy text-muted">{hint}</p>}
        </div>
      </div>
      <div className="ps-10">{children}</div>
    </section>
  )
}

/** Drop zone and thumbnail strip. The first photo is the cover; any other can be made the cover. */
export function PhotoDrop({ photos, max, copy, onFiles, onRemove, onCover, unreadable }: {
  photos: Photo[]; max: number; copy: VideoUiCopy
  onFiles: (files: FileList | File[]) => void; onRemove: (id: number) => void; onCover: (id: number) => void; unreadable: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const full = photos.length >= max
  return (
    <div className="space-y-3">
      {!full && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files) }}
          className={cn(
            'group flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 text-center transition-[border-color,background-color] duration-200 ease-snappy',
            photos.length ? 'py-5' : 'py-10',
            over ? 'border-action bg-action-soft' : 'border-line-strong bg-sunk/50 hover:border-action hover:bg-action-soft',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          )}
        >
          <span className="inline-flex size-11 items-center justify-center rounded-pill bg-surface text-action shadow-control transition-transform duration-200 ease-snappy group-hover:-translate-y-0.5"><ImagePlus className="size-5" aria-hidden="true" /></span>
          <span className="text-copy font-semibold text-ink">{copy.dropTitle}</span>
          {!photos.length && <span className="max-w-md text-caption text-muted">{copy.dropHint}</span>}
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = '' }} />
      {unreadable && <p className="text-caption text-warn" role="status">{copy.photoUnreadable}</p>}
      {photos.length > 0 && (
        <>
          <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
            {photos.map((p, i) => (
              <li key={p.id} className={cn('group relative aspect-square overflow-hidden rounded-inset bg-sunk ring-1 ring-line', i === 0 && 'ring-2 ring-action')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="" className="size-full object-cover" />
                {i === 0 && <span className="absolute start-1.5 top-1.5 inline-flex items-center gap-1 rounded-pill bg-action px-2 py-0.5 text-[11px] font-semibold text-action-ink"><Star className="size-3" aria-hidden="true" />{copy.cover}</span>}
                <button type="button" onClick={() => onRemove(p.id)} aria-label={copy.removePhoto(i + 1)}
                  className="absolute end-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-pill bg-contrast/75 text-contrast-ink opacity-100 transition-opacity hover:bg-contrast sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
                  <X className="size-3.5" aria-hidden="true" />
                </button>
                {i > 0 && (
                  <button type="button" onClick={() => onCover(p.id)}
                    className="absolute inset-x-0 bottom-0 bg-contrast/70 py-1 text-[11px] font-semibold text-contrast-ink opacity-100 transition-opacity hover:bg-contrast sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
                    {copy.makeCover}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-caption text-muted tabular-nums">{copy.photoCounter(photos.length, max)}</p>
        </>
      )}
    </div>
  )
}

/** One choice out of a few, as wrapping pills. `null` is "Auto". */
export function Chips<T extends string>({ label, value, onChange, options, auto }: {
  label: string; value: T | null; onChange: (v: T | null) => void; options: { value: T; label: string }[]; auto: string
}) {
  const all: { value: T | null; label: string }[] = [{ value: null, label: auto }, ...options]
  return (
    <div className="space-y-2">
      <p className="text-caption font-semibold text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {all.map((o) => {
          const on = o.value === value
          return (
            <button key={o.value ?? 'auto'} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
              className={cn(
                'h-9 rounded-pill border px-3.5 text-copy font-medium transition-[background-color,border-color,color] duration-150 ease-snappy active:scale-[0.97]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                on ? 'border-action bg-action-soft text-action' : 'border-line bg-surface text-body hover:border-line-strong hover:text-ink',
              )}>
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A large selectable card (goal, length, format). */
export function ChoiceCard({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      className={cn(
        'rounded-card border p-4 text-start transition-[background-color,border-color,box-shadow] duration-150 ease-snappy active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        on ? 'border-action bg-action-soft shadow-control' : 'border-line bg-surface hover:border-line-strong',
        className,
      )}>
      {children}
    </button>
  )
}
