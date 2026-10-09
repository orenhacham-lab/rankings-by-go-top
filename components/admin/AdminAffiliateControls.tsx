'use client'

/**
 * The operator's controls on the partner-program screen.
 *
 * ONE client component for every action on that page, because they all do the
 * same three things — post to /api/admin/affiliates, show what came back,
 * refresh the server-rendered page — and thirteen copies of that would be
 * thirteen chances to forget the refresh.
 *
 * IT DECIDES NOTHING. Every rule lives in lib/affiliate/operations.ts behind the
 * admin gate: a code must be free, a commission cannot be approved inside its
 * hold, a payout cannot be paid twice. So a refusal is shown as the reason the
 * server gave, in Hebrew, rather than hidden by a disabled button — an operator
 * who is told "this is still inside the hold" learns the rule.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

const REASONS: Record<string, string> = {
  code_shape: 'הקוד יכול להכיל אותיות אנגליות קטנות, ספרות, מקף וקו תחתון בלבד.',
  code_taken: 'הקוד הזה כבר תפוס. בחרו אחר.',
  already_decided: 'הבקשה הזו כבר טופלה. רעננו את העמוד.',
  still_held: 'העמלה עדיין בתוך תקופת ההחזקה. אפשר לאשר אותה אחרי שהיא משתחררת.',
  nothing_approved: 'אין עמלות מאושרות שממתינות לתשלום במטבע הזה.',
  already_paid: 'התשלום הזה כבר סומן כשולם.',
  already_reversed: 'העמלה הזו כבר בוטלה.',
  reason_required: 'צריך לכתוב סיבה.',
  reference_required: 'צריך אסמכתא.',
  reference_already_used: 'האסמכתא הזו כבר שימשה לעמלה אחרת.',
  own_referral: 'החשבון הזה הוא הרשמה שהשותף עצמו הביא, ולכן אי אפשר לקשר אותו אליו.',
  account_already_partner: 'החשבון הזה כבר מקושר לשותף אחר.',
  referral_not_theirs: 'ההרשמה הזו לא שייכת לשותף הזה.',
  payment_amount: 'סכום התשלום חייב להיות גדול מאפס.',
  rate: 'שיעור העמלה חייב להיות בין 0 ל-100.',
  currency: 'מטבע לא נתמך.',
  base_rate: 'שיעור הבסיס חייב להיות בין 0 ל-100.',
  top_rate: 'השיעור הגבוה חייב להיות בין 0 ל-100.',
  top_below_base: 'השיעור הגבוה לא יכול להיות נמוך משיעור הבסיס.',
  unknown_action: 'פעולה לא מוכרת.',
}

const OUTCOMES: Record<string, string> = {
  not_found: 'לא מצאנו את הרשומה. רעננו את העמוד.',
  failed: 'הפעולה נכשלה. נסו שוב בעוד רגע.',
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
      const response = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await response.json().catch(() => ({}))) as { status?: string; reason?: string }
      if (response.ok && body.status === 'ok') {
        startTransition(() => router.refresh())
        return true
      }
      setMessage((body.reason && REASONS[body.reason]) || (body.status && OUTCOMES[body.status]) || OUTCOMES.failed)
      return false
    } catch {
      setMessage(OUTCOMES.failed)
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

/** Approve an application with the code the operator chose, or refuse it. */
export function ApplicationDecision({ affiliateId, suggestedCode }: { affiliateId: string; suggestedCode: string }) {
  const { call, busy, message } = useAction()
  const [code, setCode] = useState(suggestedCode)
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Input label="הקוד של השותף" value={code} onChange={(event) => setCode(event.target.value)} dir="ltr" />
        </div>
        <Button size="sm" loading={busy} onClick={() => call({ action: 'approve_application', affiliateId, code })}>
          אישור והנפקת קישור
        </Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => call({ action: 'reject_application', affiliateId })}>
          דחייה
        </Button>
      </div>
      <p className="text-caption text-muted">הקישור יהיה /r/{code || '…'} — עד שמאשרים, אין לשותף קוד ואין קישור.</p>
      <Message text={message} />
    </div>
  )
}

/** Suspend a partner, or let them back in. Their link keeps working either way. */
export function PartnerStatusControl({ affiliateId, status }: { affiliateId: string; status: string }) {
  const { call, busy, message } = useAction()
  const suspended = status === 'suspended'
  return (
    <div>
      <Button
        size="sm"
        variant={suspended ? 'secondary' : 'danger'}
        loading={busy}
        onClick={() => call({ action: suspended ? 'reinstate_partner' : 'suspend_partner', affiliateId })}
      >
        {suspended ? 'החזרה לפעילות' : 'השהיה'}
      </Button>
      <Message text={message} />
    </div>
  )
}

/** How this partner is paid. Recorded for whoever makes the transfer. */
export function PayoutDetailsControl({ affiliateId, method }: { affiliateId: string; method: string | null }) {
  const { call, busy, message } = useAction()
  const [chosen, setChosen] = useState(method ?? 'paypal')
  const [details, setDetails] = useState('')
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Select
            label="אמצעי תשלום"
            value={chosen}
            onChange={(event) => setChosen(event.target.value)}
            options={[
              { value: 'paypal', label: 'פייפאל' },
              { value: 'wise', label: 'Wise' },
              { value: 'bank', label: 'העברה בנקאית' },
              { value: 'credit', label: 'קרדיט בחשבון' },
            ]}
          />
        </div>
        <div className="w-72">
          <Input label="פרטים" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="כתובת פייפאל, פרטי חשבון" />
        </div>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => call({ action: 'set_payout_details', affiliateId, method: chosen, details })}>
          שמירה
        </Button>
      </div>
      <Message text={message} />
    </div>
  )
}

/** Approve one commission for payout, or void it with a reason. */
export function CommissionDecision({ commissionId, released }: { commissionId: string; released: boolean }) {
  const { call, busy, message } = useAction()
  const [reason, setReason] = useState('')
  const [voiding, setVoiding] = useState(false)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Not disabled when it is still held: the refusal explains the hold,
            which is the thing worth learning. */}
        <Button size="sm" loading={busy} onClick={() => call({ action: 'approve_commission', commissionId })}>
          {released ? 'אישור' : 'אישור (עדיין בהחזקה)'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setVoiding((open) => !open)}>ביטול</Button>
      </div>
      {voiding && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-64">
            <Input label="סיבת הביטול" value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <Button size="sm" variant="danger" loading={busy} onClick={() => call({ action: 'reverse_commission', commissionId, reason })}>
            ביטול העמלה
          </Button>
        </div>
      )}
      <Message text={message} />
    </div>
  )
}

/** A commission entered by hand: a Shopify-billed referral, or a correction. */
export function ManualCommissionControl({ affiliateId, referralId, defaultRate }: { affiliateId: string; referralId: string; defaultRate: number }) {
  const { call, busy, message } = useAction()
  const [reference, setReference] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [rate, setRate] = useState(String(defaultRate))
  return (
    <div className="space-y-3 rounded-inset border border-line bg-sunk p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Input label="אסמכתא" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="מזהה החיוב בשופיפיי" dir="ltr" />
        </div>
        <div className="w-32">
          <Input label="סכום התשלום" type="number" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
        </div>
        <div className="w-28">
          <Select label="מטבע" value={currency} onChange={(event) => setCurrency(event.target.value)} options={[{ value: 'USD', label: 'USD' }, { value: 'ILS', label: 'ILS' }]} />
        </div>
        <div className="w-24">
          <Input label="אחוז" type="number" value={rate} onChange={(event) => setRate(event.target.value)} />
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={() => call({ action: 'manual_commission', affiliateId, referralId, reference, paymentAmount: Number(paymentAmount), currency, rate: Number(rate) })}
        >
          רישום עמלה
        </Button>
      </div>
      <Message text={message} />
    </div>
  )
}

/** Draw up a statement from everything approved and unpaid in one currency. */
export function CreatePayoutControl({ affiliateId }: { affiliateId: string }) {
  const { call, busy, message } = useAction()
  const [currency, setCurrency] = useState('ILS')
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-28">
          <Select label="מטבע" value={currency} onChange={(event) => setCurrency(event.target.value)} options={[{ value: 'ILS', label: 'ILS' }, { value: 'USD', label: 'USD' }]} />
        </div>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => call({ action: 'create_payout', affiliateId, currency })}>
          הכנת דוח תשלום
        </Button>
      </div>
      <Message text={message} />
    </div>
  )
}

/** The transfer was made: close the statement with its reference. */
export function PayoutDecision({ payoutId, status }: { payoutId: string; status: string }) {
  const { call, busy, message } = useAction()
  const [reference, setReference] = useState('')
  if (status !== 'draft') return null
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-52">
          <Input label="אסמכתא של ההעברה" value={reference} onChange={(event) => setReference(event.target.value)} dir="ltr" />
        </div>
        <Button size="sm" loading={busy} onClick={() => call({ action: 'mark_payout_paid', payoutId, reference })}>
          סימון כשולם
        </Button>
        <Button size="sm" variant="ghost" loading={busy} onClick={() => call({ action: 'cancel_payout', payoutId })}>
          ביטול הדוח
        </Button>
      </div>
      <Message text={message} />
    </div>
  )
}
