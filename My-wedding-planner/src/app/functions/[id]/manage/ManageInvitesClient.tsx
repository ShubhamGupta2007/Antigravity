'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, ChevronDown, Minus, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  DEFAULT_KID_AGE,
  functionHeadcount,
  recalcFunctionGifting,
  RSVP_LABELS,
  type PlanningAttendance,
  type RsvpStatus
} from '@/lib/functionPlanning'

type FamilyMember = {
  id: string
  name: string
  relation_to_head: string | null
  is_kid_for_gifting: boolean
  age?: number | null
  gender?: string | null
}

type Family = {
  id: string
  family_name: string
  side: 'groom' | 'bride'
  relation_tier: 'tier_1' | 'tier_2' | 'tier_3'
  relationship?: string | null
  is_local?: boolean
  city?: string | null
  expected_adults_count?: number
  expected_kids_count?: number
  needs_room?: boolean
  rooms_assigned?: number
  room_numbers?: string
  family_members: FamilyMember[]
}

type Attendance = {
  id: string
  function_id: string
  family_id: string
  member_id: string | null
  is_attending: boolean
  adults_count?: number | null
  kids_count?: number | null
  rsvp_status?: RsvpStatus | null
}

type HeadcountDraft = { adults: string; kids: string }
type RoomState = { needs_room: boolean; rooms_assigned: number; room_numbers: string }

type GiftRuleLite = { id: string; rule_name: string; amount: number }
type GiftCountLite = { rule_id: string; family_id: string; quantity: number | null; unit_amount?: number | null }

type FunctionLite = { id: string; name: string; kid_age_threshold?: number | null }

type ManageInvitesClientProps = {
  func: FunctionLite
  families: Family[]
  initialAttendance: Attendance[]
  requiredGuests: unknown[]
  giftRules?: GiftRuleLite[]
  initialGiftCounts?: GiftCountLite[]
  canEditGifts?: boolean
}

export default function ManageInvitesClient({
  func,
  families,
  initialAttendance,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for future required-guest hints
  requiredGuests,
  giftRules = [],
  initialGiftCounts = [],
  canEditGifts = false
}: ManageInvitesClientProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sideFilter, setSideFilter] = useState<'all' | 'groom' | 'bride'>('all')
  const [tierFilter, setTierFilter] = useState<'all' | 'tier_1' | 'tier_2' | 'tier_3'>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showFilter, setShowFilter] = useState<'all' | 'invited' | 'not'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [saving, setSaving] = useState(false)

  const uniqueRelationships = Array.from(new Set(families.map(f => f.relationship).filter(Boolean))).sort() as string[]

  // Map of attending items: key is `${family_id}-${member_id || 'family'}`
  const [attendanceMap, setAttendanceMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    initialAttendance.forEach(a => {
      if (a.is_attending) {
        const key = `${a.family_id}-${a.member_id || 'family'}`
        map[key] = true
      }
    })
    return map
  })

  // Per-function headcount for family-level invites ('' = use the family's usual counts)
  const [headcounts, setHeadcounts] = useState<Record<string, HeadcountDraft>>(() => {
    const map: Record<string, HeadcountDraft> = {}
    initialAttendance.forEach(a => {
      if (a.member_id === null) {
        map[a.family_id] = {
          adults: a.adults_count === null || a.adults_count === undefined ? '' : String(a.adults_count),
          kids: a.kids_count === null || a.kids_count === undefined ? '' : String(a.kids_count)
        }
      }
    })
    return map
  })

  const kidAge: number = func.kid_age_threshold || DEFAULT_KID_AGE

  // RSVP per family (whole-family invites)
  const [rsvp, setRsvp] = useState<Record<string, RsvpStatus>>(() => {
    const map: Record<string, RsvpStatus> = {}
    initialAttendance.forEach(a => { if (a.member_id === null && a.rsvp_status) map[a.family_id] = a.rsvp_status })
    return map
  })
  const handleRsvpChange = (familyId: string, value: RsvpStatus) => {
    setRsvp(prev => ({ ...prev, [familyId]: value }))
    setHasUnsavedChanges(true)
  }

  // Gift quantities per family ('' = the rule's default of 1 per family)
  const giftKey = (ruleId: string, familyId: string) => `${ruleId}:${familyId}`
  const [giftQty, setGiftQty] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    initialGiftCounts.forEach(c => { if (c.quantity !== null && c.quantity !== undefined) map[giftKey(c.rule_id, c.family_id)] = String(c.quantity) })
    return map
  })
  const handleGiftQtyChange = (ruleId: string, familyId: string, value: string) => {
    setGiftQty(prev => ({ ...prev, [giftKey(ruleId, familyId)]: value }))
    setHasUnsavedChanges(true)
  }

  const parseCount = (v: string | undefined) => {
    if (v === undefined || v.trim() === '') return null
    const n = Math.floor(Number(v))
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  // State to optimistically manage room requirements before refresh
  const [roomsState, setRoomsState] = useState<Record<string, RoomState>>(() => {
    const map: Record<string, RoomState> = {}
    families.forEach(f => {
      map[f.id] = {
        needs_room: f.needs_room || false,
        rooms_assigned: f.rooms_assigned || 0,
        room_numbers: f.room_numbers || ''
      }
    })
    return map
  })

  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  const handleMemberToggle = (familyId: string, memberId: string | null, checked: boolean) => {
    const key = `${familyId}-${memberId || 'family'}`
    setAttendanceMap(prev => ({ ...prev, [key]: checked }))
    setHasUnsavedChanges(true)
  }

  const handleFamilyToggle = (family: Family, checked: boolean) => {
    const key = `${family.id}-family`
    const updatedMap = { ...attendanceMap }
    updatedMap[key] = checked
    family.family_members.forEach(m => {
      updatedMap[`${family.id}-${m.id}`] = checked
    })
    setAttendanceMap(updatedMap)
    setHasUnsavedChanges(true)
  }

  const handleRoomChange = <K extends keyof RoomState>(familyId: string, field: K, value: RoomState[K]) => {
    const currentState = roomsState[familyId] || { needs_room: false, rooms_assigned: 0, room_numbers: '' }
    const updatedState: RoomState = { ...currentState, [field]: value }
    
    // Automatically assign 1 room if they toggle needs_room to true and it was 0
    if (field === 'needs_room' && value === true && updatedState.rooms_assigned === 0) {
      updatedState.rooms_assigned = 1
    }
    
    setRoomsState(prev => ({ ...prev, [familyId]: updatedState }))
    setHasUnsavedChanges(true)
  }

  const handleHeadcountChange = (familyId: string, field: keyof HeadcountDraft, value: string) => {
    setHeadcounts(prev => ({
      ...prev,
      [familyId]: { adults: prev[familyId]?.adults ?? '', kids: prev[familyId]?.kids ?? '', [field]: value }
    }))
    setHasUnsavedChanges(true)
  }

  const handleSaveChanges = async (exitAfterSave = false) => {
    setSaving(true)
    try {
      const upserts: Record<string, string | number | boolean | null>[] = []
      const toDelete: { family_id: string, member_id: string | null }[] = []
      const headcountUpdates: { family_id: string, adults_count: number | null, kids_count: number | null, rsvp_status: RsvpStatus }[] = []

      families.forEach(f => {
        const familyKey = `${f.id}-family`
        const initialFamRow = initialAttendance.find(a => a.family_id === f.id && a.member_id === null && a.is_attending)
        const initiallyAttendingFam = !!initialFamRow
        const adultsCount = parseCount(headcounts[f.id]?.adults)
        const kidsCount = parseCount(headcounts[f.id]?.kids)
        const rsvpStatus: RsvpStatus = rsvp[f.id] || 'invited'
        if (attendanceMap[familyKey] && !initiallyAttendingFam) {
          upserts.push({ function_id: func.id, family_id: f.id, member_id: null, is_attending: true, adults_count: adultsCount, kids_count: kidsCount, rsvp_status: rsvpStatus })
        } else if (!attendanceMap[familyKey] && initiallyAttendingFam) {
          toDelete.push({ family_id: f.id, member_id: null })
        } else if (
          attendanceMap[familyKey] && initialFamRow &&
          ((initialFamRow.adults_count ?? null) !== adultsCount || (initialFamRow.kids_count ?? null) !== kidsCount ||
            (initialFamRow.rsvp_status || 'invited') !== rsvpStatus)
        ) {
          headcountUpdates.push({ family_id: f.id, adults_count: adultsCount, kids_count: kidsCount, rsvp_status: rsvpStatus })
        }

        f.family_members.forEach(m => {
          const memberKey = `${f.id}-${m.id}`
          const initiallyAttendingMem = initialAttendance.some(a => a.family_id === f.id && a.member_id === m.id && a.is_attending)
          if (attendanceMap[memberKey] && !initiallyAttendingMem) {
            upserts.push({ function_id: func.id, family_id: f.id, member_id: m.id, is_attending: true, rsvp_status: 'invited' })
          } else if (!attendanceMap[memberKey] && initiallyAttendingMem) {
            toDelete.push({ family_id: f.id, member_id: m.id })
          }
        })
      })

      if (upserts.length > 0) {
        const { error } = await supabase.from('function_attendance').upsert(upserts, { onConflict: 'function_id,family_id,member_id', defaultToNull: false })
        if (error) throw error
      }

      for (const hc of headcountUpdates) {
        const { error } = await supabase
          .from('function_attendance')
          .update({ adults_count: hc.adults_count, kids_count: hc.kids_count, rsvp_status: hc.rsvp_status })
          .eq('function_id', func.id)
          .eq('family_id', hc.family_id)
          .is('member_id', null)
        if (error) throw error
      }

      for (const del of toDelete) {
        let q = supabase.from('function_attendance').delete().eq('function_id', func.id).eq('family_id', del.family_id)
        if (del.member_id) {
          q = q.eq('member_id', del.member_id)
        } else {
          q = q.is('member_id', null)
        }
        await q
      }

      // Update room assignments
      const roomUpdates = families.filter(f => {
        const state = roomsState[f.id]
        if (!state) return false
        return state.needs_room !== (f.needs_room || false) || 
               state.rooms_assigned !== (f.rooms_assigned || 0) || 
               state.room_numbers !== (f.room_numbers || '')
      }).map(f => ({
        id: f.id,
        needs_room: roomsState[f.id].needs_room,
        rooms_assigned: roomsState[f.id].rooms_assigned,
        room_numbers: roomsState[f.id].room_numbers
      }))

      if (roomUpdates.length > 0) {
        for (const update of roomUpdates) {
          await supabase.from('families').update({
            needs_room: update.needs_room,
            rooms_assigned: update.rooms_assigned,
            room_numbers: update.room_numbers
          }).eq('id', update.id)
        }
      }

      // Gift quantities (e.g. bhaji boxes): set, change, or clear back to the default
      if (canEditGifts) {
        for (const rule of giftRules) {
          for (const f of families) {
            const key = giftKey(rule.id, f.id)
            const initial = initialGiftCounts.find(c => c.rule_id === rule.id && c.family_id === f.id)
            const next = parseCount(giftQty[key])
            const hasPrice = initial?.unit_amount !== null && initial?.unit_amount !== undefined
            if (next === null && initial && initial.quantity !== null) {
              // Keep the row when this family has its own price; only the quantity goes back to usual
              const { error } = hasPrice
                ? await supabase.from('function_gift_counts').update({ quantity: null }).eq('rule_id', rule.id).eq('family_id', f.id)
                : await supabase.from('function_gift_counts').delete().eq('rule_id', rule.id).eq('family_id', f.id)
              if (error) throw error
            } else if (next !== null && next !== initial?.quantity) {
              const { error } = await supabase
                .from('function_gift_counts')
                .upsert({ function_id: func.id, rule_id: rule.id, family_id: f.id, quantity: next }, { onConflict: 'rule_id,family_id' })
              if (error) throw error
            }
          }
        }
      }

      // Guest list changed, so planned lifafas change too
      const { error: giftingError } = await recalcFunctionGifting(supabase, func.id)
      if (giftingError) console.error('Could not update planned gifting:', giftingError)

      setHasUnsavedChanges(false)
      if (exitAfterSave) {
        router.push(`/functions/${func.id}`)
      } else {
        router.refresh()
      }
    } catch (err) {
      console.error(err)
      toast.error(`Could not save invites: ${(err as { message?: string })?.message || 'unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  // Calculate stats for currently selected (invited) guests, using the same
  // maths as the function page (named members + expected counts + overrides)
  const draftRows: PlanningAttendance[] = []
  families.forEach(f => {
    if (attendanceMap[`${f.id}-family`]) {
      draftRows.push({
        family_id: f.id,
        member_id: null,
        adults_count: parseCount(headcounts[f.id]?.adults),
        kids_count: parseCount(headcounts[f.id]?.kids),
        rsvp_status: rsvp[f.id] || 'invited'
      })
    }
    f.family_members.forEach(m => {
      if (attendanceMap[`${f.id}-${m.id}`]) draftRows.push({ family_id: f.id, member_id: m.id })
    })
  })
  const stats = functionHeadcount(families, draftRows, kidAge)
  const totalInvited = stats.total
  const familiesInvited = stats.families
  const adultsInvited = stats.adults - stats.seniors
  const kidsInvited = stats.kids
  const seniorsInvited = stats.seniors
  const outstationInvited = stats.outstation
  let totalRooms = 0
  families.forEach(f => {
    if (stats.byFamily[f.id] && roomsState[f.id]?.needs_room) totalRooms += roomsState[f.id].rooms_assigned || 0
  })

  const familyLabel = (name: string) => (name.toLowerCase().endsWith('family') ? name : `${name} Family`)
  const TIER: Record<Family['relation_tier'], string> = { tier_1: '👑 Host', tier_2: '🤝 Close', tier_3: '🏡 Extended' }

  // Invite state of one family: whole family, some members, or not at all
  const inviteState = (f: Family) => {
    const famOn = !!attendanceMap[`${f.id}-family`]
    const picked = f.family_members.filter(m => attendanceMap[`${f.id}-${m.id}`]).length
    const all = f.family_members.length > 0 && picked === f.family_members.length
    return { invited: famOn || picked > 0, whole: famOn || all, picked }
  }

  const matchesFilters = (f: Family) =>
    f.family_name.toLowerCase().includes(searchTerm.trim().toLowerCase()) &&
    (sideFilter === 'all' || f.side === sideFilter) &&
    (tierFilter === 'all' || f.relation_tier === tierFilter) &&
    (categoryFilter === 'all' || f.relationship === categoryFilter)

  const filtered = families.filter(matchesFilters)
  const invitedCount = filtered.filter(f => inviteState(f).invited).length
  const filteredFamilies = filtered.filter(f =>
    showFilter === 'all' ? true : showFilter === 'invited' ? inviteState(f).invited : !inviteState(f).invited
  )

  // One button for the families on screen: invite them all, or (if all are in) take them all off
  const allShownInvited = filteredFamilies.length > 0 && filteredFamilies.every(f => inviteState(f).whole)
  const bulkToggle = () => {
    const n = filteredFamilies.length
    const verb = allShownInvited ? 'Remove' : 'Invite'
    if (!window.confirm(`${verb} ${n} ${n === 1 ? 'family' : 'families'} ${allShownInvited ? 'from' : 'to'} ${func.name}?`)) return
    const next = { ...attendanceMap }
    filteredFamilies.forEach(f => {
      next[`${f.id}-family`] = !allShownInvited
      f.family_members.forEach(m => { next[`${f.id}-${m.id}`] = !allShownInvited })
    })
    setAttendanceMap(next)
    setHasUnsavedChanges(true)
  }

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 font-data text-xs font-semibold transition-colors ${on ? 'border-maroon bg-maroon text-ivory' : 'border-marigold/40 bg-white text-maroon hover:bg-marigold/10'}`

  const filtersActive = searchTerm.trim() !== '' || sideFilter !== 'all' || tierFilter !== 'all' || categoryFilter !== 'all'

  return (
    <div className="space-y-5 pb-28">
      {/* Summary */}
      <section className="rounded-2xl border border-marigold/30 bg-white p-4 shadow-sm" aria-label="Invited so far">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-data text-[10px] font-bold uppercase tracking-widest text-maroon/50">Coming to {func.name}</p>
            <p className="font-display text-4xl font-bold leading-none text-maroon">{totalInvited}<span className="ml-1.5 font-data text-sm font-medium text-maroon/60">guests</span></p>
          </div>
          <div className="text-right font-data text-xs text-maroon/70">
            <p><b className="text-maroon">{familiesInvited}</b> families</p>
            <p className="text-mehendi"><b>{stats.confirmedTotal}</b> confirmed</p>
            {stats.declinedFamilies > 0 && <p className="text-rust-red">{stats.declinedFamilies} declined</p>}
          </div>
        </div>
        {totalInvited > 0 && (
          <p className="mt-3 border-t border-marigold/15 pt-2.5 font-data text-[11px] text-maroon/60">
            🧑 {adultsInvited} adults · 🧸 {kidsInvited} kids · 👵 {seniorsInvited} seniors · ✈️ {outstationInvited} outstation{totalRooms > 0 ? ` · 🏨 ${totalRooms} rooms` : ''}
          </p>
        )}
      </section>

      {/* Find families */}
      <section className="space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-maroon/40" />
          <Input
            placeholder="Search families"
            aria-label="Search families"
            className="h-11 rounded-full border-marigold/40 bg-white pl-9 font-data text-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Filters">
          {([['all', 'Both sides'], ['groom', '🤵‍♂️ Groom'], ['bride', '👰‍♀️ Bride']] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={sideFilter === id} onClick={() => setSideFilter(id)} className={chip(sideFilter === id)}>{label}</button>
          ))}
          <span className="mx-0.5 w-px shrink-0 bg-marigold/30" aria-hidden="true" />
          {([['all', 'All circles'], ['tier_1', '👑 Hosts'], ['tier_2', '🤝 Close'], ['tier_3', '🏡 Extended']] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={tierFilter === id} onClick={() => setTierFilter(id)} className={chip(tierFilter === id)}>{label}</button>
          ))}
          {uniqueRelationships.length > 0 && (
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              aria-label="Relationship"
              className={`${chip(categoryFilter !== 'all')} appearance-none pr-3`}
            >
              <option value="all">Any relationship</option>
              {uniqueRelationships.map(rel => <option key={rel} value={rel}>{rel}</option>)}
            </select>
          )}
        </div>
      </section>

      {/* Show: all / invited / not invited, plus one bulk action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-marigold/30 bg-white p-0.5 font-data text-xs" role="tablist" aria-label="Show">
          {([
            ['all', `All ${filtered.length}`],
            ['invited', `Invited ${invitedCount}`],
            ['not', `Not invited ${filtered.length - invitedCount}`]
          ] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={showFilter === id}
              onClick={() => setShowFilter(id)}
              className={`rounded-full px-3 py-1.5 transition-colors ${showFilter === id ? 'bg-maroon font-semibold text-ivory' : 'text-maroon/70 hover:text-maroon'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {filteredFamilies.length > 0 && (
          <button type="button" onClick={bulkToggle} className="rounded-full border border-marigold/50 bg-marigold/10 px-3 py-1.5 font-data text-xs font-semibold text-maroon hover:bg-marigold/20">
            {allShownInvited ? `Remove all ${filteredFamilies.length}` : `✨ Invite all ${filteredFamilies.length}${filtersActive ? ' shown' : ''}`}
          </button>
        )}
      </div>

      {/* Families */}
      <ul className="space-y-2">
        {filteredFamilies.length === 0 && (
          <li className="rounded-2xl border border-dashed border-marigold/40 p-8 text-center font-data text-sm text-maroon/50">
            {showFilter === 'invited' ? 'No one invited yet. Tap + next to a family to invite them.' : showFilter === 'not' ? 'Everyone here is invited. 🎉' : 'No families match.'}
          </li>
        )}
        {filteredFamilies.map(family => {
          const st = inviteState(family)
          const isFamilyChecked = !!attendanceMap[`${family.id}-family`]
          const hc = stats.byFamily[family.id]
          const current = rsvp[family.id] || 'invited'
          const isOpen = openId === family.id
          const room = roomsState[family.id]
          const people = hc?.total ?? 0

          const status = !st.invited
            ? null
            : !isFamilyChecked && !st.whole
              ? { text: `${st.picked} of ${family.family_members.length} invited`, cls: 'bg-marigold/15 text-maroon' }
              : current === 'confirmed'
                ? { text: `✅ ${people} coming`, cls: 'bg-mehendi/15 text-mehendi' }
                : current === 'declined'
                  ? { text: '✖ Declined', cls: 'bg-rust-red/10 text-rust-red' }
                  : { text: `✉️ ${people} invited`, cls: 'bg-maroon/10 text-maroon' }

          return (
            <li key={family.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors ${st.invited ? 'border-mehendi/40' : 'border-marigold/25'}`}>
              <div className="flex items-center gap-3 p-3">
                <button
                  type="button"
                  onClick={() => handleFamilyToggle(family, !st.whole)}
                  aria-pressed={st.whole}
                  aria-label={st.whole ? `Remove ${family.family_name} from ${func.name}` : `Invite ${family.family_name} to ${func.name}`}
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition-colors ${st.whole ? 'border-mehendi bg-mehendi text-white' : st.invited ? 'border-mehendi bg-mehendi/15 text-mehendi' : 'border-marigold/50 bg-white text-maroon/60 hover:bg-marigold/10'}`}
                >
                  {st.invited ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </button>
                <button type="button" onClick={() => setOpenId(isOpen ? null : family.id)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-data text-sm font-semibold text-maroon">{familyLabel(family.family_name)}</span>
                    <span className="block truncate font-data text-[11px] text-maroon/55">
                      {family.side === 'groom' ? '🤵‍♂️' : '👰‍♀️'} {TIER[family.relation_tier]}
                      {family.relationship ? ` · ${family.relationship}` : ''}
                      {family.is_local ? '' : ` · ✈️ ${family.city || 'Outstation'}`}
                      {room?.needs_room ? ` · 🏨 ${room.rooms_assigned}` : ''}
                    </span>
                  </span>
                  {status && <span className={`shrink-0 rounded-full px-2 py-0.5 font-data text-[10px] font-bold ${status.cls}`}>{status.text}</span>}
                  <ChevronDown className={`h-4 w-4 shrink-0 text-maroon/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {isOpen && (
                <div className="space-y-4 border-t border-marigold/15 bg-ivory/40 p-4">
                  {isFamilyChecked && (
                    <>
                      <div>
                        <p className="mb-1.5 font-data text-[10px] font-bold uppercase tracking-wide text-maroon/50">Reply</p>
                        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="RSVP">
                          {(['invited', 'confirmed', 'declined'] as RsvpStatus[]).map(s => (
                            <button
                              key={s}
                              type="button"
                              role="radio"
                              aria-checked={current === s}
                              onClick={() => handleRsvpChange(family.id, s)}
                              className={`rounded-xl border px-2 py-2 font-data text-xs font-semibold transition-colors ${
                                current === s
                                  ? s === 'confirmed' ? 'border-mehendi bg-mehendi text-white' : s === 'declined' ? 'border-rust-red bg-rust-red text-white' : 'border-maroon bg-maroon text-ivory'
                                  : 'border-marigold/30 bg-white text-maroon/70 hover:bg-marigold/10'
                              }`}
                            >
                              {s === 'confirmed' ? '✅ ' : s === 'declined' ? '✖ ' : '✉️ '}{s === 'invited' ? 'No reply' : RSVP_LABELS[s]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {current !== 'declined' && (
                        <div>
                          <p className="mb-1.5 font-data text-[10px] font-bold uppercase tracking-wide text-maroon/50">How many are coming</p>
                          <div className="flex flex-wrap items-center gap-3">
                            {(['adults', 'kids'] as const).map(field => {
                              const auto = field === 'adults' ? hc?.autoAdults : hc?.autoKids
                              const raw = headcounts[family.id]?.[field] ?? ''
                              const value = raw === '' ? Number(auto ?? 0) : Number(raw)
                              const step = (d: number) => handleHeadcountChange(family.id, field, String(Math.max(0, value + d)))
                              return (
                                <div key={field} className="flex items-center gap-2">
                                  <span className="w-12 font-data text-xs font-semibold text-maroon">{field === 'adults' ? 'Adults' : 'Kids'}</span>
                                  <div className="flex items-center rounded-full border border-marigold/40 bg-white">
                                    <button type="button" onClick={() => step(-1)} aria-label={`One fewer ${field === 'adults' ? 'adult' : 'kid'}`} className="grid h-8 w-8 place-items-center text-maroon"><Minus className="h-3.5 w-3.5" /></button>
                                    <input
                                      type="number"
                                      min={0}
                                      inputMode="numeric"
                                      aria-label={field === 'adults' ? 'Adults' : 'Kids'}
                                      placeholder={String(auto ?? '')}
                                      value={raw}
                                      onChange={e => handleHeadcountChange(family.id, field, e.target.value)}
                                      className="w-10 bg-transparent text-center font-data text-sm font-semibold text-maroon outline-none [appearance:textfield] placeholder:text-maroon/40"
                                    />
                                    <button type="button" onClick={() => step(1)} aria-label={`One more ${field === 'adults' ? 'adult' : 'kid'}`} className="grid h-8 w-8 place-items-center text-maroon"><Plus className="h-3.5 w-3.5" /></button>
                                  </div>
                                </div>
                              )
                            })}
                            {(headcounts[family.id]?.adults || headcounts[family.id]?.kids) ? (
                              <button type="button" onClick={() => { handleHeadcountChange(family.id, 'adults', ''); handleHeadcountChange(family.id, 'kids', '') }} className="font-data text-[11px] font-semibold text-maroon/60 underline">
                                Use usual ({hc?.autoAdults ?? 0} + {hc?.autoKids ?? 0})
                              </button>
                            ) : (
                              <span className="font-data text-[11px] text-maroon/50">Their usual numbers</span>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {family.family_members.length > 0 && (
                    <div>
                      <p className="mb-1.5 font-data text-[10px] font-bold uppercase tracking-wide text-maroon/50">
                        People {isFamilyChecked ? '' : '· tap to invite only some'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {family.family_members.map(member => {
                          const on = !!attendanceMap[`${family.id}-${member.id}`]
                          return (
                            <button
                              key={member.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => handleMemberToggle(family.id, member.id, !on)}
                              className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 font-data text-xs font-semibold transition-colors ${on ? 'border-mehendi bg-mehendi text-white' : 'border-marigold/30 bg-white text-maroon hover:bg-marigold/10'}`}
                            >
                              {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 opacity-60" />}
                              {member.name}
                              {member.relation_to_head && <span className={`font-normal ${on ? 'text-white/75' : 'text-maroon/45'}`}>· {member.relation_to_head}</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {isFamilyChecked && giftRules.length > 0 && (
                    <div>
                      <p className="mb-1.5 font-data text-[10px] font-bold uppercase tracking-wide text-maroon/50">Gifts for this family · blank = 1</p>
                      <div className="flex flex-wrap gap-3">
                        {giftRules.map(rule => (
                          <label key={rule.id} className="flex items-center gap-2 font-data text-xs font-semibold text-maroon">
                            <span className="max-w-[9rem] truncate" title={`${rule.rule_name} (₹${Number(rule.amount).toLocaleString('en-IN')} each)`}>🎁 {rule.rule_name}</span>
                            <Input
                              type="number"
                              min={0}
                              placeholder="1"
                              disabled={!canEditGifts}
                              value={giftQty[giftKey(rule.id, family.id)] ?? ''}
                              onChange={e => handleGiftQtyChange(rule.id, family.id, e.target.value)}
                              className="h-8 w-16 border-marigold/40 bg-white text-xs"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="flex cursor-pointer items-center gap-2 font-data text-xs font-semibold text-maroon">
                      <input
                        type="checkbox"
                        checked={room?.needs_room || false}
                        onChange={e => handleRoomChange(family.id, 'needs_room', e.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-maroon"
                      />
                      🏨 Needs a room
                    </label>
                    {room?.needs_room && (
                      <div className="mt-2 flex gap-3 pl-6">
                        <label className="w-24 space-y-1">
                          <span className="block font-data text-[10px] font-bold uppercase text-maroon/50">Rooms</span>
                          <Input type="number" min={1} value={room.rooms_assigned || ''} onChange={e => handleRoomChange(family.id, 'rooms_assigned', parseInt(e.target.value) || 0)} className="h-8 border-marigold/40 bg-white text-xs" />
                        </label>
                        <label className="flex-1 space-y-1">
                          <span className="block font-data text-[10px] font-bold uppercase text-maroon/50">Room numbers</span>
                          <Input type="text" placeholder="e.g. 101, 102" value={room.room_numbers || ''} onChange={e => handleRoomChange(family.id, 'room_numbers', e.target.value)} className="h-8 border-marigold/40 bg-white text-xs" />
                        </label>
                      </div>
                    )}
                  </div>

                  {!st.invited && family.family_members.length === 0 && (
                    <p className="font-data text-xs text-maroon/50">No people listed for this family yet. Tap + to invite the whole family.</p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {hasUnsavedChanges && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-marigold/30 bg-maroon px-4 py-3 shadow-[0_-6px_24px_rgba(58,11,32,0.25)] md:bottom-4 md:left-1/2 md:right-auto md:w-[36rem] md:-translate-x-1/2 md:rounded-full md:border">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <p className="min-w-0 flex-1 font-data text-xs font-semibold text-ivory">
              Unsaved changes
              <span className="block font-normal text-ivory/70">{totalInvited} guests · {familiesInvited} families</span>
            </p>
            <Button size="sm" variant="outline" onClick={() => handleSaveChanges(false)} disabled={saving} className="h-9 rounded-full border-[#F2C46D]/60 bg-transparent px-4 font-semibold text-ivory hover:bg-white/10 hover:text-ivory">
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" onClick={() => handleSaveChanges(true)} disabled={saving} className="h-9 rounded-full bg-[#F2C46D] px-4 font-semibold text-[#3A0B20] hover:bg-[#F2C46D]/90">
              Save &amp; done
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
