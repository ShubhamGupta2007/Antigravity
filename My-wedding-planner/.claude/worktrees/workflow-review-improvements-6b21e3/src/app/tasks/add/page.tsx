'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function AddTaskPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userSide, setUserSide] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  useEffect(() => {
    async function fetchUserSide() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: dbUser } = await supabase.from('users').select('side').eq('id', user.id).single()
        if (dbUser?.side) {
          setUserSide(dbUser.side)
        }
      }
    }
    fetchUserSide()
  }, [supabase])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError("Not logged in")
      setLoading(false)
      return
    }

    const formData = new FormData(e.currentTarget)
    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const priority_tier = formData.get('priority_tier') as string
    const deadline = formData.get('deadline') as string
    
    // Defaulting to userSide, but could allow assignment to other side if admin
    const side = userSide || 'groom'

    const { error: insertError } = await supabase.from('tasks').insert({
      title,
      description,
      priority_tier,
      deadline: deadline || null,
      side,
      status: 'not_started',
      created_by: user.id
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push('/tasks')
    router.refresh()
  }

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-lg mx-auto bg-ivory pb-20">
      <header className="flex items-center space-x-4 py-4 border-b border-marigold/30 mb-6">
        <Link href="/tasks">
          <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-display font-semibold text-maroon">Add Task</h1>
      </header>

      {error && <div className="p-4 mb-6 bg-rust-red/10 border border-rust-red/20 text-rust-red rounded-lg text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">Task Title</Label>
          <Input id="title" name="title" placeholder="e.g. Book photographer" required className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (Optional)</Label>
          <Input id="description" name="description" placeholder="Any details..." className="bg-white border-marigold/50" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="priority_tier">Priority</Label>
            <select id="priority_tier" name="priority_tier" required className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm">
              <option value="urgent">🔴 Urgent</option>
              <option value="must_have" selected>🟡 Must Have</option>
              <option value="good_to_have">🔵 Good to Have</option>
              <option value="if_time_permits">⚪ If Time Permits</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deadline">Deadline (Optional)</Label>
            <Input id="deadline" name="deadline" type="date" className="bg-white border-marigold/50" />
          </div>
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-maroon text-ivory hover:bg-maroon/90 py-6 mt-4">
          {loading ? 'Saving...' : 'Save Task'}
        </Button>
      </form>
    </main>
  )
}
