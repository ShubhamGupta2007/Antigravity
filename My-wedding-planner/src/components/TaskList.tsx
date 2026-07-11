'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle } from 'lucide-react'

type Task = {
  id: string
  title: string
  description: string | null
  priority_tier: string
  deadline: string | null
  status: 'not_started' | 'in_progress' | 'done' | 'blocked'
}

export function TaskList({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  const toggleTask = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'not_started' : 'done'
    
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))

    // DB update
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', task.id)
      
    if (error) {
      // Revert on error
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t))
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
        <p className="text-sm font-data text-maroon/70">No tasks added yet. You're all caught up!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {tasks.map(task => {
        const isDone = task.status === 'done'
        return (
          <div key={task.id} className={`flex items-start p-4 bg-white rounded-2xl shadow-sm border border-marigold/20 transition-opacity ${isDone ? 'opacity-60' : ''}`}>
            <button onClick={() => toggleTask(task)} className="mt-1 mr-4 focus:outline-none">
              {isDone ? (
                <CheckCircle2 className="w-6 h-6 text-mehendi" />
              ) : (
                <Circle className="w-6 h-6 text-marigold/50 hover:text-marigold transition-colors" />
              )}
            </button>
            <div className="flex-1">
              <h3 className={`font-display font-semibold text-lg text-maroon ${isDone ? 'line-through' : ''}`}>
                {task.title}
              </h3>
              {task.description && (
                <p className="text-sm font-data text-maroon/70 mt-1">{task.description}</p>
              )}
              <div className="flex items-center space-x-3 mt-2 text-xs font-data">
                <span className={`flex items-center ${getPriorityColor(task.priority_tier)}`}>
                  {task.priority_tier.replace(/_/g, ' ').toUpperCase()}
                </span>
                {task.deadline && (
                  <span className="text-maroon/50">• Due: {task.deadline}</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
