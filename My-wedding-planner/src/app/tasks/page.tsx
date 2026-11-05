import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus } from 'lucide-react'
import { TaskList, type Task } from '@/components/TaskList'

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ function?: string }> }) {
  const { function: functionFilter } = await searchParams
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  const { data: dbUser } = await supabase.from('users').select('side, role').eq('id', user.id).single()
  const role = dbUser?.role || 'regular'

  const cookieStore = await cookies()
  const isGuestView = cookieStore.get('guest_view')?.value === '1'
  const isEffectivelyGuest = role === 'guest' || role === 'pending' || isGuestView

  if (isEffectivelyGuest) {
    redirect('/')
  }

  // Fetch all tasks for both sides (Tasks are visible to both sides per spec),
  // with the function each belongs to (needs 13_tasks_links.sql; falls back without it)
  const linked = await supabase.from('tasks').select('*, functions (name)')
  const { data: tasks } = linked.error ? await supabase.from('tasks').select('*') : linked
  const { data: functionList } = await supabase.from('functions').select('id, name').order('event_date')

  // Not done first, then by deadline (soonest first, no deadline last)
  const allTasks = ((tasks || []) as Task[]).sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
    if (a.deadline || b.deadline) return a.deadline ? -1 : 1
    return 0
  })
  const sortedTasks = functionFilter === 'general'
    ? allTasks.filter(t => !t.function_id)
    : functionFilter
      ? allTasks.filter(t => t.function_id === functionFilter)
      : allTasks
  const openCount = (id: string | null) => allTasks.filter(t => t.status !== 'done' && (id === null ? !t.function_id : t.function_id === id)).length
  const paymentsDue = allTasks.filter(t => t.expense_id && t.status !== 'done').length

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

      {/* Filter by function */}
      <nav className="flex flex-wrap gap-2 mb-6" aria-label="Filter tasks by function">
        {[
          { key: undefined, label: 'All', count: allTasks.filter(t => t.status !== 'done').length },
          ...(functionList || []).map(f => ({ key: f.id, label: `🎪 ${f.name}`, count: openCount(f.id) })),
          { key: 'general', label: 'General', count: openCount(null) }
        ].map(chip => {
          const active = (functionFilter || undefined) === chip.key
          return (
            <Link
              key={chip.key || 'all'}
              href={chip.key ? `/tasks?function=${chip.key}` : '/tasks'}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${active ? 'bg-maroon text-ivory' : 'bg-marigold/10 text-maroon hover:bg-marigold/20'}`}
            >
              {chip.label}{chip.count > 0 && <span className={active ? 'text-ivory/80' : 'text-maroon/50'}> {chip.count}</span>}
            </Link>
          )
        })}
      </nav>
      {paymentsDue > 0 && (
        <p className="-mt-3 mb-6 text-xs font-data text-maroon/60">
          💳 {paymentsDue} payment{paymentsDue === 1 ? '' : 's'} due. These come from Budget automatically and tick themselves off when marked paid.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Groom Side Tasks */}
        <section>
          <div className="flex items-center space-x-2 mb-4">
            <h2 className="text-xl font-display font-semibold text-maroon">Ladkewale 🤵‍♂️</h2>
            <span className="bg-marigold/20 text-maroon text-xs px-2 py-1 rounded-full font-data">
              {groomTasks.filter(t => t.status !== 'done').length} pending
            </span>
          </div>
          <TaskList key={`g-${functionFilter || 'all'}`} initialTasks={groomTasks} showFunction={!functionFilter || functionFilter === 'general'} />
        </section>

        {/* Bride Side Tasks */}
        <section>
          <div className="flex items-center space-x-2 mb-4">
            <h2 className="text-xl font-display font-semibold text-maroon">Ladkiwale 👰‍♀️</h2>
            <span className="bg-rani-pink/10 text-rani-pink text-xs px-2 py-1 rounded-full font-data">
              {brideTasks.filter(t => t.status !== 'done').length} pending
            </span>
          </div>
          <TaskList key={`b-${functionFilter || 'all'}`} initialTasks={brideTasks} showFunction={!functionFilter || functionFilter === 'general'} />
        </section>
      </div>

      {/* Floating Action Button */}
      <Link href={functionFilter && functionFilter !== 'general' ? `/tasks/add?function_id=${functionFilter}` : '/tasks/add'}>
        <div className="fixed bottom-20 md:bottom-8 right-6 z-40 bg-maroon text-ivory px-6 py-4 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:scale-105 hover:bg-maroon/90 transition-all flex items-center justify-center cursor-pointer group border border-marigold/20">
          <Plus className="w-5 h-5 mr-2" />
          <span className="font-bold text-sm">Add Task</span>
        </div>
      </Link>
    </main>
  )
}
