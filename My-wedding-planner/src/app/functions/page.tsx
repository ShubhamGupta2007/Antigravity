import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Calendar, ChevronRight } from 'lucide-react'
import { differenceInCalendarDays, format } from 'date-fns'
import FunctionsView, { type FunctionCard } from './FunctionsView'
import {
  DEFAULT_KID_AGE,
  PLANNING_FAMILY_SELECT,
  familiesFromAttendance,
  formatTime,
  functionHeadcount,
  parseEventDate,
  type FunctionSegment,
  type PlanningAttendance,
  type PlanningFamily
} from '@/lib/functionPlanning'

export default async function FunctionsPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  const { data: dbUser } = await supabase.from('users').select('side, role').eq('id', user.id).single()
  const role = dbUser?.role || 'regular'
  const side = dbUser?.side

  // Fetch functions with attendance (for headcounts) and their timed parts
  const { data: functions, error: functionsError } = await supabase
    .from('functions')
    .select(`
      *,
      function_attendance (family_id, member_id, adults_count, kids_count, rsvp_status, families (${PLANNING_FAMILY_SELECT})),
      function_segments (*)
    `)
    .order('event_date')
    .order('start_time', { ascending: true, nullsFirst: false })

  if (functionsError) {
    console.error('Error fetching functions:', functionsError)
  }

  // Shagun received per function (hosts only by database rules; empty until 11_shagun_received.sql is run)
  const { data: shagunRows } = await supabase.from('shagun_received').select('function_id, amount, item')
  const shagunByFunction = new Map<string, { cash: number; entries: number; gifts: number }>()
  ;(shagunRows || []).forEach(r => {
    const cur = shagunByFunction.get(r.function_id) || { cash: 0, entries: 0, gifts: 0 }
    cur.cash += Number(r.amount) || 0
    cur.entries++
    if (r.item) cur.gifts++
    shagunByFunction.set(r.function_id, cur)
  })

  // Filter based on role and side
  const visibleFunctions: FunctionCard[] = (functions || [])
    .filter(f => {
      if (role === 'admin' || role === 'planner' || role === 'bride' || role === 'groom') return true
      return f.hosting_side === side || f.hosting_side === 'joint'
    })
    .map(f => {
      const rows = (f.function_attendance || []) as Array<PlanningAttendance & { families: PlanningFamily }>
      const hc = functionHeadcount(familiesFromAttendance(rows), rows, f.kid_age_threshold || DEFAULT_KID_AGE)
      return {
        id: f.id,
        name: f.name,
        event_date: f.event_date,
        start_time: f.start_time,
        end_time: f.end_time,
        location: f.location,
        hosting_side: f.hosting_side,
        adults: hc.adults,
        kids: hc.kids,
        total: hc.total,
        families: hc.families,
        confirmed: hc.confirmedTotal,
        plannedGifting: Math.round((Number(f.planned_lifafa_total) || 0) + (Number(f.planned_return_gift_total) || 0)),
        shagunReceived: Math.round(shagunByFunction.get(f.id)?.cash || 0),
        segments: (f.function_segments || []) as FunctionSegment[],
        daysToGo: differenceInCalendarDays(parseEventDate(f.event_date), new Date())
      }
    })

  const shagunFunctions = visibleFunctions.filter(f => shagunByFunction.has(f.id))
  const shagunTotals = shagunFunctions.reduce(
    (acc, f) => {
      const s = shagunByFunction.get(f.id)!
      return { cash: acc.cash + s.cash, entries: acc.entries + s.entries, gifts: acc.gifts + s.gifts }
    },
    { cash: 0, entries: 0, gifts: 0 }
  )

  const canAdd = role === 'admin' || role === 'planner' || role === 'bride' || role === 'groom' || side

  // Next function still to come (today counts), for the spotlight
  const upcoming = visibleFunctions.filter(f => f.daysToGo >= 0)
  const nextUp = upcoming[0] || null
  const dayCount = new Set(visibleFunctions.map(f => f.event_date.slice(0, 10))).size
  const countdownText = (d: number) => (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`)

  return (
    <main className="min-h-screen bg-ivory pb-28">
      <header className="bg-gradient-to-br from-[#3A0B20] to-maroon text-white">
        <div className="mx-auto max-w-5xl px-4 pt-4 pb-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" aria-label="Back to home" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link href="/functions/checklist" className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-semibold hover:bg-white/20">
              ✅ Ritual checklist
            </Link>
          </div>
          <h1 className="mt-4 font-display text-4xl font-bold text-[#F2C46D] sm:text-5xl">Functions</h1>
          <p className="mt-1 font-data text-[13px] text-white/80">
            {visibleFunctions.length === 0
              ? 'Every ceremony of the wedding, in one place'
              : `${visibleFunctions.length} function${visibleFunctions.length === 1 ? '' : 's'} over ${dayCount} day${dayCount === 1 ? '' : 's'}${upcoming.length < visibleFunctions.length ? ` · ${visibleFunctions.length - upcoming.length} done` : ''}`}
          </p>

          {nextUp && (
            <Link href={`/functions/${nextUp.id}`} className="group mt-5 flex items-center gap-4 rounded-2xl border border-[#F2C46D]/35 bg-white/[0.07] p-4 transition hover:bg-white/[0.12]">
              <div className="shrink-0 rounded-xl bg-[#F2C46D] px-3 py-2 text-center text-[#3A0B20]">
                <p className="font-data text-[10px] font-bold uppercase">{format(parseEventDate(nextUp.event_date), 'MMM')}</p>
                <p className="font-display text-3xl font-bold leading-none">{format(parseEventDate(nextUp.event_date), 'd')}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-data text-[10px] font-bold uppercase tracking-widest text-[#F2C46D]">Next up · {countdownText(nextUp.daysToGo)}</p>
                <p className="truncate font-display text-2xl font-semibold">{nextUp.name}</p>
                <p className="truncate font-data text-xs text-white/75">
                  {format(parseEventDate(nextUp.event_date), 'EEEE')}
                  {nextUp.start_time ? ` · ${formatTime(nextUp.start_time)}` : ''}
                  {nextUp.location ? ` · ${nextUp.location}` : ''}
                  {nextUp.total ? ` · ${nextUp.total} guests` : ''}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-white/50 transition group-hover:translate-x-0.5" />
            </Link>
          )}

          {shagunFunctions.length > 0 && (
            <p className="mt-3 inline-block rounded-full bg-white/10 px-3 py-1 font-data text-[11px]">
              🪙 ₹{Math.round(shagunTotals.cash).toLocaleString('en-IN')} shagun received · {shagunTotals.entries} {shagunTotals.entries === 1 ? 'entry' : 'entries'}
              {shagunTotals.gifts > 0 ? ` · ${shagunTotals.gifts} gifts` : ''}
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
        {functionsError && (
          <div role="alert" className="mb-6 rounded-xl border border-rust-red/30 bg-rust-red/10 p-3 font-data text-xs text-rust-red">
            Couldn&apos;t load functions. If you just updated the app, run <b>supabase/07_function_planning.sql</b> in the Supabase SQL editor.
          </div>
        )}

        {visibleFunctions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-marigold/30 bg-white p-10 text-center">
            <Calendar className="mx-auto mb-4 h-12 w-12 text-marigold/50" />
            <p className="font-display text-xl font-semibold text-maroon">No functions yet</p>
            <p className="mb-5 mt-1 font-data text-sm text-maroon/60">Add Haldi, Mehendi, Sangeet, the Wedding… and plan each one here.</p>
            {canAdd && (
              <Link href="/functions/add">
                <Button className="rounded-full bg-maroon text-ivory">Add first function</Button>
              </Link>
            )}
          </div>
        ) : (
          <FunctionsView functions={visibleFunctions} />
        )}
      </div>

      {canAdd && (
        <Link
          href="/functions/add"
          className="fixed bottom-20 right-5 z-40 flex items-center rounded-full border border-[#F2C46D]/40 bg-maroon px-5 py-3.5 text-ivory shadow-[0_8px_30px_rgba(58,11,32,0.35)] transition hover:scale-105 md:bottom-8"
        >
          <Plus className="mr-2 h-5 w-5" />
          <span className="text-sm font-bold">Add function</span>
        </Link>
      )}
    </main>
  )
}
