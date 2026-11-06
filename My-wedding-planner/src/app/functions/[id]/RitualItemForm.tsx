'use client'

import { useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Check, Plus, Search, Shuffle, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RitualItem } from './FunctionRituals'

type Side = 'groom' | 'bride' | 'joint'
type ToSide = Side | 'other'
type Status = 'pending' | 'arranged' | 'given'

/** Someone invited to this function who can give or receive (a member, or a family with no members listed). */
export type RitualPerson = { key: string; label: string; family: string; side: 'groom' | 'bride' | null }

const SIDE_LABEL: Record<ToSide, string> = {
  groom: "🤵‍♂️ Groom's side",
  bride: "👰‍♀️ Bride's side",
  joint: '🤝 Both families',
  other: '🙏 Other (pandit, staff…)'
}

type Per = 'person' | 'family'
type Kind = 'gift' | 'activity'

// Things usually handed one per household rather than one per head
const PER_FAMILY_HINT = /bhaji|box|mithai|sweet|dabba|basket|tokri|hamper|thaal|thali|kambal|blanket|bedsheet|suit|saree|sari/i

/** Saved as "15 (1 each)" or "6 (1 per family)"; read back the per-unit number and unit. */
function parseQty(q: string | null | undefined): { each: string; per: Per | null } {
  const m = (q || '').match(/\((\d+(?:\.\d+)?)\s*(each|per family)\)/i)
  if (m) return { each: m[1], per: m[2].toLowerCase() === 'each' ? 'person' : 'family' }
  return { each: '', per: null }
}

const splitNames = (s: string | null | undefined) =>
  (s || '').split(',').map(x => x.trim()).filter(Boolean)

/** Tap to pick people from one side; search, select all, or type a name not on the list. */
function PeoplePicker({
  legend,
  side,
  onSide,
  sides,
  people,
  picked,
  onPicked,
  pairOrder
}: {
  legend: string
  side: ToSide | ''
  onSide: (s: ToSide | '') => void
  sides: ToSide[]
  people: RitualPerson[]
  picked: string[]
  onPicked: (names: string[]) => void
  pairOrder: boolean
}) {
  const [query, setQuery] = useState('')
  const [typed, setTyped] = useState('')
  const pool = people.filter(p => side === '' || side === 'joint' || side === 'other' || p.side === side || p.side === null)
  const visible = (side === 'other' ? [] : pool).filter(p =>
    !query.trim() || `${p.label} ${p.family}`.toLowerCase().includes(query.trim().toLowerCase())
  )
  const toggle = (label: string) =>
    onPicked(picked.includes(label) ? picked.filter(n => n !== label) : [...picked, label])
  const allVisiblePicked = visible.length > 0 && visible.every(p => picked.includes(p.label))
  const addTyped = () => {
    const name = typed.trim()
    if (name && !picked.includes(name)) onPicked([...picked, name])
    setTyped('')
  }
  // Names picked that aren't on the list (typed in) still show, so they can be removed
  const typedPicked = picked.filter(n => !visible.some(p => p.label === n))

  return (
    <fieldset className="space-y-2 rounded-lg border border-marigold/20 p-2.5">
      <legend className="px-1 text-[10px] font-bold uppercase text-maroon/60">{legend}</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${legend}: side`}>
        {sides.map(s => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            onClick={() => onSide(side === s ? '' : s)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${side === s ? 'border-maroon bg-maroon text-ivory' : 'border-marigold/40 bg-white text-maroon hover:bg-marigold/10'}`}
          >
            {SIDE_LABEL[s]}
          </button>
        ))}
      </div>

      {side !== 'other' && pool.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-maroon/40" />
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search names" aria-label={`Search ${legend.toLowerCase()}`} className="h-8 border-marigold/40 bg-white pl-8 text-xs" />
            </div>
            <button
              type="button"
              onClick={() => onPicked(allVisiblePicked ? picked.filter(n => !visible.some(p => p.label === n)) : [...picked, ...visible.map(p => p.label).filter(l => !picked.includes(l))])}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-marigold/40 bg-white px-2.5 text-[11px] font-semibold text-maroon hover:bg-marigold/10"
            >
              <Users className="h-3.5 w-3.5" /> {allVisiblePicked ? 'Clear' : 'Select all'}
            </button>
          </div>
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
            {visible.map(p => {
              const idx = picked.indexOf(p.label)
              const on = idx !== -1
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => toggle(p.label)}
                  aria-pressed={on}
                  title={p.family}
                  className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors ${on ? 'border-mehendi bg-mehendi text-white' : 'border-marigold/30 bg-white text-maroon hover:bg-marigold/10'}`}
                >
                  {on ? (pairOrder ? <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] text-mehendi">{idx + 1}</span> : <Check className="h-3 w-3" />) : <Plus className="h-3 w-3 opacity-60" />}
                  {p.label}
                </button>
              )
            })}
            {visible.length === 0 && <p className="text-[11px] italic text-maroon/50">No one matches.</p>}
          </div>
        </>
      )}

      {typedPicked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {typedPicked.map(n => (
            <button key={n} type="button" onClick={() => toggle(n)} aria-label={`Remove ${n}`} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-mehendi bg-mehendi px-2.5 text-xs font-semibold text-white">
              {pairOrder && <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] text-mehendi">{picked.indexOf(n) + 1}</span>}
              {n} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <Input
          value={typed}
          onChange={e => setTyped(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTyped() } }}
          placeholder={side === 'other' ? 'e.g. Pandit ji, Nai, Band' : 'Someone not listed? Type a name'}
          aria-label={`Add a name to ${legend.toLowerCase()}`}
          className="h-8 border-marigold/40 bg-white text-xs"
        />
        <button type="button" onClick={addTyped} className="h-8 shrink-0 rounded-full border border-marigold/40 bg-white px-3 text-[11px] font-semibold text-maroon hover:bg-marigold/10">Add</button>
      </div>
    </fieldset>
  )
}

/**
 * Add or edit a ritual item. Pick givers and receivers by tapping names; save as one entry
 * ("Bhaji box to Mama ji, Chacha ji, Fufa ji") or, for Milni-style exchanges, pair them up
 * in the order tapped and create one entry per pair.
 */
export default function RitualItemForm({
  ritualId,
  editing,
  people,
  supabase,
  onCancel,
  onSaved
}: {
  ritualId: string
  editing: RitualItem | null
  people: RitualPerson[]
  supabase: SupabaseClient
  onCancel: () => void
  onSaved: (rows: RitualItem[], replacedId: string | null) => void
}) {
  const [kind, setKind] = useState<Kind>(editing?.kind === 'activity' ? 'activity' : 'gift')
  const isActivity = kind === 'activity'
  const [item, setItem] = useState(editing?.item || '')
  const parsed = parseQty(editing?.quantity)
  const [each, setEach] = useState(parsed.each || (editing ? '' : '1'))
  const [per, setPer] = useState<Per>(parsed.per || (editing?.item && PER_FAMILY_HINT.test(editing.item) ? 'family' : 'person'))
  const [perTouched, setPerTouched] = useState(!!parsed.per)
  // Older entries saved a bare total ("15"); keep it until a per-person number is entered
  const [legacyTotal] = useState(parsed.per ? '' : editing?.quantity || '')
  const [bySide, setBySide] = useState<ToSide | ''>(editing?.given_by_side || '')
  const [toSide, setToSide] = useState<ToSide | ''>(editing?.given_to_side || '')
  const [givers, setGivers] = useState<string[]>(splitNames(editing?.given_by))
  const [receivers, setReceivers] = useState<string[]>(splitNames(editing?.given_to))
  const [pairMode, setPairMode] = useState(false)
  const [cost, setCost] = useState(editing?.est_cost != null ? String(editing.est_cost) : '')
  const [status, setStatus] = useState<Status>(editing?.status || 'pending')
  const [notes, setNotes] = useState(editing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canPair = !editing && givers.length > 1 && receivers.length > 1
  const pairing = pairMode && canPair
  const pairs = useMemo(() => givers.map((g, i) => [g, receivers[i]] as const).filter(([, r]) => r), [givers, receivers])
  const familyOf = useMemo(() => new Map(people.map(p => [p.label, p.family])), [people])
  const receiverFamilies = new Set(receivers.map(r => familyOf.get(r) || r)).size

  const eachNum = Number(each)
  const hasEach = each.trim() !== '' && eachNum > 0
  // How many receive: each pair, each person, or each family among the people picked
  const units = pairing ? 1 : Math.max(1, per === 'family' ? receiverFamilies : receivers.length)
  const total = hasEach ? Math.round(eachNum * units * 100) / 100 : 0
  const qtyText = (n: number) =>
    isActivity ? null : hasEach ? `${n} (${each.trim()} ${per === 'family' && !pairing ? 'per family' : 'each'})` : legacyTotal.trim() || null
  const unitWord = per === 'family' ? (units === 1 ? 'family' : 'families') : units === 1 ? 'person' : 'people'

  const onItem = (v: string) => {
    setItem(v)
    if (!perTouched) setPer(PER_FAMILY_HINT.test(v) ? 'family' : 'person')
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!item.trim()) return setError(isActivity ? 'What is being done?' : 'What is being given?')
    if (pairing && givers.length !== receivers.length) {
      return setError(`To pair them up, pick the same number on both sides (now ${givers.length} giving, ${receivers.length} receiving).`)
    }
    const base = {
      ritual_id: ritualId,
      item: item.trim(),
      given_by_side: (bySide || null) as Side | null,
      given_to_side: (toSide || null) as ToSide | null,
      est_cost: isActivity || cost.trim() === '' ? null : Number(cost),
      status,
      notes: notes.trim() || null,
      // Sent only when needed, so gifts keep saving even before 15_ritual_activities.sql is run
      ...(isActivity || editing?.kind ? { kind } : {})
    }
    const explain = (msg: string) =>
      /kind/.test(msg) ? 'To save activities, first run supabase/15_ritual_activities.sql in the Supabase SQL editor.' : msg
    setSaving(true)
    if (pairing) {
      // One entry per pair, so each can be ticked off on the day
      const rows = pairs.map(([g, r]) => ({ ...base, given_by: g, given_to: r, quantity: qtyText(eachNum) }))
      const { data, error: err } = await supabase.from('ritual_items').insert(rows).select()
      setSaving(false)
      if (err) return setError(explain(err.message))
      return onSaved((data || []) as RitualItem[], null)
    }
    const payload = {
      ...base,
      given_by: givers.join(', ') || null,
      given_to: receivers.join(', ') || null,
      quantity: qtyText(total)
    }
    const { data, error: err } = editing
      ? await supabase.from('ritual_items').update(payload).eq('id', editing.id).select().single()
      : await supabase.from('ritual_items').insert(payload).select().single()
    setSaving(false)
    if (err) return setError(explain(err.message))
    onSaved([data as RitualItem], editing?.id || null)
  }

  const selectCls = 'w-full bg-white border border-marigold/50 rounded-md h-9 px-2 text-sm'

  return (
    <form onSubmit={save} className="space-y-3 rounded-b-xl border-t border-marigold/15 bg-white/70 p-3">
      {error && <div role="alert" className="rounded border border-rust-red/30 bg-rust-red/10 p-2 font-data text-xs text-rust-red">{error}</div>}
      <div className="flex gap-1.5" role="radiogroup" aria-label="Kind of entry">
        {([['gift', '🎁 Something given'], ['activity', '🙌 Something done']] as [Kind, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${kind === k ? 'border-maroon bg-maroon text-ivory' : 'border-marigold/40 bg-white text-maroon hover:bg-marigold/10'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <Label htmlFor={`item-${ritualId}`} className="text-xs font-semibold text-maroon">{isActivity ? 'What is done' : 'What is given'}</Label>
        <Input id={`item-${ritualId}`} required value={item} onChange={e => onItem(e.target.value)} placeholder={isActivity ? 'e.g. Tilak, Chunni chadhana, Haldi lagana, Milni' : 'e.g. Shagun lifafa, Kambal, Bhaji box'} className="h-9 border-marigold/50 bg-white text-sm" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PeoplePicker legend={isActivity ? 'Done by' : 'Given by'} side={bySide} onSide={setBySide} sides={['groom', 'bride', 'joint']} people={people} picked={givers} onPicked={setGivers} pairOrder={pairing} />
        <PeoplePicker legend={isActivity ? 'Done for' : 'Given to'} side={toSide} onSide={setToSide} sides={['groom', 'bride', 'joint', 'other']} people={people} picked={receivers} onPicked={setReceivers} pairOrder={pairing} />
      </div>

      {!isActivity && (
      <div className="space-y-2 rounded-lg border border-marigold/20 p-2.5">
        <div className="flex flex-wrap items-center gap-2 font-data text-xs text-maroon">
          <Label htmlFor={`each-${ritualId}`} className="text-xs font-semibold text-maroon">{pairing ? 'Each pair' : 'Each'}</Label>
          <Input id={`each-${ritualId}`} type="number" min={0} step="any" inputMode="decimal" value={each} onChange={e => setEach(e.target.value)} placeholder="1" className="h-8 w-16 border-marigold/50 bg-white text-sm" />
          {!pairing && (
            <div className="flex gap-1" role="radiogroup" aria-label="Counted per">
              {(['person', 'family'] as Per[]).map(u => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={per === u}
                  onClick={() => { setPer(u); setPerTouched(true) }}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${per === u ? 'border-maroon bg-maroon text-ivory' : 'border-marigold/40 bg-white text-maroon hover:bg-marigold/10'}`}
                >
                  per {u}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="font-data text-xs text-maroon/70" aria-live="polite">
          {hasEach ? (
            pairing ? (
              <>Total to arrange: <strong className="text-maroon">{Math.round(eachNum * pairs.length * 100) / 100}</strong> ({each.trim()} × {pairs.length} pairs)</>
            ) : (
              <>Total to arrange: <strong className="text-maroon">{total}</strong> ({each.trim()} × {units} {unitWord}{receivers.length === 0 ? ' — pick who receives' : ''})</>
            )
          ) : legacyTotal ? (
            <>Saved as <strong className="text-maroon">{legacyTotal}</strong>. Enter how many each gets to work it out from who receives.</>
          ) : (
            <>Enter how many each gets.</>
          )}
        </p>
      </div>
      )}

      {canPair && (
        <div className="space-y-2 rounded-lg border border-marigold/25 bg-marigold/5 p-2.5">
          <label className="flex cursor-pointer items-start gap-2 font-data text-xs text-maroon">
            <input type="checkbox" checked={pairMode} onChange={e => setPairMode(e.target.checked)} className="mt-0.5 h-4 w-4 accent-maroon" />
            <span>
              <span className="inline-flex items-center gap-1 font-semibold"><Shuffle className="h-3.5 w-3.5" /> Pair them up (Milni)</span>
              <span className="block text-maroon/60">
                {isActivity ? 'The 1st person does it with the 1st person on the other side, the 2nd with the 2nd…' : 'The 1st giver gives to the 1st receiver, the 2nd to the 2nd…'} in the order you tapped. One entry per pair.
              </span>
            </span>
          </label>
          {pairing && (
            <ol className="space-y-1 pl-6 font-data text-xs text-maroon/80">
              {givers.map((g, i) => (
                <li key={g + i} className={receivers[i] ? '' : 'text-rust-red'}>
                  {g} → {receivers[i] || 'pick one more receiver'}
                </li>
              ))}
              {receivers.slice(givers.length).map(r => <li key={r} className="text-rust-red">pick one more giver → {r}</li>)}
            </ol>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {!isActivity && <div className="space-y-1">
          <Label htmlFor={`cost-${ritualId}`} className="text-xs font-semibold text-maroon">{pairing ? 'Est. cost per pair (₹)' : 'Est. cost (₹)'}</Label>
          <Input id={`cost-${ritualId}`} type="number" min={0} value={cost} onChange={e => setCost(e.target.value)} placeholder="optional" className="h-9 border-marigold/50 bg-white text-sm" />
        </div>}
        <div className={`space-y-1 ${isActivity ? 'col-span-2' : ''}`}>
          <Label htmlFor={`status-${ritualId}`} className="text-xs font-semibold text-maroon">Status</Label>
          <select id={`status-${ritualId}`} value={status} onChange={e => setStatus(e.target.value as Status)} className={selectCls}>
            <option value="pending">{isActivity ? 'To do' : 'To arrange'}</option>
            <option value="arranged">{isActivity ? 'Ready' : 'Arranged'}</option>
            <option value="given">{isActivity ? 'Done' : 'Given'}</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`notes-${ritualId}`} className="text-xs font-semibold text-maroon">Notes</Label>
        <Input id={`notes-${ritualId}`} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Keep in red potli, with 11 dry fruit boxes" className="h-9 border-marigold/50 bg-white text-sm" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} className="h-8 border-marigold/30 text-xs text-maroon">Cancel</Button>
        <Button type="submit" disabled={saving} className="h-8 min-w-[90px] bg-maroon text-xs text-ivory">
          {saving ? 'Saving…' : pairing ? `Save ${pairs.length} pairs` : 'Save'}
        </Button>
      </div>
    </form>
  )
}
