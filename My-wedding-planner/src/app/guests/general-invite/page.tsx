import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/server'
import GeneralInviteClient, { type OpenFn, type OpenReply } from './GeneralInviteClient'

export const dynamic = 'force-dynamic'

/** The general invitation link for our side: settings, functions it shows, and replies. */
export default async function GeneralInvitePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'planner', 'bride', 'groom'].includes(String(dbUser?.role))) redirect('/guests')

  const { data: settings } = await supabase.from('wedding_settings').select('*').eq('id', 1).maybeSingle()
  const ready = !!settings && 'open_invite_code' in settings
  const side: string = settings?.open_invite_side || 'groom'

  const [fnRes, repliesRes] = ready
    ? await Promise.all([
        supabase.from('functions').select('id, name, event_date, start_time, hosting_side, open_to_all').order('event_date').order('start_time', { nullsFirst: false }),
        supabase.from('open_rsvps').select('*').order('updated_at', { ascending: false })
      ])
    : [{ data: [] }, { data: [] }]
  const functions = ((fnRes.data || []) as OpenFn[]).filter(f => String(f.hosting_side) === side || String(f.hosting_side) === 'joint')

  return (
    <main className="min-h-screen bg-ivory">
      <header className="bg-gradient-to-br from-[#3A0B20] to-maroon text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link href="/guests" aria-label="Back to the guest list" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold text-[#F2C46D]">General invite</h1>
            <p className="font-data text-xs text-white/75">One link for {side === 'bride' ? 'the bride’s' : 'our'} side · people not on the guest list</p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 pt-5">
        {ready ? (
          <GeneralInviteClient
            initialEnabled={!!settings.open_invite_enabled}
            initialCode={settings.open_invite_code}
            side={side}
            functions={functions}
            replies={(repliesRes.data || []) as OpenReply[]}
            couple={{ bride_name: settings.bride_name, groom_name: settings.groom_name }}
          />
        ) : (
          <p role="alert" className="rounded-2xl border border-rust-red/30 bg-rust-red/10 p-4 font-data text-sm text-rust-red">
            Run <b>supabase/21_open_invitation.sql</b> in the Supabase SQL editor to turn on the general invitation.
          </p>
        )}
      </div>
    </main>
  )
}
