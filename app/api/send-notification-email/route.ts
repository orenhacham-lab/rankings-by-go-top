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

    // Send notification to admin
    const adminEmailResult = await resend.emails.send({
      from: 'noreply@gotopseo.com',
      to: 'orenhacham@gmail.com',
      subject: 'חשבון חדש נפתח - Rankings by Go Top',
      html: `
        <h2>חשבון חדש נפתח!</h2>
        <p><strong>דוא"ל:</strong> ${email}</p>
        <p><strong>שם:</strong> ${userName || 'לא הוזן'}</p>
        <p><strong>זמן:</strong> ${new Date().toLocaleString('he-IL')}</p>
        <hr>
        <p>זהו הודעה אוטומטית מ-Rankings by Go Top</p>
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
