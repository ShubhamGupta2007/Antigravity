import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SheetActions from './SheetActions'
import {
  DEFAULT_KID_AGE,
  familiesFromAttendance,
  formatTime,
  functionHeadcount,
  parseEventDate,
  sortSegments,
  type FunctionSegment,
  type PlanningAttendance,
  type PlanningFamily
} from '@/lib/functionPlanning'

type Item = {
  id: string; item: string; quantity: string | null; given_by_side: string | null; given_by: string | null
  given_to_side: string | null; given_to: string | null; status: string
}
type Ritual = { id: string; name: string; start_time: string | null; description: string | null; sort_order: number; ritual_items: Item[] | null }

const SIDE: Record<string, string> = { groom: "Groom's side", bride: "Bride's side", joint: 'Both families', other: 'Other' }
const party = (side: string | null, who: string | null) => [side ? SIDE[side] || side : null, who].filter(Boolean).join(' – ') || '—'
const range = (s: string | null, e: string | null) => (s ? `${formatTime(s)}${e ? ` – ${formatTime(e)}` : ''}` : 'Time TBD')

/** One-page day sheet for a function: timings, rituals and who gives what, headcount. Printable and shareable. */
export default async function FunctionSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: func } = await supabase.from('functions').select('*').eq('id', id).single()
  if (!func) return <div className="p-6 text-center">Function not found.</div>

  const [segRes, ritRes, attRes] = await Promise.all([
    supabase.from('function_segments').select('*').eq('function_id', id),
    supabase.from('function_rituals').select('id, name, start_time, description, sort_order, ritual_items (*)').eq('function_id', id),
    supabase
      .from('function_attendance')
      .select('family_id, member_id, adults_count, kids_count, rsvp_status, families (id, family_name, side, relation_tier, expected_adults_count, expected_kids_count, is_local, family_members (id, name, age, gender, is_kid_for_gifting))')
      .eq('function_id', id)
  ])

  const segments = sortSegments((segRes.data || []) as FunctionSegment[])
  const rituals = sortSegments((ritRes.data || []) as Ritual[])
  const rows = (attRes.data || []) as unknown as Array<PlanningAttendance & { families: PlanningFamily }>
  const families = familiesFromAttendance(rows)
  const hc = functionHeadcount(families, rows, func.kid_age_threshold || DEFAULT_KID_AGE)
  const date = func.event_date ? format(parseEventDate(func.event_date), 'EEEE, d MMMM yyyy') : ''

  const shareText = [
    `*${func.name}*`,
    [date, range(func.start_time, func.end_time)].filter(Boolean).join(' • '),
    func.location ? `📍 ${func.location}` : '',
    hc.total ? `👥 ${hc.total} guests expected (${hc.adults} adults${hc.kids ? `, ${hc.kids} kids` : ''})` : '',
    segments.length ? `\n*Schedule*\n${segments.map(s => `${range(s.start_time, s.end_time)} – ${s.name}${s.location ? ` (${s.location})` : ''}`).join('\n')}` : '',
    rituals.length
      ? `\n*Rituals*\n${rituals.map(r => `• ${r.name}${r.start_time ? ` (${formatTime(r.start_time)})` : ''}${(r.ritual_items || []).map(i => `\n   – ${i.item}${i.quantity ? ` ×${i.quantity}` : ''}: ${party(i.given_by_side, i.given_by)} → ${party(i.given_to_side, i.given_to)}`).join('')}`).join('\n')}`
      : ''
  ].filter(Boolean).join('\n')

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto bg-ivory print:bg-white print:p-0 pb-24 text-maroon">
      <div className="flex items-center justify-between gap-2 mb-6 print:hidden">
        <Link href={`/functions/${id}`}>
          <Button variant="ghost" size="sm" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
        <SheetActions shareText={shareText} />
      </div>

      <header className="border-b-2 border-maroon/20 pb-4 mb-6">
        <h1 className="text-3xl font-display font-bold">{func.name}</h1>
        <p className="text-sm font-data mt-1">{date} • {range(func.start_time, func.end_time)}</p>
        {func.location && <p className="text-sm font-data text-maroon/70">📍 {func.location}</p>}
        <p className="text-sm font-data mt-2">
          <strong>{hc.total}</strong> guests expected ({hc.adults} adults{hc.kids ? `, ${hc.kids} kids` : ''}) from {hc.families} families
          {hc.confirmedTotal > 0 && <> • <strong>{hc.confirmedTotal}</strong> confirmed</>}
        </p>
      </header>

      {segments.length > 0 && (
        <section className="mb-8 break-inside-avoid">
          <h2 className="text-lg font-display font-semibold mb-2">Schedule</h2>
          <table className="w-full text-sm font-data">
            <tbody>
              {segments.map(s => (
                <tr key={s.id} className="border-b border-maroon/10 align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap text-maroon/70 w-36">{range(s.start_time, s.end_time)}</td>
                  <td className="py-1.5 font-semibold">{s.name}{s.location && <span className="font-normal text-maroon/60"> • {s.location}</span>}{s.notes && <span className="block font-normal text-xs text-maroon/60">{s.notes}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {rituals.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-display font-semibold mb-2">Rituals – who gives what</h2>
          <div className="space-y-4">
            {rituals.map(r => (
              <div key={r.id} className="break-inside-avoid">
                <h3 className="font-semibold">{r.name}{r.start_time && <span className="font-normal text-sm text-maroon/60"> • {formatTime(r.start_time)}</span>}</h3>
                {r.description && <p className="text-xs font-data text-maroon/60">{r.description}</p>}
                {(r.ritual_items || []).length > 0 ? (
                  <table className="w-full text-xs font-data mt-1">
                    <thead>
                      <tr className="text-left text-maroon/50 border-b border-maroon/15">
                        <th className="py-1 pr-2 font-semibold w-6" aria-label="Done"></th>
                        <th className="py-1 pr-2 font-semibold">Item</th>
                        <th className="py-1 pr-2 font-semibold">From</th>
                        <th className="py-1 font-semibold">To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(r.ritual_items || []).map(i => (
                        <tr key={i.id} className="border-b border-maroon/10 align-top">
                          <td className="py-1 pr-2">{i.status === 'given' ? '☑' : '☐'}</td>
                          <td className="py-1 pr-2 font-semibold">{i.item}{i.quantity ? ` × ${i.quantity}` : ''}</td>
                          <td className="py-1 pr-2">{party(i.given_by_side, i.given_by)}</td>
                          <td className="py-1">{party(i.given_to_side, i.given_to)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs font-data text-maroon/40 italic">Nothing listed.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {segments.length === 0 && rituals.length === 0 && (
        <p className="text-sm font-data text-maroon/50 italic print:hidden">Add schedule parts and rituals on the function page to fill this sheet.</p>
      )}
    </main>
  )
}
