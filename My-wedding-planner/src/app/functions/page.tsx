import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Calendar, MapPin, Users } from 'lucide-react'
import { format } from 'date-fns'

type FunctionItem = {
  id: string
  name: string
  event_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  hosting_side: 'groom' | 'bride' | 'joint'
  max_budget: number
}

export default async function FunctionsPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  const { data: dbUser } = await supabase.from('users').select('side, role').eq('id', user.id).single()
  const role = dbUser?.role || 'regular'
  const side = dbUser?.side

  // Fetch functions with attendance lists
  const { data: functions } = await supabase
    .from('functions')
    .select(`
      *,
      function_attendance (id, member_id)
    `)
    .order('event_date')

  // Filter based on role and side
  const visibleFunctions = (functions || [])
    .map(f => {
      const attendingMembers = (f.function_attendance || []).filter((a: any) => a.member_id !== null)
      return {
        ...f,
        attendingCount: attendingMembers.length
      }
    })
    .filter(f => {
      if (role === 'admin' || role === 'bride' || role === 'groom') return true
      return f.hosting_side === side || f.hosting_side === 'joint'
    })

  const canAdd = role === 'admin' || role === 'bride' || role === 'groom' || side

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
      </header>

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleFunctions.map(f => (
            <Link key={f.id} href={`/functions/${f.id}`} className="group">
              <div className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-5 hover:border-marigold transition-colors h-full flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-display font-semibold text-maroon group-hover:text-marigold transition-colors">{f.name}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full font-data ${
                    f.hosting_side === 'groom' ? 'bg-marigold/20 text-maroon' : 
                    f.hosting_side === 'bride' ? 'bg-rani-pink/10 text-rani-pink' : 
                    'bg-mehendi/10 text-mehendi'
                  }`}>
                    {f.hosting_side === 'groom' ? '🤵‍♂️ Groom' : 
                     f.hosting_side === 'bride' ? '👰‍♀️ Bride' : 
                     '🤝 Joint'}
                  </span>
                </div>

                <div className="space-y-2 mt-auto">
                  <div className="flex items-center text-sm font-data text-maroon/70">
                    <Calendar className="w-4 h-4 mr-2 text-marigold" />
                    <span>{format(new Date(f.event_date), 'MMM do, yyyy')}</span>
                    {f.start_time && <span className="ml-2 border-l border-maroon/20 pl-2">{f.start_time.slice(0, 5)}</span>}
                  </div>
                  
                  {f.location && (
                    <div className="flex items-center text-sm font-data text-maroon/70">
                      <MapPin className="w-4 h-4 mr-2 text-marigold" />
                      <span className="truncate">{f.location}</span>
                    </div>
                  )}

                  <div className="flex items-center text-sm font-data text-maroon/70 pt-2 border-t border-marigold/10 mt-3">
                    <Users className="w-4 h-4 mr-2 text-marigold" />
                    <span>{f.attendingCount} Attending</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
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
