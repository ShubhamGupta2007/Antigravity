'use client'

import { useState, Fragment, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { UserPlus, Search, ChevronDown, ChevronUp, Plus, CalendarDays, Settings, Edit2 } from 'lucide-react'

type FamilyMember = {
  id: string
  name: string
  age: number | null
  relation_to_head: string | null
  gender: string
  is_kid_for_gifting: boolean
}

type Family = {
  id: string
  family_name: string
  side: string
  relation_tier: string
  expected_adults_count: number | null
  expected_kids_count: number | null
  is_local: boolean
  city: string | null
  contact_person: string | null
  contact_phone: string | null
  relationship: string | null
  family_members: FamilyMember[]
  function_attendance?: {
    function_id: string
    functions?: { name: string } | null
  }[]
}

const TIER_LABELS: Record<string, string> = {
  tier_1: 'Immediate Family (Hosts) 👑',
  tier_2: 'Close Circle (Rishtedaar & Friends) 🤝',
  tier_3: 'Extended Circle & Neighbors 🏡'
}

// Custom Action Menu Component
function ActionMenu({ family }: { family: Family }) {
  const [open, setOpen] = useState(false)
  
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="h-8 px-2 text-xs border-marigold/30 text-maroon hover:bg-marigold/10 rounded-full"
      >
        <Settings className="w-3.5 h-3.5 mr-1" /> Manage
      </Button>
      
      {open && (
        <div 
          className="absolute right-0 top-full mt-1 w-48 bg-white border border-marigold/30 rounded-xl shadow-xl z-50 py-1 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <Link href={`/guests/${family.id}/edit`} className="flex items-center px-4 py-2.5 text-xs text-maroon hover:bg-marigold/15 font-data">
            <Edit2 className="w-3.5 h-3.5 mr-2" /> Edit Details
          </Link>
          <Link href={`/guests/${family.id}/add-member`} className="flex items-center px-4 py-2.5 text-xs text-maroon hover:bg-mehendi/15 font-data">
            <UserPlus className="w-3.5 h-3.5 mr-2" /> Add Member
          </Link>
          <Link href={`/guests/${family.id}/functions`} className="flex items-center px-4 py-2.5 text-xs text-maroon hover:bg-blue-50 font-data">
            <CalendarDays className="w-3.5 h-3.5 mr-2" /> Manage Functions
          </Link>
        </div>
      )}
    </div>
  )
}

export default function GuestListManager({
  initialFamilies,
  role,
  userSide
}: {
  initialFamilies: Family[]
  role: string
  userSide?: string
}) {
  const [selectedTier, setSelectedTier] = useState<string>(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('guestList_selectedTier') || 'all'
    return 'all'
  })
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [expandedFamilies, setExpandedFamilies] = useState<Record<string, boolean>>({})
  const [selectedRelationship, setSelectedRelationship] = useState<string>(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('guestList_selectedRelationship') || 'all'
    return 'all'
  })
  
  // Set default active side based on userSide
  const [activeSide, setActiveSide] = useState<'groom' | 'bride'>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('guestList_activeSide')
      if (stored === 'groom' || stored === 'bride') return stored
    }
    return userSide === 'bride' ? 'bride' : 'groom'
  })
  
  useEffect(() => {
    if (typeof window !== 'undefined') sessionStorage.setItem('guestList_selectedTier', selectedTier)
  }, [selectedTier])

  useEffect(() => {
    if (typeof window !== 'undefined') sessionStorage.setItem('guestList_selectedRelationship', selectedRelationship)
  }, [selectedRelationship])

  useEffect(() => {
    if (typeof window !== 'undefined') sessionStorage.setItem('guestList_activeSide', activeSide)
  }, [activeSide])
  
  // Set default view mode to 'table'
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')

  const toggleExpand = (familyId: string) => {
    setExpandedFamilies(prev => ({
      ...prev,
      [familyId]: !prev[familyId]
    }))
  }

  // Filter logic
  const filteredFamilies = initialFamilies.filter(f => {
    // 1. Side filter
    if (f.side !== activeSide) {
      return false
    }

    // 2. Tier filter
    if (selectedTier !== 'all') {
      if (f.relation_tier !== selectedTier) {
        return false
      }
    }

    // 3. Relationship filter
    if (selectedRelationship !== 'all') {
      if ((f.relationship || '') !== selectedRelationship) {
        return false
      }
    }

    // 4. Search query filter
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase()
      const matchesFamilyName = f.family_name.toLowerCase().includes(query)
      const matchesCity = f.city?.toLowerCase().includes(query) || false
      const matchesContact = f.contact_person?.toLowerCase().includes(query) || false
      const matchesMembers = f.family_members?.some(m => m.name.toLowerCase().includes(query)) || false
      return matchesFamilyName || matchesCity || matchesContact || matchesMembers
    }
    return true
  })

  const canEditGroom = role === 'admin'
  const canEditBride = role === 'admin'
  const canEditActive = activeSide === 'groom' ? canEditGroom : canEditBride

  const uniqueRelationships = Array.from(new Set(initialFamilies
    .filter(f => f.side === activeSide && (selectedTier === 'all' ? true : f.relation_tier === selectedTier))
    .map(f => f.relationship)
    .filter(Boolean) as string[]
  )).sort()

  const isFilterActive = searchQuery.trim() !== '' || selectedRelationship !== 'all' || selectedTier !== 'all'
  
  let filterExpectedCount = 0
  let filterAdults = 0
  let filterKids = 0
  let filterSeniors = 0
  let filterOutstation = 0
  
  if (isFilterActive) {
    filteredFamilies.forEach(f => {
      const addedMembersCount = f.family_members?.length || 0
      
      let localAdults = 0
      let localKids = 0
      let localSeniors = 0
      
      if (addedMembersCount > 0) {
        f.family_members?.forEach((m: FamilyMember) => {
          if (m.age !== null) {
            if (m.age < 12) localKids++
            else if (m.age >= 60) localSeniors++
            else localAdults++
          } else {
            localAdults++
          }
        })
      }
      
      const expectedAdults = f.expected_adults_count || 1
      const expectedKids = f.expected_kids_count || 0
      
      localKids += Math.max(0, expectedKids - localKids)
      localAdults += Math.max(0, expectedAdults - localAdults - localSeniors)
      
      filterAdults += localAdults
      filterKids += localKids
      filterSeniors += localSeniors
      
      const familyTotal = localAdults + localKids + localSeniors
      filterExpectedCount += familyTotal
      
      if (!f.is_local) {
        filterOutstation += familyTotal
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Category Navigation Tabs & Search */}
      <div className="bg-white/80 backdrop-blur-sm border border-marigold/20 rounded-2xl p-4 shadow-sm space-y-4">
        {/* Search Input & Relationship Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-maroon/40" />
            <input
              type="text"
              placeholder="Search family name, city, contact person, or member..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-full text-sm bg-ivory rounded-xl border border-marigold/30 focus:border-marigold focus:ring-1 focus:ring-marigold outline-none text-maroon placeholder-maroon/40"
            />
          </div>
          
          <select
            value={selectedRelationship}
            onChange={(e) => setSelectedRelationship(e.target.value)}
            className="px-4 py-2 text-sm bg-ivory rounded-xl border border-marigold/30 focus:border-marigold focus:ring-1 focus:ring-marigold outline-none text-maroon min-w-[200px]"
            disabled={uniqueRelationships.length === 0}
          >
            <option value="all">
              {uniqueRelationships.length === 0 ? "No Relationships Added Yet" : "All Relationships"}
            </option>
            {uniqueRelationships.map(rel => (
              <option key={rel} value={rel}>{rel}</option>
            ))}
          </select>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-marigold/10 pb-2">
          {[
            { id: 'all', label: 'All Guests 🌐' },
            { id: 'tier_2', label: 'Close Circle 🤝' },
            { id: 'tier_3', label: 'Extended & Neighbors 🏡' }
          ].map(tab => {
            const count = initialFamilies.filter(f => 
              f.side === activeSide && (tab.id === 'all' ? true : f.relation_tier === tab.id)
            ).length
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedTier(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
                  selectedTier === tab.id
                    ? 'bg-maroon text-ivory shadow-sm'
                    : 'bg-marigold/10 text-maroon hover:bg-marigold/20'
                }`}
              >
                {tab.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* View Mode & Side Toggle Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/80 backdrop-blur-sm border border-marigold/20 rounded-2xl p-4 shadow-sm">
        
        {/* Side Selector Toggle (For Admin or Couple) */}
        {role === 'admin' ? (
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setActiveSide('groom')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-sm font-semibold tracking-wide border transition-all flex items-center justify-center gap-1.5 ${
                activeSide === 'groom'
                  ? 'bg-maroon text-ivory border-maroon shadow-sm'
                  : 'bg-white text-maroon/70 border-marigold/30 hover:bg-marigold/10'
              }`}
            >
              🤵‍♂️ Ladkewale (Groom)
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeSide === 'groom' ? 'bg-white/20 text-white' : 'bg-marigold/10 text-maroon'}`}>
                {initialFamilies.filter(f => f.side === 'groom' && (selectedTier === 'all' ? true : f.relation_tier === selectedTier)).length}
              </span>
            </button>
            <button
              onClick={() => setActiveSide('bride')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-sm font-semibold tracking-wide border transition-all flex items-center justify-center gap-1.5 ${
                activeSide === 'bride'
                  ? 'bg-maroon text-ivory border-maroon shadow-sm'
                  : 'bg-white text-maroon/70 border-marigold/30 hover:bg-marigold/10'
              }`}
            >
              👰‍♀️ Ladkiwale (Bride)
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeSide === 'bride' ? 'bg-white/20 text-white' : 'bg-marigold/10 text-maroon'}`}>
                {initialFamilies.filter(f => f.side === 'bride' && (selectedTier === 'all' ? true : f.relation_tier === selectedTier)).length}
              </span>
            </button>
          </div>
        ) : (
          <div className="text-sm font-display font-semibold text-maroon flex items-center gap-1.5">
            {activeSide === 'groom' ? '🤵‍♂️ Ladkewale (Groom Side)' : '👰‍♀️ Ladkiwale (Bride Side)'}
          </div>
        )}

        {/* Action button & View Mode Switcher */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {/* View Mode controls */}
          <div className="flex items-center gap-1.5 border border-marigold/35 bg-ivory p-1 rounded-xl w-full sm:w-auto justify-center">
            <button
              onClick={() => setViewMode('table')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-maroon shadow-xs font-bold border border-marigold/10'
                  : 'text-maroon/60 hover:text-maroon'
              }`}
            >
              📋 Table View
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-maroon shadow-xs font-bold border border-marigold/10'
                  : 'text-maroon/60 hover:text-maroon'
              }`}
            >
              🎴 Cards View
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Selection Summary (Only shown when a filter is active) */}
      {isFilterActive && (
        <div className="bg-marigold/10 border border-marigold/30 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-display font-semibold text-maroon uppercase tracking-wider bg-white/50 px-2.5 py-1 rounded-lg">Selection Stats</span>
            <span className="text-sm font-bold text-maroon">{filterExpectedCount} Guests</span>
            <span className="text-xs font-data text-maroon/60">({filteredFamilies.length} Families)</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-data font-medium text-maroon">
            <div className="flex gap-2.5">
              {filterAdults > 0 && <span>🧑 <span className="font-bold">{filterAdults}</span></span>}
              {filterKids > 0 && <span>🧸 <span className="font-bold">{filterKids}</span></span>}
              {filterSeniors > 0 && <span>👵 <span className="font-bold">{filterSeniors}</span></span>}
            </div>
            {filterOutstation > 0 && (
              <div className="border-l border-marigold/30 pl-4 text-rust-red flex items-center gap-1 font-semibold">
                ✈️ {filterOutstation} outstation
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div>
        {filteredFamilies.length === 0 ? (
          <div className="p-12 bg-white rounded-2xl shadow-sm border border-marigold/20 text-center">
            <p className="text-sm font-data text-maroon/70">No families match your active selection filters.</p>
          </div>
        ) : viewMode === 'table' ? (
          <GuestTable
            families={filteredFamilies}
            canEdit={canEditActive}
            expandedFamilies={expandedFamilies}
            onToggleExpand={toggleExpand}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredFamilies.map(family => (
              <FamilyCard
                key={family.id}
                family={family}
                canEdit={canEditActive}
                isExpanded={!!expandedFamilies[family.id]}
                onToggleExpand={() => toggleExpand(family.id)}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Floating Action Button */}
      {canEditActive && (
        <Link href={`/guests/add-family?side=${activeSide}&relation_tier=${selectedTier !== 'all' ? selectedTier : 'tier_2'}`}>
          <div className="fixed bottom-20 md:bottom-8 right-6 z-40 bg-maroon text-ivory px-6 py-4 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:scale-105 hover:bg-maroon/90 transition-all flex items-center justify-center cursor-pointer group border border-marigold/20">
            <Plus className="w-5 h-5 mr-2" />
            <span className="font-bold text-sm">Add Family</span>
          </div>
        </Link>
      )}
    </div>
  )
}

function GuestTable({
  families,
  canEdit,
  expandedFamilies,
  onToggleExpand
}: {
  families: Family[]
  canEdit: boolean
  expandedFamilies: Record<string, boolean>
  onToggleExpand: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto border border-marigold/20 rounded-2xl shadow-sm bg-white">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-ivory border-b border-marigold/20 text-maroon/80 font-display text-xs font-bold uppercase tracking-wider">
            <th className="p-4 pl-6 w-1/4">Family Name</th>
            <th className="p-4">Category</th>
            <th className="p-4">Location</th>
            <th className="p-4">Functions</th>
            <th className="p-4 text-center">Composition</th>
            <th className="p-4 text-right pr-6">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-marigold/10 font-data text-sm text-maroon">
          {families.map(family => {
            const isExpanded = !!expandedFamilies[family.id]
            const addedCount = family.family_members?.length || 0
            const expectedCount = (family.expected_adults_count || 1) + (family.expected_kids_count || 0)
            
            return (
              <Fragment key={family.id}>
                {/* Row */}
                <tr 
                  onClick={() => onToggleExpand(family.id)}
                  className="hover:bg-marigold/5 cursor-pointer transition-colors"
                >
                  <td className="p-4 pl-6 font-semibold flex items-center gap-2">
                    <span className="text-maroon/40 text-[10px] w-4">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    {family.family_name}
                  </td>
                  <td className="p-4 text-xs">
                    <span className="bg-marigold/10 text-maroon border border-marigold/20 px-2.5 py-1 rounded-full font-semibold">
                      {family.relation_tier === 'tier_1' ? 'Hosts 👑' : 
                       family.relation_tier === 'tier_2' ? 'Close 🤝' : 'Extended 🏡'}
                    </span>
                    {family.relationship && (
                      <div className="mt-1.5 text-[10px] text-maroon/70 font-semibold uppercase tracking-wider">{family.relationship}</div>
                    )}
                  </td>
                  <td className="p-4 text-xs">
                    {family.is_local ? (
                      <span className="text-maroon/50">Local 🚗</span>
                    ) : (
                      <span className="text-rust-red font-semibold bg-rust-red/5 px-2 py-0.5 rounded-full border border-rust-red/10">
                        Outstation ✈️
                      </span>
                    )}
                    {family.city && <div className="mt-1 text-[10px] text-maroon/70">{family.city}</div>}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1 max-w-[140px]">
                      {(() => {
                        const uniqueFunctions = Array.from(new Set(
                          (family.function_attendance || [])
                            .map(a => a.functions?.name)
                            .filter(Boolean)
                        )) as string[]
                        
                        if (uniqueFunctions.length === 0) {
                          return <span className="text-[10px] text-maroon/40 italic">None yet</span>
                        }
                        
                        const visible = uniqueFunctions.slice(0, 3)
                        const remaining = uniqueFunctions.length - 3

                        return (
                          <>
                            {visible.map((fnName, i) => (
                              <span key={i} title={fnName} className="text-[9px] font-bold bg-ivory text-maroon border border-marigold/30 px-1.5 py-0.5 rounded truncate max-w-[90px]">
                                {fnName}
                              </span>
                            ))}
                            {remaining > 0 && (
                              <span title={uniqueFunctions.slice(3).join(', ')} className="text-[9px] font-bold bg-marigold/20 text-maroon border border-marigold/30 px-1.5 py-0.5 rounded cursor-help">
                                +{remaining} more
                              </span>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1 items-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        addedCount === expectedCount 
                          ? 'bg-mehendi/15 text-mehendi' 
                          : 'bg-maroon/10 text-maroon'
                      }`}>
                        {addedCount}/{expectedCount} Added
                      </span>
                      <div className="flex gap-1.5 text-[10px] text-maroon/70 font-semibold mt-0.5">
                        <span title="Expected Adults">🧑 {family.expected_adults_count || 1}</span>
                        {(family.expected_kids_count || 0) > 0 && <span title="Expected Kids">🧸 {family.expected_kids_count}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                    {canEdit && <ActionMenu family={family} />}
                  </td>
                </tr>
                
                {/* Expanded Member List */}
                {isExpanded && (
                  <tr className="bg-ivory/20">
                    <td colSpan={6} className="p-4 pl-12 border-t border-marigold/10">
                      <div className="space-y-3 text-xs">
                        {/* Contact details */}
                        {family.contact_person && (
                          <div className="text-maroon/70">
                            👤 Primary Contact: <span className="font-semibold text-maroon">{family.contact_person}</span>
                            {family.contact_phone && ` • 📞 Phone: ${family.contact_phone}`}
                          </div>
                        )}
                        
                        {/* Expected breakdown */}
                        <div className="text-maroon/60">
                          📊 Expected Headcount: <span className="font-semibold text-maroon">{family.expected_adults_count || 1} Adults</span>, <span className="font-semibold text-maroon">{family.expected_kids_count || 0} Kids</span>
                        </div>

                        {/* Members sub-list */}
                        <div className="space-y-1.5">
                          <div className="font-bold text-maroon/40 uppercase tracking-wider text-[10px]">Family Members Added:</div>
                          {family.family_members && family.family_members.length > 0 ? (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {family.family_members.map(member => (
                                <div key={member.id} className="bg-white border border-marigold/20 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs group">
                                  <span className="font-semibold text-maroon">{member.name}</span>
                                  <span className="text-maroon/50 text-[10px]">
                                    ({member.relation_to_head || 'Member'}
                                    {member.age ? `, ${member.age} yrs` : ''}
                                    {member.gender && member.gender !== 'Unknown' ? `, ${member.gender}` : ''})
                                  </span>
                                  {canEdit && (
                                    <Link href={`/guests/${family.id}/members/${member.id}/edit`} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                                      <span className="text-maroon/60 hover:text-maroon text-[10px]">✏️</span>
                                    </Link>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-maroon/40 italic">No family members details added yet.</p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FamilyCard({
  family,
  canEdit,
  isExpanded,
  onToggleExpand
}: {
  family: Family
  canEdit: boolean
  isExpanded: boolean
  onToggleExpand: () => void
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-5 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="text-lg font-display font-semibold text-maroon">{family.family_name}</h3>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className="text-xs bg-marigold/10 text-maroon border border-marigold/30 px-2 py-0.5 rounded-full font-data">
                {TIER_LABELS[family.relation_tier] || family.relation_tier}
              </span>
              {family.relationship && (
                <span className="text-[10px] font-data bg-mehendi/10 text-mehendi border border-mehendi/20 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">
                  {family.relationship}
                </span>
              )}
              {family.city && <span className="text-xs font-data text-maroon/60">• {family.city}</span>}
              {!family.is_local && (
                <span className="text-[10px] bg-rust-red/10 text-rust-red border border-rust-red/20 px-2 py-0.5 rounded-full font-data font-semibold">
                  Accommodation Required
                </span>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="flex justify-end pt-2 border-t border-marigold/10 mt-2">
              <ActionMenu family={family} />
            </div>
          )}
        </div>

        {family.contact_person && (
          <div className="mt-2 text-xs font-data text-maroon/70">
            👤 Contact: <span className="font-semibold">{family.contact_person}</span>
            {family.contact_phone && ` (${family.contact_phone})`}
          </div>
        )}
        
        <div className="mt-1.5 flex gap-3 text-xs font-data text-maroon/70">
          <div>🧑 Adults: <span className="font-bold text-maroon">{family.expected_adults_count || 1}</span></div>
          {(family.expected_kids_count || 0) > 0 && (
            <div>🧸 Kids: <span className="font-bold text-maroon">{family.expected_kids_count}</span></div>
          )}
        </div>

        <div className="mt-2.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-maroon/50 block mb-1">Functions Invited</span>
          <div className="flex flex-wrap gap-1">
            {(() => {
              const uniqueFunctions = Array.from(new Set(
                (family.function_attendance || [])
                  .map(a => a.functions?.name)
                  .filter(Boolean)
              )) as string[]
              
              if (uniqueFunctions.length === 0) {
                return <span className="text-[10px] text-maroon/40 italic">No functions assigned yet</span>
              }
              
              const visible = uniqueFunctions.slice(0, 3)
              const remaining = uniqueFunctions.length - 3

              return (
                <>
                  {visible.map((fnName, i) => (
                    <span key={i} title={fnName} className="text-[10px] font-semibold bg-ivory text-maroon border border-marigold/30 px-2 py-0.5 rounded-full shadow-xs truncate max-w-[120px]">
                      {fnName}
                    </span>
                  ))}
                  {remaining > 0 && (
                    <span title={uniqueFunctions.slice(3).join(', ')} className="text-[10px] font-semibold bg-marigold/20 text-maroon border border-marigold/30 px-2 py-0.5 rounded-full shadow-xs cursor-help">
                      +{remaining} more
                    </span>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-marigold/10 pt-3">
        <button
          onClick={onToggleExpand}
          className="flex justify-between items-center w-full text-left text-xs font-data text-maroon/80 hover:text-maroon"
        >
          <div className="flex items-center font-semibold">
            Members Added
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 ml-1 text-maroon/50" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-1 text-maroon/50" />
            )}
          </div>
          <span className="text-xs bg-maroon/10 text-maroon px-2 py-0.5 rounded-full font-semibold">
            {family.family_members?.length || 0} / {(family.expected_adults_count || 1) + (family.expected_kids_count || 0)} added
          </span>
        </button>
        
        {/* Collapsible Content */}
        {isExpanded && (
          <div className="mt-3 transition-all duration-300">
            {family.family_members && family.family_members.length > 0 ? (
              <ul className="space-y-2">
                {family.family_members.map(member => (
                  <li key={member.id} className="flex justify-between items-center text-sm font-data p-2 bg-ivory rounded-lg border border-marigold/10 group">
                    <span className="text-maroon">{member.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-maroon/60 text-xs flex items-center">
                        {member.relation_to_head || 'Member'}
                        {member.age ? `, ${member.age} yrs` : ''}
                      </span>
                      {canEdit && (
                        <Link href={`/guests/${family.id}/members/${member.id}/edit`} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-maroon/60 hover:text-maroon text-[10px]">✏️</span>
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs font-data text-maroon/50 italic text-center py-2">
                No family members details added yet.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
