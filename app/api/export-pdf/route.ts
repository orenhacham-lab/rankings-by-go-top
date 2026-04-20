import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  let browser = null

  try {
    const { html } = await request.json()

    if (!html) {
      return NextResponse.json({ error: 'HTML content required' }, { status: 400 })
    }

    // Try Puppeteer first (most reliable)
    try {
      const puppeteer = await import('puppeteer')
      browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })

      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      await page.emulateMediaType('print')

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true,
        margin: { top: 14, right: 14, bottom: 14, left: 14 },
      })

      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="report.pdf"',
        },
      })
    } catch (puppeteerError) {
      // If Puppeteer fails, fall back to returning HTML for browser print-to-PDF
      console.error('Puppeteer error, falling back to HTML:', puppeteerError)
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'attachment; filename="report.html"',
        },
      })
    }
  } catch (error) {
    console.error('PDF export error:', error)
    return NextResponse.json(
      { error: 'PDF generation failed', details: String(error) },
      { status: 500 }
    )
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch (e) {
        console.error('Error closing browser:', e)
      }
    }
  }
}
