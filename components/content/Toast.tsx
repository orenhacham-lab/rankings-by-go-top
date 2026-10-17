'use client'

// The content module's toasts ARE the shell's toasts (design contract §8): one
// look, one timing, one aria-live region. Kept as a path so existing imports work.
export * from '@/components/ui/Toast'
