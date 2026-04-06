export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" dir="rtl">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
          GT
        </div>
        <div>
          <span className="font-bold text-slate-800 text-sm">Rankings by </span>
          <span className="font-bold text-blue-600 text-sm">Go Top</span>
        </div>
        <span className="text-slate-300 mx-2">|</span>
        <span className="text-slate-500 text-sm">אשף ההגדרה</span>
      </header>

      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  )
}
