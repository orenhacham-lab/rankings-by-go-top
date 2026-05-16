import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch profile to determine admin status
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="flex flex-col md:flex-row h-full min-h-screen dark:bg-slate-950">
      {/* Temporary test probe to verify dark variant works */}
      <div className="hidden dark:block fixed bottom-4 left-4 z-[9999] rounded bg-emerald-500 px-3 py-2 text-white text-sm font-medium">
        DARK MODE ACTIVE
      </div>
      <Sidebar isAdmin={isAdmin} />
      <main className="flex-1 md:mr-64 p-4 md:p-8 overflow-auto min-h-screen dark:bg-slate-950 dark:text-slate-50">
        {children}
      </main>
    </div>
  )
}
