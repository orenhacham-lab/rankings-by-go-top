'use client'

/**
 * The partner application, on the public page, in the reader's own language.
 *
 * WHY A FORM AT ALL, when the page used to offer only WhatsApp and email: an
 * applicant writing a free email tells us whatever they think of, and the one
 * thing the decision actually needs — where their audience is — is the thing
 * they leave out. The field with the hint under it is the whole point of the
 * form. WhatsApp and email stay on the page beside it for a partner who would
 * rather talk first.
 *
 * NOTHING IS GRANTED BY SENDING IT. The row is `pending` and a pending partner
 * has no code at all, which is a CHECK constraint rather than a convention, so
 * no link can exist before a person has read the application. The small print
 * says so before they type, not after.
 *
 * The browser's checks are a courtesy: lib/affiliate/application.ts decides, on
 * the server, with the same limits the table's constraints carry. A field the
 * server rejects comes back by NAME and lands on that field, so an applicant is
 * never told "something is wrong" about a form they can see.
 */
import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import { NoticeBox } from '@/components/ui/Notice'
import { AFFILIATE_FORM_COPY } from '@/lib/i18n/public/affiliate-form'
import { readApplication, type ApplicationField } from '@/lib/affiliate/application'
import { getLocaleConfig } from '@/lib/i18n/locales'
import type { PublicLocale } from '@/lib/i18n/locales'

export default function AffiliateApplicationForm({ locale }: { locale: PublicLocale }) {
  const c = AFFILIATE_FORM_COPY[locale]
  const [fields, setFields] = useState({ name: '', email: '', phone: '', website: '', country: '', audience: '' })
  const [errors, setErrors] = useState<Partial<Record<ApplicationField, string>>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) => {
    setFields((current) => ({ ...current, [key]: event.target.value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setNotice(null)
    const parsed = readApplication(fields)
    if (!parsed.ok) {
      setErrors(Object.fromEntries(parsed.errors.map((field) => [field, c.errors[field]])))
      return
    }
    setSending(true)
    try {
      const response = await fetch('/api/affiliate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.fields),
      })
      if (response.ok) {
        setSent(true)
        return
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string; fields?: ApplicationField[] }
      if (response.status === 429) setNotice(c.errors.rateLimited)
      else if (body.error === 'invalid_fields' && body.fields?.length) {
        setErrors(Object.fromEntries(body.fields.map((field) => [field, c.errors[field]])))
      } else setNotice(c.errors.failed)
    } catch {
      // The provider's own words never reach an applicant: this says what
      // happened in ours, and offers the other way in.
      setNotice(c.errors.failed)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div id="affiliate-apply" dir={getLocaleConfig(locale).dir} className="mx-auto max-w-2xl">
        <NoticeBox tone="ok" language={locale}>
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 aria-hidden className="size-4 shrink-0" />
            {c.success}
          </span>
        </NoticeBox>
      </div>
    )
  }

  return (
    <form id="affiliate-apply" dir={getLocaleConfig(locale).dir} onSubmit={submit} className="mx-auto max-w-2xl space-y-5" noValidate>
      <div>
        <h2 className="text-headline font-bold tracking-tight text-ink">{c.title}</h2>
        <p className="mt-2 text-copy text-body">{c.intro}</p>
      </div>

      {notice && <NoticeBox tone="bad" language={locale}>{notice}</NoticeBox>}

      <div className="grid gap-5 sm:grid-cols-2">
        <Input label={c.name} value={fields.name} onChange={set('name')} error={errors.name} placeholder={c.namePlaceholder} autoComplete="name" required />
        <Input label={c.email} type="email" value={fields.email} onChange={set('email')} error={errors.email} placeholder={c.emailPlaceholder} autoComplete="email" required />
        <Input label={`${c.phone} ${c.phoneOptional}`} type="tel" value={fields.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" />
        <Input label={c.website} type="url" value={fields.website} onChange={set('website')} error={errors.website} placeholder={c.websitePlaceholder} />
        <Input label={c.country} value={fields.country} onChange={set('country')} error={errors.country} autoComplete="country-name" />
      </div>

      <Textarea label={c.audience} rows={5} value={fields.audience} onChange={set('audience')} error={errors.audience} placeholder={c.audiencePlaceholder} required />
      <p className="text-caption text-muted">{c.audienceHint}</p>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={sending}>{sending ? c.submitting : c.submit}</Button>
        <p className="text-caption text-muted">{c.smallPrint}</p>
      </div>
    </form>
  )
}
