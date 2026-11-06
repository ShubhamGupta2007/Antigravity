import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { differenceInCalendarDays, format } from 'date-fns'
import DeleteFunctionButton from './DeleteFunctionButton'
import FunctionGiftingRules from './FunctionGiftingRules'
import FunctionGiftHandover, { type HandoverRow } from './FunctionGiftHandover'
import FunctionSchedule from './FunctionSchedule'
import FunctionRituals, { type Ritual } from './FunctionRituals'
import type { RitualPerson } from './RitualItemForm'
import FunctionShagunReceived, { type ShagunEntry } from './FunctionShagunReceived'
import { TaskList, type Task } from '@/components/TaskList'
import FunctionGuestDetails from './FunctionGuestDetails'
import FunctionReplies, { type GuestMessage, type ReplyFamily } from './FunctionReplies'
import {
  computeGifting,
  DEFAULT_KID_AGE,
  familiesFromAttendance,
  functionHeadcount,
  formatTime,
  parseEventDate,
  sortSegments,
  type FunctionSegment,
  type GiftCount,
  type GiftOverride,
  type GiftingRule,
  type PlanningAttendance,
  type PlanningFamily
} from '@/lib/functionPlanning'

export default async function FunctionDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedParams = await params
  const sp = await searchParams
  const viewParam = sp.view
  const giftTab = sp.tab === 'give' ? 'give' : 'plan'
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
  // A function's budget comes from its linked category in Budget Setup (both
  // sides' limits added up). The function's own max_budget is only a fallback
  // when no category limit is set, so the two can't disagree on screen.
  const { data: budgetCats } = await supabase
    .from('categories')
    .select('id, name, category_budgets (max_budget)')
    .eq('function_id', func.id)
  const categoryLimit = (budgetCats || []).reduce(
    (sum, c) => sum + ((c.category_budgets as { max_budget: number }[] | null) || []).reduce((s, b) => s + (Number(b.max_budget) || 0), 0),
    0
  )
  const budgetFromCategory = categoryLimit > 0
  const maxBudget = budgetFromCategory ? categoryLimit : Number(func.max_budget) || 0

  // Fetch linked category sub-items to detect if itemized allocations exceed category/function budget
  const linkedCategoryIds = (budgetCats || []).map(c => c.id)
  const { data: linkedSubItems } = linkedCategoryIds.length > 0
    ? await supabase.from('category_sub_items').select('id, name, target_budget, is_auto').in('category_id', linkedCategoryIds)
    : { data: [] }

  const subItemsPlannedTotal = (linkedSubItems || []).reduce((acc, curr) => acc + (Number(curr.target_budget) || 0), 0)
  const subItemsOverAllocated = (linkedSubItems || []).length > 0 && maxBudget > 0 && subItemsPlannedTotal > maxBudget
  const subItemsOverAllocatedAmount = subItemsOverAllocated ? subItemsPlannedTotal - maxBudget : 0
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

  const [giftingRulesRes, overridesRes, segmentsRes, linkedCategoryRes, ritualsRes, giftCountsRes, shagunRes, tasksRes, handoverRes] = await Promise.all([
    supabase.from('function_gifting_rules').select('*').eq('function_id', func.id).order('created_at'),
    supabase.from('function_gift_overrides').select('*').eq('function_id', func.id),
    supabase.from('function_segments').select('*').eq('function_id', func.id),
    supabase.from('categories').select('id, name').eq('function_id', func.id).order('name').limit(1),
    supabase.from('function_rituals').select('*, ritual_items (*)').eq('function_id', func.id).order('sort_order'),
    supabase.from('function_gift_counts').select('*').eq('function_id', func.id),
    supabase.from('shagun_received').select('*').eq('function_id', func.id).order('created_at'),
    supabase.from('tasks').select('*').eq('function_id', func.id).order('deadline', { ascending: true, nullsFirst: false }),
    // Hand-over ticks (needs 16_gifts.sql; the tab says so without it)
    supabase.from('function_gift_handover').select('family_id, line_key, given_at').eq('function_id', func.id)
  ])
  // Not done first, then by deadline (already ordered)
  const functionTasks = ((tasksRes.data || []) as Task[]).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))
  const openTasks = functionTasks.filter(t => t.status !== 'done')
  const paymentsDue = openTasks.filter(t => t.expense_id).length
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

  // Invitation replies: invite codes, phones and guests' messages (needs 14_guest_invitations.sql; skipped without it)
  const familyIdsForReplies = Array.from(new Set((attendance || []).map(a => a.family_id)))
  const [inviteInfoRes, messagesRes, coupleRes, respondedRes] = await Promise.all([
    familyIdsForReplies.length
      ? supabase.from('families').select('id, invite_code, contact_phone').in('id', familyIdsForReplies)
      : Promise.resolve({ data: [], error: null }),
    familyIdsForReplies.length
      ? supabase.from('invitation_responses').select('family_id, note, travel, submitted_at').in('family_id', familyIdsForReplies).order('submitted_at', { ascending: false }).limit(30)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('wedding_settings').select('bride_name, groom_name').eq('id', 1).maybeSingle(),
    supabase.from('function_attendance').select('family_id, responded_at').eq('function_id', func.id).is('member_id', null)
  ])
  const respondedAt = new Map(((respondedRes.data || []) as { family_id: string; responded_at: string | null }[]).map(r => [r.family_id, r.responded_at]))
  const invitesReady = !inviteInfoRes.error

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

  const inviteInfo = new Map(((inviteInfoRes.data || []) as { id: string; invite_code: string | null; contact_phone: string | null }[]).map(r => [r.id, r]))
  const replyFamilies: ReplyFamily[] = planningFamilies.map(f => {
    const row = attendanceRows.find(a => a.family_id === f.id && a.member_id === null)
    const hc = headcount.byFamily[f.id]
    return {
      id: f.id,
      name: f.family_name || 'Family',
      status: (row?.rsvp_status || 'invited') as ReplyFamily['status'],
      respondedAt: respondedAt.get(f.id) || null,
      inviteCode: inviteInfo.get(f.id)?.invite_code || null,
      phone: inviteInfo.get(f.id)?.contact_phone || null,
      guests: hc?.total || 0
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
  const guestMessages: GuestMessage[] = ((messagesRes.data || []) as { family_id: string; note: string | null; travel: string | null; submitted_at: string }[])
    .filter(m => m.note || m.travel)
    .map(m => ({ familyName: planningFamilies.find(f => f.id === m.family_id)?.family_name || 'Family', note: m.note, travel: m.travel, submittedAt: m.submitted_at }))

  // People coming to this function, for tap-to-pick givers/receivers in rituals
  const ritualPeople: RitualPerson[] = (() => {
    const list: RitualPerson[] = []
    planningFamilies.forEach(f => {
      const rows = attendanceRows.filter(a => a.family_id === f.id)
      const familyRow = rows.find(a => a.member_id === null)
      if (familyRow?.rsvp_status === 'declined') return
      const familyName = f.family_name || 'Family'
      const side = f.side === 'groom' || f.side === 'bride' ? f.side : null
      const members = (f.family_members || []).filter(m => familyRow || rows.some(r => r.member_id === m.id))
      if (members.length === 0) {
        list.push({ key: `family-${f.id}`, label: `${familyName} family`, family: familyName, side })
        return
      }
      members.forEach(m => {
        if (m.name?.trim()) list.push({ key: m.id, label: m.name.trim(), family: familyName, side })
      })
    })
    const counts = new Map<string, number>()
    list.forEach(p => counts.set(p.label.toLowerCase(), (counts.get(p.label.toLowerCase()) || 0) + 1))
    return list
      .map(p => ((counts.get(p.label.toLowerCase()) || 0) > 1 ? { ...p, label: `${p.label} (${p.family})` } : p))
      .sort((a, b) => a.family.localeCompare(b.family) || a.label.localeCompare(b.label))
  })()

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
      const member = rule.family_members as unknown as { name: string; families?: { family_name?: string } | null }
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
        (membersList as unknown as { id: string; name: string; families?: { family_name?: string } | null }[]).forEach(m => {
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

  // ---- Overview summaries --------------------------------------------------
  const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
  const shortRupees = (n: number) =>
    n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)}Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)}L` : rupees(n)

  const eventDate = parseEventDate(func.event_date)
  const daysToGo = differenceInCalendarDays(eventDate, new Date())
  const countdown =
    daysToGo > 1 ? { big: String(daysToGo), small: 'days to go' }
      : daysToGo === 1 ? { big: '1', small: 'day to go' }
        : daysToGo === 0 ? { big: 'Today', small: 'it’s the day' }
          : null

  const segments = sortSegments((segmentsRes.data || []) as FunctionSegment[])
  const firstSegmentTime = segments.find(sg => sg.start_time)?.start_time || func.start_time

  const ritualList = (ritualsRes.data || []) as Ritual[]
  const ritualItems = ritualList.flatMap(r => r.ritual_items || [])
  const ritualsToArrange = ritualItems.filter(i => i.status === 'pending').length
  const ritualTotal = Number(func.planned_ritual_total) || 0

  const giftingRules = (giftingRulesRes.data || []) as GiftingRule[]
  const giftOverrides = (overridesRes.data || []) as GiftOverride[]
  const giftCounts = (giftCountsRes.data || []) as GiftCount[]
  const handoverRows = (handoverRes.data || []) as HandoverRow[]
  const handoverReady = !handoverRes.error
  const giftPlan = computeGifting(giftingRules, giftOverrides, planningFamilies, attendanceRows, kidAge, giftCounts)
  const givenKeys = new Set(handoverRows.map(h => `${h.family_id}:${h.line_key}`))
  const giftGivenAmount = giftPlan.lines.filter(l => givenKeys.has(`${l.familyId}:${l.key}`)).reduce((s, l) => s + l.total, 0)
  const giftFamilies = new Set(giftPlan.lines.map(l => l.familyId))
  const giftFamiliesLeft = Array.from(giftFamilies).filter(fid => giftPlan.lines.some(l => l.familyId === fid && !givenKeys.has(`${fid}:${l.key}`))).length

  const shagunEntries = (shagunRes.data || []) as ShagunEntry[]
  const shagunTotal = shagunEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  const repliedFamilies = replyFamilies.filter(f => f.status !== 'invited').length

  const paymentTasks = openTasks.filter(t => t.expense_id)
  const missingRequired = requiredValidationList.filter(r => !r.isAttending)

  const dueLabel = (deadline: string | null) => {
    if (!deadline) return ''
    const d = differenceInCalendarDays(parseEventDate(deadline), new Date())
    return d < 0 ? `overdue by ${-d} day${d === -1 ? '' : 's'}` : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due in ${d} days`
  }

  // What needs doing, most pressing first. Empty means nothing to flag.
  const attention: { icon: string; text: string; view: string }[] = []
  if (missingRequired.length > 0) {
    const names = missingRequired.slice(0, 3).map(r => r.name).join(', ')
    attention.push({
      icon: '⚠️',
      text: `${missingRequired.length} required guest${missingRequired.length === 1 ? '' : 's'} not invited: ${names}${missingRequired.length > 3 ? '…' : ''}`,
      view: 'guests'
    })
  }
  paymentTasks.slice(0, 2).forEach(t => {
    attention.push({ icon: '💳', text: `${t.title}${t.deadline ? ` · ${dueLabel(t.deadline)}` : ''}`, view: 'tasks' })
  })
  if (paymentTasks.length > 2) attention.push({ icon: '💳', text: `${paymentTasks.length - 2} more payments due`, view: 'tasks' })
  if (ritualsToArrange > 0) {
    attention.push({ icon: '📦', text: `${ritualsToArrange} ritual item${ritualsToArrange === 1 ? '' : 's'} still to arrange`, view: 'rituals' })
  }
  if (overbudget) attention.push({ icon: '💰', text: `Over budget by ${rupees(totalSpent - maxBudget)}`, view: 'budget' })
  if (subItemsOverAllocated) attention.push({ icon: '📊', text: `Sub-budgets add up to ${rupees(subItemsOverAllocatedAmount)} more than the limit`, view: 'budget' })

  const toDoCount = openTasks.length + ritualsToArrange

  type View = { key: string; icon: string; title: string; value: string; sub: string; flag?: { text: string; tone: 'bad' | 'good' }; bar?: number }
  const views: View[] = [
    {
      key: 'guests', icon: '👥', title: 'Guests',
      value: String(estimatedTotal),
      sub: attendingFamilyIds.length === 0 ? 'No one invited yet' : `${attendingFamilyIds.length} families · ${headcount.confirmedFamilies} confirmed`,
      flag: missingRequired.length > 0 ? { text: `${missingRequired.length} missing`, tone: 'bad' } : undefined
    },
    {
      key: 'schedule', icon: '🕒', title: 'Schedule',
      value: segments.length ? `${segments.length} part${segments.length === 1 ? '' : 's'}` : '—',
      sub: firstSegmentTime ? `starts ${formatTime(firstSegmentTime)}` : 'Add the flow of the day'
    },
    ...(!ritualsRes.error ? [{
      key: 'rituals', icon: '🪔', title: 'Rituals',
      value: ritualList.length ? String(ritualList.length) : '—',
      sub: ritualList.length ? `${ritualItems.length} entries${ritualTotal ? ` · ${shortRupees(ritualTotal)}` : ''}` : 'Who gives and does what',
      flag: ritualsToArrange > 0 ? { text: `${ritualsToArrange} to arrange`, tone: 'bad' as const } : undefined
    }] : []),
    {
      key: 'gifts', icon: '🎁', title: 'Lifafa & Gifts',
      value: plannedGifting ? shortRupees(plannedGifting) : '—',
      sub: !giftingRules.length
        ? 'Lifafas, bhaji, gifts'
        : handoverReady && giftGivenAmount > 0
          ? `${shortRupees(giftGivenAmount)} given · ${giftFamiliesLeft} families left`
          : `${giftingRules.length} item${giftingRules.length === 1 ? '' : 's'} planned`
    },
    {
      key: 'budget', icon: '💰', title: 'Budget',
      value: maxBudget > 0 ? `${Math.round(budgetPercentage)}%` : shortRupees(totalSpent),
      sub: maxBudget > 0 ? `${shortRupees(totalSpent)} of ${shortRupees(maxBudget)}` : 'spent · no limit set',
      bar: maxBudget > 0 ? budgetPercentage : undefined,
      flag: overbudget ? { text: 'Over', tone: 'bad' } : subItemsOverAllocated ? { text: 'Over-planned', tone: 'bad' } : undefined
    },
    ...(!tasksRes.error ? [{
      key: 'tasks', icon: '✅', title: 'Tasks',
      value: openTasks.length ? `${openTasks.length} open` : 'All done',
      sub: paymentsDue ? `${paymentsDue} payment${paymentsDue === 1 ? '' : 's'} due` : `${functionTasks.length} in total`,
      flag: paymentsDue ? { text: `${paymentsDue} due`, tone: 'bad' as const } : undefined
    }] : []),
    ...(invitesReady && canEditSchedule ? [{
      key: 'invites', icon: '💌', title: 'Invitations',
      value: replyFamilies.length ? `${repliedFamilies} / ${replyFamilies.length}` : '—',
      sub: replyFamilies.length ? `replied${guestMessages.length ? ` · ${guestMessages.length} message${guestMessages.length === 1 ? '' : 's'}` : ''}` : 'Venue, dress code, replies',
      flag: guestMessages.length ? { text: `${guestMessages.length} note${guestMessages.length === 1 ? '' : 's'}`, tone: 'good' as const } : undefined
    }] : []),
    ...(canEditSchedule && !shagunRes.error ? [{
      key: 'shagun', icon: '🙏', title: 'Shagun',
      value: shagunTotal ? shortRupees(shagunTotal) : '—',
      sub: shagunEntries.length ? `received · ${shagunEntries.length} entries` : 'Note what guests give'
    }] : [])
  ]
  const active = views.find(v => v.key === viewParam) || null
  const href = (key: string | null) => (key ? `/functions/${func.id}?view=${key}` : `/functions/${func.id}`)

  const sideChip =
    func.hosting_side === 'groom' ? '🤵‍♂️ Ladkewale' : func.hosting_side === 'bride' ? '👰‍♀️ Ladkiwale' : '🤝 Joint'
  const timeText = func.start_time ? `${formatTime(func.start_time)}${func.end_time ? ` – ${formatTime(func.end_time)}` : ''}` : null

  const dbNotice = attendanceError
    ? 'The guest list could not load. Run the scripts in supabase/README.md, in order, in the Supabase SQL editor.'
    : planningError
      ? 'Run supabase/07_function_planning.sql (then 08_function_rituals.sql) to turn on schedules, headcounts and rituals.'
      : ritualsRes.error
        ? 'Run supabase/08_function_rituals.sql to turn on rituals.'
        : null

  const headerActions = (
    <div className="flex items-center gap-1.5">
      <Link href={`/functions/${func.id}/sheet`} className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20">
        📄 Day sheet
      </Link>
      {canEditSchedule && (
        <Link href={`/functions/${func.id}/edit`} className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20">
          ✏️ Edit
        </Link>
      )}
    </div>
  )

  const backButton = (to: string, label: string) => (
    <Link href={to} aria-label={label} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
      <ArrowLeft className="h-4 w-4" />
    </Link>
  )

  // ---- Sections -------------------------------------------------------------
  const guestsSection = (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4 border-b border-marigold/10 pb-3">
          <h2 className="text-xl font-display font-semibold text-maroon">👥 Guests</h2>
          <Link href={`/functions/${func.id}/manage`}>
            <Button size="sm" className="bg-maroon text-ivory hover:bg-maroon/90 h-8 text-xs rounded-full">Manage invites</Button>
          </Link>
        </div>

        {attendingFamilyIds.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm font-data text-maroon/50 italic">No guests invited to this function yet.</p>
            <Link href={`/functions/${func.id}/manage`} className="inline-block mt-3">
              <Button size="sm" className="bg-maroon text-ivory">Invite guests</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { label: 'Expected', value: estimatedTotal, strong: true },
                { label: 'Adults', value: estimatedAdults },
                { label: 'Kids', value: estimatedKids },
                { label: 'Seniors', value: estimatedSeniors },
                { label: 'Gents', value: estimatedMales },
                { label: 'Ladies', value: estimatedFemales },
                { label: 'Outstation', value: outstationCount },
                { label: 'Rooms', value: roomsRequired }
              ]
                .filter(x => x.strong || x.value > 0)
                .map(x => (
                  <div key={x.label} className={`rounded-xl p-2.5 text-center ${x.strong ? 'bg-maroon text-ivory' : 'bg-ivory border border-marigold/20 text-maroon'}`}>
                    <p className="text-lg font-display font-bold leading-none">{x.value}</p>
                    <p className={`mt-1 text-[10px] uppercase tracking-wide font-data ${x.strong ? 'text-ivory/80' : 'text-maroon/60'}`}>{x.label}</p>
                  </div>
                ))}
            </div>

            <p className="text-xs font-data text-maroon/70">
              {attendingFamilyIds.length} families invited · <span className="font-semibold text-mehendi">{headcount.confirmedFamilies} confirmed ({headcount.confirmedTotal} guests)</span>
              {headcount.declinedFamilies > 0 && <span className="text-rust-red"> · {headcount.declinedFamilies} declined</span>}
            </p>

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

      {requiredValidationList.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-5 sm:p-6">
          <h2 className="text-base font-display font-semibold text-maroon mb-1">Must-attend check</h2>
          <p className="text-xs font-data text-maroon/60 mb-3">
            {missingRequired.length ? `${missingRequired.length} of ${requiredValidationList.length} not invited yet` : 'Everyone who must come is invited.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {[...requiredValidationList].sort((a, b) => Number(a.isAttending) - Number(b.isAttending)).map(req => (
              <div key={req.id} className="flex items-center justify-between py-1.5 text-xs font-data border-b border-marigold/10">
                <div className="min-w-0">
                  <span className="font-medium text-maroon block truncate">{req.name}</span>
                  <span className="text-[10px] text-maroon/50 block truncate">{req.familyName}</span>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${req.isAttending ? 'bg-mehendi/15 text-mehendi' : 'bg-rust-red/15 text-rust-red'}`}>
                  {req.isAttending ? 'Invited' : 'Missing'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )

  const budgetSection = (
    <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-5 border-b border-marigold/10 pb-3">
        <h2 className="text-xl font-display font-semibold text-maroon">💰 Budget</h2>
        <Link href={`/budget/add?function_id=${func.id}`}>
          <Button size="sm" className="bg-maroon text-ivory hover:bg-maroon/90 h-8 text-xs rounded-full">+ Log expense</Button>
        </Link>
      </div>
      <div className="flex items-end justify-between gap-4 mb-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide font-data text-maroon/50">Spent</p>
          <p className="text-3xl font-display font-bold text-maroon">{rupees(totalSpent)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide font-data text-maroon/50">Budget</p>
          <p className="text-lg font-data font-semibold text-maroon">{maxBudget > 0 ? rupees(maxBudget) : 'Not set'}</p>
        </div>
      </div>
      {maxBudget > 0 && (
        <div className="w-full h-2.5 bg-ivory rounded-full overflow-hidden mb-2">
          <div className={`h-full rounded-full ${overbudget ? 'bg-rust-red' : budgetPercentage >= 80 ? 'bg-marigold' : 'bg-mehendi'}`} style={{ width: `${Math.min(budgetPercentage, 100)}%` }} />
        </div>
      )}
      <p className={`text-xs font-data mb-5 ${overbudget ? 'text-rust-red font-semibold' : 'text-maroon/60'}`}>
        {maxBudget <= 0 ? 'No budget limit set yet.' : overbudget ? `⚠️ Over budget by ${rupees(totalSpent - maxBudget)}` : `${rupees(maxBudget - totalSpent)} left`}
      </p>
      {subItemsOverAllocated && (
        <p role="alert" className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 font-data text-xs text-amber-900">
          ⚠️ <span className="font-bold">Sub-budgets exceed the limit:</span> itemized sub-items total {rupees(subItemsPlannedTotal)}, which is {rupees(subItemsOverAllocatedAmount)} more than this function&apos;s budget ({rupees(maxBudget)}).
        </p>
      )}
      <dl className="space-y-2 text-xs font-data border-t border-marigold/10 pt-4">
        <div className="flex justify-between gap-4">
          <dt className="text-maroon/60">Where the limit comes from</dt>
          <dd className="text-right text-maroon">{budgetFromCategory ? `Budget Setup (${(budgetCats || []).map(c => c.name).join(', ')})` : 'Set on this function'}</dd>
        </div>
        {plannedGifting > 0 && (
          <div className="flex justify-between gap-4"><dt className="text-maroon/60">Planned lifafas & gifts</dt><dd className="text-maroon">{rupees(plannedGifting)}</dd></div>
        )}
        {ritualTotal > 0 && (
          <div className="flex justify-between gap-4"><dt className="text-maroon/60">Planned ritual items</dt><dd className="text-maroon">{rupees(ritualTotal)}</dd></div>
        )}
      </dl>
    </section>
  )

  const tasksSection = (
    <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-3 border-b border-marigold/10 pb-3">
        <h2 className="text-xl font-display font-semibold text-maroon">
          ✅ Tasks{openTasks.length > 0 && <span className="ml-2 text-xs font-data font-normal text-maroon/60">{openTasks.length} open</span>}
        </h2>
        <Link href={`/tasks/add?function_id=${func.id}`}>
          <Button size="sm" className="bg-maroon text-ivory hover:bg-maroon/90 h-8 text-xs rounded-full">+ Add</Button>
        </Link>
      </div>
      {paymentsDue > 0 && (
        <p className="text-[11px] font-data text-maroon/60 mb-3">💳 {paymentsDue} payment{paymentsDue === 1 ? '' : 's'} due, added from Budget automatically.</p>
      )}
      {functionTasks.length === 0 ? (
        <p className="text-sm font-data text-maroon/50 italic text-center py-4">No tasks for this function yet.</p>
      ) : (
        <TaskList initialTasks={functionTasks} showFunction={false} />
      )}
      <Link href={`/tasks?function=${func.id}`} className="block text-center text-xs font-semibold text-maroon/70 hover:text-maroon mt-3">
        Open in Tasks →
      </Link>
    </section>
  )

  const invitesSection = (
    <div className="space-y-6">
      {replyFamilies.length > 0 && (
        <FunctionReplies functionName={func.name} families={replyFamilies} messages={guestMessages} couple={coupleRes.data || {}} />
      )}
      {'venue_name' in func && (
        <FunctionGuestDetails
          functionId={func.id}
          initial={{
            venue_name: func.venue_name ?? null,
            venue_address: func.venue_address ?? null,
            map_url: func.map_url ?? null,
            dress_code: func.dress_code ?? null,
            dress_colors: func.dress_colors ?? null,
            guest_note: func.guest_note ?? null
          }}
        />
      )}
    </div>
  )

  const sectionFor = (key: string) => {
    switch (key) {
      case 'guests':
        return guestsSection
      case 'schedule':
        return (
          <FunctionSchedule
            functionId={func.id}
            functionStart={func.start_time}
            functionEnd={func.end_time}
            initialSegments={(segmentsRes.data || []) as FunctionSegment[]}
            canEdit={canEditSchedule}
          />
        )
      case 'rituals':
        return (
          <FunctionRituals
            functionId={func.id}
            canEdit={canEditSchedule}
            initialRituals={ritualList}
            storedRitualTotal={ritualTotal}
            linkedCategory={linkedCategoryRes.data?.[0] || null}
            people={ritualPeople}
          />
        )
      case 'gifts':
        return (
          <div className="space-y-4">
            <div className="inline-flex rounded-full border border-marigold/30 bg-white p-0.5 font-data text-xs" role="tablist" aria-label="Lifafa and gifts">
              <Link href={href('gifts')} role="tab" aria-selected={giftTab === 'plan'} className={`rounded-full px-4 py-1.5 ${giftTab === 'plan' ? 'bg-maroon font-semibold text-ivory' : 'text-maroon/70 hover:text-maroon'}`}>
                📋 Plan
              </Link>
              <Link href={`${href('gifts')}&tab=give`} role="tab" aria-selected={giftTab === 'give'} className={`rounded-full px-4 py-1.5 ${giftTab === 'give' ? 'bg-maroon font-semibold text-ivory' : 'text-maroon/70 hover:text-maroon'}`}>
                ✅ Give &amp; track
              </Link>
            </div>
            {giftTab === 'give' ? (
              handoverReady ? (
                <FunctionGiftHandover
                  functionId={func.id}
                  canTick={canEditSchedule}
                  canChange={isManager}
                  families={planningFamilies}
                  attendance={attendanceRows}
                  rules={giftingRules}
                  overrides={giftOverrides}
                  initialCounts={giftCounts}
                  kidAge={kidAge}
                  rituals={ritualList}
                  initialHandover={handoverRows}
                />
              ) : (
                <p role="alert" className="rounded-xl border border-rust-red/30 bg-rust-red/10 p-3 font-data text-xs text-rust-red">
                  Run <b>supabase/16_gifts.sql</b> in the Supabase SQL editor to tick off lifafas and gifts as they&apos;re given.
                </p>
              )
            ) : (
          <FunctionGiftingRules
            functionId={func.id}
            initialKidAge={kidAge}
            canEdit={isManager}
            initialRules={giftingRules}
            initialOverrides={giftOverrides}
            giftCounts={giftCounts}
            families={planningFamilies}
            attendance={attendanceRows}
            storedLifafaTotal={Number(func.planned_lifafa_total) || 0}
            storedReturnGiftTotal={Number(func.planned_return_gift_total) || 0}
            linkedCategory={linkedCategoryRes.data?.[0] || null}
            functionBudget={maxBudget}
          />
            )}
          </div>
        )
      case 'budget':
        return budgetSection
      case 'tasks':
        return tasksSection
      case 'invites':
        return invitesSection
      case 'shagun':
        return <FunctionShagunReceived functionId={func.id} initialEntries={shagunEntries} families={planningFamilies} />
      default:
        return null
    }
  }

  return (
    <main className="min-h-screen bg-ivory pb-24">
      {/* Hero: always-visible essentials */}
      <header className="bg-gradient-to-br from-[#3A0B20] to-maroon text-white">
        <div className={`mx-auto max-w-5xl px-4 sm:px-6 ${active ? 'py-3' : 'pt-4 pb-6'}`}>
          <div className="flex items-center justify-between gap-3">
            {active ? backButton(href(null), 'Back to overview') : backButton('/functions', 'Back to functions')}
            {headerActions}
          </div>

          {active ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h1 className="font-display text-2xl font-bold text-[#F2C46D]">{func.name}</h1>
              <span className="font-data text-xs text-white/75">
                {format(eventDate, 'EEE d MMM')}{func.start_time ? ` · ${formatTime(func.start_time)}` : ''}
              </span>
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="inline-block rounded-full bg-[#F2C46D] px-2.5 py-0.5 font-data text-[11px] font-semibold text-[#3A0B20]">{sideChip}</span>
                  <h1 className="mt-2 font-display text-4xl font-bold leading-none text-[#F2C46D] sm:text-5xl">{func.name}</h1>
                  <div className="mt-3 space-y-1 font-data text-[13px] text-white/85">
                    <p>📅 {format(eventDate, 'EEEE, d MMMM yyyy')}</p>
                    {timeText && <p>🕒 {timeText}</p>}
                    {(func.venue_name || func.location) && <p className="truncate">📍 {func.venue_name || func.location}</p>}
                  </div>
                </div>
                {countdown && (
                  <div className="shrink-0 rounded-2xl border border-[#F2C46D]/40 bg-white/5 px-4 py-2.5 text-center">
                    <p className="font-display text-3xl font-bold leading-none text-[#F2C46D]">{countdown.big}</p>
                    <p className="mt-1 font-data text-[10px] uppercase tracking-wider text-white/75">{countdown.small}</p>
                  </div>
                )}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
                <Link href={href('guests')} className="rounded-xl bg-white/10 px-3 py-2.5 hover:bg-white/15">
                  <p className="font-data text-lg font-bold">{estimatedTotal}</p>
                  <p className="font-data text-[10px] uppercase tracking-wide text-white/70">guests</p>
                </Link>
                <Link href={href('budget')} className="rounded-xl bg-white/10 px-3 py-2.5 hover:bg-white/15">
                  <p className="font-data text-lg font-bold">{shortRupees(totalSpent)}</p>
                  <p className="font-data text-[10px] uppercase tracking-wide text-white/70">{maxBudget > 0 ? `of ${shortRupees(maxBudget)}` : 'spent'}</p>
                </Link>
                <Link href={href(tasksRes.error ? 'rituals' : 'tasks')} className="rounded-xl bg-white/10 px-3 py-2.5 hover:bg-white/15">
                  <p className="font-data text-lg font-bold">{toDoCount}</p>
                  <p className="font-data text-[10px] uppercase tracking-wide text-white/70">to do</p>
                </Link>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Section switcher: only once a section is open */}
      {active && (
        <nav aria-label="Function sections" className="sticky top-0 z-20 border-b border-marigold/25 bg-ivory/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl gap-1.5 overflow-x-auto px-4 py-2.5 sm:px-6 [scrollbar-width:none]">
            <Link href={href(null)} className="shrink-0 rounded-full border border-marigold/40 bg-white px-3 py-1.5 font-data text-xs font-semibold text-maroon hover:bg-marigold/10">
              Overview
            </Link>
            {views.map(v => (
              <Link
                key={v.key}
                href={href(v.key)}
                aria-current={v.key === active.key ? 'page' : undefined}
                className={`shrink-0 rounded-full border px-3 py-1.5 font-data text-xs font-semibold ${v.key === active.key ? 'border-maroon bg-maroon text-ivory' : 'border-marigold/40 bg-white text-maroon hover:bg-marigold/10'}`}
              >
                {v.icon} {v.title}
              </Link>
            ))}
          </div>
        </nav>
      )}

      <div className="mx-auto max-w-5xl px-4 pt-5 sm:px-6">
        {dbNotice && (
          <p role="alert" className="mb-4 rounded-xl border border-rust-red/30 bg-rust-red/10 p-3 font-data text-xs text-rust-red">🚨 {dbNotice}</p>
        )}

        {active ? (
          sectionFor(active.key)
        ) : (
          <>
            {attention.length > 0 && (
              <section className="mb-6 rounded-2xl border border-marigold/30 bg-white p-4 shadow-sm">
                <h2 className="mb-1 font-data text-[10px] font-bold uppercase tracking-widest text-maroon/50">Needs attention</h2>
                <ul className="divide-y divide-dashed divide-maroon/10">
                  {attention.map((a, i) => (
                    <li key={i}>
                      <Link href={href(a.view)} className="flex items-center gap-2 py-2 font-data text-[13px] text-maroon hover:text-maroon/70">
                        <span aria-hidden="true">{a.icon}</span>
                        <span className="min-w-0 flex-1">{a.text}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-maroon/30" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <h2 className="mb-3 px-1 font-data text-[10px] font-bold uppercase tracking-widest text-maroon/50">Plan this function</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {views.map(v => (
                <Link
                  key={v.key}
                  href={href(v.key)}
                  className="relative flex min-h-[132px] flex-col rounded-2xl border border-marigold/30 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-marigold hover:shadow-md"
                >
                  {v.flag && (
                    <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 font-data text-[10px] font-bold ${v.flag.tone === 'bad' ? 'bg-rust-red/10 text-rust-red' : 'bg-mehendi/15 text-mehendi'}`}>
                      {v.flag.text}
                    </span>
                  )}
                  <span className="text-xl" aria-hidden="true">{v.icon}</span>
                  <span className="mt-1 font-display text-lg font-semibold text-maroon">{v.title}</span>
                  <span className="mt-auto pt-2 font-data text-xl font-bold text-maroon">{v.value}</span>
                  {v.bar !== undefined && (
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-marigold/20">
                      <span className={`block h-full rounded-full ${v.bar > 100 ? 'bg-rust-red' : v.bar >= 80 ? 'bg-marigold' : 'bg-mehendi'}`} style={{ width: `${Math.min(v.bar, 100)}%` }} />
                    </span>
                  )}
                  <span className="mt-0.5 font-data text-[11px] text-maroon/60">{v.sub}</span>
                </Link>
              ))}
            </div>

            <div className="mt-10 flex justify-center">
              <DeleteFunctionButton functionId={func.id} />
            </div>
          </>
        )}
      </div>
    </main>
  )
}
