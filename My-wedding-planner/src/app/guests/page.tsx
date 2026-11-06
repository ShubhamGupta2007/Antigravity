import { createClient } from '@/lib/server'
import type { FamilyShagun } from '@/components/ShagunHistory'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import GuestListManager from '@/components/GuestListManager'
import { familyCount } from '@/lib/guests'
import type { GuestFamily } from '@/components/FamilyPanel'

export default async function GuestsPage() {
  const supabase = await createClient()

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Fetch user role and side from public.users
  const { data: dbUser } = await supabase
    .from('users')
    .select('role, side')
    .eq('id', user.id)
    .single()
    
  const role = dbUser?.role || 'regular'
  const cookieStore = await cookies()
  const isGuestView = cookieStore.get('guest_view')?.value === '1'
  const isEffectivelyGuest = role === 'guest' || role === 'pending' || isGuestView
  
  if (isEffectivelyGuest) {
    redirect('/')
  }
  const userSide = dbUser?.side

  if ((role !== 'admin' && role !== 'planner')) {
    redirect('/')
  }

  // Fetch all families and their members
  const { data: families, error } = await supabase
    .from('families')
    .select(`
      *,
      family_members (*),
      function_attendance (
        function_id,
        functions (
          name
        )
      )
    `)
    .order('side')
    .order('family_name')

  if (error) {
    console.error('Error fetching families:', error)
  }

  // Shagun each family gave at functions (only functions this user can see;
  // empty until 11_shagun_received.sql has been run)
  const { data: shagunRows } = await supabase
    .from('shagun_received')
    .select('function_id, family_id, amount, item, functions (name, event_date)')
    .not('family_id', 'is', null)
  // Couple's names for invitation messages (empty until 14_guest_invitations.sql is run)
  const { data: weddingSettings } = await supabase.from('wedding_settings').select('bride_name, groom_name').eq('id', 1).maybeSingle()
  const shagunByFamily: Record<string, FamilyShagun[]> = {}
  ;((shagunRows || []) as unknown as FamilyShagun[]).forEach(r => {
    if (r.family_id) (shagunByFamily[r.family_id] ||= []).push(r)
  })

  const allFamilies = (families || []) as GuestFamily[]
  // Same counting as the list and the function pages: named members padded up to expected counts
  const sum = (list: GuestFamily[]) =>
    list.reduce(
      (acc, f) => {
        const c = familyCount(f)
        return { guests: acc.guests + c.total, adults: acc.adults + c.adults, kids: acc.kids + c.kids, seniors: acc.seniors + c.seniors, outstation: acc.outstation + (f.is_local ? 0 : c.total), families: acc.families + 1 }
      },
      { guests: 0, adults: 0, kids: 0, seniors: 0, outstation: 0, families: 0 }
    )
  const all = sum(allFamilies)
  const groom = sum(allFamilies.filter(f => f.side === 'groom'))
  const bride = sum(allFamilies.filter(f => f.side === 'bride'))
  const named = allFamilies.reduce((s, f) => s + (f.family_members?.length || 0), 0)

  return (
    <main className="min-h-screen bg-ivory">
      <header className="bg-gradient-to-br from-[#3A0B20] to-maroon text-white">
        <div className="mx-auto max-w-3xl px-4 pt-4 pb-6">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" aria-label="Back to home" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link href="/guests/analytics" className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-semibold hover:bg-white/20">
              📊 Analytics
            </Link>
          </div>
          <h1 className="mt-4 font-display text-4xl font-bold text-[#F2C46D] sm:text-5xl">Guest list</h1>
          <p className="mt-1 font-data text-[13px] text-white/80">
            {all.families} families · {named} of {all.guests} guests named
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/10 px-3 py-2.5">
              <p className="font-display text-2xl font-bold leading-none">{all.guests}</p>
              <p className="mt-1 font-data text-[10px] uppercase tracking-wide text-white/70">expected</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5">
              <p className="font-data text-sm font-bold leading-tight">🤵‍♂️ {groom.guests} <span className="font-normal text-white/60">·</span> 👰‍♀️ {bride.guests}</p>
              <p className="mt-1 font-data text-[10px] uppercase tracking-wide text-white/70">by side</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5">
              <p className="font-data text-sm font-bold leading-tight">✈️ {all.outstation}</p>
              <p className="mt-1 font-data text-[10px] uppercase tracking-wide text-white/70">outstation</p>
            </div>
          </div>
          <p className="mt-3 font-data text-[11px] text-white/70">🧑 {all.adults} adults · 🧸 {all.kids} kids · 👵 {all.seniors} seniors</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-5">
        <GuestListManager
          initialFamilies={allFamilies}
          role={role}
          userSide={userSide}
          shagunByFamily={shagunByFamily}
          couple={weddingSettings || {}}
        />
      </div>
    </main>
  )
}
