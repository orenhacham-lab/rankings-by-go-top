import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('[email-route] received request')
    const body = await request.json()
    const { fullName, email, companyName, phone } = body

    console.log('[email-route] fullName:', fullName, 'email:', email, 'companyName:', companyName, 'phone:', phone)

    if (!email || !fullName) {
      console.error('[email-route] missing required fields (email or fullName)')
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Send email using Resend
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    // Use custom domain if verified, otherwise use Resend's default
    // Change FROM_EMAIL to 'noreply@gotopseo.com' after verifying domain in Resend
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Rankings by Go Top <onboarding@resend.dev>'

    // Send notification to admin
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'orenhacham@gmail.com'
    console.log('[email-route] admin email:', adminEmail, 'from email:', fromEmail)
    console.log('[email-route] calling resend.emails.send...')
    const adminEmailResult = await resend.emails.send({
      from: fromEmail,
      to: adminEmail,
      subject: 'חשבון חדש נפתח - Rankings by Go Top',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">🎉 חשבון חדש נפתח ב-Rankings by Go Top!</h2>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-right: 4px solid #2563eb;">
            <p><strong>שם מלא:</strong> ${fullName || 'לא הוזן'}</p>
            <p><strong>דוא״ל:</strong> ${email}</p>
            <p><strong>שם חברה:</strong> ${companyName || 'לא הוזן'}</p>
            <p><strong>טלפון:</strong> ${phone || 'לא הוזן'}</p>
            <p><strong>זמן הרשמה:</strong> ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
          </div>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
          <p style="color: #64748b; font-size: 12px;">הודעה אוטומטית מ-Rankings by Go Top</p>
        </div>
      `,
    })

    console.log('[email-route] resend response:', { hasError: !!adminEmailResult.error, hasData: !!adminEmailResult.data })

    if (adminEmailResult.error) {
      console.error('[email-route] Resend error:', adminEmailResult.error)
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      )
    }

    console.log('[email-route] email sent successfully, messageId:', adminEmailResult.data?.id)
    return NextResponse.json(
      { success: true, messageId: adminEmailResult.data?.id },
      { status: 200 }
    )
  } catch (error) {
    console.error('Email sending error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
