import UiNotice, { type NoticeProps } from '@/components/ui/Notice'

export type { NoticeTone } from '@/components/ui/Notice'

/**
 * The settings screen's notice IS the app's notice (components/ui/Notice.tsx,
 * design contract §8): the same tones, lucide icons and close button. It stays
 * here only so the settings components keep their import path.
 */
export default function Notice(props: NoticeProps) {
  return <UiNotice {...props} />
}
