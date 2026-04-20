import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer'

export async function POST(request: NextRequest) {
  let browser = null
  try {
    const { html } = await request.json()

    if (!html) {
      return NextResponse.json({ error: 'HTML content required' }, { status: 400 })
    }

    // Use Puppeteer for reliable HTML-to-PDF conversion with proper text direction support
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.emulateMediaType('print')

    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      margin: {
        top: 14,
        right: 14,
        bottom: 14,
        left: 14,
      },
    })

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="report.pdf"',
      },
    })
  } catch (error) {
    console.error('PDF export error:', error)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
