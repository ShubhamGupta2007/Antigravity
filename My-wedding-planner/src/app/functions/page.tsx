import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Calendar } from 'lucide-react'
import FunctionsView, { type FunctionCard } from './FunctionsView'
import {
  DEFAULT_KID_AGE,
  PLANNING_FAMILY_SELECT,
  familiesFromAttendance,
  functionHeadcount,
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
        segments: (f.function_segments || []) as FunctionSegment[]
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

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-5xl mx-auto bg-ivory pb-24">
      <header className="flex items-center justify-between py-4 border-b border-marigold/30 mb-6">
        <div className="flex items-center space-x-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-display font-semibold text-maroon">Functions</h1>
        </div>
        <Link href="/functions/checklist">
          <Button variant="outline" size="sm" className="border-marigold/50 text-maroon hover:bg-marigold/10 h-8 text-xs rounded-full">
            ✅ Ritual Checklist
          </Button>
        </Link>
      </header>

      {functionsError && (
        <div className="bg-rust-red/10 border border-rust-red p-4 rounded-xl mb-6 text-xs text-rust-red font-data">
          Couldn&apos;t load functions. If you just updated the app, run <b>supabase/07_function_planning.sql</b> in the Supabase SQL editor.
        </div>
      )}

      {visibleFunctions.length === 0 ? (
        <div className="text-center p-8 bg-white rounded-2xl border border-marigold/30 mt-4">
          <Calendar className="w-12 h-12 text-marigold/40 mx-auto mb-4" />
          <p className="text-maroon/70 font-data text-sm mb-4">No functions have been added yet.</p>
          {canAdd && (
            <Link href="/functions/add">
              <Button className="bg-maroon text-ivory">Add First Function</Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          {shagunFunctions.length > 0 && (
            <section className="mb-6 bg-gradient-to-r from-mehendi/10 to-marigold/10 border border-mehendi/20 rounded-2xl p-4" aria-label="Shagun received">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-maroon/60">🪙 Shagun received, all functions</p>
                  <p className="text-2xl font-display font-bold text-maroon">₹{Math.round(shagunTotals.cash).toLocaleString('en-IN')}</p>
                  <p className="text-xs font-data text-maroon/60">
                    {shagunTotals.entries} {shagunTotals.entries === 1 ? 'entry' : 'entries'}{shagunTotals.gifts > 0 ? ` • ${shagunTotals.gifts} gifts` : ''}
                  </p>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {shagunFunctions.map(f => (
                    <li key={f.id}>
                      <Link href={`/functions/${f.id}`} className="block text-xs font-data bg-white/80 border border-marigold/20 hover:border-marigold rounded-xl px-3 py-1.5">
                        <span className="text-maroon/70">{f.name}</span>{' '}
                        <b className="text-maroon">₹{Math.round(shagunByFunction.get(f.id)!.cash).toLocaleString('en-IN')}</b>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          <FunctionsView functions={visibleFunctions} />
        </>
      )}

      {/* Floating Action Button */}
      {canAdd && (
        <Link href="/functions/add">
          <div className="fixed bottom-20 md:bottom-8 right-6 z-40 bg-maroon text-ivory px-6 py-4 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:scale-105 hover:bg-maroon/90 transition-all flex items-center justify-center cursor-pointer group border border-marigold/20">
            <Plus className="w-5 h-5 mr-2" />
            <span className="font-bold text-sm">Add Function</span>
          </div>
        </Link>
      )}
    </main>
  )
}
