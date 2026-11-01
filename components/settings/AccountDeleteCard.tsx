'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserX } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { fill } from '@/lib/project-settings/view'
import SettingsCard, { fieldClass } from './SettingsCard'
import { SECTION } from './anchors'

type Copy = DashboardDictionary['projectSettings']['account']

/** Exactly the codes POST /api/account/delete answers with. Nothing else is shown. */
const REFUSALS = [
  'not_signed_in',
  'confirmation_mismatch',
  'subscription_active',
  'admin_account',
  'storage_incomplete',
  'delete_failed',
] as const
type Refusal = (typeof REFUSALS)[number]
const isRefusal = (v: unknown): v is Refusal => typeof v === 'string' && (REFUSALS as readonly string[]).includes(v)

/**
 * The last card on the settings screen: deleting the ACCOUNT, not a project.
 *
 * Until now the only way out was to delete each project by hand and leave the
 * login behind, while the privacy policy promised erasure (GDPR Art. 17). This is
 * where a merchant exercises it themselves.
 *
 * It sits under the project danger zone deliberately: the one thing a reader must
 * not confuse is "this site" with "everything". So the card names the account's
 * email address, and the confirmation is that address typed out — a dialog whose
 * primary button is one click away from erasing every project is not a dialog this
 * belongs in.
 *
 * Every refusal the route can answer with has its own sentence here, because each
 * one has a different next step: cancel the subscription first, try again, or (the
 * operator account) nothing at all. The route never returns provider text, and
 * this card never renders anything but the sentences below.
 */
export default function AccountDeleteCard({ t }: { t: Copy }) {
  const router = useRouter()
  const ids = useId()
  const [email, setEmail] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<Refusal | 'unknown' | null>(null)

  // The address the route will compare against, read from the session itself so
  // the two can never disagree.
  useEffect(() => {
    let cancelled = false
    void createClient().auth.getUser().then(({ data }) => {
      if (!cancelled) setEmail(data.user?.email ?? null)
    })
    return () => { cancelled = true }
  }, [])

  const matches = !!email && typed.trim().toLowerCase() === email.trim().toLowerCase()

  const close = () => {
    if (working) return
    setTyped('')
    setError(null)
    setOpen(false)
  }

  async function run() {
    if (working || !matches) return
    setWorking(true)
    setError(null)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      })
      if (res.ok) {
        // The account is gone and the route cleared the session. `refresh()` after
        // the navigation drops every cached server render of the dashboard, so no
        // screen of a deleted account is left behind in the client's cache.
        router.replace('/login')
        router.refresh()
        return
      }
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null
      setError(isRefusal(body?.error) ? body.error : 'unknown')
    } catch {
      setError('unknown')
    } finally {
      setWorking(false)
    }
  }

  return (
    <SettingsCard id={SECTION.account} icon={UserX} tone="danger" title={t.title} description={t.body}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <p className="text-copy font-semibold text-ink">{t.deleteTitle}</p>
          <p className="mt-0.5 text-copy text-muted">{t.deleteBody}</p>
          <p className="mt-1.5 text-copy text-muted">{t.externalNote}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="shrink-0 self-start text-bad hover:bg-bad-soft hover:text-bad sm:self-auto"
        >
          <UserX aria-hidden className="size-4" />
          {t.delete}
        </Button>
      </div>

      <Modal open={open} onClose={close} title={t.confirmTitle} size="sm">
        <p className="text-copy text-body whitespace-pre-line">{t.confirmBody}</p>
        <label htmlFor={`${ids}-confirm`} className="mt-4 block text-copy font-medium text-ink">
          {email ? fill(t.confirmPrompt, { email }) : t.confirmPrompt.replace('{email}', '…')}
        </label>
        <input
          id={`${ids}-confirm`}
          type="email"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          disabled={working}
          onChange={(e) => { setTyped(e.target.value); setError(null) }}
          className={`mt-1.5 ${fieldClass}`}
        />
        {error && (
          <p role="alert" className="mt-3 rounded-control border border-bad/20 bg-bad-soft px-3 py-2 text-copy text-bad">
            {error === 'unknown' ? t.errors.delete_failed : t.errors[error]}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={working}>
            {t.cancel}
          </Button>
          <Button variant="danger" onClick={() => void run()} loading={working} disabled={working || !matches}>
            {working ? t.deleting : t.confirm}
          </Button>
        </div>
      </Modal>
    </SettingsCard>
  )
}
