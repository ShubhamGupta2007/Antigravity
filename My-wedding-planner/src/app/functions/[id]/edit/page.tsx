'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FunctionRow = {
  id: string
  name: string
  event_date: string | null
  start_time: string | null
  end_time: string | null
  location: string | null
  hosting_side: 'groom' | 'bride' | 'joint'
  max_budget: number | null
}

/** Edit a function's name, date, timings, venue, hosting side and fallback budget. */
export default function EditFunctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [fn, setFn] = useState<FunctionRow | null>(null)
  const [otherNames, setOtherNames] = useState<string[]>([])
  const [hasBudgetCategory, setHasBudgetCategory] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const [fnRes, allFns, cats] = await Promise.all([
        supabase.from('functions').select('id, name, event_date, start_time, end_time, location, hosting_side, max_budget').eq('id', id).maybeSingle(),
        supabase.from('functions').select('id, name'),
        supabase.from('categories').select('name, function_id')
      ])
      if (fnRes.error || !fnRes.data) {
        setLoadError(fnRes.error?.message || 'Function not found.')
        return
      }
      setFn(fnRes.data as FunctionRow)
      // Names must stay unique across functions and budget categories (except this function and its own category)
      setOtherNames([
        ...(allFns.data || []).filter(f => f.id !== id).map(f => f.name.trim().toLowerCase()),
        ...(cats.data || []).filter(c => c.function_id !== id).map(c => (c.name || '').trim().toLowerCase())
      ])
      setHasBudgetCategory((cats.data || []).some(c => c.function_id === id))
    }
    load()
  }, [supabase, id])

  const name = fn?.name ?? ''
  const isDuplicate = !!name.trim() && otherNames.includes(name.trim().toLowerCase())
  const set = (patch: Partial<FunctionRow>) => setFn(prev => (prev ? { ...prev, ...patch } : prev))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fn) return
    setSaveError(null)
    if (!fn.name.trim()) return setSaveError('Please enter a name.')
    if (isDuplicate) return setSaveError(`Something named "${fn.name.trim()}" already exists. Please choose a different name.`)
    if (!fn.event_date) return setSaveError('Please choose a date.')
    setSaving(true)
    const { error } = await supabase
      .from('functions')
      .update({
        name: fn.name.trim(),
        event_date: fn.event_date,
        start_time: fn.start_time || null,
        end_time: fn.end_time || null,
        location: fn.location?.trim() || null,
        hosting_side: fn.hosting_side,
        max_budget: Number(fn.max_budget) || 0
      })
      .eq('id', id)
    setSaving(false)
    if (error) return setSaveError(error.message)
    toast.success('Function updated')
    router.push(`/functions/${id}`)
    router.refresh()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col bg-ivory p-6 pb-20">
      <header className="mb-6 flex items-center space-x-4 border-b border-marigold/30 py-4">
        <Link href={`/functions/${id}`}>
          <Button variant="ghost" size="icon" aria-label="Back to the function" className="text-maroon/70 hover:bg-marigold/10 hover:text-maroon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="font-display text-2xl font-semibold text-maroon">Edit Function</h1>
      </header>

      {loadError && <div className="mb-6 rounded-lg border border-rust-red/20 bg-rust-red/10 p-4 text-sm text-rust-red">{loadError}</div>}
      {!fn && !loadError && <p className="font-data text-sm text-maroon/50">Loading…</p>}

      {fn && (
        <form onSubmit={save} className="space-y-6">
          {saveError && <div className="rounded-lg border border-rust-red/20 bg-rust-red/10 p-4 text-sm text-rust-red">{saveError}</div>}

          <div className="space-y-2">
            <Label htmlFor="name">Function Name</Label>
            <Input id="name" required value={fn.name} onChange={e => set({ name: e.target.value })} className={`border-marigold/50 bg-white ${isDuplicate ? 'border-rust-red' : ''}`} />
            {isDuplicate && <p className="font-data text-xs font-medium text-rust-red">Another function or budget allotment already has this name.</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="event_date">Date</Label>
            <Input id="event_date" type="date" required value={fn.event_date?.slice(0, 10) || ''} onChange={e => set({ event_date: e.target.value })} className="border-marigold/50 bg-white" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time">Start Time</Label>
              <Input id="start_time" type="time" value={fn.start_time?.slice(0, 5) || ''} onChange={e => set({ start_time: e.target.value })} className="border-marigold/50 bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">End Time</Label>
              <Input id="end_time" type="time" value={fn.end_time?.slice(0, 5) || ''} onChange={e => set({ end_time: e.target.value })} className="border-marigold/50 bg-white" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location / Venue</Label>
            <Input id="location" value={fn.location || ''} onChange={e => set({ location: e.target.value })} placeholder="e.g. Taj Hotel" className="border-marigold/50 bg-white" />
            <p className="font-data text-[11px] text-maroon/50">The venue, address and map link guests see are under &ldquo;For guests&rdquo; on the function page.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hosting_side">Hosting Side</Label>
            <select id="hosting_side" value={fn.hosting_side} onChange={e => set({ hosting_side: e.target.value as FunctionRow['hosting_side'] })} className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm">
              <option value="groom">Ladkewale 🤵‍♂️</option>
              <option value="bride">Ladkiwale 👰‍♀️</option>
              <option value="joint">Joint 🤝</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_budget">Max Budget (₹)</Label>
            <Input id="max_budget" type="number" min="0" step="1" value={fn.max_budget ?? ''} onChange={e => set({ max_budget: Number(e.target.value) })} className="border-marigold/50 bg-white" />
            <p className="font-data text-[11px] text-maroon/50">
              {hasBudgetCategory
                ? 'This function has a budget category, so its limit in Budget Setup is used instead of this number.'
                : 'Used as this function’s budget until a budget category is linked to it.'}
            </p>
          </div>

          <Button type="submit" disabled={saving || isDuplicate} className="mt-4 w-full bg-maroon py-6 font-bold text-ivory hover:bg-maroon/90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </form>
      )}
    </main>
  )
}
