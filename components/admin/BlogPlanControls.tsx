'use client'

/**
 * The operator's controls on the blog queue screen: take a keyword out, put one
 * back, or plan one by hand.
 *
 * It decides nothing. Every refusal is the reason the server gave, shown in
 * Hebrew, so an operator who is told "the keyword is already planned" learns
 * why rather than finding a dead button.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

const REASONS: Record<string, string> = {
  invalid_body: 'הבקשה לא נשלחה כמו שצריך. רעננו את העמוד.',
  missing_id: 'לא מצאנו את השורה. רעננו את העמוד.',
  missing_keyword: 'צריך לכתוב ביטוי.',
  bad_locale: 'שפה לא נתמכת.',
  already_planned_or_failed: 'הביטוי הזה כבר בתור בשפה הזו.',
  unknown_action: 'פעולה לא מוכרת.',
  update_failed: 'הפעולה נכשלה. נסו שוב בעוד רגע.',
}

function useAction() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const call = async (payload: Record<string, unknown>) => {
    setMessage(null)
    setSending(true)
    try {
      const response = await fetch('/api/admin/blog-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (response.ok && body.ok) {
        startTransition(() => router.refresh())
        return true
      }
      setMessage((body.error && REASONS[body.error]) || REASONS.update_failed)
      return false
    } catch {
      setMessage(REASONS.update_failed)
      return false
    } finally {
      setSending(false)
    }
  }

  return { call, busy: sending || pending, message }
}

function Message({ text }: { text: string | null }) {
  if (!text) return null
  return <p role="alert" className="mt-2 text-caption text-bad">{text}</p>
}

export function RowActions({ id, status }: { id: string; status: string }) {
  const { call, busy, message } = useAction()
  const canReject = status === 'planned' || status === 'failed' || status === 'generating'
  const canRestore = status === 'rejected' || status === 'failed'
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canReject && (
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => call({ action: 'reject', id })}>
          הוציאו מהתור
        </Button>
      )}
      {canRestore && (
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => call({ action: 'restore', id })}>
          החזירו לתור
        </Button>
      )}
      <Message text={message} />
    </div>
  )
}

export function AddPlanRow() {
  const { call, busy, message } = useAction()
  const [locale, setLocale] = useState('he')
  const [keyword, setKeyword] = useState('')
  const [topic, setTopic] = useState('')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-32">
          <Select
            label="שפה"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            options={[
              { value: 'he', label: 'עברית' },
              { value: 'en', label: 'אנגלית' },
              { value: 'es', label: 'ספרדית' },
            ]}
          />
        </div>
        <label className="min-w-56 flex-1">
          <span className="block text-caption text-muted">ביטוי מפתח</span>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="מחקר מילות מפתח" />
        </label>
        <label className="min-w-56 flex-1">
          <span className="block text-caption text-muted">זווית המאמר (לא חובה)</span>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="איך לבחור ביטוי לפני שכותבים" />
        </label>
        <Button
          type="button"
          disabled={busy || !keyword.trim()}
          onClick={async () => {
            const ok = await call({ action: 'add', locale, primary_keyword: keyword, topic })
            if (ok) { setKeyword(''); setTopic('') }
          }}
        >
          הוסיפו לתור
        </Button>
      </div>
      <Message text={message} />
    </div>
  )
}
