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

  return (
    <div className="flex md:flex-row flex-col h-full min-h-screen overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 overflow-x-hidden overflow-y-auto min-h-screen">
        {children}
      </main>
    </div>
  )
}
