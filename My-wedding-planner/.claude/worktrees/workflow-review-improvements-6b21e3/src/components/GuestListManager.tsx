'use client'

import { useState, Fragment } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { UserPlus, Search, ChevronDown, ChevronUp, Plus } from 'lucide-react'

type FamilyMember = {
  id: string
  name: string
  age: number | null
  relation_to_head: string | null
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
  family_members: FamilyMember[]
}

const TIER_LABELS: Record<string, string> = {
  tier_1: 'Immediate Family (Hosts) 👑',
  tier_2: 'Close Circle (Rishtedaar & Friends) 🤝',
  tier_3: 'Extended Circle & Neighbors 🏡'
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
  const [selectedTier, setSelectedTier] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [expandedFamilies, setExpandedFamilies] = useState<Record<string, boolean>>({})
  
  // Set default active side based on userSide
  const [activeSide, setActiveSide] = useState<'groom' | 'bride'>(
    userSide === 'bride' ? 'bride' : 'groom'
  )
  
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
    if (selectedTier === 'all') {
      // Exclude hosts/immediate family from general invited list by default
      if (f.relation_tier === 'tier_1') {
        return false
      }
    } else {
      if (f.relation_tier !== selectedTier) {
        return false
      }
    }

    // 3. Search query filter
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

  return (
    <div className="space-y-6">
      {/* Category Navigation Tabs & Search */}
      <div className="bg-white/80 backdrop-blur-sm border border-marigold/20 rounded-2xl p-4 shadow-sm space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-maroon/40" />
          <input
            type="text"
            placeholder="Search family name, city, contact person, or member..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 w-full text-sm bg-ivory rounded-xl border border-marigold/30 focus:border-marigold focus:ring-1 focus:ring-marigold outline-none text-maroon placeholder-maroon/40"
          />
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-marigold/10 pb-2">
          {[
            { id: 'all', label: 'Invited Guests (All) 🌐' },
            { id: 'tier_1', label: 'Immediate Family 👑' },
            { id: 'tier_2', label: 'Close Circle 🤝' },
            { id: 'tier_3', label: 'Extended & Neighbors 🏡' }
          ].map(tab => {
            const count = initialFamilies.filter(f => 
              f.side === activeSide && (tab.id === 'all' ? f.relation_tier !== 'tier_1' : f.relation_tier === tab.id)
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
                {initialFamilies.filter(f => f.side === 'groom' && (selectedTier === 'all' ? f.relation_tier !== 'tier_1' : f.relation_tier === selectedTier)).length}
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
                {initialFamilies.filter(f => f.side === 'bride' && (selectedTier === 'all' ? f.relation_tier !== 'tier_1' : f.relation_tier === selectedTier)).length}
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
          {/* Quick Add Family Link */}
          {canEditActive && (
            <Link href={`/guests/add-family?side=${activeSide}&relation_tier=${selectedTier !== 'all' ? selectedTier : 'tier_2'}`} className="w-full sm:w-auto">
              <Button size="sm" className="bg-maroon text-ivory hover:bg-maroon/90 w-full sm:w-auto text-xs rounded-xl flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Family
              </Button>
            </Link>
          )}

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
            <th className="p-4 pl-6 w-1/3">Family Name</th>
            <th className="p-4">Category</th>
            <th className="p-4">City</th>
            <th className="p-4">Location</th>
            <th className="p-4 text-center">Members</th>
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
                  </td>
                  <td className="p-4 text-maroon/70 font-normal">{family.city || '-'}</td>
                  <td className="p-4 text-xs">
                    {family.is_local ? (
                      <span className="text-maroon/50">Local 🚗</span>
                    ) : (
                      <span className="text-rust-red font-semibold bg-rust-red/5 px-2 py-0.5 rounded-full border border-rust-red/10">
                        Outstation ✈️
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-center font-bold">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      addedCount === expectedCount 
                        ? 'bg-mehendi/15 text-mehendi' 
                        : 'bg-maroon/10 text-maroon'
                    }`}>
                      {addedCount} / {expectedCount}
                    </span>
                  </td>
                  <td className="p-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                    {canEdit && (
                      <div className="flex items-center justify-end space-x-1">
                        <Link href={`/guests/${family.id}/edit`}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-marigold/15 text-maroon" title="Edit Family">
                            ✏️
                          </Button>
                        </Link>
                        <Link href={`/guests/${family.id}/add-member`}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-mehendi/15 text-mehendi" title="Add Member">
                            ➕
                          </Button>
                        </Link>
                      </div>
                    )}
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
                                <div key={member.id} className="bg-white border border-marigold/20 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
                                  <span className="font-semibold text-maroon">{member.name}</span>
                                  <span className="text-maroon/50 text-[10px]">
                                    ({member.relation_to_head || 'Member'}
                                    {member.age ? `, ${member.age} yrs` : ''})
                                  </span>
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
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs bg-marigold/10 text-maroon border border-marigold/30 px-2 py-0.5 rounded-full font-data">
                {TIER_LABELS[family.relation_tier] || family.relation_tier}
              </span>
              {family.city && <span className="text-xs font-data text-maroon/60">• {family.city}</span>}
              {!family.is_local && (
                <span className="text-[10px] bg-rust-red/10 text-rust-red border border-rust-red/20 px-2 py-0.5 rounded-full font-data font-semibold">
                  Accommodation Required
                </span>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center space-x-1.5">
              <Link href={`/guests/${family.id}/edit`}>
                <Button variant="ghost" size="sm" className="text-maroon hover:bg-marigold/10 h-8 px-2 text-xs rounded-full">
                  Edit ✏️
                </Button>
              </Link>
              <Link href={`/guests/${family.id}/add-member`}>
                <Button variant="ghost" size="sm" className="text-mehendi hover:bg-mehendi/10 hover:text-mehendi h-8 px-2 text-xs rounded-full">
                  <UserPlus className="w-3.5 h-3.5 mr-1" />
                  Add Member
                </Button>
              </Link>
            </div>
          )}
        </div>

        {family.contact_person && (
          <div className="mt-2 text-xs font-data text-maroon/70">
            👤 Contact: <span className="font-semibold">{family.contact_person}</span>
            {family.contact_phone && ` (${family.contact_phone})`}
          </div>
        )}
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
                  <li key={member.id} className="flex justify-between text-sm font-data p-2 bg-ivory rounded-lg border border-marigold/10">
                    <span className="text-maroon">{member.name}</span>
                    <span className="text-maroon/60 text-xs flex items-center">
                      {member.relation_to_head || 'Member'}
                      {member.age ? `, ${member.age} yrs` : ''}
                    </span>
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
