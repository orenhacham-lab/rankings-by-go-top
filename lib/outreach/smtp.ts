/**
 * The transport for the US outbound channel: SMTP submission as the mailbox.
 *
 * WHY NOT RESEND, WHICH THE PRODUCT ALREADY USES. Resend's terms do not permit
 * cold outreach, and the account that sends this product's customer mail — the
 * signup, reminder, report and onboarding emails — is the account that would be
 * closed for it. The channel's rules therefore put it off limits, not even for
 * a single test message, and that is a commercial decision rather than a
 * technical one: the cheapest way to lose every transactional email is to send
 * one cold message through the provider that carries them.
 *
 * WHY THIS HOST AND PORT. The messages sent by hand on 13 Oct 2026 went out
 * through `smtp.hostinger.com` on submission, which is visible in the headers
 * of the one bounce the wave produced (`by smtp.hostinger.com ... with
 * ESMTPSA`), and arrived with SPF, DKIM and DMARC all passing. So this is the
 * path already known to authenticate for this mailbox, not a guess from
 * documentation.
 *
 * WHY THE PASSWORD IS NOT IN THE REPOSITORY AND CANNOT BE. It is a mailbox
 * password, which means it is also read access to every reply the channel gets.
 * It is entered in Vercel by Oren directly and read here from the environment.
 * A session never prints it, never asks for it in chat, and never writes it to
 * a log line.
 *
 * WHY A PERMANENT REJECTION IS TOLD APART FROM EVERY OTHER FAILURE. A 5xx at
 * submission means this address will never accept this message, and two of them
 * in a day is one of the plan's own reasons to stop the channel. A timeout, a
 * refused connection or a 4xx is our problem or a transient one, and must not
 * be counted as the recipient rejecting us — treating infrastructure trouble as
 * a bounce is how a channel stops itself for the wrong reason and nobody can
 * tell why.
 */

/** Where the channel sends from. The only mailbox the channel has. */
export const DEFAULT_SMTP_HOST = 'smtp.hostinger.com'
export const DEFAULT_SMTP_PORT = 465
export const DEFAULT_SMTP_USER = 'oren@trygotopseo.com'

export interface SmtpSettings {
  host: string
  port: number
  user: string
  password: string
}

export type SmtpConfig =
  | { ok: true; settings: SmtpSettings }
  /** `missing_password` is the ordinary state before Oren has entered it. */
  | { ok: false; reason: 'missing_password' | 'bad_port' }

/**
 * The transport's settings from the environment. Only the password has no
 * default: everything else is a fact about the mailbox rather than a secret,
 * and giving them defaults means one variable to set rather than four.
 */
export function readSmtpConfig(env: Record<string, string | undefined>): SmtpConfig {
  const password = (env.OUTREACH_SMTP_PASSWORD ?? '').trim()
  if (password.length === 0) return { ok: false, reason: 'missing_password' }
  const port = Number(env.OUTREACH_SMTP_PORT ?? DEFAULT_SMTP_PORT)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return { ok: false, reason: 'bad_port' }
  return {
    ok: true,
    settings: {
      host: (env.OUTREACH_SMTP_HOST ?? DEFAULT_SMTP_HOST).trim() || DEFAULT_SMTP_HOST,
      port,
      user: (env.OUTREACH_SMTP_USER ?? DEFAULT_SMTP_USER).trim() || DEFAULT_SMTP_USER,
      password,
    },
  }
}

export interface OutgoingMessage {
  to: string
  subject: string
  text: string
  fromName: string
}

export type SendOutcome =
  | { status: 'sent'; messageId: string | null }
  /** The server refused this address permanently. Counts towards the daily stop. */
  | { status: 'rejected'; code: string }
  /** Anything else: our side, the network, or a transient refusal. */
  | { status: 'failed'; code: string }

/** Sends one message, or reports why not. Injected so QA never opens a socket. */
export type MessageSender = (message: OutgoingMessage) => Promise<SendOutcome>

/**
 * A 5xx reply, which SMTP defines as permanent. Read from nodemailer's
 * `responseCode` where it has one, and from the reply text otherwise, because
 * a rejection that arrives as a bare string is still a rejection.
 */
export function isPermanentRejection(error: unknown): boolean {
  const e = error as { responseCode?: unknown; response?: unknown; message?: unknown } | null
  const code = typeof e?.responseCode === 'number' ? e.responseCode : null
  if (code !== null) return code >= 500 && code < 600
  const text = `${typeof e?.response === 'string' ? e.response : ''} ${typeof e?.message === 'string' ? e.message : ''}`
  return /\b5\d\d\b/.test(text)
}

/** A short, loggable label for a failure. Never the server's own words. */
export function failureCode(error: unknown): string {
  const e = error as { responseCode?: unknown; code?: unknown } | null
  if (typeof e?.responseCode === 'number') return `smtp_${e.responseCode}`
  if (typeof e?.code === 'string' && /^[A-Z_]{2,32}$/.test(e.code)) return `smtp_${e.code.toLowerCase()}`
  return 'smtp_unknown'
}

/**
 * The real sender. Built per call rather than kept around: a serverless
 * instance may sit idle for hours between passes, and a pooled connection that
 * old is a connection that fails on first use.
 */
export function liveSender(settings: SmtpSettings): MessageSender {
  return async (message) => {
    try {
      const { createTransport } = await import('nodemailer')
      const transport = createTransport({
        host: settings.host,
        port: settings.port,
        // 465 is implicit TLS; anything else upgrades with STARTTLS. Certificate
        // verification is never disabled: an unverified submission host is a
        // host that could be reading the mailbox password.
        secure: settings.port === 465,
        requireTLS: settings.port !== 465,
        auth: { user: settings.user, pass: settings.password },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 25_000,
      })
      try {
        const info = await transport.sendMail({
          from: { name: message.fromName, address: settings.user },
          to: message.to,
          subject: message.subject,
          text: message.text,
        })
        return { status: 'sent', messageId: typeof info?.messageId === 'string' ? info.messageId : null }
      } finally {
        try { transport.close() } catch { /* closing a dead transport is not a failure */ }
      }
    } catch (error) {
      return isPermanentRejection(error)
        ? { status: 'rejected', code: failureCode(error) }
        : { status: 'failed', code: failureCode(error) }
    }
  }
}
