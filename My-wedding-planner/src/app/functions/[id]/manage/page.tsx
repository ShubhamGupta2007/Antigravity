import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Users, UserPlus } from 'lucide-react'
import ManageInvitesClient from './ManageInvitesClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ManageInvitesPage({ params }: PageProps) {
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

  // Fetch current user details
  const { data: dbUser } = await supabase
    .from('users')
    .select('side, role')
    .eq('id', user.id)
    .single()

  const userSide = dbUser?.side
  const role = dbUser?.role || 'regular'
  const isAdmin = role === 'admin' || role === 'bride' || role === 'groom'

  // Access validation: regular family members can only manage if it matches their side or is joint
  const canManage = isAdmin || func.hosting_side === 'joint' || func.hosting_side === userSide
  if (!canManage) {
    redirect('/functions')
  }

  // Fetch all families and members
  let familiesQuery = supabase.from('families').select(`
    id,
    family_name,
    side,
    relation_tier,
    relationship,
    is_local,
    city,
    expected_adults_count,
    expected_kids_count,
    needs_room,
    rooms_assigned,
    room_numbers,
    family_members (id, name, relation_to_head, is_kid_for_gifting)
  `)

  // If not admin and it is not joint, only fetch families on the user's side
  if (!isAdmin && func.hosting_side !== 'joint') {
    familiesQuery = familiesQuery.eq('side', userSide)
  }

  const { data: families } = await familiesQuery.order('family_name')

  // Fetch existing attendance
  const { data: attendance } = await supabase
    .from('function_attendance')
    .select('*')
    .eq('function_id', func.id)

  // Fetch required guests
  const { data: required } = await supabase
    .from('function_required_guests')
    .select('*')
    .eq('function_id', func.id)

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-lg mx-auto bg-ivory pb-24">
      <header className="flex items-center space-x-4 py-4 border-b border-marigold/30 mb-6">
        <Link href={`/functions/${func.id}`}>
          <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-display font-semibold text-maroon">Manage Invites</h1>
          <p className="text-xs text-maroon/50 font-data">{func.name}</p>
        </div>
      </header>

      <ManageInvitesClient 
        func={func}
        families={families || []}
        initialAttendance={attendance || []}
        requiredGuests={required || []}
      />
    </main>
  )
}
