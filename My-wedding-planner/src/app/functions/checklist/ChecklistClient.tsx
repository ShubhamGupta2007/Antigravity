'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/client'
import { parseEventDate } from '@/lib/functionPlanning'

type Status = 'pending' | 'arranged' | 'given'
export type ChecklistItem = {
  id: string
  item: string
  quantity: string | null
  given_by_side: string | null
  given_by: string | null
  given_to_side: string | null
  given_to: string | null
  est_cost: number | null
  status: Status
  ritualName: string
  functionId: string
  functionName: string
  eventDate: string | null
}

const STATUS: Record<Status, { label: string; cls: string; next: Status }> = {
  pending: { label: '⏳ To arrange', cls: 'bg-rust-red/10 text-rust-red', next: 'arranged' },
  arranged: { label: '📦 Arranged', cls: 'bg-marigold/20 text-maroon', next: 'given' },
  given: { label: '✅ Given', cls: 'bg-mehendi/15 text-mehendi', next: 'pending' }
}
const SIDE: Record<string, string> = { groom: "Groom's side", bride: "Bride's side", joint: 'Both families', other: 'Other' }
const party = (side: string | null, who: string | null) => [side ? SIDE[side] || side : null, who].filter(Boolean).join(' · ') || '—'

export default function ChecklistClient({ items: initial, canEdit }: { items: ChecklistItem[]; canEdit: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState(initial)
  const [filter, setFilter] = useState<'open' | 'pending' | 'all'>('open')
  const [side, setSide] = useState<'all' | 'groom' | 'bride'>('all')

  const visible = items.filter(i =>
    (filter === 'all' || (filter === 'open' ? i.status !== 'given' : i.status === 'pending')) &&
    (side === 'all' || i.given_by_side === side || i.given_by_side === 'joint')
  )
  const groups = new Map<string, ChecklistItem[]>()
  visible.forEach(i => groups.set(i.functionId, [...(groups.get(i.functionId) || []), i]))
  const counts = {
    pending: items.filter(i => i.status === 'pending').length,
    arranged: items.filter(i => i.status === 'arranged').length,
    given: items.filter(i => i.status === 'given').length
  }

  const cycle = async (item: ChecklistItem) => {
    if (!canEdit) return
    const next = STATUS[item.status].next
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, status: next } : i)))
    const { error } = await supabase.from('ritual_items').update({ status: next }).eq('id', item.id)
    if (error) {
      toast.error(`Could not update: ${error.message}`)
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, status: item.status } : i)))
    }
  }

  const chip = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-semibold transition-colors ${active ? 'bg-maroon text-ivory' : 'bg-marigold/10 text-maroon hover:bg-marigold/20'}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 text-[11px] font-data">
        <span className="px-2 py-1 rounded-full bg-rust-red/10 text-rust-red">⏳ <b>{counts.pending}</b> to arrange</span>
        <span className="px-2 py-1 rounded-full bg-marigold/20 text-maroon">📦 <b>{counts.arranged}</b> arranged</span>
        <span className="px-2 py-1 rounded-full bg-mehendi/15 text-mehendi">✅ <b>{counts.given}</b> given</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={chip(filter === 'open')} onClick={() => setFilter('open')}>Not given yet</button>
        <button className={chip(filter === 'pending')} onClick={() => setFilter('pending')}>To arrange</button>
        <button className={chip(filter === 'all')} onClick={() => setFilter('all')}>Everything</button>
        <span className="w-px bg-marigold/30 mx-1" aria-hidden />
        <button className={chip(side === 'all')} onClick={() => setSide('all')}>Both sides</button>
        <button className={chip(side === 'groom')} onClick={() => setSide('groom')}>🤵‍♂️ We give (groom)</button>
        <button className={chip(side === 'bride')} onClick={() => setSide('bride')}>👰‍♀️ We give (bride)</button>
      </div>

      {groups.size === 0 ? (
        <p className="text-sm font-data text-maroon/50 italic text-center py-10 bg-white rounded-2xl border border-marigold/20">
          {items.length === 0 ? 'No ritual items yet. Add them under Rituals on each function.' : 'Nothing here. 🎉'}
        </p>
      ) : (
        Array.from(groups.entries()).map(([fid, list]) => (
          <section key={fid} className="bg-white rounded-2xl border border-marigold/20 shadow-sm">
            <header className="flex items-baseline justify-between gap-2 p-4 border-b border-marigold/15">
              <Link href={`/functions/${fid}`} className="font-display font-semibold text-lg text-maroon hover:text-marigold">{list[0].functionName}</Link>
              {list[0].eventDate && <span className="text-xs font-data text-maroon/60">{format(parseEventDate(list[0].eventDate), 'EEE, d MMM')}</span>}
            </header>
            <ul className="divide-y divide-marigold/10">
              {list.map(i => (
                <li key={i.id} className="p-4 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-maroon">
                      🎁 {i.item}{i.quantity && <span className="font-normal text-maroon/60"> × {i.quantity}</span>}
                      <span className="ml-2 text-[10px] font-data font-normal text-maroon/50 uppercase tracking-wide">{i.ritualName}</span>
                    </p>
                    <p className="text-xs font-data text-maroon/60 flex flex-wrap items-center gap-1 mt-0.5">
                      {party(i.given_by_side, i.given_by)} <ArrowRight className="w-3 h-3 text-marigold" aria-label="to" /> {party(i.given_to_side, i.given_to)}
                      {i.est_cost ? <span className="ml-2">₹{Math.round(Number(i.est_cost)).toLocaleString('en-IN')}</span> : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => cycle(i)}
                    disabled={!canEdit}
                    title={canEdit ? 'Tap to change status' : undefined}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS[i.status].cls} ${canEdit ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                  >
                    {STATUS[i.status].label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
