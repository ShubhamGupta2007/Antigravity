'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { MapPin, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type GuestDetails = {
  venue_name: string | null
  venue_address: string | null
  map_url: string | null
  dress_code: string | null
  dress_colors: string[] | null
  guest_note: string | null
}

/** What guests see about this function on their invitation: venue, map, dress code, a note. */
export default function FunctionGuestDetails({ functionId, initial }: { functionId: string; initial: GuestDetails }) {
  const supabase = useMemo(() => createClient(), [])
  const [d, setD] = useState<GuestDetails>({ ...initial, dress_colors: initial.dress_colors || [] })
  const [open, setOpen] = useState(!initial.venue_name && !initial.dress_code)
  const [saving, setSaving] = useState(false)
  const colors = d.dress_colors || []

  const set = (patch: Partial<GuestDetails>) => setD(prev => ({ ...prev, ...patch }))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const clean = (v: string | null) => (v && v.trim() ? v.trim() : null)
    const { error } = await supabase
      .from('functions')
      .update({
        venue_name: clean(d.venue_name),
        venue_address: clean(d.venue_address),
        map_url: clean(d.map_url),
        dress_code: clean(d.dress_code),
        dress_colors: colors.length ? colors : null,
        guest_note: clean(d.guest_note)
      })
      .eq('id', functionId)
    setSaving(false)
    if (error) toast.error(`Could not save: ${error.message}`)
    else {
      toast.success('Guests will see these details')
      setOpen(false)
    }
  }

  return (
    <section className="rounded-2xl border border-marigold/20 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between border-b border-marigold/10 pb-3">
        <h2 className="flex items-center font-display text-xl font-semibold text-maroon">
          <MapPin className="mr-2 h-5 w-5" /> For guests
        </h2>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="h-8 rounded-full border-marigold/50 text-xs text-maroon hover:bg-marigold/10">Edit</Button>
        )}
      </div>

      {!open ? (
        <dl className="space-y-1.5 font-data text-sm text-maroon/80">
          <div><dt className="inline font-semibold text-maroon">Venue: </dt><dd className="inline">{d.venue_name || '—'}{d.venue_address ? `, ${d.venue_address}` : ''}</dd></div>
          <div className="flex items-center gap-1.5"><dt className="font-semibold text-maroon">Dress: </dt><dd className="flex items-center gap-1.5">{colors.map(c => <span key={c} aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: c }} />)}{d.dress_code || (colors.length ? '' : '—')}</dd></div>
          {d.guest_note && <div><dt className="inline font-semibold text-maroon">Note: </dt><dd className="inline">{d.guest_note}</dd></div>}
          <p className="pt-1 text-[11px] text-maroon/50">Shown on each invited family&apos;s invitation, with the timed parts from the Schedule.</p>
        </dl>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="venue_name" className="text-xs font-semibold text-maroon">Venue</Label>
              <Input id="venue_name" value={d.venue_name || ''} onChange={e => set({ venue_name: e.target.value })} placeholder="e.g. Shubh Vatika Lawns" className="h-9 border-marigold/50 bg-white text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="venue_address" className="text-xs font-semibold text-maroon">Address</Label>
              <Input id="venue_address" value={d.venue_address || ''} onChange={e => set({ venue_address: e.target.value })} placeholder="e.g. Delhi Road, Meerut" className="h-9 border-marigold/50 bg-white text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="map_url" className="text-xs font-semibold text-maroon">Google Maps link <span className="font-normal text-maroon/50">(optional; otherwise we search the address)</span></Label>
            <Input id="map_url" type="url" value={d.map_url || ''} onChange={e => set({ map_url: e.target.value })} placeholder="https://maps.app.goo.gl/…" className="h-9 border-marigold/50 bg-white text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dress_code" className="text-xs font-semibold text-maroon">What to wear</Label>
            <Input id="dress_code" value={d.dress_code || ''} onChange={e => set({ dress_code: e.target.value })} placeholder="e.g. Pastels, or Traditional, rich colours" className="h-9 border-marigold/50 bg-white text-sm" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-maroon">Colours</p>
            <div className="flex flex-wrap items-center gap-2">
              {colors.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full border border-marigold/30 bg-ivory py-1 pl-1 pr-2">
                  <input
                    type="color"
                    aria-label={`Colour ${i + 1}`}
                    value={c}
                    onChange={e => set({ dress_colors: colors.map((x, j) => (j === i ? e.target.value : x)) })}
                    className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                  />
                  <button type="button" aria-label={`Remove colour ${i + 1}`} onClick={() => set({ dress_colors: colors.filter((_, j) => j !== i) })} className="text-maroon/50 hover:text-rust-red">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {colors.length < 4 && (
                <button type="button" onClick={() => set({ dress_colors: [...colors, '#8E1F2F'] })} className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-marigold/50 px-3 text-xs font-semibold text-maroon hover:bg-marigold/10">
                  <Plus className="h-3.5 w-3.5" /> Colour
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="guest_note" className="text-xs font-semibold text-maroon">Note for guests <span className="font-normal text-maroon/50">(optional)</span></Label>
            <textarea id="guest_note" rows={2} value={d.guest_note || ''} onChange={e => set({ guest_note: e.target.value })} placeholder="e.g. Dinner from 9:30 PM. Parking at the back gate." className="w-full rounded-md border border-marigold/50 bg-white p-2 font-data text-sm text-maroon" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-8 border-marigold/30 text-xs text-maroon">Cancel</Button>
            <Button type="submit" disabled={saving} className="h-8 min-w-[90px] bg-maroon text-xs text-ivory">{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      )}
    </section>
  )
}
