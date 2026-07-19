import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import ManageFamilyFunctionsClient from './ManageFamilyFunctionsClient'

export default async function ManageFamilyFunctionsPage({ params }: { params: Promise<{ familyId: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Fetch family and members
  const { data: family } = await supabase
    .from('families')
    .select(`
      *,
      family_members (*)
    `)
    .eq('id', resolvedParams.familyId)
    .single()

  if (!family) {
    return <div className="p-6">Family not found.</div>
  }

  // Fetch all functions
  const { data: functions } = await supabase
    .from('functions')
    .select('*')
    .order('event_date', { ascending: true })

  // Fetch current function attendance for this family
  const { data: attendance } = await supabase
    .from('function_attendance')
    .select('id, function_id, member_id')
    .eq('family_id', family.id)

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-4xl mx-auto bg-ivory pb-24">
      <header className="flex items-center space-x-4 py-4 border-b border-marigold/30 mb-8">
        <Link href="/guests">
          <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-marigold/20 flex items-center justify-center text-maroon">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-semibold text-maroon">Manage Functions</h1>
            <p className="text-xs font-data text-maroon/60">Select which functions {family.family_name.toLowerCase().endsWith('family') ? family.family_name : `${family.family_name} Family`} is invited to</p>
          </div>
        </div>
      </header>

      <ManageFamilyFunctionsClient 
        family={family} 
        functions={functions || []} 
        initialAttendance={attendance || []} 
      />
    </main>
  )
}
