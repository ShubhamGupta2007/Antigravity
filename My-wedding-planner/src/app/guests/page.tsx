import { createClient } from '@/lib/server'
import { cookies } from 'next/headers'
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
  gender: string
  is_kid_for_gifting: boolean
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
  const cookieStore = await cookies()
  const isGuestView = cookieStore.get('guest_view')?.value === '1'
  const isEffectivelyGuest = role === 'guest' || role === 'pending' || isGuestView
  
  if (isEffectivelyGuest) {
    redirect('/')
  }
  const userSide = dbUser?.side

  if ((role !== 'admin' && role !== 'planner')) {
    redirect('/')
  }

  // Fetch all families and their members
  const { data: families, error } = await supabase
    .from('families')
    .select(`
      *,
      family_members (*),
      function_attendance (
        function_id,
        functions (
          name
        )
      )
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
  // Include all families for stats
  const guestsFamilies = allFamilies
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
    // Count added members for all families
    {
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
  })

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
        
        <div className="flex justify-center mt-2">
          <Link href="/guests/analytics">
            <Button variant="outline" className="border-marigold/40 text-maroon hover:bg-marigold/10 rounded-full text-sm font-semibold px-6 shadow-sm">
              View Detailed Analytics 📊
            </Button>
          </Link>
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
