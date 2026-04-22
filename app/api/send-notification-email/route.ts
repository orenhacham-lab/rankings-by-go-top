import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, userName } = body

    if (!email || !userName) {
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
    const adminEmailResult = await resend.emails.send({
      from: fromEmail,
      to: 'orenhacham@gmail.com',
      subject: 'חשבון חדש נפתח - Rankings by Go Top',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">🎉 חשבון חדש נפתח ב-Rankings by Go Top!</h2>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-right: 4px solid #2563eb;">
            <p><strong>דוא"ל:</strong> ${email}</p>
            <p><strong>שם:</strong> ${userName || 'לא הוזן'}</p>
            <p><strong>זמן:</strong> ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
          </div>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
          <p style="color: #64748b; font-size: 12px;">הודעה אוטומטית מ-Rankings by Go Top</p>
        </div>
      `,
    })

    if (adminEmailResult.error) {
      console.error('Failed to send notification email:', adminEmailResult.error)
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      )
    }

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
