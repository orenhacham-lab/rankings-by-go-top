import Image from 'next/image'

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" dir="rtl">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <Image
          src="/gotop-primary.svg"
          alt="Go Top logo"
          width={120}
          height={120}
          className="h-auto w-24"
          priority
        />
        <span className="text-slate-300 mx-2">|</span>
        <span className="text-slate-500 text-sm">אשף ההגדרה</span>
      </header>

      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  )
}
