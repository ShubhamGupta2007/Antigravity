import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ChecklistClient, { type ChecklistItem } from './ChecklistClient'

export default async function RitualChecklistPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: dbUser } = await supabase.from('users').select('side, role').eq('id', user.id).single()
  const role = dbUser?.role || 'regular'
  const isManager = ['admin', 'planner', 'bride', 'groom'].includes(role)

  const { data, error } = await supabase
    .from('functions')
    .select('id, name, event_date, start_time, hosting_side, function_rituals (name, start_time, sort_order, ritual_items (*))')
    .order('event_date')
    .order('start_time', { ascending: true, nullsFirst: false })

  const items: ChecklistItem[] = (data || [])
    .filter(f => isManager || f.hosting_side === 'joint' || f.hosting_side === dbUser?.side)
    .flatMap(f =>
      [...(f.function_rituals || [])]
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .flatMap(r => (r.ritual_items || []).map(i => ({
          ...i,
          ritualName: r.name,
          functionId: f.id,
          functionName: f.name,
          eventDate: f.event_date
        })))
    )

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-3xl mx-auto bg-ivory pb-24">
      <header className="flex items-center space-x-4 py-4 border-b border-marigold/30 mb-6">
        <Link href="/functions">
          <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10" aria-label="Back to functions">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-semibold text-maroon">Ritual Checklist</h1>
          <p className="text-xs font-data text-maroon/60">Everything to give across all functions</p>
        </div>
      </header>
      {error ? (
        <p className="bg-rust-red/10 border border-rust-red p-4 rounded-xl text-xs text-rust-red font-data">
          Couldn&apos;t load rituals. Run <b>supabase/08_function_rituals.sql</b> in the Supabase SQL editor.
        </p>
      ) : (
        <ChecklistClient items={items} canEdit />
      )}
    </main>
  )
}
