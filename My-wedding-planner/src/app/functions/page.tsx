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
        segments: (f.function_segments || []) as FunctionSegment[]
      }
    })

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
        <FunctionsView functions={visibleFunctions} />
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
