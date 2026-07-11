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
  let coreFamilyCount = 0     // tier_1 expected total
  let closeFamilyCount = 0    // tier_2 expected total
  let extendedFamilyCount = 0 // tier_3 expected total
  
  let kidsCount = 0
  let seniorsCount = 0
  
  let outstationFamiliesCount = 0
  let outstationExpectedCount = 0

  allFamilies.forEach(f => {
    // Only count added members for actually invited guests
    if (f.relation_tier !== 'tier_1') {
      totalAdded += f.family_members?.length || 0
      
      f.family_members?.forEach((m: FamilyMember) => {
        if (m.age !== null) {
          if (m.age < 12) {
            kidsCount++
          } else if (m.age >= 60) {
            seniorsCount++
          }
        }
      })

      if (!f.is_local) {
        outstationFamiliesCount++
        outstationExpectedCount += (f.expected_adults_count || 1) + (f.expected_kids_count || 0)
      }
    }
    
    const count = (f.expected_adults_count || 1) + (f.expected_kids_count || 0)
    if (f.relation_tier === 'tier_1') {
      coreFamilyCount += count
    } else if (f.relation_tier === 'tier_2') {
      closeFamilyCount += count
    } else if (f.relation_tier === 'tier_3') {
      extendedFamilyCount += count
    }
  })
  
  const adultsCount = Math.max(0, totalAdded - kidsCount - seniorsCount)

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
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 w-full">
        {/* Logistics & Headcount */}
        <div className="bg-white/80 backdrop-blur-sm border border-marigold/25 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <h3 className="text-sm font-display font-semibold text-maroon uppercase tracking-wider border-b border-marigold/15 pb-2 mb-3">
            📋 Logistics & Demographics
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-start text-sm font-data border-b border-marigold/10 pb-3 mb-2">
              <span className="text-maroon/70 font-medium">Headcount Summary:</span>
              <div className="text-right space-y-1">
                <div className="font-bold text-maroon text-base">
                  {totalExpected} Expected Guests
                </div>
                <div className="text-xs text-maroon/60">
                  ({totalExpectedAdults} Adults + {totalExpectedKids} Kids)
                </div>
              </div>
            </div>
            
            {/* Named/Added Guest Breakdown */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] text-maroon/50 uppercase tracking-wider font-semibold font-data">
                Names Submitted ({totalAdded} of {totalExpected} added)
              </div>
              <div className="bg-ivory/60 border border-marigold/15 rounded-xl p-2.5 flex justify-around text-xs font-data text-maroon/80">
                <span className="flex items-center font-medium">🧑 {adultsCount} Adults</span>
                <span className="flex items-center font-medium">🧸 {kidsCount} Kids</span>
                <span className="flex items-center font-medium">👵 {seniorsCount} Seniors</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center text-sm font-data pt-2">
              <span className="text-maroon/70">Families Invited (Cards needed):</span>
              <span className="font-semibold text-maroon">{totalFamiliesCount} Families</span>
            </div>
            
            <div className="flex justify-between items-center text-sm font-data border-t border-marigold/10 pt-2">
              <span className="text-maroon/70">Outstation (Requires Accommodations):</span>
              <span className="font-semibold text-maroon flex flex-col items-end">
                <span>{outstationExpectedCount} Guests</span>
                <span className="text-[10px] text-maroon/50 font-normal">({outstationFamiliesCount} Families)</span>
              </span>
            </div>
          </div>
        </div>

        {/* Tiers & Event Schedules */}
        <div className="bg-white/80 backdrop-blur-sm border border-marigold/25 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <h3 className="text-sm font-display font-semibold text-maroon uppercase tracking-wider border-b border-marigold/15 pb-2 mb-3">
            🏠 Category Tiers (Headcount)
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm font-data">
              <span className="flex items-center font-medium text-maroon">
                Immediate Family (Hosts) 👑
              </span>
              <span className="font-bold text-maroon bg-marigold/20 px-2 py-0.5 rounded-full text-xs">
                {coreFamilyCount} expected
              </span>
            </div>
            <p className="text-[10px] text-maroon/60 font-data -mt-2 italic">
              ↳ Attending Engagement in Muzaffarnagar (Jan 17) & Wedding in Delhi (Jan 19).
            </p>

            <div className="flex justify-between items-center text-sm font-data border-t border-marigold/10 pt-2">
              <span className="font-medium text-maroon">Close Circle (Rishtedaar & Friends)</span>
              <span className="font-bold text-maroon bg-marigold/10 px-2 py-0.5 rounded-full text-xs">
                {closeFamilyCount} expected
              </span>
            </div>
            <p className="text-[10px] text-maroon/60 font-data -mt-2 italic">
              ↳ Attending Delhi Wedding (Jan 19) & Joint Functions.
            </p>

            <div className="flex justify-between items-center text-sm font-data border-t border-marigold/10 pt-2">
              <span className="font-medium text-maroon">Extended Circle & Neighbors</span>
              <span className="font-bold text-maroon bg-marigold/5 px-2 py-0.5 rounded-full text-xs">
                {extendedFamilyCount} expected
              </span>
            </div>
            <p className="text-[10px] text-maroon/60 font-data -mt-2 italic">
              ↳ Local guests attending selected functions.
            </p>
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
