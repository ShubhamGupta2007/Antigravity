import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus } from 'lucide-react'
import { TaskList } from '@/components/TaskList'

export default async function TasksPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  const { data: dbUser } = await supabase.from('users').select('side, role').eq('id', user.id).single()
  const role = dbUser?.role || 'regular'
  const side = dbUser?.side

  const cookieStore = await cookies()
  const isGuestView = cookieStore.get('guest_view')?.value === '1'
  const isEffectivelyGuest = role === 'guest' || role === 'pending' || isGuestView

  if (isEffectivelyGuest) {
    redirect('/')
  }

  // Fetch all tasks for both sides (Tasks are visible to both sides per spec)
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .order('status', { ascending: false }) // 'not_started' > 'done' alphabetically, but we want 'not_started' first usually.
    .order('deadline', { ascending: true })

  // Since status enum is 'not_started', 'in_progress', 'done', 'blocked'
  // Let's sort them manually in JS for perfect UX: not_started first, done last.
  const sortedTasks = (tasks || []).sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1
    if (a.status !== 'done' && b.status === 'done') return -1
    return 0
  })

  // Group tasks by side so users can see which side is responsible
  const groomTasks = sortedTasks.filter(t => t.side === 'groom')
  const brideTasks = sortedTasks.filter(t => t.side === 'bride')

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-5xl mx-auto bg-ivory pb-24">
      <header className="flex items-center justify-between py-4 border-b border-marigold/30 mb-6">
        <div className="flex items-center space-x-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-display font-semibold text-maroon">Tasks & To-Do</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Groom Side Tasks */}
        <section>
          <div className="flex items-center space-x-2 mb-4">
            <h2 className="text-xl font-display font-semibold text-maroon">Ladkewale 🤵‍♂️</h2>
            <span className="bg-marigold/20 text-maroon text-xs px-2 py-1 rounded-full font-data">
              {groomTasks.filter(t => t.status !== 'done').length} pending
            </span>
          </div>
          <TaskList initialTasks={groomTasks} />
        </section>

        {/* Bride Side Tasks */}
        <section>
          <div className="flex items-center space-x-2 mb-4">
            <h2 className="text-xl font-display font-semibold text-maroon">Ladkiwale 👰‍♀️</h2>
            <span className="bg-rani-pink/10 text-rani-pink text-xs px-2 py-1 rounded-full font-data">
              {brideTasks.filter(t => t.status !== 'done').length} pending
            </span>
          </div>
          <TaskList initialTasks={brideTasks} />
        </section>
      </div>

      {/* Floating Action Button */}
      <Link href="/tasks/add">
        <div className="fixed bottom-20 md:bottom-8 right-6 z-40 bg-maroon text-ivory px-6 py-4 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:scale-105 hover:bg-maroon/90 transition-all flex items-center justify-center cursor-pointer group border border-marigold/20">
          <Plus className="w-5 h-5 mr-2" />
          <span className="font-bold text-sm">Add Task</span>
        </div>
      </Link>
    </main>
  )
}
