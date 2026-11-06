'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { familyCount } from '@/lib/guests'
import { ShagunBadge, type FamilyShagun } from './ShagunHistory'
import FamilyPanel, { type Couple, type GuestFamily } from './FamilyPanel'

type Tier = 'all' | 'tier_1' | 'tier_2' | 'tier_3'
const TIERS: { id: Exclude<Tier, 'all'>; label: string; icon: string }[] = [
  { id: 'tier_1', label: 'Hosts', icon: '👑' },
  { id: 'tier_2', label: 'Close', icon: '🤝' },
  { id: 'tier_3', label: 'Extended', icon: '🏡' }
]
const TIER_TITLE: Record<string, string> = {
  tier_1: '👑 Hosts & immediate family',
  tier_2: '🤝 Close circle',
  tier_3: '🏡 Extended & neighbours'
}

const familyLabel = (name: string) => (name.toLowerCase().endsWith('family') ? name : `${name} Family`)
const initials = (name: string) =>
  name.replace(/family$/i, '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'

// Remembered for this browser tab only, so returning from an edit page keeps your place
const remember = (key: string, value: string) => { try { sessionStorage.setItem(key, value) } catch { /* ignore */ } }
const recall = (key: string) => { try { return sessionStorage.getItem(key) } catch { return null } }

export default function GuestListManager({
  initialFamilies,
  role,
  userSide,
  shagunByFamily = {},
  couple = {}
}: {
  initialFamilies: GuestFamily[]
  role: string
  userSide?: string
  shagunByFamily?: Record<string, FamilyShagun[]>
  couple?: Couple
}) {
  const families = initialFamilies
  const [activeSide, setActiveSide] = useState<'groom' | 'bride'>(userSide === 'bride' ? 'bride' : 'groom')
  const [tier, setTier] = useState<Tier>('all')
  const [relationship, setRelationship] = useState('all')
  const [query, setQuery] = useState('')
  const [onlyOutstation, setOnlyOutstation] = useState(false)
  const [onlyMissingNames, setOnlyMissingNames] = useState(false)
  const [onlyPending, setOnlyPending] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  // Restore where you were (side / circle / relationship / open family) after hydration
  useEffect(() => {
    const side = recall('guestList_activeSide')
    const t = recall('guestList_selectedTier')
    const rel = recall('guestList_selectedRelationship')
    const open = recall('guestList_open')
    /* eslint-disable react-hooks/set-state-in-effect -- restoring saved view after hydration */
    if (role === 'admin' && (side === 'groom' || side === 'bride')) setActiveSide(side)
    if (t === 'all' || t === 'tier_1' || t === 'tier_2' || t === 'tier_3') setTier(t)
    if (rel) setRelationship(rel)
    if (open) setOpenId(open)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [role])

  const changeSide = (s: 'groom' | 'bride') => { setActiveSide(s); remember('guestList_activeSide', s); setRelationship('all'); remember('guestList_selectedRelationship', 'all') }
  const changeTier = (t: Tier) => { setTier(t); remember('guestList_selectedTier', t) }
  const changeRelationship = (r: string) => { setRelationship(r); remember('guestList_selectedRelationship', r) }
  const toggleOpen = (id: string) => {
    const next = openId === id ? null : id
    setOpenId(next)
    remember('guestList_open', next || '')
  }

  const canEditGroom = role === 'admin' || (role === 'planner' && userSide === 'groom') || role === 'groom'
  const canEditBride = role === 'admin' || (role === 'planner' && userSide === 'bride') || role === 'bride'
  const canEdit = activeSide === 'groom' ? canEditGroom : canEditBride

  const sideFamilies = families.filter(f => f.side === activeSide)
  const relationships = Array.from(new Set(sideFamilies.map(f => f.relationship).filter(Boolean) as string[])).sort()
  const missingNames = (f: GuestFamily) => (f.family_members?.length || 0) < familyCount(f).total
  const hasPending = (f: GuestFamily) => (f.family_members || []).some(m => m.pending_approval)
  const pendingCount = sideFamilies.filter(hasPending).length

  const q = query.trim().toLowerCase()
  const visible = sideFamilies.filter(f => {
    if (tier !== 'all' && f.relation_tier !== tier) return false
    if (relationship !== 'all' && (f.relationship || '') !== relationship) return false
    if (onlyOutstation && f.is_local) return false
    if (onlyMissingNames && !missingNames(f)) return false
    if (onlyPending && !hasPending(f)) return false
    if (!q) return true
    return (
      f.family_name.toLowerCase().includes(q) ||
      (f.city || '').toLowerCase().includes(q) ||
      (f.contact_person || '').toLowerCase().includes(q) ||
      (f.relationship || '').toLowerCase().includes(q) ||
      (f.family_members || []).some(m => m.name.toLowerCase().includes(q))
    )
  })

  const totals = visible.reduce(
    (acc, f) => {
      const c = familyCount(f)
      return {
        guests: acc.guests + c.total,
        adults: acc.adults + c.adults,
        kids: acc.kids + c.kids,
        seniors: acc.seniors + c.seniors,
        outstation: acc.outstation + (f.is_local ? 0 : c.total)
      }
    },
    { guests: 0, adults: 0, kids: 0, seniors: 0, outstation: 0 }
  )

  // Group by circle when showing all circles
  const groups: { key: string; title: string | null; items: GuestFamily[] }[] =
    tier === 'all'
      ? TIERS.map(t => ({ key: t.id as string, title: TIER_TITLE[t.id] as string | null, items: visible.filter(f => f.relation_tier === t.id) }))
          .concat([{ key: 'other', title: 'Other', items: visible.filter(f => !TIERS.some(t => t.id === f.relation_tier)) }])
          .filter(g => g.items.length > 0)
      : [{ key: tier, title: null, items: visible }]

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 font-data text-xs font-semibold transition-colors ${on ? 'border-maroon bg-maroon text-ivory' : 'border-marigold/40 bg-white text-maroon hover:bg-marigold/10'}`

  const anyFilter = tier !== 'all' || relationship !== 'all' || onlyOutstation || onlyMissingNames || onlyPending || q !== ''
  const clearFilters = () => {
    changeTier('all'); changeRelationship('all'); setOnlyOutstation(false); setOnlyMissingNames(false); setOnlyPending(false); setQuery('')
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Side */}
      {role === 'admin' ? (
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-marigold/30 bg-white p-1" role="tablist" aria-label="Side">
          {(['groom', 'bride'] as const).map(s => {
            const n = families.filter(f => f.side === s).length
            return (
              <button key={s} role="tab" aria-selected={activeSide === s} onClick={() => changeSide(s)}
                className={`rounded-xl px-3 py-2.5 font-data text-sm font-semibold transition-colors ${activeSide === s ? 'bg-maroon text-ivory shadow-sm' : 'text-maroon/70 hover:bg-marigold/10'}`}>
                {s === 'groom' ? '🤵‍♂️ Ladkewale' : '👰‍♀️ Ladkiwale'} <span className={`ml-1 rounded-full px-1.5 text-xs ${activeSide === s ? 'bg-white/20' : 'bg-marigold/15'}`}>{n}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="font-display text-lg font-semibold text-maroon">{activeSide === 'groom' ? '🤵‍♂️ Ladkewale' : '👰‍♀️ Ladkiwale'}</p>
      )}

      {/* Find */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-maroon/40" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search a family, person, city or relation"
          aria-label="Search guests"
          className="h-11 w-full rounded-full border border-marigold/40 bg-white pl-10 pr-4 font-data text-sm text-maroon outline-none placeholder:text-maroon/40 focus:border-maroon"
        />
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Filters">
        <button type="button" aria-pressed={tier === 'all'} onClick={() => changeTier('all')} className={chip(tier === 'all')}>All {sideFamilies.length}</button>
        {TIERS.map(t => {
          const n = sideFamilies.filter(f => f.relation_tier === t.id).length
          return n > 0 || tier === t.id ? (
            <button key={t.id} type="button" aria-pressed={tier === t.id} onClick={() => changeTier(t.id)} className={chip(tier === t.id)}>{t.icon} {t.label} {n}</button>
          ) : null
        })}
        <span className="mx-0.5 w-px shrink-0 bg-marigold/30" aria-hidden="true" />
        <button type="button" aria-pressed={onlyOutstation} onClick={() => setOnlyOutstation(v => !v)} className={chip(onlyOutstation)}>✈️ Outstation</button>
        <button type="button" aria-pressed={onlyMissingNames} onClick={() => setOnlyMissingNames(v => !v)} className={chip(onlyMissingNames)}>✍️ Names missing</button>
        {pendingCount > 0 && (
          <button type="button" aria-pressed={onlyPending} onClick={() => setOnlyPending(v => !v)} className={chip(onlyPending)}>🆕 To approve {pendingCount}</button>
        )}
        {relationships.length > 0 && (
          <select value={relationship} onChange={e => changeRelationship(e.target.value)} aria-label="Relationship" className={`${chip(relationship !== 'all')} appearance-none pr-3`}>
            <option value="all">Any relationship</option>
            {relationships.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      {/* What's showing */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-marigold/25 bg-white px-4 py-3">
        <p className="font-data text-sm text-maroon">
          <b className="font-display text-xl">{totals.guests}</b> guests · {visible.length} {visible.length === 1 ? 'family' : 'families'}
        </p>
        <p className="font-data text-xs text-maroon/65">
          🧑 {totals.adults} · 🧸 {totals.kids} · 👵 {totals.seniors}{totals.outstation ? ` · ✈️ ${totals.outstation}` : ''}
        </p>
        {anyFilter && (
          <button type="button" onClick={clearFilters} className="w-full text-left font-data text-[11px] font-semibold text-maroon/60 underline sm:w-auto">Clear filters</button>
        )}
      </div>

      {/* Families */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-marigold/40 p-10 text-center">
          <p className="font-display text-lg font-semibold text-maroon">{sideFamilies.length === 0 ? 'No families yet' : 'No families match'}</p>
          <p className="mt-1 font-data text-sm text-maroon/60">
            {sideFamilies.length === 0 ? 'Add the first family on this side.' : 'Try another search or clear the filters.'}
          </p>
        </div>
      ) : (
        groups.map(group => (
          <section key={group.key} aria-label={group.title || undefined} className="space-y-2">
            {group.title && (
              <h2 className="flex items-baseline justify-between px-1 pt-2 font-data text-[11px] font-bold uppercase tracking-widest text-maroon/55">
                <span>{group.title}</span>
                <span className="font-semibold normal-case tracking-normal text-maroon/45">
                  {group.items.length} {group.items.length === 1 ? 'family' : 'families'} · {group.items.reduce((s, f) => s + familyCount(f).total, 0)} guests
                </span>
              </h2>
            )}
            <ul className="space-y-2">
              {group.items.map(f => {
                const c = familyCount(f)
                const named = f.family_members?.length || 0
                const isOpen = openId === f.id
                const fnCount = new Set((f.function_attendance || []).map(a => a.function_id)).size
                const pending = (f.family_members || []).filter(m => m.pending_approval).length
                return (
                  <li key={f.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors ${isOpen ? 'border-marigold' : 'border-marigold/25'}`}>
                    <button type="button" onClick={() => toggleOpen(f.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-3 text-left hover:bg-marigold/5">
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-display text-base font-bold ${f.side === 'bride' ? 'bg-rani-pink/10 text-rani-pink' : 'bg-marigold/20 text-maroon'}`} aria-hidden="true">
                        {initials(f.family_name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-data text-sm font-semibold text-maroon">{familyLabel(f.family_name)}</span>
                          {pending > 0 && <span className="shrink-0 rounded-full bg-marigold/25 px-1.5 py-0.5 font-data text-[9px] font-bold text-maroon">🆕 {pending}</span>}
                        </span>
                        <span className="block truncate font-data text-[11px] text-maroon/55">
                          {[f.relationship, f.is_local ? (f.city || null) : `✈️ ${f.city || 'Outstation'}`, fnCount ? `${fnCount} function${fnCount === 1 ? '' : 's'}` : 'no functions yet'].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-data text-sm font-bold text-maroon">{c.total} <span className="text-[10px] font-medium text-maroon/50">guests</span></span>
                        <span className={`block font-data text-[10px] ${named >= c.total ? 'text-mehendi' : 'text-maroon/50'}`}>{named >= c.total ? '✓ all named' : `${named}/${c.total} named`}</span>
                      </span>
                      <ShagunBadge entries={shagunByFamily[f.id] || []} />
                      <ChevronDown className={`h-4 w-4 shrink-0 text-maroon/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && <FamilyPanel family={f} canEdit={canEdit} shagun={shagunByFamily[f.id] || []} couple={couple} />}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      {canEdit && (
        <Link
          href={`/guests/add-family?side=${activeSide}&relation_tier=${tier !== 'all' ? tier : 'tier_2'}`}
          className="fixed bottom-20 right-5 z-40 flex items-center rounded-full border border-[#F2C46D]/40 bg-maroon px-5 py-3.5 text-ivory shadow-[0_8px_30px_rgba(58,11,32,0.35)] transition hover:scale-105 md:bottom-8"
        >
          <Plus className="mr-2 h-5 w-5" />
          <span className="text-sm font-bold">Add family</span>
        </Link>
      )}
    </div>
  )
}
