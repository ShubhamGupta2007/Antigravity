'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Link2, MessageCircle, Phone, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/client'
import { recalcFunctionGifting } from '@/lib/functionPlanning'
import { whatsappUrl } from '@/lib/invite'

export type OpenFn = { id: string; name: string; event_date: string | null; start_time: string | null; hosting_side: string; open_to_all: boolean }
export type OpenReply = {
  id: string
  name: string
  phone: string
  attending: boolean
  function_ids: string[]
  people: number
  kids: number
  needs_help: boolean
  message: string | null
  status: 'new' | 'added' | 'updated' | 'dismissed'
  family_id: string | null
  created_at: string
  updated_at: string
}

type Tab = 'new' | 'added' | 'dismissed'

/**
 * Planner side of the general invitation: switch the link on, choose which of our functions
 * it shows, share it, and turn replies into families on the guest list.
 */
export default function GeneralInviteClient({
  initialEnabled,
  initialCode,
  side,
  functions,
  replies,
  couple
}: {
  initialEnabled: boolean
  initialCode: string | null
  side: string
  functions: OpenFn[]
  replies: OpenReply[]
  couple: { bride_name?: string | null; groom_name?: string | null }
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [, startRefresh] = useTransition()
  const refresh = () => startRefresh(() => router.refresh())
  const [enabled, setEnabled] = useState(initialEnabled)
  const [code, setCode] = useState(initialCode)
  const [openFns, setOpenFns] = useState<Record<string, boolean>>(() => Object.fromEntries(functions.map(f => [f.id, f.open_to_all])))
  const [tab, setTab] = useState<Tab>('new')
  const [busy, setBusy] = useState<string | null>(null)

  // The site's address is only known in the browser
  const [origin, setOrigin] = useState('')
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser's address after hydration
  useEffect(() => setOrigin(window.location.origin), [])
  const link = origin && code ? `${origin}/invite/open/${code}` : ''
  const fnName = (id: string) => functions.find(f => f.id === id)?.name || 'a function'
  const shownCount = Object.values(openFns).filter(Boolean).length

  const saveSettings = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from('wedding_settings').update(patch).eq('id', 1)
    if (error) toast.error(`Could not save: ${error.message}`)
    return !error
  }

  const toggleEnabled = async () => {
    const next = !enabled
    setEnabled(next)
    if (!(await saveSettings({ open_invite_enabled: next }))) setEnabled(!next)
  }

  const newLink = async () => {
    if (!window.confirm('Make a new link? The old link will stop working for anyone who has it.')) return
    const next = Math.random().toString(36).slice(2, 12)
    if (await saveSettings({ open_invite_code: next })) {
      setCode(next)
      toast.success('New link ready')
    }
  }

  const toggleFn = async (id: string) => {
    const next = !openFns[id]
    setOpenFns(prev => ({ ...prev, [id]: next }))
    const { error } = await supabase.from('functions').update({ open_to_all: next }).eq('id', id)
    if (error) {
      toast.error(`Could not save: ${error.message}`)
      setOpenFns(prev => ({ ...prev, [id]: !next }))
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copied')
    } catch {
      window.prompt('Copy this link', link)
    }
  }
  const share = () => {
    const text = `Namaste 🙏\n\nWith great joy, we invite you to celebrate the wedding of ${couple.groom_name || 'our son'} & ${couple.bride_name || ''}.\n\nAll the details are here. Please let us know if you can come:\n${link}`
    window.open(whatsappUrl(text), '_blank', 'noopener,noreferrer')
  }

  // Add (or update) a reply as a family on the guest list, invited to the functions they picked
  const addToGuestList = async (r: OpenReply) => {
    setBusy(r.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const adults = Math.max(1, r.people - r.kids)
      let familyId = r.family_id
      const familyFields = {
        expected_adults_count: adults,
        expected_kids_count: r.kids,
        needs_room: r.needs_help,
        contact_person: r.name,
        contact_phone: r.phone
      }
      if (familyId) {
        const { error } = await supabase.from('families').update(familyFields).eq('id', familyId)
        if (error) throw error
      } else {
        const { data: fam, error } = await supabase
          .from('families')
          .insert({ family_name: r.name, side, relation_tier: 'tier_3', relationship: 'General invite', is_local: true, created_by: user?.id, ...familyFields })
          .select('id')
          .single()
        if (error) throw error
        familyId = fam.id
        await supabase.from('family_members').insert({ family_id: familyId, name: r.name, relation_to_head: 'Head' })
      }

      // Their functions: confirmed with their headcount; functions on the link they didn't pick are removed
      const linkFns = functions.filter(f => openFns[f.id]).map(f => f.id)
      const chosen = r.attending ? r.function_ids : []
      const drop = linkFns.filter(id => !chosen.includes(id))
      if (drop.length) {
        const { error } = await supabase.from('function_attendance').delete().eq('family_id', familyId).in('function_id', drop)
        if (error) throw error
      }
      if (chosen.length) {
        const rows = chosen.map(function_id => ({
          function_id, family_id: familyId, member_id: null, is_attending: true,
          rsvp_status: 'confirmed', adults_count: adults, kids_count: r.kids, responded_at: r.updated_at
        }))
        const { error } = await supabase.from('function_attendance').upsert(rows, { onConflict: 'function_id,family_id,member_id', defaultToNull: false })
        if (error) throw error
      }
      const { error: stErr } = await supabase.from('open_rsvps').update({ status: 'added', family_id: familyId }).eq('id', r.id)
      if (stErr) throw stErr
      // Their headcount changes the planned lifafas of those functions
      await Promise.all([...new Set([...chosen, ...drop])].map(id => recalcFunctionGifting(supabase, id)))
      toast.success(r.family_id ? `${r.name}'s family updated` : `${r.name} added to the guest list`)
      refresh()
    } catch (e) {
      toast.error(`Could not add: ${(e as { message?: string }).message || 'unknown error'}`)
    } finally {
      setBusy(null)
    }
  }

  const setStatus = async (r: OpenReply, status: OpenReply['status']) => {
    setBusy(r.id)
    const { error } = await supabase.from('open_rsvps').update({ status }).eq('id', r.id)
    setBusy(null)
    if (error) toast.error(`Could not save: ${error.message}`)
    else refresh()
  }

  const inTab = (r: OpenReply) => (tab === 'new' ? r.status === 'new' || r.status === 'updated' : r.status === tab)
  const counts = {
    new: replies.filter(r => r.status === 'new' || r.status === 'updated').length,
    added: replies.filter(r => r.status === 'added').length,
    dismissed: replies.filter(r => r.status === 'dismissed').length
  }
  const coming = replies.filter(r => r.attending && r.status !== 'dismissed').reduce((s, r) => s + r.people, 0)

  return (
    <div className="space-y-5 pb-24">
      {/* The link */}
      <section className="rounded-2xl border border-marigold/30 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-maroon">Your general invitation link</h2>
            <p className="mt-0.5 font-data text-xs text-maroon/60">For people who aren&apos;t on the guest list. Anyone with the link can see the functions you pick below and reply.</p>
          </div>
          <button type="button" role="switch" aria-checked={enabled} onClick={toggleEnabled}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${enabled ? 'bg-mehendi' : 'bg-maroon/20'}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
            <span className="sr-only">Link {enabled ? 'on' : 'off'}</span>
          </button>
        </div>
        {enabled ? (
          <>
            <p className="mt-3 break-all rounded-xl bg-ivory px-3 py-2 font-data text-xs text-maroon">{link || '…'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={copy} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-marigold/40 bg-white px-3.5 font-data text-xs font-semibold text-maroon hover:bg-marigold/10"><Link2 className="h-3.5 w-3.5" /> Copy link</button>
              <button type="button" onClick={share} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-mehendi px-3.5 font-data text-xs font-semibold text-white hover:opacity-90"><MessageCircle className="h-3.5 w-3.5" /> Share on WhatsApp</button>
              {link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-full border border-marigold/40 px-3.5 font-data text-xs font-semibold text-maroon hover:bg-marigold/10">Open it</a>}
              <button type="button" onClick={newLink} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 font-data text-xs font-semibold text-maroon/60 hover:text-maroon"><RefreshCw className="h-3.5 w-3.5" /> New link</button>
            </div>
          </>
        ) : (
          <p className="mt-3 font-data text-xs text-maroon/60">The link is off: nobody can open it. Switch it on to share.</p>
        )}
      </section>

      {/* Which functions */}
      <section className="rounded-2xl border border-marigold/30 bg-white p-5 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-maroon">Functions on the link</h2>
        <p className="mt-0.5 mb-3 font-data text-xs text-maroon/60">Only our side&apos;s functions (and joint ones). Private ones like the Haldi can stay off. {shownCount} shown.</p>
        {functions.length === 0 ? (
          <p className="font-data text-sm italic text-maroon/50">No functions on our side yet.</p>
        ) : (
          <ul className="divide-y divide-marigold/10">
            {functions.map(f => (
              <li key={f.id}>
                <label className="flex cursor-pointer items-center gap-3 py-2.5">
                  <input type="checkbox" checked={!!openFns[f.id]} onChange={() => toggleFn(f.id)} className="h-5 w-5 accent-maroon" />
                  <span className="min-w-0 flex-1 font-data text-sm font-semibold text-maroon">{f.name}</span>
                  <span className="shrink-0 font-data text-[11px] text-maroon/55">
                    {f.event_date ? new Date(`${f.event_date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'No date'}
                    {f.hosting_side === 'joint' ? ' · joint' : ''}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Replies */}
      <section className="rounded-2xl border border-marigold/30 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-semibold text-maroon">Replies</h2>
            <p className="font-data text-xs text-maroon/60">{replies.length} replies · {coming} people say they&apos;re coming</p>
          </div>
          <div className="inline-flex rounded-full border border-marigold/30 bg-white p-0.5 font-data text-xs" role="tablist">
            {([['new', 'To add'], ['added', 'Added'], ['dismissed', 'Dismissed']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`rounded-full px-3 py-1.5 ${tab === id ? 'bg-maroon font-semibold text-ivory' : 'text-maroon/70 hover:text-maroon'}`}>
                {label} {counts[id]}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-4 space-y-2">
          {replies.filter(inTab).length === 0 && (
            <li className="rounded-xl border border-dashed border-marigold/40 p-6 text-center font-data text-sm text-maroon/50">
              {tab === 'new' ? 'No new replies. Share the link to get some.' : 'Nothing here.'}
            </li>
          )}
          {replies.filter(inTab).map(r => (
            <li key={r.id} className="rounded-xl bg-ivory/60 p-3.5 ring-1 ring-marigold/20">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-data text-sm font-semibold text-maroon">
                    {r.name}
                    {r.status === 'updated' && <span className="ml-2 rounded-full bg-marigold/25 px-1.5 py-0.5 text-[10px] font-bold">Changed their reply</span>}
                  </p>
                  <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 font-data text-xs text-maroon/70 hover:underline"><Phone className="h-3 w-3" /> {r.phone}</a>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 font-data text-[11px] font-bold ${r.attending ? 'bg-mehendi/15 text-mehendi' : 'bg-rust-red/10 text-rust-red'}`}>
                  {r.attending ? `Coming · ${r.people}${r.kids ? ` (${r.kids} ${r.kids === 1 ? 'kid' : 'kids'})` : ''}` : 'Not coming'}
                </span>
              </div>
              {r.attending && r.function_ids.length > 0 && (
                <p className="mt-1.5 font-data text-xs text-maroon/75">For: {r.function_ids.map(fnName).join(', ')}</p>
              )}
              {r.needs_help && <p className="mt-1 font-data text-xs font-semibold text-maroon">🏨 Needs help with a room or travel</p>}
              {r.message && <p className="mt-1.5 rounded-lg bg-white px-2.5 py-1.5 font-data text-xs italic text-maroon/80">“{r.message}”</p>}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {(r.status === 'new' || r.status === 'updated') && (
                  <button type="button" disabled={busy === r.id} onClick={() => (!r.attending && !r.family_id ? setStatus(r, 'added') : addToGuestList(r))}
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-maroon px-3.5 font-data text-xs font-semibold text-ivory disabled:opacity-50">
                    <Check className="h-3.5 w-3.5" /> {r.family_id ? 'Update their family' : r.attending ? 'Add to guest list' : 'Noted'}
                  </button>
                )}
                {r.status !== 'dismissed' && r.status !== 'added' && (
                  <button type="button" disabled={busy === r.id} onClick={() => setStatus(r, 'dismissed')} className="h-8 rounded-full px-3 font-data text-xs font-semibold text-maroon/60 hover:text-rust-red">Dismiss</button>
                )}
                {r.status === 'dismissed' && (
                  <button type="button" disabled={busy === r.id} onClick={() => setStatus(r, 'new')} className="h-8 rounded-full px-3 font-data text-xs font-semibold text-maroon/70 hover:text-maroon">Move back</button>
                )}
                {r.status === 'added' && (
                  <span className="font-data text-xs text-mehendi">{r.family_id ? '✓ On the guest list' : '✓ Noted'}</span>
                )}
                <span className="ml-auto font-data text-[10px] text-maroon/45">
                  {new Date(r.updated_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
