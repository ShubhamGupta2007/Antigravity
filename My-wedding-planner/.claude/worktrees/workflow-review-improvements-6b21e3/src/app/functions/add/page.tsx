'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'

export default function AddFunctionPage() {
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
    const name = formData.get('name') as string
    const event_date = formData.get('event_date') as string
    const start_time = formData.get('start_time') as string
    const end_time = formData.get('end_time') as string
    const location = formData.get('location') as string
    const hosting_side = formData.get('hosting_side') as string
    const max_budget = Number(formData.get('max_budget'))

    if (max_budget <= 0) {
      setError("Max budget is required.")
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase.from('functions').insert({
      name,
      event_date,
      start_time: start_time || null,
      end_time: end_time || null,
      location,
      hosting_side,
      max_budget,
      created_by: user.id
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push('/functions')
    router.refresh()
  }

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-lg mx-auto bg-ivory pb-20">
      <header className="flex items-center space-x-4 py-4 border-b border-marigold/30 mb-6">
        <Link href="/functions">
          <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-display font-semibold text-maroon">Add Function</h1>
      </header>

      {error && <div className="p-4 mb-6 bg-rust-red/10 border border-rust-red/20 text-rust-red rounded-lg text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Function Name</Label>
          <Input id="name" name="name" placeholder="e.g. Haldi, Sangeet" required className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="event_date">Date</Label>
          <Input id="event_date" name="event_date" type="date" required className="bg-white border-marigold/50" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="start_time">Start Time</Label>
            <Input id="start_time" name="start_time" type="time" className="bg-white border-marigold/50" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_time">End Time</Label>
            <Input id="end_time" name="end_time" type="time" className="bg-white border-marigold/50" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location / Venue</Label>
          <Input id="location" name="location" placeholder="e.g. Taj Hotel" className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hosting_side">Hosting Side</Label>
          <select id="hosting_side" name="hosting_side" required defaultValue={userSide || 'groom'} className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm">
            <option value="groom">Ladkewale 🤵‍♂️</option>
            <option value="bride">Ladkiwale 👰‍♀️</option>
            <option value="joint">Joint 🤝</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="max_budget">Max Budget (₹) *</Label>
          <Input id="max_budget" name="max_budget" type="number" min="1" step="1" required className="bg-white border-marigold/50 text-lg" placeholder="0" />
          <p className="text-xs text-maroon/50 font-data">Required to track expenses for this function.</p>
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-maroon text-ivory hover:bg-maroon/90 py-6 mt-4">
          {loading ? 'Saving...' : 'Save Function'}
        </Button>
      </form>
    </main>
  )
}
