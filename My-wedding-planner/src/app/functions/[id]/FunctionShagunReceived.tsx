'use client'

import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { HandCoins, Plus, Trash2, Edit2 } from 'lucide-react'
import { createClient } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ShagunEntry = {
  id: string
  function_id: string
  family_id: string | null
  giver_name: string | null
  amount: number | null
  item: string | null
  notes: string | null
  created_at: string
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const familyLabel = (name?: string | null) =>
  !name ? 'Family' : name.toLowerCase().endsWith('family') ? name : `${name} Family`

/** Shagun / gifts received from guests at this function (not the lifafas the family gives). */
export default function FunctionShagunReceived({
  functionId,
  initialEntries,
  families
}: {
  functionId: string
  initialEntries: ShagunEntry[]
  families: { id: string; family_name?: string | null }[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const [entries, setEntries] = useState<ShagunEntry[]>(initialEntries)
  const [editing, setEditing] = useState<ShagunEntry | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameOf = (e: ShagunEntry) =>
    e.family_id ? familyLabel(families.find(f => f.id === e.family_id)?.family_name || e.giver_name) : e.giver_name || 'Guest'
  const sorted = [...entries].sort((a, b) => (b.amount || 0) - (a.amount || 0))
  const cashTotal = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const giftCount = entries.filter(e => e.item).length
  const current = editing && editing !== 'new' ? editing : null

  const handleSave = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget)
    const familyId = String(fd.get('family_id') || '') || null
    const giver = String(fd.get('giver_name') || '').trim() || null
    const amountRaw = String(fd.get('amount') || '').trim()
    const item = String(fd.get('item') || '').trim() || null
    if (!familyId && !giver) return setError('Pick a family or type who gave it.')
    if (!amountRaw && !item) return setError('Enter an amount or the gift.')
    const payload = {
      function_id: functionId,
      family_id: familyId,
      giver_name: giver,
      amount: amountRaw ? Number(amountRaw) : null,
      item,
      notes: String(fd.get('notes') || '').trim() || null
    }
    setSaving(true)
    const { data, error: err } = current
      ? await supabase.from('shagun_received').update(payload).eq('id', current.id).select().single()
      : await supabase.from('shagun_received').insert(payload).select().single()
    setSaving(false)
    if (err) return setError(err.message)
    setEntries(prev => (current ? prev.map(e => (e.id === data.id ? data : e)) : [...prev, data]))
    setEditing(null)
    setError(null)
    if (!current) toast.success('Shagun recorded')
  }

  const handleDelete = async (entry: ShagunEntry) => {
    if (!window.confirm(`Remove the entry from ${nameOf(entry)}?`)) return
    const { error: err } = await supabase.from('shagun_received').delete().eq('id', entry.id)
    if (err) toast.error(`Could not remove: ${err.message}`)
    else setEntries(prev => prev.filter(e => e.id !== entry.id))
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6">
      <div className="flex items-center justify-between mb-1 border-b border-marigold/10 pb-3">
        <h2 className="text-xl font-display font-semibold text-maroon flex items-center">
          <HandCoins className="w-5 h-5 mr-2 text-maroon" /> Shagun Received
        </h2>
        {!editing && (
          <Button size="sm" onClick={() => { setError(null); setEditing('new') }} className="bg-maroon text-ivory hover:bg-maroon/90 h-8 text-xs rounded-full">
            <Plus className="w-4 h-4 mr-1" /> Record
          </Button>
        )}
      </div>
      <p className="text-[11px] font-data text-maroon/50 mb-4">What guests gave you at this function. Only the hosts can see this.</p>

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 text-[11px] font-data">
          <span className="px-2 py-1 rounded-full bg-mehendi/10 text-mehendi">Cash <b>{rupees(cashTotal)}</b></span>
          <span className="px-2 py-1 rounded-full bg-marigold/15 text-maroon"><b>{entries.length}</b> {entries.length === 1 ? 'entry' : 'entries'}</span>
          {giftCount > 0 && <span className="px-2 py-1 rounded-full bg-maroon/5 text-maroon"><b>{giftCount}</b> {giftCount === 1 ? 'gift' : 'gifts'}</span>}
        </div>
      )}

      {editing && (
        <form key={current?.id || 'new'} onSubmit={handleSave} className="mb-4 p-4 bg-ivory/60 rounded-xl border border-marigold/25 space-y-3">
          {error && <div className="p-2 bg-rust-red/10 border border-rust-red/30 text-rust-red text-xs rounded font-data">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-maroon font-semibold">Family</Label>
              <select name="family_id" defaultValue={current?.family_id || ''} className="w-full bg-white border border-marigold/50 rounded-md h-9 px-2 text-sm">
                <option value="">Not in the guest list</option>
                {families.map(f => <option key={f.id} value={f.id}>{familyLabel(f.family_name)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-maroon font-semibold">Given by (name)</Label>
              <Input name="giver_name" defaultValue={current?.giver_name || ''} placeholder="e.g. Verma uncle" className="bg-white border-marigold/50 h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-maroon font-semibold">Amount (₹)</Label>
              <Input name="amount" type="number" min={0} defaultValue={current?.amount ?? ''} placeholder="1100" className="bg-white border-marigold/50 h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-maroon font-semibold">Gift (if not cash)</Label>
              <Input name="item" defaultValue={current?.item || ''} placeholder="e.g. Silver coin" className="bg-white border-marigold/50 h-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-maroon font-semibold">Notes</Label>
            <Input name="notes" defaultValue={current?.notes || ''} placeholder="optional" className="bg-white border-marigold/50 h-9 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)} className="border-marigold/30 text-maroon h-8 text-xs">Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-maroon text-ivory h-8 text-xs min-w-[90px]">{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      )}

      {entries.length === 0 && !editing ? (
        <p className="text-sm font-data text-maroon/50 italic text-center py-3">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y divide-marigold/10">
          {sorted.map(e => (
            <li key={e.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-maroon">{nameOf(e)}</p>
                {(e.family_id && e.giver_name) || e.notes ? (
                  <p className="text-[11px] font-data text-maroon/50">{[e.family_id ? e.giver_name : null, e.notes].filter(Boolean).join(' • ')}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm font-data font-bold text-maroon text-right">
                  {e.amount ? rupees(Number(e.amount)) : ''}
                  {e.item && <span className="block text-[11px] font-normal text-maroon/60">🎁 {e.item}</span>}
                </span>
                <Button variant="ghost" size="icon" aria-label="Edit entry" onClick={() => { setError(null); setEditing(e) }} className="text-maroon/50 hover:text-maroon hover:bg-marigold/10 h-7 w-7">
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Remove entry" onClick={() => handleDelete(e)} className="text-rust-red/50 hover:text-rust-red hover:bg-rust-red/10 h-7 w-7">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
