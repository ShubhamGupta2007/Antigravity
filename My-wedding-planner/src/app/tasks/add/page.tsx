'use client'

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/client'

type FunctionOption = { id: string; name: string; event_date: string | null; hosting_side: string | null }

function AddTaskForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userSide, setUserSide] = useState<string | null>(null)
  const [functions, setFunctions] = useState<FunctionOption[]>([])
  const searchParams = useSearchParams()
  const [functionId, setFunctionId] = useState<string>(searchParams.get('function_id') || '')
  const [side, setSide] = useState<string>('')

  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: dbUser } = await supabase.from('users').select('side').eq('id', user.id).single()
        if (dbUser?.side) setUserSide(dbUser.side)
      }
      const { data } = await supabase.from('functions').select('id, name, event_date, hosting_side').order('event_date')
      setFunctions(data || [])
    }
    load()
  }, [supabase])

  // Default side: the function's hosting side when it is one side's function, else the user's side
  const selectedFunction = functions.find(f => f.id === functionId)
  const defaultSide =
    selectedFunction && (selectedFunction.hosting_side === 'groom' || selectedFunction.hosting_side === 'bride')
      ? selectedFunction.hosting_side
      : userSide || 'groom'
  const effectiveSide = side || defaultSide
  const backHref = functionId && searchParams.get('function_id') ? `/functions/${functionId}` : '/tasks'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not logged in')
      setLoading(false)
      return
    }

    const formData = new FormData(e.currentTarget)
    const { error: insertError } = await supabase.from('tasks').insert({
      title: String(formData.get('title') || '').trim(),
      description: String(formData.get('description') || '').trim() || null,
      priority_tier: formData.get('priority_tier') as string,
      deadline: (formData.get('deadline') as string) || null,
      side: effectiveSide,
      status: 'not_started',
      created_by: user.id,
      function_id: functionId || null
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push(backHref)
    router.refresh()
  }

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-lg mx-auto bg-ivory pb-20">
      <header className="flex items-center space-x-4 py-4 border-b border-marigold/30 mb-6">
        <Link href={backHref}>
          <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-display font-semibold text-maroon">Add Task</h1>
      </header>

      {error && <div className="p-4 mb-6 bg-rust-red/10 border border-rust-red/20 text-rust-red rounded-lg text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">Task Title</Label>
          <Input id="title" name="title" placeholder="e.g. Book mehendi artist" required className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (Optional)</Label>
          <Input id="description" name="description" placeholder="Any details..." className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="function_id">Function (Optional)</Label>
          <select
            id="function_id"
            value={functionId}
            onChange={e => setFunctionId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm"
          >
            <option value="">General (not for one function)</option>
            {functions.map(f => (
              <option key={f.id} value={f.id}>🎪 {f.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="priority_tier">Priority</Label>
            <select id="priority_tier" name="priority_tier" required defaultValue="must_have" className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm">
              <option value="urgent">🔴 Urgent</option>
              <option value="must_have">🟡 Must Have</option>
              <option value="good_to_have">🔵 Good to Have</option>
              <option value="if_time_permits">⚪ If Time Permits</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deadline">Deadline (Optional)</Label>
            <Input id="deadline" name="deadline" type="date" className="bg-white border-marigold/50" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="side">Whose task</Label>
          <select
            id="side"
            value={effectiveSide}
            onChange={e => setSide(e.target.value)}
            className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm"
          >
            <option value="groom">Ladkewale 🤵‍♂️</option>
            <option value="bride">Ladkiwale 👰‍♀️</option>
          </select>
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-maroon text-ivory hover:bg-maroon/90 py-6 mt-4">
          {loading ? 'Saving...' : 'Save Task'}
        </Button>
      </form>
    </main>
  )
}

export default function AddTaskPage() {
  return (
    <Suspense>
      <AddTaskForm />
    </Suspense>
  )
}
