'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, Pencil, Search } from 'lucide-react'
import { createClient } from '@/lib/client'
import { Input } from '@/components/ui/input'
import {
  computeGifting,
  GIFT_KINDS,
  LIFAFA_EXCEPTION_KEY,
  saveGiftingPlan,
  type GiftCount,
  type GiftingRule,
  type GiftLine,
  type GiftOverride,
  type PlanningAttendance,
  type PlanningFamily
} from '@/lib/functionPlanning'
import type { Ritual } from './FunctionRituals'

export type HandoverRow = { family_id: string; line_key: string; given_at: string }

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const familyLabel = (name?: string | null) => (!name ? 'Family' : name.toLowerCase().endsWith('family') ? name : `${name} Family`)
const norm = (s: string) => s.trim().toLowerCase()

/** A ritual item handed to someone in this family (matched by name), with its share of the cost. */
type RitualLine = { itemId: string; label: string; ritual: string; names: string[]; share: number }

type Filter = 'all' | 'pending' | 'done'

/**
 * Hand-over checklist for one function: for each family, every lifafa and gift they are
 * due (from the plan) and ritual items given to them, ticked off as they're handed over.
 */
export default function FunctionGiftHandover({
  functionId,
  canTick,
  canChange,
  families,
  attendance,
  rules,
  overrides,
  initialCounts,
  kidAge,
  rituals,
  initialHandover
}: {
  functionId: string
  /** Hosts and managers: tick things off */
  canTick: boolean
  /** Managers: change one family's quantity or price */
  canChange: boolean
  families: PlanningFamily[]
  attendance: PlanningAttendance[]
  rules: GiftingRule[]
  overrides: GiftOverride[]
  initialCounts: GiftCount[]
  kidAge: number
  rituals: Ritual[]
  initialHandover: HandoverRow[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const [counts, setCounts] = useState<GiftCount[]>(initialCounts)
  const [given, setGiven] = useState<Set<string>>(() => new Set(initialHandover.map(h => `${h.family_id}:${h.line_key}`)))
  const [ritualGiven, setRitualGiven] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    rituals.forEach(r => (r.ritual_items || []).forEach(i => { map[i.id] = i.status === 'given' }))
    return map
  })
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ familyId: string; ruleId: string; qty: string; price: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const summary = useMemo(
    () => computeGifting(rules, overrides, families, attendance, kidAge, counts),
    [rules, overrides, families, attendance, kidAge, counts]
  )

  // Lines grouped per family
  const linesByFamily = useMemo(() => {
    const map = new Map<string, GiftLine[]>()
    summary.lines.forEach(l => map.set(l.familyId, [...(map.get(l.familyId) || []), l]))
    return map
  }, [summary.lines])

  // Ritual items whose receivers are members of a family (matched by name)
  const ritualByFamily = useMemo(() => {
    const map = new Map<string, RitualLine[]>()
    const invited = families.filter(f => attendance.some(a => a.family_id === f.id))
    rituals.forEach(r =>
      (r.ritual_items || []).forEach(item => {
        if (item.kind === 'activity') return
        const receivers = (item.given_to || '').split(',').map(x => x.trim()).filter(Boolean)
        if (receivers.length === 0) return
        const share = (Number(item.est_cost) || 0) / receivers.length
        invited.forEach(f => {
          const fname = norm(f.family_name || '')
          const names = receivers.filter(rc => {
            const n = norm(rc)
            if (n === fname || n === `${fname} family`) return true
            return (f.family_members || []).some(m => {
              const mn = norm(m.name || '')
              return mn && (n === mn || n === `${mn} (${fname})` || n === `${mn} (${fname} family)`)
            })
          })
          if (names.length === 0) return
          map.set(f.id, [
            ...(map.get(f.id) || []),
            {
              itemId: item.id,
              label: `${item.item}${item.quantity ? ` × ${item.quantity}` : ''}`,
              ritual: r.name,
              names,
              share: share * names.length
            }
          ])
        })
      })
    )
    return map
  }, [rituals, families, attendance])

  const familyRows = families
    .filter(f => (linesByFamily.get(f.id)?.length || 0) + (ritualByFamily.get(f.id)?.length || 0) > 0)
    .map(f => {
      const lines = linesByFamily.get(f.id) || []
      const rit = ritualByFamily.get(f.id) || []
      const doneLines = lines.filter(l => given.has(`${f.id}:${l.key}`))
      const doneRit = rit.filter(r => ritualGiven[r.itemId])
      const total = lines.reduce((s, l) => s + l.total, 0) + rit.reduce((s, r) => s + r.share, 0)
      const givenAmount = doneLines.reduce((s, l) => s + l.total, 0) + doneRit.reduce((s, r) => s + r.share, 0)
      const items = lines.length + rit.length
      const done = doneLines.length + doneRit.length
      return { family: f, lines, rit, total, givenAmount, items, done, complete: done === items }
    })

  const totals = familyRows.reduce(
    (acc, r) => ({ planned: acc.planned + r.total, given: acc.given + r.givenAmount, families: acc.families + 1, done: acc.done + (r.complete ? 1 : 0) }),
    { planned: 0, given: 0, families: 0, done: 0 }
  )

  const visible = familyRows
    .filter(r => (filter === 'all' ? true : filter === 'done' ? r.complete : !r.complete))
    .filter(r => !query.trim() || norm(r.family.family_name || '').includes(norm(query)))
    .sort((a, b) => Number(a.complete) - Number(b.complete) || (a.family.family_name || '').localeCompare(b.family.family_name || ''))

  // ---- Ticking -------------------------------------------------------------
  const setLine = async (familyId: string, lineKey: string, on: boolean) => {
    const key = `${familyId}:${lineKey}`
    setGiven(prev => { const n = new Set(prev); if (on) n.add(key); else n.delete(key); return n })
    const { error } = on
      ? await supabase.from('function_gift_handover').upsert({ function_id: functionId, family_id: familyId, line_key: lineKey }, { onConflict: 'function_id,family_id,line_key' })
      : await supabase.from('function_gift_handover').delete().eq('function_id', functionId).eq('family_id', familyId).eq('line_key', lineKey)
    if (error) {
      toast.error(`Could not save: ${error.message}`)
      setGiven(prev => { const n = new Set(prev); if (on) n.delete(key); else n.add(key); return n })
    }
  }

  const setRitual = async (itemId: string, on: boolean) => {
    setRitualGiven(prev => ({ ...prev, [itemId]: on }))
    const { error } = await supabase.from('ritual_items').update({ status: on ? 'given' : 'arranged' }).eq('id', itemId)
    if (error) {
      toast.error(`Could not save: ${error.message}`)
      setRitualGiven(prev => ({ ...prev, [itemId]: !on }))
    }
  }

  const giveAll = async (row: (typeof familyRows)[number]) => {
    setBusy(true)
    await Promise.all([
      ...row.lines.filter(l => !given.has(`${row.family.id}:${l.key}`)).map(l => setLine(row.family.id, l.key, true)),
      ...row.rit.filter(r => !ritualGiven[r.itemId]).map(r => setRitual(r.itemId, true))
    ])
    setBusy(false)
  }

  // ---- One family's quantity / price ---------------------------------------
  const saveEdit = async () => {
    if (!editing) return
    const parse = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v)))
    const quantity = parse(editing.qty)
    const unit_amount = parse(editing.price)
    setBusy(true)
    const { error } =
      quantity === null && unit_amount === null
        ? await supabase.from('function_gift_counts').delete().eq('rule_id', editing.ruleId).eq('family_id', editing.familyId)
        : await supabase
            .from('function_gift_counts')
            .upsert({ function_id: functionId, rule_id: editing.ruleId, family_id: editing.familyId, quantity: quantity === null ? null : Math.floor(quantity), unit_amount }, { onConflict: 'rule_id,family_id' })
    if (error) {
      setBusy(false)
      toast.error(/unit_amount|null value/.test(error.message) ? 'Run supabase/16_gifts.sql first to change prices per family.' : `Could not save: ${error.message}`)
      return
    }
    const next = counts.filter(c => !(c.rule_id === editing.ruleId && c.family_id === editing.familyId))
    if (quantity !== null || unit_amount !== null) next.push({ rule_id: editing.ruleId, family_id: editing.familyId, quantity: quantity === null ? null : Math.floor(quantity), unit_amount })
    setCounts(next)
    // Keep the function's planned totals (and the budget line) in step
    const s = computeGifting(rules, overrides, families, attendance, kidAge, next)
    await saveGiftingPlan(supabase, functionId, s.lifafaTotal, s.returnGiftTotal)
    setBusy(false)
    setEditing(null)
    toast.success('Updated for this family')
  }

  const pct = totals.planned > 0 ? Math.round((totals.given / totals.planned) * 100) : 0

  return (
    <section className="rounded-2xl border border-marigold/20 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-marigold/10 pb-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-maroon">✅ Give &amp; track</h2>
          <p className="font-data text-xs text-maroon/60">Tick each lifafa and gift as it&apos;s handed over.</p>
        </div>
      </div>

      {familyRows.length === 0 ? (
        <p className="py-6 text-center font-data text-sm italic text-maroon/50">
          Nothing to hand over yet. Add lifafas or gifts under &ldquo;Plan&rdquo;, and invite families.
        </p>
      ) : (
        <>
          <div className="mb-4 rounded-xl bg-ivory p-3.5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-data text-[10px] font-bold uppercase tracking-widest text-maroon/50">Given so far</p>
                <p className="font-display text-3xl font-bold leading-none text-maroon">
                  {rupees(totals.given)} <span className="font-data text-sm font-medium text-maroon/50">of {rupees(totals.planned)}</span>
                </p>
              </div>
              <p className="font-data text-xs text-maroon/70">
                <b className="text-mehendi">{totals.done}</b> of {totals.families} families done · <b className="text-rust-red">{rupees(totals.planned - totals.given)}</b> to go
              </p>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-marigold/20">
              <div className="h-full rounded-full bg-mehendi" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-marigold/30 bg-white p-0.5 font-data text-xs" role="tablist" aria-label="Show">
              {([
                ['all', `All ${familyRows.length}`],
                ['pending', `To give ${familyRows.length - totals.done}`],
                ['done', `Done ${totals.done}`]
              ] as const).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
                  className={`rounded-full px-3 py-1.5 ${filter === id ? 'bg-maroon font-semibold text-ivory' : 'text-maroon/70 hover:text-maroon'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="relative min-w-[10rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-maroon/40" />
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a family" aria-label="Find a family" className="h-9 rounded-full border-marigold/40 bg-white pl-8 text-xs" />
            </div>
          </div>

          <ul className="space-y-2">
            {visible.length === 0 && <li className="py-6 text-center font-data text-sm text-maroon/50">{filter === 'pending' ? 'Everything is handed over. 🎉' : 'No families match.'}</li>}
            {visible.map(row => {
              const f = row.family
              const isOpen = openId === f.id
              return (
                <li key={f.id} className={`overflow-hidden rounded-2xl border bg-white ${row.complete ? 'border-mehendi/40' : 'border-marigold/25'}`}>
                  <button type="button" onClick={() => setOpenId(isOpen ? null : f.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-3 text-left">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-data text-xs font-bold ${row.complete ? 'bg-mehendi text-white' : 'bg-marigold/15 text-maroon'}`}>
                      {row.complete ? <Check className="h-4 w-4" /> : `${row.done}/${row.items}`}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-data text-sm font-semibold text-maroon">{familyLabel(f.family_name)}</span>
                      <span className="block truncate font-data text-[11px] text-maroon/55">
                        {row.lines.map(l => `${GIFT_KINDS[l.kind]?.icon || '🎁'} ${l.label}`).concat(row.rit.map(r => `🪔 ${r.label}`)).join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-data">
                      <span className="block text-sm font-bold text-maroon">{rupees(row.total)}</span>
                      {!row.complete && row.givenAmount > 0 && <span className="block text-[10px] text-mehendi">{rupees(row.givenAmount)} given</span>}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-maroon/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isOpen && (
                    <div className="space-y-1 border-t border-marigold/15 bg-ivory/40 p-3">
                      {row.lines.map(l => {
                        const on = given.has(`${f.id}:${l.key}`)
                        const isEditing = editing?.familyId === f.id && editing.ruleId === l.ruleId
                        const rule = rules.find(r => r.id === l.ruleId)
                        return (
                          <div key={l.key} className="rounded-xl bg-white p-2.5 ring-1 ring-marigold/15">
                            <div className="flex items-center gap-2.5">
                              <button type="button" disabled={!canTick} onClick={() => setLine(f.id, l.key, !on)} aria-pressed={on} aria-label={`${on ? 'Not given' : 'Given'}: ${l.label}`}
                                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-mehendi bg-mehendi text-white' : 'border-marigold/50 bg-white text-transparent'} disabled:opacity-60`}>
                                <Check className="h-4 w-4" />
                              </button>
                              <span className={`min-w-0 flex-1 font-data text-xs ${on ? 'text-maroon/50 line-through' : 'text-maroon'}`}>
                                <span className="font-semibold">{GIFT_KINDS[l.kind]?.icon} {l.label}</span>
                                <span className="text-maroon/55"> · {l.qty} × {rupees(l.unit)}{l.custom && l.key !== LIFAFA_EXCEPTION_KEY ? ' (changed)' : ''}</span>
                                {l.people.length > 0 && <span className="block text-[10px] text-maroon/55">For {l.people.join(', ')}</span>}
                              </span>
                              <span className="shrink-0 font-data text-xs font-bold text-maroon">{rupees(l.total)}</span>
                              {canChange && rule && (
                                <button type="button" aria-label={`Change ${l.label} for this family`} onClick={() => {
                                  const c = counts.find(x => x.rule_id === rule.id && x.family_id === f.id)
                                  setEditing(isEditing ? null : { familyId: f.id, ruleId: rule.id, qty: c?.quantity != null ? String(c.quantity) : '', price: c?.unit_amount != null ? String(c.unit_amount) : '' })
                                }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-maroon/40 hover:bg-marigold/10 hover:text-maroon">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            {isEditing && (
                              <div className="mt-2.5 flex flex-wrap items-end gap-2 border-t border-marigold/15 pt-2.5">
                                <label className="w-20 space-y-1">
                                  <span className="block font-data text-[10px] font-bold uppercase text-maroon/50">How many</span>
                                  <Input type="number" min={0} value={editing.qty} placeholder="usual" onChange={e => setEditing({ ...editing, qty: e.target.value })} className="h-8 border-marigold/40 text-xs" />
                                </label>
                                <label className="w-28 space-y-1">
                                  <span className="block font-data text-[10px] font-bold uppercase text-maroon/50">Price of one ₹</span>
                                  <Input type="number" min={0} value={editing.price} placeholder="usual" onChange={e => setEditing({ ...editing, price: e.target.value })} className="h-8 border-marigold/40 text-xs" />
                                </label>
                                <button type="button" disabled={busy} onClick={saveEdit} className="h-8 rounded-full bg-maroon px-4 font-data text-xs font-semibold text-ivory disabled:opacity-60">Save</button>
                                <button type="button" onClick={() => setEditing({ ...editing, qty: '', price: '' })} className="h-8 px-2 font-data text-[11px] font-semibold text-maroon/60 underline">Back to usual</button>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {row.rit.map(r => {
                        const on = !!ritualGiven[r.itemId]
                        return (
                          <div key={r.itemId} className="flex items-center gap-2.5 rounded-xl bg-white p-2.5 ring-1 ring-marigold/15">
                            <button type="button" disabled={!canTick} onClick={() => setRitual(r.itemId, !on)} aria-pressed={on} aria-label={`${on ? 'Not given' : 'Given'}: ${r.label}`}
                              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-mehendi bg-mehendi text-white' : 'border-marigold/50 bg-white text-transparent'} disabled:opacity-60`}>
                              <Check className="h-4 w-4" />
                            </button>
                            <span className={`min-w-0 flex-1 font-data text-xs ${on ? 'text-maroon/50 line-through' : 'text-maroon'}`}>
                              <span className="font-semibold">🪔 {r.label}</span>
                              <span className="text-maroon/55"> · {r.ritual}</span>
                              <span className="block text-[10px] text-maroon/55">For {r.names.join(', ')}</span>
                            </span>
                            {r.share > 0 && <span className="shrink-0 font-data text-xs font-bold text-maroon">{rupees(r.share)}</span>}
                          </div>
                        )
                      })}

                      {canTick && !row.complete && (
                        <button type="button" disabled={busy} onClick={() => giveAll(row)} className="mt-1 w-full rounded-xl border border-mehendi/40 bg-mehendi/10 py-2 font-data text-xs font-semibold text-mehendi hover:bg-mehendi/15 disabled:opacity-60">
                          ✓ Mark everything for this family as given
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-3 font-data text-[10px] text-maroon/45">Ritual items show here when the person they&apos;re for is picked from the guest list. Ticking one marks that ritual entry as given.</p>
        </>
      )}
    </section>
  )
}
