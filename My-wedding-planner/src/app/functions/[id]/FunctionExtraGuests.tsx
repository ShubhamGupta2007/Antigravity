'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Minus, Plus } from 'lucide-react'
import { createClient } from '@/lib/client'

/**
 * Guests expected at a function who aren't on the guest list (neighbours, the mohalla,
 * walk-ins at a Mata ki Chowki). Added to the function's headcount, not to lifafas.
 */
export default function FunctionExtraGuests({
  functionId,
  initialAdults,
  initialKids,
  listed,
  canEdit
}: {
  functionId: string
  initialAdults: number
  initialKids: number
  /** Guests counted from the guest list */
  listed: number
  canEdit: boolean
}) {
  const router = useRouter()
  const [, startRefresh] = useTransition()
  const [adults, setAdults] = useState(String(initialAdults || ''))
  const [kids, setKids] = useState(String(initialKids || ''))
  const [saving, setSaving] = useState(false)
  const saved = useRef({ adults: initialAdults || 0, kids: initialKids || 0 })

  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0))
  const extra = num(adults) + num(kids)

  const save = async (nextAdults = num(adults), nextKids = num(kids)) => {
    if (nextAdults === saved.current.adults && nextKids === saved.current.kids) return
    setSaving(true)
    const { error } = await createClient().from('functions').update({ estimated_adults: nextAdults, estimated_kids: nextKids }).eq('id', functionId)
    setSaving(false)
    if (error) {
      toast.error(/estimated_/.test(error.message) ? 'Run supabase/19_estimated_guests.sql in the Supabase SQL editor first.' : `Could not save: ${error.message}`)
      return
    }
    saved.current = { adults: nextAdults, kids: nextKids }
    startRefresh(() => router.refresh())
  }

  const stepper = (label: string, value: string, set: (v: string) => void, which: 'adults' | 'kids') => {
    const bump = (d: number) => {
      const next = String(Math.max(0, num(value) + d))
      set(next)
      save(which === 'adults' ? num(next) : num(adults), which === 'kids' ? num(next) : num(kids))
    }
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-marigold/20">
        <span className="font-data text-xs font-semibold text-maroon">{label}</span>
        {canEdit ? (
          <div className="flex items-center rounded-full border border-marigold/40">
            <button type="button" onClick={() => bump(-10)} disabled={num(value) === 0} aria-label={`Ten fewer ${label.toLowerCase()}`} className="grid h-8 w-8 place-items-center text-maroon disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              aria-label={`Estimated ${label.toLowerCase()} not on the list`}
              value={value}
              placeholder="0"
              onChange={e => set(e.target.value)}
              onBlur={() => save()}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="w-14 bg-transparent text-center font-data text-sm font-bold text-maroon outline-none [appearance:textfield]"
            />
            <button type="button" onClick={() => bump(10)} aria-label={`Ten more ${label.toLowerCase()}`} className="grid h-8 w-8 place-items-center text-maroon"><Plus className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <span className="font-data text-sm font-bold text-maroon">{num(value)}</span>
        )}
      </div>
    )
  }

  return (
    <section className="rounded-2xl border border-marigold/20 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-maroon">Guests not on the list</h2>
        {saving && <span className="font-data text-[11px] text-maroon/50">Saving…</span>}
      </div>
      <p className="mb-3 font-data text-xs text-maroon/60">
        For big functions where not everyone is on the guest list: neighbours, the mohalla, walk-ins. Counted in the headcount and catering, not in lifafas.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {stepper('Adults', adults, setAdults, 'adults')}
        {stepper('Kids', kids, setKids, 'kids')}
      </div>
      <p className="mt-3 rounded-xl bg-ivory px-3 py-2 font-data text-xs text-maroon/70">
        <b className="text-maroon">{listed + extra}</b> expected in all = {listed} from the guest list + {extra} estimated
      </p>
    </section>
  )
}
