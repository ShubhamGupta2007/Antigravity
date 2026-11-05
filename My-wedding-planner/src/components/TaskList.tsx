'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, CreditCard } from 'lucide-react'
import { format } from 'date-fns'
import { createClient } from '@/lib/client'
import { parseEventDate } from '@/lib/functionPlanning'

export type Task = {
  id: string
  title: string
  description: string | null
  priority_tier: string
  deadline: string | null
  status: 'not_started' | 'in_progress' | 'done' | 'blocked'
  side?: string | null
  function_id?: string | null
  expense_id?: string | null
  source?: string | null
  functions?: { name: string } | null
}

const DAY = 86400000

function deadlineInfo(deadline: string | null, done: boolean) {
  if (!deadline) return null
  const date = parseEventDate(deadline)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((date.getTime() - today.getTime()) / DAY)
  const label = format(date, 'd MMM yyyy')
  if (done) return { label: `Due ${label}`, cls: 'text-maroon/50' }
  if (days < 0) return { label: `Overdue • ${label}`, cls: 'text-rust-red font-semibold' }
  if (days === 0) return { label: 'Due today', cls: 'text-rust-red font-semibold' }
  if (days <= 7) return { label: `Due in ${days} day${days === 1 ? '' : 's'} • ${label}`, cls: 'text-marigold font-semibold' }
  return { label: `Due ${label}`, cls: 'text-maroon/50' }
}

export function TaskList({ initialTasks, showFunction = true }: { initialTasks: Task[]; showFunction?: boolean }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const toggleTask = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'not_started' : 'done'

    // A payment task closes by itself when the payment is marked paid in Budget
    if (task.expense_id && newStatus === 'done') {
      const ok = window.confirm(
        'This only ticks the task.\n\nTo record the payment, open it in Budget and mark it Paid (the task then ticks itself).\n\nTick the task anyway?'
      )
      if (!ok) return
    }

    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status: newStatus } : t)))
    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    if (error) {
      setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status: task.status } : t)))
      console.error(error)
    } else {
      router.refresh()
    }
  }

  const getPriorityColor = (tier: string) => {
    switch (tier) {
      case 'urgent': return 'text-rust-red'
      case 'must_have': return 'text-marigold'
      case 'good_to_have': return 'text-mehendi'
      default: return 'text-gray-400'
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="p-8 bg-white rounded-2xl shadow-sm border border-marigold/20 text-center">
        <p className="text-sm font-data text-maroon/70">No tasks here. You&apos;re all caught up!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {tasks.map(task => {
        const isDone = task.status === 'done'
        const due = deadlineInfo(task.deadline, isDone)
        const isPayment = !!task.expense_id
        return (
          <div key={task.id} className={`flex items-start p-4 bg-white rounded-2xl shadow-sm border transition-opacity ${isDone ? 'opacity-60 border-marigold/20' : due?.cls.includes('rust-red') ? 'border-rust-red/30' : 'border-marigold/20'}`}>
            <button
              onClick={() => toggleTask(task)}
              className="mt-1 mr-4 focus:outline-none"
              aria-label={isDone ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
            >
              {isDone ? (
                <CheckCircle2 className="w-6 h-6 text-mehendi" />
              ) : (
                <Circle className="w-6 h-6 text-marigold/50 hover:text-marigold transition-colors" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <h3 className={`font-display font-semibold text-lg text-maroon ${isDone ? 'line-through' : ''}`}>
                {task.title}
              </h3>
              {task.description && (
                <p className="text-sm font-data text-maroon/70 mt-1">{task.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs font-data">
                <span className={`flex items-center ${getPriorityColor(task.priority_tier)}`}>
                  {task.priority_tier.replace(/_/g, ' ').toUpperCase()}
                </span>
                {due && <span className={due.cls}>• {due.label}</span>}
                {isPayment && (
                  <Link href={`/budget/${task.expense_id}/edit`} className="inline-flex items-center text-[11px] font-semibold text-maroon bg-marigold/15 hover:bg-marigold/25 px-2 py-0.5 rounded-full">
                    <CreditCard className="w-3 h-3 mr-1" /> Payment • open
                  </Link>
                )}
                {showFunction && task.function_id && task.functions?.name && (
                  <Link href={`/functions/${task.function_id}`} className="text-[11px] font-semibold text-mehendi bg-mehendi/10 hover:bg-mehendi/20 px-2 py-0.5 rounded-full">
                    🎪 {task.functions.name}
                  </Link>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
