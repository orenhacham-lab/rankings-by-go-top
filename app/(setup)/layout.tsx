import Image from 'next/image'

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas" dir="rtl">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4 sm:px-6">
        <Image
          src="/gotop-primary.png"
          alt="Go Top logo"
          width={120}
          height={120}
          className="h-auto w-24"
          sizes="96px"
          priority
        />
        <span aria-hidden className="mx-2 h-5 w-px bg-line-strong" />
        <span className="text-copy font-semibold text-body">אשף ההגדרה</span>
      </header>

      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  )
}
