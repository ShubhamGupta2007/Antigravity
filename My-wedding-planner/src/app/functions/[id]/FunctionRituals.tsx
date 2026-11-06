'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, Plus, Edit2, Trash2, ArrowRight, Wallet } from 'lucide-react'
import { createClient } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatTime, sortSegments } from '@/lib/functionPlanning'
import RitualItemForm, { type RitualPerson } from './RitualItemForm'

type Side = 'groom' | 'bride' | 'joint'
type ToSide = Side | 'other'
type Status = 'pending' | 'arranged' | 'given'

export type RitualItem = {
  id: string
  ritual_id: string
  item: string
  quantity: string | null
  given_by_side: Side | null
  given_by: string | null
  given_to_side: ToSide | null
  given_to: string | null
  est_cost: number | null
  status: Status
  notes: string | null
  /** 'activity' = something done (tilak, chunni chadhana); missing before 15_ritual_activities.sql */
  kind?: 'gift' | 'activity' | null
}

export type Ritual = {
  id: string
  function_id: string
  name: string
  start_time: string | null
  description: string | null
  sort_order: number
  ritual_items?: RitualItem[] | null
}

const SIDE_LABEL: Record<ToSide, string> = {
  groom: "🤵‍♂️ Groom's side",
  bride: "👰‍♀️ Bride's side",
  joint: '🤝 Both families',
  other: '🙏 Other'
}

const SIDE_CHIP: Record<ToSide, string> = {
  groom: 'bg-marigold/20 text-maroon',
  bride: 'bg-rani-pink/10 text-rani-pink',
  joint: 'bg-mehendi/10 text-mehendi',
  other: 'bg-maroon/5 text-maroon/70'
}

const STATUS: Record<Status, { label: string; cls: string; next: Status }> = {
  pending: { label: '⏳ To arrange', cls: 'bg-rust-red/10 text-rust-red', next: 'arranged' },
  arranged: { label: '📦 Arranged', cls: 'bg-marigold/20 text-maroon', next: 'given' },
  given: { label: '✅ Given', cls: 'bg-mehendi/15 text-mehendi', next: 'pending' }
}
const ACTIVITY_LABEL: Record<Status, string> = { pending: '⏳ To do', arranged: '👍 Ready', given: '✅ Done' }

const SUGGESTIONS = ['Tilak', 'Ring Exchange', 'Shagun', 'Chunni Chadhana', 'Milni', 'Varmala', 'Kanyadaan', 'Vidaai']

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const text = (fd: FormData, key: string) => String(fd.get(key) || '').trim() || null

function Party({ side, who }: { side: ToSide | null; who: string | null }) {
  if (!side && !who) return <span className="text-maroon/40 italic">not set</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {side && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${SIDE_CHIP[side]}`}>{SIDE_LABEL[side]}</span>}
      {who && <span className="text-maroon font-medium">{who}</span>}
    </span>
  )
}

export default function FunctionRituals({
  functionId,
  canEdit,
  initialRituals,
  storedRitualTotal = 0,
  linkedCategory = null,
  people = []
}: {
  functionId: string
  canEdit: boolean
  initialRituals: Ritual[]
  storedRitualTotal?: number
  linkedCategory?: { id: string; name: string } | null
  people?: RitualPerson[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const [rituals, setRituals] = useState<Ritual[]>(() =>
    initialRituals.map(r => ({ ...r, ritual_items: r.ritual_items || [] }))
  )
  const [ritualForm, setRitualForm] = useState<{ editing: Ritual | null; name?: string } | null>(null)
  const [itemForm, setItemForm] = useState<{ ritualId: string; editing: RitualItem | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sorted = sortSegments(rituals)
  const allItems = rituals.flatMap(r => r.ritual_items || [])
  const fromGroom = allItems.filter(i => i.given_by_side === 'groom').length
  const fromBride = allItems.filter(i => i.given_by_side === 'bride').length
  const pending = allItems.filter(i => i.status === 'pending').length
  const estTotal = allItems.reduce((s, i) => s + (Number(i.est_cost) || 0), 0)

  // Keep the budget's auto "Ritual items" line in step with the estimated costs
  const lastSaved = useRef(Number(storedRitualTotal) || 0)
  const [syncError, setSyncError] = useState(false)
  useEffect(() => {
    if (!canEdit || lastSaved.current === estTotal) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const { error: err } = await supabase.rpc('set_function_ritual_plan', { p_function_id: functionId, p_total: estTotal })
      if (cancelled) return
      if (err) {
        console.error(err)
        setSyncError(true)
      } else {
        lastSaved.current = estTotal
        setSyncError(false)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [estTotal, canEdit, supabase, functionId])

  const updateItems = (ritualId: string, fn: (items: RitualItem[]) => RitualItem[]) =>
    setRituals(prev => prev.map(r => (r.id === ritualId ? { ...r, ritual_items: fn(r.ritual_items || []) } : r)))

  // ---- Rituals -----------------------------------------------------------
  const saveRitual = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const payload = {
      function_id: functionId,
      name: String(fd.get('name') || '').trim(),
      start_time: text(fd, 'start_time'),
      description: text(fd, 'description')
    }
    const editing = ritualForm?.editing
    setSaving(true)
    const { data, error: err } = editing
      ? await supabase.from('function_rituals').update(payload).eq('id', editing.id).select().single()
      : await supabase.from('function_rituals').insert({ ...payload, sort_order: rituals.length }).select().single()
    setSaving(false)
    if (err) return setError(err.message)
    setRituals(prev =>
      editing
        ? prev.map(r => (r.id === data.id ? { ...data, ritual_items: r.ritual_items } : r))
        : [...prev, { ...data, ritual_items: [] }]
    )
    setRitualForm(null)
    setError(null)
  }

  const deleteRitual = async (ritual: Ritual) => {
    const count = ritual.ritual_items?.length || 0
    if (!window.confirm(`Delete "${ritual.name}"${count ? ` and its ${count} item${count === 1 ? '' : 's'}` : ''}?`)) return
    const { error: err } = await supabase.from('function_rituals').delete().eq('id', ritual.id)
    if (err) toast.error(`Could not delete: ${err.message}`)
    else setRituals(prev => prev.filter(r => r.id !== ritual.id))
  }

  // ---- Items -------------------------------------------------------------
  const deleteItem = async (item: RitualItem) => {
    if (!window.confirm(`Remove "${item.item}"?`)) return
    const { error: err } = await supabase.from('ritual_items').delete().eq('id', item.id)
    if (err) toast.error(`Could not remove: ${err.message}`)
    else updateItems(item.ritual_id, items => items.filter(i => i.id !== item.id))
  }

  const cycleStatus = async (item: RitualItem) => {
    const next = STATUS[item.status].next
    updateItems(item.ritual_id, items => items.map(i => (i.id === item.id ? { ...i, status: next } : i)))
    const { error: err } = await supabase.from('ritual_items').update({ status: next }).eq('id', item.id)
    if (err) {
      toast.error(`Could not update: ${err.message}`)
      updateItems(item.ritual_id, items => items.map(i => (i.id === item.id ? { ...i, status: item.status } : i)))
    }
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6">
      <div className="flex items-center justify-between mb-4 border-b border-marigold/10 pb-3">
        <h2 className="text-xl font-display font-semibold text-maroon flex items-center">
          <Sparkles className="w-5 h-5 mr-2 text-maroon" /> Rituals
        </h2>
        {canEdit && !ritualForm && (
          <Button size="sm" onClick={() => { setError(null); setRitualForm({ editing: null }) }} className="bg-maroon text-ivory hover:bg-maroon/90 h-8 text-xs rounded-full">
            <Plus className="w-4 h-4 mr-1" /> Add Ritual
          </Button>
        )}
      </div>

      {allItems.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 text-[11px] font-data">
          <span className="px-2 py-1 rounded-full bg-marigold/15 text-maroon">🤵‍♂️ Groom&apos;s side gives <b>{fromGroom}</b></span>
          <span className="px-2 py-1 rounded-full bg-rani-pink/10 text-rani-pink">👰‍♀️ Bride&apos;s side gives <b>{fromBride}</b></span>
          {pending > 0 && <span className="px-2 py-1 rounded-full bg-rust-red/10 text-rust-red">⏳ <b>{pending}</b> still to arrange</span>}
          {estTotal > 0 && <span className="px-2 py-1 rounded-full bg-maroon/5 text-maroon">Est. <b>{rupees(estTotal)}</b></span>}
        </div>
      )}
      {estTotal > 0 && (
        <p className="-mt-2 mb-4 text-[11px] font-data text-maroon/60">
          <Wallet className="inline w-3.5 h-3.5 mr-1 text-mehendi" />
          {linkedCategory
            ? <>In budget as <strong className="text-maroon">{linkedCategory.name} → Ritual items</strong></>
            : 'Not in the budget yet: link a budget category to this function in Budget Setup.'}
          {syncError && <span className="text-rust-red"> • couldn&apos;t update the budget (has 12_ritual_budget.sql been run?)</span>}
        </p>
      )}

      {sorted.length === 0 && !ritualForm && (
        <div className="text-center py-3 space-y-3">
          <p className="text-sm font-data text-maroon/50 italic">No rituals added yet.</p>
          {canEdit && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map(name => (
                <button key={name} type="button" onClick={() => { setError(null); setRitualForm({ editing: null, name }) }} className="text-xs px-2.5 py-1 rounded-full bg-marigold/10 text-maroon hover:bg-marigold/20 border border-marigold/20">
                  + {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ritual form */}
      {ritualForm && (
        <form key={ritualForm.editing?.id || ritualForm.name || 'new'} onSubmit={saveRitual} className="mb-4 p-4 bg-ivory/60 rounded-xl border border-marigold/25 space-y-3">
          {error && <div className="p-2 bg-rust-red/10 border border-rust-red/30 text-rust-red text-xs rounded font-data">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-maroon font-semibold">Ritual</Label>
              <Input name="name" required defaultValue={ritualForm.editing?.name || ritualForm.name} placeholder="e.g. Milni" className="bg-white border-marigold/50 h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-maroon font-semibold">Time (optional)</Label>
              <Input name="start_time" type="time" defaultValue={ritualForm.editing?.start_time?.slice(0, 5) || ''} className="bg-white border-marigold/50 h-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-maroon font-semibold">What happens (optional)</Label>
            <textarea name="description" rows={2} defaultValue={ritualForm.editing?.description || ''} placeholder="e.g. Elders of both families meet and exchange shagun" className="w-full rounded-md border border-marigold/50 bg-white p-2 text-sm font-data text-maroon" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRitualForm(null)} className="border-marigold/30 text-maroon h-8 text-xs">Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-maroon text-ivory h-8 text-xs min-w-[90px]">{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {sorted.map(ritual => {
          const items = ritual.ritual_items || []
          const isItemFormHere = itemForm?.ritualId === ritual.id
          return (
            <article key={ritual.id} className="rounded-xl border border-marigold/25 bg-ivory/30">
              <header className="flex flex-wrap items-start justify-between gap-2 p-3 border-b border-marigold/15">
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-maroon">
                    {ritual.name}
                    {ritual.start_time && <span className="ml-2 text-xs font-data font-normal text-maroon/60">{formatTime(ritual.start_time)}</span>}
                  </h3>
                  {ritual.description && <p className="text-xs font-data text-maroon/60 mt-0.5 whitespace-pre-line">{ritual.description}</p>}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label="Edit ritual" onClick={() => { setError(null); setRitualForm({ editing: ritual }) }} className="text-maroon/50 hover:text-maroon hover:bg-marigold/10 h-8 w-8">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete ritual" onClick={() => deleteRitual(ritual)} className="text-rust-red/50 hover:text-rust-red hover:bg-rust-red/10 h-8 w-8">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </header>

              <ul className="divide-y divide-marigold/10">
                {items.length === 0 && !isItemFormHere && (
                  <li className="p-3 text-xs font-data text-maroon/40 italic">Nothing planned yet: add what is given, or what someone does.</li>
                )}
                {items.map(item => (
                  <li key={item.id} className="p-3 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-maroon">
                        {item.kind === 'activity' ? '🙌' : '🎁'} {item.item}
                        {item.quantity && <span className="font-normal text-maroon/60"> × {item.quantity}</span>}
                        {item.est_cost ? <span className="ml-2 text-xs font-data font-normal text-maroon/60">{rupees(Number(item.est_cost))}</span> : null}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => cycleStatus(item)}
                          title={canEdit ? 'Tap to change status' : undefined}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS[item.status].cls} ${canEdit ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                        >
                          {item.kind === 'activity' ? ACTIVITY_LABEL[item.status] : STATUS[item.status].label}
                        </button>
                        {canEdit && (
                          <>
                            <Button variant="ghost" size="icon" aria-label="Edit item" onClick={() => { setError(null); setItemForm({ ritualId: ritual.id, editing: item }) }} className="text-maroon/50 hover:text-maroon hover:bg-marigold/10 h-7 w-7">
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label="Remove item" onClick={() => deleteItem(item)} className="text-rust-red/50 hover:text-rust-red hover:bg-rust-red/10 h-7 w-7">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-data text-maroon/70">
                      <span className="text-[10px] uppercase font-bold text-maroon/40">{item.kind === 'activity' ? 'By' : 'From'}</span>
                      <Party side={item.given_by_side} who={item.given_by} />
                      <ArrowRight className="w-3.5 h-3.5 text-marigold" aria-label="to" />
                      <span className="text-[10px] uppercase font-bold text-maroon/40">{item.kind === 'activity' ? 'For' : 'To'}</span>
                      <Party side={item.given_to_side} who={item.given_to} />
                    </div>
                    {item.notes && <p className="text-[11px] font-data text-maroon/50">{item.notes}</p>}
                  </li>
                ))}
              </ul>

              {isItemFormHere ? (
                <RitualItemForm
                  key={itemForm?.editing?.id || 'new'}
                  ritualId={ritual.id}
                  editing={itemForm?.editing || null}
                  people={people}
                  supabase={supabase}
                  onCancel={() => setItemForm(null)}
                  onSaved={(rows, replacedId) => {
                    updateItems(ritual.id, items => (replacedId ? items.map(i => (i.id === replacedId ? rows[0] : i)) : [...items, ...rows]))
                    setItemForm(null)
                  }}
                />
              ) : (
                canEdit && (
                  <div className="p-2 border-t border-marigold/10">
                    <button type="button" onClick={() => { setError(null); setItemForm({ ritualId: ritual.id, editing: null }) }} className="text-xs font-semibold text-maroon hover:underline px-1">
                      + Add something given or done
                    </button>
                  </div>
                )
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
