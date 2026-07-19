import { createClient } from '@/lib/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, BarChart2 } from 'lucide-react'

type FamilyMember = {
  id: string
  name: string
  age: number | null
  relation_to_head: string | null
  gender: string
  is_kid_for_gifting: boolean
}

export default async function GuestAnalyticsPage() {
  const supabase = await createClient()

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Fetch user role and side
  const { data: dbUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
    
  const role = dbUser?.role || 'regular'
  const cookieStore = await cookies()
  const isGuestView = cookieStore.get('guest_view')?.value === '1'
  const isEffectivelyGuest = role === 'guest' || role === 'pending' || isGuestView
  
  if (isEffectivelyGuest || (role !== 'admin' && role !== 'planner')) {
    redirect('/guests')
  }

  // Fetch all families
  const { data: families } = await supabase
    .from('families')
    .select(`
      *,
      family_members (*)
    `)

  const allFamilies = families || []

  // Fetch functions, attendance and rules
  const { data: functions } = await supabase.from('functions').select('id, name')
  const { data: functionAttendance } = await supabase.from('function_attendance').select('function_id, family_id, member_id')
  const { data: giftingRules } = await supabase.from('function_gifting_rules').select('*')
  
  let closeFamilyCount = 0
  let extendedFamilyCount = 0

  const relationshipCounts: Record<string, { total: number, adults: number, kids: number, seniors: number, outstation: number }> = {}

  allFamilies.forEach(f => {
    // Tiers count
    const count = (f.expected_adults_count || 1) + (f.expected_kids_count || 0)
    if (f.relation_tier === 'tier_2') {
      closeFamilyCount += count
    } else if (f.relation_tier === 'tier_3') {
      extendedFamilyCount += count
    }

    // Relationship breakdown
    if (f.relationship) {
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

  // Sort relationships by total guests
  const sortedRelationships = Object.entries(relationshipCounts)
    .sort((a, b) => b[1].total - a[1].total)

  // Calculate function stats
  const functionStats = (functions || []).map(fn => {
    const fnAttendance = (functionAttendance || []).filter(a => a.function_id === fn.id)
    const attendingFamilyIds = new Set(fnAttendance.map(a => a.family_id))
    
    const attendingFamiliesData = allFamilies.filter(f => attendingFamilyIds.has(f.id))
    const attendingMembersData = fnAttendance.filter(a => a.member_id !== null)
    
    let adults = 0, kids = 0, seniors = 0, males = 0, females = 0
    
    attendingFamiliesData.forEach(f => {
      const members = attendingMembersData.filter(m => m.family_id === f.id)
      let localAdults = 0, localKids = 0, localSeniors = 0
      
      if (members.length > 0) {
        members.forEach(m => {
          const famMem = f.family_members.find((fm: any) => fm.id === m.member_id)
          if (famMem) {
            const age = famMem.age
            const gender = famMem.gender
            if (age !== null && age !== undefined) {
              if (age < 12) localKids++
              else if (age >= 60) localSeniors++
              else localAdults++
            } else {
              localAdults++
            }
            if (gender === 'Male') males++
            else if (gender === 'Female') females++
          }
        })
      } else {
        localAdults = f.expected_adults_count || 1
        localKids = f.expected_kids_count || 0
      }
      adults += localAdults
      kids += localKids
      seniors += localSeniors
    })
    
    const totalHeadcount = adults + kids + seniors
    
    return {
      name: fn.name,
      families: attendingFamiliesData.length,
      totalHeadcount,
      adults, kids, seniors, males, females
    }
  }).sort((a, b) => b.totalHeadcount - a.totalHeadcount)

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-5xl mx-auto bg-ivory pb-24">
      <header className="flex items-center space-x-4 py-4 border-b border-marigold/30 mb-8">
        <Link href="/guests">
          <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-marigold/20 flex items-center justify-center text-maroon">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-semibold text-maroon">Guest Analytics</h1>
            <p className="text-xs font-data text-maroon/60">Detailed breakdown of relationships and categories</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Relationships */}
        <div className="bg-white/80 backdrop-blur-sm border border-marigold/25 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-display font-semibold text-maroon uppercase tracking-wider border-b border-marigold/15 pb-3 mb-5 flex items-center gap-2">
            🔗 All Relationships
          </h3>
          {sortedRelationships.length > 0 ? (
            <div className="space-y-4">
              {sortedRelationships.map(([rel, stats]) => (
                <div key={rel} className="flex justify-between items-center text-sm font-data border-b border-marigold/5 pb-4 last:border-0 last:pb-0">
                  <span className="font-semibold text-maroon pr-4">{rel}</span>
                  <div className="flex flex-col items-end">
                    <span className="font-bold text-maroon bg-mehendi/10 text-mehendi px-3 py-1 rounded-full text-xs shadow-sm">
                      {stats.total} guests
                    </span>
                    {stats.outstation > 0 && (
                      <span className="text-[10px] font-data font-bold text-rust-red bg-rust-red/5 border border-rust-red/10 px-2 py-0.5 rounded-full mt-2 mb-1">
                        ✈️ {stats.outstation} outstation
                      </span>
                    )}
                    <div className="flex gap-2.5 text-[11px] font-data text-maroon/60 mt-1 uppercase tracking-wider font-semibold">
                      {stats.adults > 0 && <span>🧑 {stats.adults}</span>}
                      {stats.kids > 0 && <span>🧸 {stats.kids}</span>}
                      {stats.seniors > 0 && <span>👵 {stats.seniors}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm font-data text-maroon/50 italic py-6 text-center bg-ivory/50 rounded-xl border border-marigold/10">
              No relationships added yet. Try categorizing your families!
            </div>
          )}
        </div>
        
        {/* Category Tiers */}
        <div className="space-y-6">
          <div className="bg-white/80 backdrop-blur-sm border border-marigold/25 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-display font-semibold text-maroon uppercase tracking-wider border-b border-marigold/15 pb-3 mb-5 flex items-center gap-2">
              🏠 Category Tiers
            </h3>
            <div className="space-y-5">
              <div className="bg-ivory/80 border border-marigold/20 rounded-xl p-4 shadow-sm hover:border-marigold transition-colors">
                <div className="flex justify-between items-center text-sm font-data mb-2">
                  <span className="font-bold text-maroon">Close Circle (Rishtedaar & Friends)</span>
                  <span className="font-bold text-maroon bg-marigold/20 px-3 py-1 rounded-full text-xs">
                    {closeFamilyCount} expected
                  </span>
                </div>
                <p className="text-xs text-maroon/70 font-data italic leading-relaxed">
                  ↳ Attending core wedding events (e.g., Delhi Wedding, Jan 19) & Joint Functions. Typically family and very close friends.
                </p>
              </div>

              <div className="bg-ivory/80 border border-marigold/20 rounded-xl p-4 shadow-sm hover:border-marigold transition-colors">
                <div className="flex justify-between items-center text-sm font-data mb-2">
                  <span className="font-bold text-maroon">Extended Circle & Neighbors</span>
                  <span className="font-bold text-maroon bg-marigold/10 px-3 py-1 rounded-full text-xs">
                    {extendedFamilyCount} expected
                  </span>
                </div>
                <p className="text-xs text-maroon/70 font-data italic leading-relaxed">
                  ↳ Local guests attending selected functions like Sangeet or Reception. Usually neighbors and acquaintances.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Function Breakdown */}
      <div className="mt-8 bg-white/80 backdrop-blur-sm border border-marigold/25 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-display font-semibold text-maroon uppercase tracking-wider border-b border-marigold/15 pb-3 mb-5 flex items-center gap-2">
          🎉 Function Breakdown & Gifting Plans
        </h3>
        {functionStats.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {functionStats.map((stat, i) => (
              <div key={i} className="bg-ivory/50 border border-marigold/20 p-4 rounded-xl shadow-xs hover:border-marigold/50 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-semibold text-maroon">{stat.name}</h4>
                  <span className="bg-mehendi/10 text-mehendi font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {stat.totalHeadcount} Guests
                  </span>
                </div>
                
                <div className="flex gap-4 text-xs font-data text-maroon/70">
                  <span>👨 {stat.males} Gents</span>
                  <span>👩 {stat.females} Ladies</span>
                  <span>🧸 {stat.kids} Kids</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm font-data text-maroon/50 italic py-6 text-center bg-ivory/50 rounded-xl border border-marigold/10">
            No functions found.
          </div>
        )}
      </div>
    </main>
  )
}
