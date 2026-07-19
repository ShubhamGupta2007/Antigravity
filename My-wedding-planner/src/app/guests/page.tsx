import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import GuestListManager from '@/components/GuestListManager'

// Define the shape of our data based on our schema
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
  relationship: string | null
  expected_adults_count: number | null
  expected_kids_count: number | null
  is_local: boolean
  city: string | null
  contact_person: string | null
  contact_phone: string | null
  family_members: FamilyMember[]
}

export default async function GuestsPage() {
  const supabase = await createClient()

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Fetch user role and side from public.users
  const { data: dbUser } = await supabase
    .from('users')
    .select('role, side')
    .eq('id', user.id)
    .single()
    
  const role = dbUser?.role || 'regular'
  const userSide = dbUser?.side

  if (role !== 'admin') {
    redirect('/')
  }

  // Fetch all families and their members
  const { data: families, error } = await supabase
    .from('families')
    .select(`
      *,
      family_members (*)
    `)
    .order('side')
    .order('family_name')

  if (error) {
    console.error('Error fetching families:', error)
  }

  // Group by side
  const ladkewale = (families || []).filter(f => f.side === 'groom')
  const ladkiwale = (families || []).filter(f => f.side === 'bride')

  const canEditGroom = role === 'admin'
  const canEditBride = role === 'admin'

  // Live Guest Stats Calculation
  const allFamilies = families || []
  // Filter out Tier 1 (Hosts/Immediate family) for invited stats
  const guestsFamilies = allFamilies.filter(f => f.relation_tier !== 'tier_1')
  const totalExpectedAdults = guestsFamilies.reduce((sum, f) => sum + (f.expected_adults_count || 1), 0)
  const totalExpectedKids = guestsFamilies.reduce((sum, f) => sum + (f.expected_kids_count || 0), 0)
  const totalExpected = totalExpectedAdults + totalExpectedKids
  const totalFamiliesCount = guestsFamilies.length
  
  let totalAdded = 0
  let closeFamilyCount = 0    // tier_2 expected total
  let extendedFamilyCount = 0 // tier_3 expected total
  
  let estimatedAdultsCount = 0
  let estimatedKidsCount = 0
  let seniorsCount = 0
  
  let outstationFamiliesCount = 0
  let outstationExpectedCount = 0
  let outstationAdultsCount = 0
  let outstationKidsCount = 0
  let outstationSeniorsCount = 0

  allFamilies.forEach(f => {
    // Only count added members for actually invited guests
    if (f.relation_tier !== 'tier_1') {
      const addedMembersCount = f.family_members?.length || 0
      
      let localAdults = 0
      let localKids = 0
      let localSeniors = 0

      if (addedMembersCount > 0) {
        f.family_members?.forEach((m: FamilyMember) => {
          if (m.age !== null) {
            if (m.age < 12) {
              localKids++
            } else if (m.age >= 60) {
              localSeniors++
            } else {
              localAdults++
            }
          } else {
            localAdults++
          }
        })
      }
      
      // Calculate remaining expected members
      const expectedAdults = f.expected_adults_count || 1
      const expectedKids = f.expected_kids_count || 0
      
      const remainingExpectedKids = Math.max(0, expectedKids - localKids)
      // Seniors count against the adult quota
      const remainingExpectedAdults = Math.max(0, expectedAdults - localAdults - localSeniors)

      localAdults += remainingExpectedAdults
      localKids += remainingExpectedKids

      estimatedAdultsCount += localAdults
      estimatedKidsCount += localKids
      seniorsCount += localSeniors

      if (!f.is_local) {
        outstationFamiliesCount++
        outstationExpectedCount += (localAdults + localKids + localSeniors)
        outstationAdultsCount += localAdults
        outstationKidsCount += localKids
        outstationSeniorsCount += localSeniors
      }
    }
    
    const count = (f.expected_adults_count || 1) + (f.expected_kids_count || 0)
    if (f.relation_tier === 'tier_2') {
      closeFamilyCount += count
    } else if (f.relation_tier === 'tier_3') {
      extendedFamilyCount += count
    }
  })

  const relationshipCounts: Record<string, { total: number, adults: number, kids: number, seniors: number, outstation: number }> = {}
  
  allFamilies.forEach(f => {
    if (f.relation_tier !== 'tier_1' && f.relationship) {
      if (!relationshipCounts[f.relationship]) {
        relationshipCounts[f.relationship] = { total: 0, adults: 0, kids: 0, seniors: 0, outstation: 0 }
      }
      
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
      
      const familyTotal = localAdults + localKids + localSeniors
      relationshipCounts[f.relationship].adults += localAdults
      relationshipCounts[f.relationship].kids += localKids
      relationshipCounts[f.relationship].seniors += localSeniors
      relationshipCounts[f.relationship].total += familyTotal
      
      if (!f.is_local) {
        relationshipCounts[f.relationship].outstation += familyTotal
      }
    }
  })
  
  const topRelationships = Object.entries(relationshipCounts)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-5xl mx-auto bg-ivory pb-24">
      <header className="flex items-center space-x-4 py-4 border-b border-marigold/30 mb-6">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-semibold text-maroon">Guest List</h1>
          {role === 'admin' && <span className="text-xs bg-maroon text-ivory px-2 py-0.5 rounded-full font-data">Admin</span>}
        </div>
      </header>

      {/* Stats Dashboard Banner */}
      <section className="flex flex-col gap-6 mb-8 w-full">
        {/* Row 1: Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
          {/* Card 1: Total Headcount */}
          <div className="bg-white/80 backdrop-blur-sm border border-marigold/25 rounded-2xl p-4 shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] text-maroon/60 uppercase tracking-wider font-semibold font-data mb-1">Expected Headcount</span>
            <span className="text-3xl font-display font-bold text-maroon">{totalExpected}</span>
            <span className="text-xs text-maroon/60 font-data mt-1">{totalExpectedAdults} Adults, {totalExpectedKids} Kids</span>
          </div>
          
          {/* Card 2: Demographics */}
          <div className="bg-white/80 backdrop-blur-sm border border-marigold/25 rounded-2xl p-4 shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] text-maroon/60 uppercase tracking-wider font-semibold font-data mb-1">Demographics</span>
            <div className="flex gap-3 text-sm font-data font-medium text-maroon mt-1">
              <span className="flex flex-col items-center">🧑 <span className="text-lg font-bold">{estimatedAdultsCount}</span></span>
              <span className="flex flex-col items-center">🧸 <span className="text-lg font-bold">{estimatedKidsCount}</span></span>
              <span className="flex flex-col items-center">👵 <span className="text-lg font-bold">{seniorsCount}</span></span>
            </div>
            <span className="text-[9px] text-maroon/40 font-data mt-1.5">*auto-updates</span>
          </div>

          {/* Card 3: Total Families */}
          <div className="bg-white/80 backdrop-blur-sm border border-marigold/25 rounded-2xl p-4 shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] text-maroon/60 uppercase tracking-wider font-semibold font-data mb-1">Families Invited</span>
            <span className="text-3xl font-display font-bold text-maroon">{totalFamiliesCount}</span>
            <span className="text-xs text-maroon/60 font-data mt-1">Cards Needed</span>
          </div>

          {/* Card 4: Outstation */}
          <div className="bg-white/80 backdrop-blur-sm border border-marigold/25 rounded-2xl p-4 shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] text-maroon/60 uppercase tracking-wider font-semibold font-data mb-1">Outstation Guests</span>
            <span className="text-3xl font-display font-bold text-maroon">{outstationExpectedCount}</span>
            <span className="text-[10px] text-maroon/60 font-data mt-0.5 mb-1.5 font-semibold">{outstationFamiliesCount} Families</span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {outstationAdultsCount > 0 && <span className="bg-ivory text-maroon border border-marigold/40 px-2 py-0.5 rounded-full text-[11px] font-bold shadow-sm flex items-center gap-1">🧑 {outstationAdultsCount}</span>}
              {outstationKidsCount > 0 && <span className="bg-ivory text-maroon border border-marigold/40 px-2 py-0.5 rounded-full text-[11px] font-bold shadow-sm flex items-center gap-1">🧸 {outstationKidsCount}</span>}
              {outstationSeniorsCount > 0 && <span className="bg-ivory text-maroon border border-marigold/40 px-2 py-0.5 rounded-full text-[11px] font-bold shadow-sm flex items-center gap-1">👵 {outstationSeniorsCount}</span>}
            </div>
          </div>
        </div>

        {/* Row 2: Detailed Lists */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Relationships */}
          <div className="bg-white/80 backdrop-blur-sm border border-marigold/25 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-display font-semibold text-maroon uppercase tracking-wider border-b border-marigold/15 pb-2 mb-4">
              🔗 Top Relationships
            </h3>
            {topRelationships.length > 0 ? (
              <div className="space-y-3">
                {topRelationships.map(([rel, stats]) => (
                  <div key={rel} className="flex justify-between items-center text-sm font-data border-b border-marigold/5 pb-3 last:border-0 last:pb-0">
                    <span className="font-medium text-maroon truncate pr-4">{rel}</span>
                    <div className="flex flex-col items-end">
                      <span className="font-bold text-maroon bg-mehendi/10 text-mehendi px-2.5 py-0.5 rounded-full text-xs">
                        {stats.total} guests
                      </span>
                      {stats.outstation > 0 && (
                        <span className="text-[9px] font-data font-semibold text-rust-red bg-rust-red/5 border border-rust-red/10 px-2 py-0.5 rounded-full mt-1.5 mb-0.5">
                          ✈️ {stats.outstation} outstation
                        </span>
                      )}
                      <div className="flex gap-2 text-[10px] font-data text-maroon/60 mt-1 uppercase tracking-wider">
                        {stats.adults > 0 && <span>🧑 {stats.adults}</span>}
                        {stats.kids > 0 && <span>🧸 {stats.kids}</span>}
                        {stats.seniors > 0 && <span>👵 {stats.seniors}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs font-data text-maroon/50 italic py-2 text-center">
                No relationships added yet.
              </div>
            )}
          </div>
          
          {/* Category Tiers */}
          <div className="bg-white/80 backdrop-blur-sm border border-marigold/25 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-display font-semibold text-maroon uppercase tracking-wider border-b border-marigold/15 pb-2 mb-4">
              🏠 Category Tiers
            </h3>
            <div className="space-y-4">
              <div className="bg-ivory/60 border border-marigold/15 rounded-xl p-3">
                <div className="flex justify-between items-center text-sm font-data mb-1">
                  <span className="font-medium text-maroon">Close Circle (Rishtedaar & Friends)</span>
                  <span className="font-bold text-maroon bg-marigold/10 px-2 py-0.5 rounded-full text-xs">
                    {closeFamilyCount} expected
                  </span>
                </div>
                <p className="text-xs text-maroon/60 font-data italic">
                  ↳ Attending Delhi Wedding (Jan 19) & Joint Functions.
                </p>
              </div>
  
              <div className="bg-ivory/60 border border-marigold/15 rounded-xl p-3">
                <div className="flex justify-between items-center text-sm font-data mb-1">
                  <span className="font-medium text-maroon">Extended Circle & Neighbors</span>
                  <span className="font-bold text-maroon bg-marigold/5 px-2 py-0.5 rounded-full text-xs">
                    {extendedFamilyCount} expected
                  </span>
                </div>
                <p className="text-xs text-maroon/60 font-data italic">
                  ↳ Local guests attending selected functions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <GuestListManager
        initialFamilies={families as Family[] || []}
        role={role}
        userSide={userSide}
      />
    </main>
  )
}
