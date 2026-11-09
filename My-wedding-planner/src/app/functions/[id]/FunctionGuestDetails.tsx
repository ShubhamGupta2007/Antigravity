'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { MapPin, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { colorName, isLight, NAMED_COLORS, OUTFITS_HER, OUTFITS_HIM, splitList, suggestedTheme, THEME_CHOICES, type DressTheme } from '@/lib/dressThemes'

export type GuestDetails = {
  venue_name: string | null
  venue_address: string | null
  map_url: string | null
  dress_code: string | null
  dress_colors: string[] | null
  guest_note: string | null
  /** Needs 20_dress_themes.sql */
  dress_theme?: string | null
  dress_him?: string | null
  dress_her?: string | null
}

/** What guests see about this function on their invitation: venue, map, dress code, a note. */
export default function FunctionGuestDetails({
  functionId,
  functionName = '',
  initial,
  themesReady = false
}: {
  functionId: string
  functionName?: string
  initial: GuestDetails
  /** 20_dress_themes.sql has been run: theme name and outfit ideas can be saved */
  themesReady?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [d, setD] = useState<GuestDetails>({ ...initial, dress_colors: initial.dress_colors || [] })
  const [open, setOpen] = useState(!initial.venue_name && !initial.dress_code)
  const [saving, setSaving] = useState(false)
  const colors = d.dress_colors || []
  const him = splitList(d.dress_him)
  const her = splitList(d.dress_her)
  const suggestion = suggestedTheme(functionName)
  const applyTheme = (t: DressTheme) => set({ dress_theme: t.theme, dress_colors: t.colors, dress_him: t.him.join(', '), dress_her: t.her.join(', ') })
  const toggleOutfit = (field: 'dress_him' | 'dress_her', item: string) => {
    const list = field === 'dress_him' ? him : her
    set({ [field]: (list.includes(item) ? list.filter(x => x !== item) : [...list, item]).join(', ') })
  }
  const toggleColor = (hex: string) =>
    set({ dress_colors: colors.some(c => c.toLowerCase() === hex.toLowerCase()) ? colors.filter(c => c.toLowerCase() !== hex.toLowerCase()) : colors.length < 5 ? [...colors, hex] : colors })

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
        guest_note: clean(d.guest_note),
        ...(themesReady ? { dress_theme: clean(d.dress_theme ?? null), dress_him: clean(d.dress_him ?? null), dress_her: clean(d.dress_her ?? null) } : {})
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
          <div className="flex flex-wrap items-center gap-1.5">
            <dt className="font-semibold text-maroon">Wear: </dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              {colors.map(c => <span key={c} aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: c }} />)}
              {[d.dress_theme, him.length ? `Him: ${him.join(', ')}` : null, her.length ? `Her: ${her.join(', ')}` : null, d.dress_code].filter(Boolean).join(' · ') || (colors.length ? '' : '—')}
            </dd>
          </div>
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
          <fieldset className="space-y-3 rounded-xl border border-marigold/25 bg-ivory/40 p-3">
            <legend className="px-1 text-xs font-bold text-maroon">👗 What to wear</legend>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-maroon/70">Quick themes{suggestion ? ` · suggested for ${functionName}: ${suggestion.theme}` : ''}</p>
              <div className="flex flex-wrap gap-1.5">
                {(suggestion ? [suggestion, ...THEME_CHOICES.filter(t => t.theme !== suggestion.theme)] : THEME_CHOICES).map(t => (
                  <button key={t.theme} type="button" onClick={() => applyTheme(t)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${d.dress_theme === t.theme ? 'border-maroon bg-maroon text-ivory' : 'border-marigold/40 bg-white text-maroon hover:bg-marigold/10'}`}>
                    <span className="flex -space-x-1">{t.colors.slice(0, 4).map(c => <span key={c} aria-hidden="true" className="h-3 w-3 rounded-full ring-1 ring-white" style={{ background: c }} />)}</span>
                    {t.theme}
                  </button>
                ))}
              </div>
            </div>

            {themesReady && (
              <div className="space-y-1">
                <Label htmlFor="dress_theme" className="text-xs font-semibold text-maroon">Theme name</Label>
                <Input id="dress_theme" value={d.dress_theme || ''} onChange={e => set({ dress_theme: e.target.value })} placeholder="e.g. Sunshine yellow, Pastels, Red & gold" className="h-9 border-marigold/50 bg-white text-sm" />
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-maroon">Colours <span className="font-normal text-maroon/50">(tap up to 5)</span></p>
              <div className="flex flex-wrap gap-1.5">
                {NAMED_COLORS.map(c => {
                  const on = colors.some(x => x.toLowerCase() === c.hex.toLowerCase())
                  return (
                    <button key={c.hex} type="button" onClick={() => toggleColor(c.hex)} aria-pressed={on} title={c.name}
                      className={`h-8 w-8 rounded-full transition-transform ${on ? 'scale-110 ring-2 ring-maroon ring-offset-2' : 'ring-1 ring-black/10 hover:scale-105'}`} style={{ background: c.hex }}>
                      <span className="sr-only">{c.name}</span>
                      {on && <span aria-hidden="true" className={`text-xs font-bold ${isLight(c.hex) ? 'text-maroon' : 'text-white'}`}>✓</span>}
                    </button>
                  )
                })}
                <label className="relative grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-dashed border-marigold/60 text-maroon/60" title="Another colour">
                  <Plus className="h-3.5 w-3.5" />
                  <input type="color" aria-label="Pick another colour" className="absolute inset-0 cursor-pointer opacity-0" onChange={e => colors.length < 5 && set({ dress_colors: [...colors, e.target.value] })} />
                </label>
              </div>
              {colors.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {colors.map(c => (
                    <span key={c} className="inline-flex items-center gap-1 rounded-full bg-white py-0.5 pl-1 pr-2 text-[11px] text-maroon ring-1 ring-marigold/30">
                      <span aria-hidden="true" className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: c }} />
                      {colorName(c)}
                      <button type="button" aria-label={`Remove ${colorName(c)}`} onClick={() => set({ dress_colors: colors.filter(x => x !== c) })} className="text-maroon/50 hover:text-rust-red"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {themesReady ? (
              (['dress_him', 'dress_her'] as const).map(field => {
                const list = field === 'dress_him' ? him : her
                const options = field === 'dress_him' ? OUTFITS_HIM : OUTFITS_HER
                return (
                  <div key={field} className="space-y-1.5">
                    <p className="text-xs font-semibold text-maroon">{field === 'dress_him' ? '👔 For him' : '🥻 For her'}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[...options, ...list.filter(x => !options.includes(x))].map(o => {
                        const on = list.includes(o)
                        return (
                          <button key={o} type="button" aria-pressed={on} onClick={() => toggleOutfit(field, o)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${on ? 'border-mehendi bg-mehendi text-white' : 'border-marigold/30 bg-white text-maroon hover:bg-marigold/10'}`}>
                            {on ? '✓ ' : ''}{o}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-[11px] text-maroon/60">Run <b>supabase/20_dress_themes.sql</b> to add a theme name and outfit ideas for him and her.</p>
            )}

            <div className="space-y-1">
              <Label htmlFor="dress_code" className="text-xs font-semibold text-maroon">Anything else about clothes <span className="font-normal text-maroon/50">(optional)</span></Label>
              <Input id="dress_code" value={d.dress_code || ''} onChange={e => set({ dress_code: e.target.value })} placeholder="e.g. Please avoid black · Comfortable shoes, it's on grass" className="h-9 border-marigold/50 bg-white text-sm" />
            </div>
          </fieldset>
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
