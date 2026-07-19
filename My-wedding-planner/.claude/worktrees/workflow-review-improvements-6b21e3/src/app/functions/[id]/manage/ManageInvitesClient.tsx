'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Search, Sparkles, UserCheck } from 'lucide-react'

type FamilyMember = {
  id: string
  name: string
  relation_to_head: string
}

type Family = {
  id: string
  family_name: string
  side: 'groom' | 'bride'
  relation_tier: 'tier_1' | 'tier_2' | 'tier_3'
  family_members: FamilyMember[]
}

type Attendance = {
  id: string
  function_id: string
  family_id: string
  member_id: string | null
  is_attending: boolean
}

type ManageInvitesClientProps = {
  func: any
  families: Family[]
  initialAttendance: Attendance[]
  requiredGuests: any[]
}

export default function ManageInvitesClient({
  func,
  families,
  initialAttendance,
  requiredGuests
}: ManageInvitesClientProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sideFilter, setSideFilter] = useState<'all' | 'groom' | 'bride'>('all')
  const [loading, setLoading] = useState<Record<string, boolean>>({})

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

  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  const handleMemberToggle = async (familyId: string, memberId: string | null, checked: boolean) => {
    const key = `${familyId}-${memberId || 'family'}`
    setLoading(prev => ({ ...prev, [key]: true }))

    // Optimistically update local state
    setAttendanceMap(prev => ({ ...prev, [key]: checked }))

    try {
      if (checked) {
        // Insert/Invite
        const { error } = await supabase.from('function_attendance').upsert({
          function_id: func.id,
          family_id: familyId,
          member_id: memberId,
          is_attending: true
        }, { onConflict: 'function_id,family_id,member_id' })

        if (error) console.error('Error toggling attendance:', error.message)
      } else {
        // Remove Invite
        const query = supabase
          .from('function_attendance')
          .delete()
          .eq('function_id', func.id)
          .eq('family_id', familyId)

        if (memberId) {
          query.eq('member_id', memberId)
        } else {
          query.is('member_id', null)
        }

        const { error } = await query
        if (error) console.error('Error removing attendance:', error.message)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }))
      router.refresh()
    }
  }

  const handleFamilyToggle = async (family: Family, checked: boolean) => {
    const key = `${family.id}-family`
    setLoading(prev => ({ ...prev, [key]: true }))
    family.family_members.forEach(m => {
      setLoading(prev => ({ ...prev, [`${family.id}-${m.id}`]: true }))
    })

    // Local state updates
    const updatedMap = { ...attendanceMap }
    updatedMap[key] = checked
    family.family_members.forEach(m => {
      updatedMap[`${family.id}-${m.id}`] = checked
    })
    setAttendanceMap(updatedMap)

    try {
      if (checked) {
        // Bulk invite family card level
        const upsertData = [
          {
            function_id: func.id,
            family_id: family.id,
            member_id: null,
            is_attending: true
          },
          ...family.family_members.map(m => ({
            function_id: func.id,
            family_id: family.id,
            member_id: m.id,
            is_attending: true
          }))
        ]

        const { error } = await supabase
          .from('function_attendance')
          .upsert(upsertData, { onConflict: 'function_id,family_id,member_id' })
        
        if (error) console.error(error.message)
      } else {
        // Delete all attendance for this family
        const { error } = await supabase
          .from('function_attendance')
          .delete()
          .eq('function_id', func.id)
          .eq('family_id', family.id)

        if (error) console.error(error.message)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }))
      family.family_members.forEach(m => {
        setLoading(prev => ({ ...prev, [`${family.id}-${m.id}`]: false }))
      })
      router.refresh()
    }
  }

  // Auto-invite by relation tier
  const handleAutoInviteTier = async (tier: 'tier_1' | 'tier_2' | 'tier_3') => {
    const targetFamilies = families.filter(f => f.relation_tier === tier)
    if (targetFamilies.length === 0) return

    const upsertData: any[] = []
    const updatedMap = { ...attendanceMap }

    targetFamilies.forEach(f => {
      upsertData.push({
        function_id: func.id,
        family_id: f.id,
        member_id: null,
        is_attending: true
      })
      updatedMap[`${f.id}-family`] = true

      f.family_members.forEach(m => {
        upsertData.push({
          function_id: func.id,
          family_id: f.id,
          member_id: m.id,
          is_attending: true
        })
        updatedMap[`${f.id}-${m.id}`] = true
      })
    })

    setAttendanceMap(updatedMap)

    const { error } = await supabase
      .from('function_attendance')
      .upsert(upsertData, { onConflict: 'function_id,family_id,member_id' })

    if (error) {
      console.error('Error auto-inviting tier:', error.message)
    } else {
      router.refresh()
    }
  }

  // Filtered families list
  const filteredFamilies = families.filter(f => {
    const matchesSearch = f.family_name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesSide = sideFilter === 'all' || f.side === sideFilter
    return matchesSearch && matchesSide
  })

  const getTierLabel = (tier: string) => {
    if (tier === 'tier_1') return '👑 Immediate Family / Hosts'
    if (tier === 'tier_2') return '🤝 Close Circle'
    return 'Extended Circle'
  }

  return (
    <div className="space-y-6">
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
            onClick={() => handleAutoInviteTier('tier_1')}
          >
            👑 Invite All Hosts (Tier 1)
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="border-marigold/50 text-maroon hover:bg-marigold/10 text-xs"
            onClick={() => handleAutoInviteTier('tier_2')}
          >
            🤝 Invite Close Circle (Tier 2)
          </Button>
        </div>
      </section>

      {/* Search & Filters */}
      <section className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-maroon/40" />
          <Input 
            placeholder="Search family name..." 
            className="pl-9 bg-white border-marigold/50 font-data"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
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
            🤵‍♂️ Groom's
          </button>
          <button 
            onClick={() => setSideFilter('bride')}
            className={`flex-1 py-1.5 rounded-md transition-all ${sideFilter === 'bride' ? 'bg-maroon text-ivory shadow-xs font-semibold' : 'text-maroon/70'}`}
          >
            👰‍♀️ Bride's
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
                      <label htmlFor={family.id} className="font-data font-semibold text-maroon text-sm cursor-pointer hover:text-maroon/80">
                        {family.family_name} Family
                      </label>
                      <span className="text-[10px] font-data text-maroon/50 block">
                        {getTierLabel(family.relation_tier)} • {family.side === 'groom' ? '🤵‍♂️ Groom side' : '👰‍♀️ Bride side'}
                      </span>
                    </div>
                  </div>
                  {isFamilyChecked && (
                    <span className="text-[10px] bg-mehendi/10 text-mehendi px-2 py-0.5 rounded-full font-data flex items-center font-medium">
                      <UserCheck className="w-3 h-3 mr-0.5" /> Invited
                    </span>
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
      </section>
    </div>
  )
}
