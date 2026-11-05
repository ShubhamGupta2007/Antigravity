'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Sparkles, UserCheck } from 'lucide-react'
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

type GiftRuleLite = { id: string; rule_name: string; amount: number }
type GiftCountLite = { rule_id: string; family_id: string; quantity: number }

type ManageInvitesClientProps = {
  func: any
  families: Family[]
  initialAttendance: Attendance[]
  requiredGuests: any[]
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
  const [loading, setLoading] = useState<Record<string, boolean>>({})
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
    initialGiftCounts.forEach(c => { map[giftKey(c.rule_id, c.family_id)] = String(c.quantity) })
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
  const [roomsState, setRoomsState] = useState<Record<string, { needs_room: boolean; rooms_assigned: number; room_numbers: string }>>(() => {
    const map: Record<string, any> = {}
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

  const handleRoomChange = (familyId: string, field: string, value: any) => {
    const currentState = roomsState[familyId] || { needs_room: false, rooms_assigned: 0, room_numbers: '' }
    const updatedState = { ...currentState, [field]: value }
    
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

  const handleAutoInviteTier = (tier: 'tier_1' | 'tier_2' | 'tier_3') => {
    const targetFamilies = families.filter(f => f.relation_tier === tier)
    
    const tierName = tier === 'tier_1' ? 'Hosts' : tier === 'tier_2' ? 'Close Circle' : 'Extended Families'
    
    if (targetFamilies.length === 0) {
      alert(`You don't have any families added to the ${tierName} tier yet.`)
      return
    }

    // Check if all members of these families are already invited
    const allAlreadyInvited = targetFamilies.every(f => {
      const familyChecked = attendanceMap[`${f.id}-family`]
      const membersChecked = f.family_members.length === 0 || f.family_members.every(m => attendanceMap[`${f.id}-${m.id}`])
      return familyChecked || membersChecked
    })

    const actionText = allAlreadyInvited ? 'UNINVITE' : 'INVITE'
    const isConfirmed = window.confirm(`Are you sure you want to ${actionText} all ${tierName} for this function?`)
    
    if (!isConfirmed) return

    const updatedMap = { ...attendanceMap }

    targetFamilies.forEach(f => {
      updatedMap[`${f.id}-family`] = !allAlreadyInvited
      f.family_members.forEach(m => {
        updatedMap[`${f.id}-${m.id}`] = !allAlreadyInvited
      })
    })

    setAttendanceMap(updatedMap)
    setHasUnsavedChanges(true)
  }

  const handleSaveChanges = async (exitAfterSave = false) => {
    setSaving(true)
    try {
      const upserts: any[] = []
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
            upserts.push({ function_id: func.id, family_id: f.id, member_id: m.id, is_attending: true })
          } else if (!attendanceMap[memberKey] && initiallyAttendingMem) {
            toDelete.push({ family_id: f.id, member_id: m.id })
          }
        })
      })

      if (upserts.length > 0) {
        const { error } = await supabase.from('function_attendance').upsert(upserts, { onConflict: 'function_id,family_id,member_id' })
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
            if (next === null && initial) {
              const { error } = await supabase.from('function_gift_counts').delete().eq('rule_id', rule.id).eq('family_id', f.id)
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

  // Filtered families list
  const filteredFamilies = families.filter(f => {
    const matchesSearch = f.family_name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesSide = sideFilter === 'all' || f.side === sideFilter
    const matchesTier = tierFilter === 'all' || f.relation_tier === tierFilter
    const matchesCategory = categoryFilter === 'all' || f.relationship === categoryFilter
    return matchesSearch && matchesSide && matchesTier && matchesCategory
  })

  const getTierLabel = (tier: string) => {
    if (tier === 'tier_1') return '👑 Immediate Family / Hosts'
    if (tier === 'tier_2') return '🤝 Close Circle'
    return 'Extended Circle'
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

  return (
    <div className="space-y-6">
      {/* Current Invite Stats */}
      <section className="bg-gradient-to-br from-marigold/20 to-marigold/5 p-4 rounded-xl border border-marigold/30 shadow-sm">
        <h3 className="text-sm font-display font-semibold text-maroon mb-3">
          Invited Guests Overview
        </h3>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div>
            <div className="text-3xl font-display font-bold text-maroon leading-none">{totalInvited}</div>
            <div className="text-[10px] font-data text-maroon/70 font-semibold uppercase tracking-wider mt-1">Total Invited</div>
          </div>
          <div>
            <div className="text-xl font-display font-bold text-maroon leading-none">{familiesInvited}</div>
            <div className="text-[10px] font-data text-maroon/70 font-semibold uppercase tracking-wider mt-1">Families</div>
          </div>
          <div>
            <div className="text-xl font-display font-bold text-mehendi leading-none">{stats.confirmedTotal}</div>
            <div className="text-[10px] font-data text-maroon/70 font-semibold uppercase tracking-wider mt-1">Confirmed{stats.declinedFamilies > 0 ? ` • ${stats.declinedFamilies} declined` : ''}</div>
          </div>
          <div className="flex gap-4 ml-auto bg-white/50 p-2.5 rounded-lg border border-white/60">
            <div className="text-center">
              <div className="text-sm font-bold text-maroon flex items-center justify-center"><span className="text-xs mr-1">🧑</span> {adultsInvited}</div>
              <div className="text-[9px] font-data text-maroon/60 uppercase">Adults</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-maroon flex items-center justify-center"><span className="text-xs mr-1">🧸</span> {kidsInvited}</div>
              <div className="text-[9px] font-data text-maroon/60 uppercase">Kids</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-maroon flex items-center justify-center"><span className="text-xs mr-1">👵</span> {seniorsInvited}</div>
              <div className="text-[9px] font-data text-maroon/60 uppercase">Seniors</div>
            </div>
          </div>
          <div className="text-center bg-white/50 p-2.5 rounded-lg border border-white/60 min-w-[90px]">
            <div className="text-sm font-bold text-maroon flex items-center justify-center"><span className="text-xs mr-1">✈️</span> {outstationInvited}</div>
            <div className="text-[9px] font-data text-maroon/60 uppercase">Outstation</div>
            {totalRooms > 0 && (
              <div className="text-[8px] font-data text-marigold-dark font-bold uppercase mt-0.5">{totalRooms} Rooms</div>
            )}
          </div>
        </div>
      </section>
      {/* Auto-Invite Actions */}
      <section className="bg-white p-4 rounded-xl border border-marigold/30 shadow-sm space-y-3">
        <h3 className="text-sm font-display font-semibold text-maroon flex items-center">
          <Sparkles className="w-4 h-4 mr-1 text-marigold" /> Auto-Invite Helpers
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            className="border-marigold/50 text-maroon hover:bg-marigold/10 text-xs"
            onClick={() => handleAutoInviteTier('tier_2')}
          >
            🤝 Invite Close Circle
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="border-marigold/50 text-maroon hover:bg-marigold/10 text-xs"
            onClick={() => handleAutoInviteTier('tier_3')}
          >
            🌍 Invite Extended
          </Button>
          <Button 
            size="sm" 
            className="bg-maroon text-ivory hover:bg-maroon/90 text-xs font-semibold shadow-sm"
            onClick={() => {
              handleAutoInviteTier('tier_1')
              handleAutoInviteTier('tier_2')
              handleAutoInviteTier('tier_3')
            }}
          >
            ✨ Invite Everyone
          </Button>
        </div>
      </section>

      {/* Search & Filters */}
      <section className="space-y-3 bg-white/80 p-4 rounded-xl border border-marigold/30 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-maroon/40" />
            <Input 
              placeholder="Search family name..." 
              className="pl-9 bg-ivory border-marigold/50 font-data w-full text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-ivory rounded-md border border-marigold/50 focus:border-marigold focus:ring-1 focus:ring-marigold outline-none text-maroon font-data"
            disabled={uniqueRelationships.length === 0}
          >
            <option value="all">All Relationships</option>
            {uniqueRelationships.map(rel => (
              <option key={rel} value={rel}>{rel}</option>
            ))}
          </select>
        </div>

        {/* Tier Tabs */}
        <div className="flex flex-wrap gap-1.5 pb-2 border-b border-marigold/10">
          {[
            { id: 'all', label: 'All Tiers 🌐' },
            { id: 'tier_1', label: 'Hosts 👑' },
            { id: 'tier_2', label: 'Close 🤝' },
            { id: 'tier_3', label: 'Extended 🏡' }
          ].map(tab => {
            return (
              <button
                key={tab.id}
                onClick={() => setTierFilter(tab.id as any)}
                className={`px-3 py-1 rounded-full text-xs font-semibold tracking-wide transition-all ${
                  tierFilter === tab.id
                    ? 'bg-maroon text-ivory shadow-sm'
                    : 'bg-marigold/10 text-maroon hover:bg-marigold/20'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Side filter toggle */}
        <div className="flex bg-marigold/10 p-0.5 rounded-lg text-xs font-data">
          <button 
            onClick={() => setSideFilter('all')}
            className={`flex-1 py-1.5 rounded-md transition-all ${sideFilter === 'all' ? 'bg-maroon text-ivory shadow-xs font-semibold' : 'text-maroon/70'}`}
          >
            All Sides
          </button>
          <button 
            onClick={() => setSideFilter('groom')}
            className={`flex-1 py-1.5 rounded-md transition-all ${sideFilter === 'groom' ? 'bg-maroon text-ivory shadow-xs font-semibold' : 'text-maroon/70'}`}
          >
            🤵‍♂️ Groom&apos;s
          </button>
          <button 
            onClick={() => setSideFilter('bride')}
            className={`flex-1 py-1.5 rounded-md transition-all ${sideFilter === 'bride' ? 'bg-maroon text-ivory shadow-xs font-semibold' : 'text-maroon/70'}`}
          >
            👰‍♀️ Bride&apos;s
          </button>
        </div>
      </section>

      {/* Families List */}
      <section className="space-y-4">
        {filteredFamilies.length === 0 ? (
          <p className="text-sm font-data text-maroon/50 italic text-center py-8">No matching families found.</p>
        ) : (
          filteredFamilies.map(family => {
            const familyKey = `${family.id}-family`
            const isFamilyChecked = attendanceMap[familyKey] || false
            
            // Check if all members are selected
            const allMembersChecked = family.family_members.length > 0 && 
              family.family_members.every(m => attendanceMap[`${family.id}-${m.id}`])

            return (
              <div key={family.id} className="bg-white p-4 rounded-xl border border-marigold/20 shadow-xs space-y-3">
                
                {/* Family Header Selector */}
                <div className="flex items-center justify-between border-b border-marigold/10 pb-2">
                  <div className="flex items-start space-x-2">
                    <input 
                      type="checkbox"
                      id={family.id}
                      checked={isFamilyChecked || allMembersChecked}
                      disabled={loading[familyKey]}
                      onChange={(e) => handleFamilyToggle(family, e.target.checked)}
                      className="h-4 w-4 rounded border-marigold/50 text-maroon focus:ring-maroon mt-0.5 cursor-pointer accent-maroon"
                    />
                    <div>
                      <label htmlFor={family.id} className="font-data font-semibold text-maroon text-sm cursor-pointer hover:text-maroon/80 flex items-center gap-2">
                        {family.family_name.toLowerCase().endsWith('family') ? family.family_name : `${family.family_name} Family`}
                        <span className="text-[10px] bg-marigold/20 px-1.5 py-0.5 rounded font-medium">
                          {(family.expected_adults_count || 1) + (family.expected_kids_count || 0)} members
                        </span>
                      </label>
                      <div className="text-[10px] font-data text-maroon/60 flex flex-wrap gap-x-2 gap-y-1 mt-1">
                        <span>{getTierLabel(family.relation_tier)}</span>
                        <span>•</span>
                        <span>{family.side === 'groom' ? '🤵‍♂️ Groom side' : '👰‍♀️ Bride side'}</span>
                        {family.relationship && (
                          <>
                            <span>•</span>
                            <span className="font-medium text-maroon">{family.relationship}</span>
                          </>
                        )}
                        <span>•</span>
                        <span className={family.is_local ? 'text-mehendi font-medium' : 'text-rust-red font-medium'}>
                          {family.is_local ? 'Local 🚗' : 'Outstation ✈️'} {family.city && `(${family.city})`}
                        </span>
                      </div>
                    </div>
                  </div>
                  {isFamilyChecked && (
                    <span className="text-[10px] bg-mehendi/10 text-mehendi px-2 py-0.5 rounded-full font-data flex items-center font-medium">
                      <UserCheck className="w-3 h-3 mr-0.5" /> Invited
                    </span>
                  )}
                </div>

                {/* Per-function headcount (family-level invites) */}
                {isFamilyChecked && (() => {
                  const hc = stats.byFamily[family.id]
                  const current = rsvp[family.id] || 'invited'
                  return (
                    <div className="bg-mehendi/5 rounded-lg p-3 border border-mehendi/15 space-y-3">
                      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="RSVP">
                        <span className="text-[10px] uppercase font-bold text-maroon/60 mr-1">RSVP</span>
                        {(['invited', 'confirmed', 'declined'] as RsvpStatus[]).map(status => (
                          <button
                            key={status}
                            type="button"
                            role="radio"
                            aria-checked={current === status}
                            onClick={() => handleRsvpChange(family.id, status)}
                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                              current === status
                                ? status === 'confirmed' ? 'bg-mehendi text-white border-mehendi' : status === 'declined' ? 'bg-rust-red text-white border-rust-red' : 'bg-maroon text-ivory border-maroon'
                                : 'bg-white text-maroon/70 border-marigold/30 hover:bg-marigold/10'
                            }`}
                          >
                            {status === 'confirmed' ? '✅ ' : status === 'declined' ? '✖ ' : '✉️ '}{RSVP_LABELS[status]}
                          </button>
                        ))}
                      </div>
                      {current !== 'declined' && (
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="text-xs font-semibold text-maroon mr-auto">
                          👥 Coming to {func.name}
                          <span className="block text-[10px] font-normal text-maroon/50">
                            Leave blank to use their usual {hc?.autoAdults ?? family.expected_adults_count ?? 1} adults / {hc?.autoKids ?? family.expected_kids_count ?? 0} kids
                          </span>
                        </div>
                        <div className="space-y-1 w-20">
                          <label className="text-[10px] uppercase font-bold text-maroon/60" htmlFor={`${family.id}-adults`}>Adults</label>
                          <Input
                            id={`${family.id}-adults`}
                            type="number"
                            min={0}
                            placeholder={String(hc?.autoAdults ?? '')}
                            value={headcounts[family.id]?.adults ?? ''}
                            onChange={(e) => handleHeadcountChange(family.id, 'adults', e.target.value)}
                            className="h-7 text-xs bg-white border-marigold/30"
                          />
                        </div>
                        <div className="space-y-1 w-20">
                          <label className="text-[10px] uppercase font-bold text-maroon/60" htmlFor={`${family.id}-kids`}>Kids</label>
                          <Input
                            id={`${family.id}-kids`}
                            type="number"
                            min={0}
                            placeholder={String(hc?.autoKids ?? '')}
                            value={headcounts[family.id]?.kids ?? ''}
                            onChange={(e) => handleHeadcountChange(family.id, 'kids', e.target.value)}
                            className="h-7 text-xs bg-white border-marigold/30"
                          />
                        </div>
                      </div>
                      )}
                    </div>
                  )
                })()}

                {/* Gift quantities (per-family return gifts like bhaji boxes) */}
                {isFamilyChecked && giftRules.length > 0 && (
                  <div className="flex flex-wrap items-end gap-3 bg-marigold/5 rounded-lg p-3 border border-marigold/10">
                    <div className="text-xs font-semibold text-maroon mr-auto">
                      🎁 Gifts for this family
                      <span className="block text-[10px] font-normal text-maroon/50">Blank = 1 each</span>
                    </div>
                    {giftRules.map(rule => (
                      <div key={rule.id} className="space-y-1 w-24">
                        <label className="text-[10px] uppercase font-bold text-maroon/60 block truncate" htmlFor={`${family.id}-${rule.id}`} title={`${rule.rule_name} (₹${Number(rule.amount).toLocaleString('en-IN')} each)`}>
                          {rule.rule_name}
                        </label>
                        <Input
                          id={`${family.id}-${rule.id}`}
                          type="number"
                          min={0}
                          placeholder="1"
                          disabled={!canEditGifts}
                          value={giftQty[giftKey(rule.id, family.id)] ?? ''}
                          onChange={(e) => handleGiftQtyChange(rule.id, family.id, e.target.value)}
                          className="h-7 text-xs bg-white border-marigold/30"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Room Needs Section */}
                <div className="bg-marigold/5 rounded-lg p-3 border border-marigold/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-maroon flex items-center cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={roomsState[family.id]?.needs_room || false}
                        onChange={(e) => handleRoomChange(family.id, 'needs_room', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-marigold/50 text-maroon focus:ring-maroon accent-maroon mr-2 cursor-pointer"
                      />
                      🏨 Requires Accommodation
                    </label>
                  </div>
                  
                  {roomsState[family.id]?.needs_room && (
                    <div className="flex items-center gap-3 pl-5 pt-1 animate-in fade-in slide-in-from-top-1">
                      <div className="space-y-1 w-1/3">
                        <label className="text-[10px] uppercase font-bold text-maroon/60">Rooms Needed</label>
                        <Input 
                          type="number" 
                          min={1}
                          value={roomsState[family.id]?.rooms_assigned || ''}
                          onChange={(e) => handleRoomChange(family.id, 'rooms_assigned', parseInt(e.target.value) || 0)}
                          className="h-7 text-xs bg-white border-marigold/30"
                        />
                      </div>
                      <div className="space-y-1 w-2/3">
                        <label className="text-[10px] uppercase font-bold text-maroon/60">Room Number(s) Assigned</label>
                        <Input 
                          type="text" 
                          placeholder="e.g. 101, 102"
                          value={roomsState[family.id]?.room_numbers || ''}
                          onChange={(e) => handleRoomChange(family.id, 'room_numbers', e.target.value)}
                          className="h-7 text-xs bg-white border-marigold/30"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Family Members Checklist */}
                {family.family_members.length === 0 ? (
                  <p className="text-xs text-maroon/40 italic pl-6">No members added to this family card yet.</p>
                ) : (
                  <div className="space-y-2 pl-6">
                    {family.family_members.map(member => {
                      const memberKey = `${family.id}-${member.id}`
                      const isMemberChecked = attendanceMap[memberKey] || false

                      return (
                        <div key={member.id} className="flex items-center space-x-2">
                          <input 
                            type="checkbox"
                            id={member.id}
                            checked={isMemberChecked}
                            disabled={loading[memberKey]}
                            onChange={(e) => handleMemberToggle(family.id, member.id, e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-marigold/50 text-maroon focus:ring-maroon cursor-pointer accent-maroon"
                          />
                          <label htmlFor={member.id} className="text-xs font-data text-maroon/80 cursor-pointer">
                            {member.name} <span className="text-[10px] text-maroon/40">({member.relation_to_head || 'Member'})</span>
                          </label>
                        </div>
                      )
                    })}
                  </div>
                )}

              </div>
            )
          })
        )}
        {hasUnsavedChanges && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-maroon text-ivory px-6 py-3 rounded-full shadow-[0_4px_20px_rgba(110,24,24,0.4)] flex items-center gap-4 z-50 animate-in slide-in-from-bottom-5 font-bold border border-marigold/30">
            <span className="text-sm whitespace-nowrap">⚠️ You have unsaved changes!</span>
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => handleSaveChanges(false)} 
                disabled={saving}
                className="border-marigold text-ivory hover:bg-marigold/10 hover:text-ivory h-8 font-semibold rounded-full px-4 transition-transform active:scale-95 bg-transparent"
              >
                {saving ? 'Saving...' : 'Save & Continue'}
              </Button>
              <Button 
                size="sm" 
                onClick={() => handleSaveChanges(true)} 
                disabled={saving}
                className="bg-marigold text-maroon hover:bg-marigold/90 h-8 font-semibold rounded-full px-6 transition-transform active:scale-95"
              >
                {saving ? 'Saving...' : 'Save & Exit'}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
