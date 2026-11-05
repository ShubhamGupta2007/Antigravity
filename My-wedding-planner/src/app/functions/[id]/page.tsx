import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Calendar, MapPin, IndianRupee, Clock, Users } from 'lucide-react'
import { format } from 'date-fns'
import DeleteFunctionButton from './DeleteFunctionButton'
import FunctionGiftingRules from './FunctionGiftingRules'
import FunctionSchedule from './FunctionSchedule'
import FunctionRituals, { type Ritual } from './FunctionRituals'
import FunctionShagunReceived, { type ShagunEntry } from './FunctionShagunReceived'
import {
  DEFAULT_KID_AGE,
  familiesFromAttendance,
  functionHeadcount,
  parseEventDate,
  type FunctionSegment,
  type GiftCount,
  type GiftOverride,
  type GiftingRule,
  type PlanningAttendance,
  type PlanningFamily
} from '@/lib/functionPlanning'

export default async function FunctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Fetch function details
  const { data: func } = await supabase
    .from('functions')
    .select('*')
    .eq('id', resolvedParams.id)
    .single()

  if (!func) {
    return <div className="p-6 text-center">Function not found.</div>
  }

  // Fetch expenses for this function
  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount')
    .eq('function_id', func.id)

  const totalSpent = (expenses || []).reduce((acc, curr) => acc + Number(curr.amount), 0)
  const maxBudget = Number(func.max_budget)
  const budgetPercentage = maxBudget > 0 ? (totalSpent / maxBudget) * 100 : 0
  const overbudget = totalSpent > maxBudget

  // Fetch current user role (gifting rules: admin / planner / bride / groom)
  const { data: dbUser } = await supabase.from('users').select('side, role').eq('id', user.id).single()
  const role = dbUser?.role || 'regular'
  const isManager = ['admin', 'planner', 'bride', 'groom'].includes(role)
  const canEditSchedule = isManager || func.hosting_side === 'joint' || func.hosting_side === dbUser?.side
  const kidAge: number = func.kid_age_threshold || DEFAULT_KID_AGE

  // Fetch invited guests attendance details
  const { data: attendance, error: attendanceError } = await supabase
    .from('function_attendance')
    .select(`
      id,
      family_id,
      member_id,
      adults_count,
      kids_count,
      rsvp_status,
      families (
        id, family_name, expected_adults_count, expected_kids_count, is_local, side, relation_tier, city, needs_room, rooms_assigned, room_numbers,
        family_members (id, name, age, gender, is_kid_for_gifting)
      ),
      family_members (name, age, gender)
    `)
    .eq('function_id', func.id)

  if (attendanceError) {
    console.error('Error fetching function_attendance:', attendanceError)
  }

  const [giftingRulesRes, overridesRes, segmentsRes, linkedCategoryRes, ritualsRes, giftCountsRes, shagunRes] = await Promise.all([
    supabase.from('function_gifting_rules').select('*').eq('function_id', func.id).order('created_at'),
    supabase.from('function_gift_overrides').select('*').eq('function_id', func.id),
    supabase.from('function_segments').select('*').eq('function_id', func.id),
    supabase.from('categories').select('id, name').eq('function_id', func.id).order('name').limit(1),
    supabase.from('function_rituals').select('*, ritual_items (*)').eq('function_id', func.id).order('sort_order'),
    supabase.from('function_gift_counts').select('rule_id, family_id, quantity').eq('function_id', func.id),
    supabase.from('shagun_received').select('*').eq('function_id', func.id).order('created_at')
  ])
  if (ritualsRes.error) {
    console.error('Error fetching rituals:', ritualsRes.error)
  }
  const planningError = overridesRes.error || segmentsRes.error || giftCountsRes.error
  if (planningError) {
    console.error('Error fetching function planning data:', planningError)
  }

  // Fetch required guests rules
  const { data: requiredRules } = await supabase
    .from('function_required_guests')
    .select(`
      id,
      relation_type,
      specific_member_id,
      family_members (
        id,
        name,
        family_id,
        families (family_name)
      )
    `)
    .eq('function_id', func.id)

  const attendanceRows = (attendance || []) as unknown as Array<PlanningAttendance & { families: PlanningFamily }>
  const planningFamilies = familiesFromAttendance(attendanceRows)
  const headcount = functionHeadcount(planningFamilies, attendanceRows, kidAge)

  const attendingMembers = (attendance || []).filter(a => a.member_id !== null)
  const attendingFamilyIds = Array.from(new Set((attendance || []).map(a => a.family_id)))

  const estimatedAdults = headcount.adults - headcount.seniors
  const estimatedSeniors = headcount.seniors
  const estimatedKids = headcount.kids
  const estimatedMales = headcount.males
  const estimatedFemales = headcount.females
  const outstationCount = headcount.outstation
  const estimatedTotal = headcount.total

  const plannedGifting = Math.round((Number(func.planned_lifafa_total) || 0) + (Number(func.planned_return_gift_total) || 0))

  let roomsRequired = 0
  planningFamilies.forEach(f => {
    const fam = f as PlanningFamily & { needs_room?: boolean; rooms_assigned?: number }
    if (fam.needs_room) roomsRequired += fam.rooms_assigned || 0
  })

  // Validate required guests
  const requiredValidationList: { id: string; name: string; familyName: string; isAttending: boolean }[] = []
  
  for (const rule of (requiredRules || [])) {
    if (rule.specific_member_id && rule.family_members) {
      const isAttending = attendingMembers.some(a => a.member_id === rule.specific_member_id)
      const member = rule.family_members as any
      requiredValidationList.push({
        id: rule.id,
        name: member.name,
        familyName: member.families?.family_name || 'Unknown',
        isAttending
      })
    } else if (rule.relation_type) {
      // Map hosts/close_circle to database tiers
      let tierToQuery: 'tier_1' | 'tier_2' | 'tier_3' | null = null
      const typeLower = rule.relation_type.toLowerCase()
      if (typeLower === 'hosts' || typeLower === 'tier_1' || typeLower === 'immediate') {
        tierToQuery = 'tier_1'
      } else if (typeLower === 'close_circle' || typeLower === 'tier_2') {
        tierToQuery = 'tier_2'
      }

      if (tierToQuery) {
        // Query members from families matching the tier on the function's side
        let membersQuery = supabase
          .from('family_members')
          .select('id, name, families!inner(id, family_name, side, relation_tier)')
        
        if (func.hosting_side !== 'joint') {
          membersQuery = membersQuery.eq('families.side', func.hosting_side)
        }
        membersQuery = membersQuery.eq('families.relation_tier', tierToQuery)
        
        const { data: tierMembers } = await membersQuery;
        const membersList = tierMembers || [];
        membersList.forEach((m: any) => {
          const isAttending = attendingMembers.some(a => a.member_id === m.id)
          requiredValidationList.push({
            id: `${rule.id}-${m.id}`,
            name: m.name,
            familyName: m.families?.family_name || 'Unknown',
            isAttending
          })
        })
      }
    }
  }

  const missingRequiredCount = requiredValidationList.filter(r => !r.isAttending).length
  const hasRequiredAlert = missingRequiredCount > 0

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-5xl mx-auto bg-ivory pb-24">
      {/* Database Error Banner */}
      {attendanceError && (
        <div className="bg-rust-red/10 border border-rust-red p-4 rounded-xl mb-6 shadow-sm flex items-start space-x-3">
          <span className="text-xl">🚨</span>
          <div>
            <h3 className="font-semibold text-rust-red font-display text-sm">Database Error Detected</h3>
            <p className="text-xs text-rust-red/80 font-data mt-0.5">
              We couldn't fetch the guest list. Have you run the <b>06_gifting_rules.sql</b> migration script in your Supabase SQL editor? The app requires the new `gender` column to load attendance!
            </p>
          </div>
        </div>
      )}

      {planningError && (
        <div className="bg-rust-red/10 border border-rust-red p-4 rounded-xl mb-6 shadow-sm flex items-start space-x-3">
          <span className="text-xl">🚨</span>
          <div>
            <h3 className="font-semibold text-rust-red font-display text-sm">Database update needed</h3>
            <p className="text-xs text-rust-red/80 font-data mt-0.5">
              Run <b>supabase/07_function_planning.sql</b> in the Supabase SQL editor (and then <b>08_function_rituals.sql</b>) to enable schedules, headcounts, lifafa exceptions and rituals.
            </p>
          </div>
        </div>
      )}

      {ritualsRes.error && !planningError && (
        <div className="bg-rust-red/10 border border-rust-red p-4 rounded-xl mb-6 shadow-sm flex items-start space-x-3">
          <span className="text-xl">🚨</span>
          <div>
            <h3 className="font-semibold text-rust-red font-display text-sm">Database update needed</h3>
            <p className="text-xs text-rust-red/80 font-data mt-0.5">
              Run <b>supabase/08_function_rituals.sql</b> in the Supabase SQL editor to enable rituals.
            </p>
          </div>
        </div>
      )}

      {/* Alert Banner for Missing Required Guests */}
      {hasRequiredAlert && (
        <div className="bg-rust-red/10 border-l-4 border-rust-red p-4 rounded-r-xl mb-6 shadow-sm flex items-start space-x-3">
          <span className="text-xl">⚠️</span>
          <div>
            <h3 className="font-semibold text-rust-red font-display text-sm">Missing Required Guests</h3>
            <p className="text-xs text-rust-red/80 font-data mt-0.5">
              {missingRequiredCount} required family members or hosts are not yet marked as attending this function.
            </p>
          </div>
        </div>
      )}

      <header className="flex items-center space-x-4 py-4 border-b border-marigold/30 mb-6">
        <Link href="/functions">
          <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-display font-semibold text-maroon">{func.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-data ${
              func.hosting_side === 'groom' ? 'bg-marigold/20 text-maroon' : 
              func.hosting_side === 'bride' ? 'bg-rani-pink/10 text-rani-pink' : 
              'bg-mehendi/10 text-mehendi'
            }`}>
              {func.hosting_side === 'groom' ? '🤵‍♂️ Groom' : 
               func.hosting_side === 'bride' ? '👰‍♀️ Bride' : 
               '🤝 Joint'}
            </span>
          </div>
          
          <DeleteFunctionButton functionId={func.id} />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Details */}
        <div className="md:col-span-2 space-y-6">
          <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6">
            <h2 className="text-xl font-display font-semibold text-maroon mb-4">Event Details</h2>
            <div className="space-y-4">
              <div className="flex items-start">
                <Calendar className="w-5 h-5 text-marigold mr-3 mt-0.5" />
                <div>
                  <p className="text-sm font-data font-medium text-maroon">Date</p>
                  <p className="text-sm font-data text-maroon/70">{format(parseEventDate(func.event_date), 'EEEE, MMMM do, yyyy')}</p>
                </div>
              </div>
              
              {(func.start_time || func.end_time) && (
                <div className="flex items-start">
                  <Clock className="w-5 h-5 text-marigold mr-3 mt-0.5" />
                  <div>
                    <p className="text-sm font-data font-medium text-maroon">Time</p>
                    <p className="text-sm font-data text-maroon/70">
                      {func.start_time?.slice(0, 5)} {func.end_time ? `- ${func.end_time.slice(0, 5)}` : ''}
                    </p>
                  </div>
                </div>
              )}

              {func.location && (
                <div className="flex items-start">
                  <MapPin className="w-5 h-5 text-marigold mr-3 mt-0.5" />
                  <div>
                    <p className="text-sm font-data font-medium text-maroon">Location</p>
                    <p className="text-sm font-data text-maroon/70">{func.location}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <FunctionSchedule
            functionId={func.id}
            functionStart={func.start_time}
            functionEnd={func.end_time}
            initialSegments={(segmentsRes.data || []) as FunctionSegment[]}
            canEdit={canEditSchedule}
          />

          {!ritualsRes.error && (
            <FunctionRituals
              functionId={func.id}
              canEdit={canEditSchedule}
              initialRituals={(ritualsRes.data || []) as Ritual[]}
            />
          )}

          {/* Invited Guests Section */}
          <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6">
            <div className="flex items-center justify-between mb-4 border-b border-marigold/10 pb-3">
              <h2 className="text-xl font-display font-semibold text-maroon flex items-center">
                <Users className="w-5 h-5 mr-2 text-maroon" /> Guests ({estimatedTotal} Expected)
              </h2>
              <Link href={`/functions/${func.id}/manage`}>
                <Button size="sm" variant="outline" className="border-marigold/50 text-maroon hover:bg-marigold/10 h-8 text-xs rounded-full">
                  Manage Invites
                </Button>
              </Link>
            </div>
            
            {attendingFamilyIds.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm font-data text-maroon/50 italic">No guests invited to this function yet.</p>
                <Link href={`/functions/${func.id}/manage`} className="inline-block mt-3">
                  <Button size="sm" className="bg-maroon text-ivory">Invite Guests</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Stats Dashboard Banner */}
                <div className="bg-gradient-to-r from-marigold/20 to-mehendi/10 p-4 rounded-xl border border-marigold/30 flex flex-wrap gap-4 items-center justify-between">
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-maroon/70">Est. Total</p>
                    <p className="text-2xl font-display font-bold text-maroon">{estimatedTotal}</p>
                  </div>
                  
                  <div className="flex gap-4">
                    {estimatedAdults > 0 && (
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-maroon/70">Adults</p>
                        <p className="text-lg font-data font-semibold text-maroon">🧑 {estimatedAdults}</p>
                      </div>
                    )}
                    {estimatedKids > 0 && (
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-maroon/70">Kids</p>
                        <p className="text-lg font-data font-semibold text-maroon">🧸 {estimatedKids}</p>
                      </div>
                    )}
                    {estimatedSeniors > 0 && (
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-maroon/70">Seniors</p>
                        <p className="text-lg font-data font-semibold text-maroon">👵 {estimatedSeniors}</p>
                      </div>
                    )}
                  </div>

                  {/* Gender Breakdown (if available) */}
                  {(estimatedMales > 0 || estimatedFemales > 0) && (
                    <>
                      <div className="w-px h-10 bg-marigold/30 hidden md:block"></div>
                      <div className="flex gap-4">
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-maroon/70">Gents</p>
                          <p className="text-lg font-data font-semibold text-maroon">👨 {estimatedMales}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-maroon/70">Ladies</p>
                          <p className="text-lg font-data font-semibold text-maroon">👩 {estimatedFemales}</p>
                        </div>
                      </div>
                    </>
                  )}
                  
                  <div className="w-px h-10 bg-marigold/30 hidden md:block"></div>
                  
                  <div className="flex gap-4">
                    {outstationCount > 0 && (
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-maroon/70">Overseas</p>
                        <p className="text-lg font-data font-semibold text-maroon">✈️ {outstationCount}</p>
                      </div>
                    )}
                    {roomsRequired > 0 && (
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-maroon/70">Rooms</p>
                        <p className="text-lg font-data font-semibold text-maroon">🏨 {roomsRequired}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs font-data text-maroon/60">
                  <p>Invited Families: <span className="font-semibold text-maroon">{attendingFamilyIds.length} families</span></p>
                  <p>Confirmed: <span className="font-semibold text-mehendi">{headcount.confirmedFamilies} families ({headcount.confirmedTotal} guests)</span>{headcount.declinedFamilies > 0 && <span className="text-rust-red"> • {headcount.declinedFamilies} declined</span>}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {planningFamilies.map(fam => {
                    const members = attendingMembers.filter(m => m.family_id === fam.id)
                    const hc = headcount.byFamily[fam.id]

                    return (
                      <div key={fam.id} className="p-3 bg-ivory/50 rounded-lg border border-marigold/15">
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-xs font-data font-semibold text-maroon truncate">
                            {fam.family_name?.toLowerCase().endsWith('family') ? fam.family_name : `${fam.family_name} Family`}
                          </span>
                          {hc?.rsvp === 'declined' ? (
                            <span className="text-[10px] bg-rust-red/10 text-rust-red px-1.5 py-0.5 rounded-full font-data whitespace-nowrap">✖ Declined</span>
                          ) : (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-data whitespace-nowrap ${hc?.rsvp === 'confirmed' ? 'bg-mehendi/15 text-mehendi' : 'bg-maroon/10 text-maroon'}`} title={hc?.isOverride ? 'Headcount set for this function' : undefined}>
                              {hc?.rsvp === 'confirmed' ? '✅ ' : ''}{hc?.adults || 0} adults{hc?.kids ? ` + ${hc.kids} kids` : ''}{hc?.isOverride ? ' ✎' : ''}
                            </span>
                          )}
                        </div>
                        {members.length > 0 && (
                          <p className="text-[10px] font-data text-maroon/60 mt-1 truncate">
                            {members.map(m => (Array.isArray(m.family_members) ? m.family_members[0] : m.family_members)?.name).join(', ')}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Dynamic Gifting Rules Section */}
          <FunctionGiftingRules
            functionId={func.id}
            initialKidAge={kidAge}
            canEdit={isManager}
            initialRules={(giftingRulesRes.data || []) as GiftingRule[]}
            initialOverrides={(overridesRes.data || []) as GiftOverride[]}
            giftCounts={(giftCountsRes.data || []) as GiftCount[]}
            families={planningFamilies}
            attendance={attendanceRows}
            storedLifafaTotal={Number(func.planned_lifafa_total) || 0}
            storedReturnGiftTotal={Number(func.planned_return_gift_total) || 0}
            linkedCategory={linkedCategoryRes.data?.[0] || null}
            functionBudget={maxBudget}
          />

          {/* Shagun received: hosts only; hidden until 11_shagun_received.sql is run */}
          {canEditSchedule && !shagunRes.error && (
            <FunctionShagunReceived
              functionId={func.id}
              initialEntries={(shagunRes.data || []) as ShagunEntry[]}
              families={planningFamilies}
            />
          )}
        </div>

        {/* Right Column: Required Validation Panel & Budget */}
        <div className="space-y-6">
          {/* Required Guests Panel */}
          {requiredValidationList.length > 0 && (
            <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6">
              <h2 className="text-base font-display font-semibold text-maroon mb-3 border-b border-marigold/10 pb-2">
                👥 Required Attendees Check
              </h2>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {requiredValidationList.map(req => (
                  <div key={req.id} className="flex items-center justify-between py-1.5 text-xs font-data border-b border-marigold/5">
                    <div>
                      <span className="font-medium text-maroon block">{req.name}</span>
                      <span className="text-[10px] text-maroon/50 block">
                        {req.familyName.toLowerCase().endsWith('family') ? req.familyName : `${req.familyName} Family`}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      req.isAttending ? 'bg-mehendi/15 text-mehendi' : 'bg-rust-red/15 text-rust-red'
                    }`}>
                      {req.isAttending ? 'Confirmed' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6">
            <h2 className="text-xl font-display font-semibold text-maroon mb-4 flex items-center">
              <IndianRupee className="w-5 h-5 mr-2" /> Budget
            </h2>
            
            <div className="mb-4">
              <div className="flex justify-between text-sm font-data text-maroon mb-1">
                <span>Spent</span>
                <span className="font-semibold">₹{totalSpent.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-xs font-data text-maroon/50 mb-2">
                <span>Total Budget</span>
                <span>₹{maxBudget.toLocaleString('en-IN')}</span>
              </div>
              {plannedGifting > 0 && (
                <div className="flex justify-between text-xs font-data text-maroon/50 mb-2">
                  <span>Planned lifafas & gifts</span>
                  <span>₹{plannedGifting.toLocaleString('en-IN')}</span>
                </div>
              )}
              
              <div className="w-full h-2 bg-ivory rounded-full overflow-hidden relative">
                <div 
                  className={`h-full rounded-full ${overbudget ? 'bg-rust-red' : (budgetPercentage >= 80 ? 'bg-marigold' : 'bg-mehendi')}`}
                  style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
                />
              </div>
              {overbudget && (
                <p className="text-xs text-rust-red mt-2 font-data flex items-center">
                  <span className="mr-1">⚠️</span> Over budget!
                </p>
              )}
            </div>
            
            <Link href={`/budget/add?function_id=${func.id}`}>
              <Button className="w-full bg-marigold/20 text-maroon hover:bg-marigold/30">
                Log Expense
              </Button>
            </Link>
          </section>
        </div>
      </div>
    </main>
  )
}
