import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatTime } from '@/lib/functionPlanning'
import { calendarUrl, eventDateParts, mapsUrl, rsvpBadge, themeFor, type Invitation, type InviteGate } from '@/lib/invite'
import { loadInvitation } from '../../load'
import { LockedGate, NotFoundGate, PinGate } from '../../../_components/Gate'
import { Mandala } from '../../../_components/Decor'

export const dynamic = 'force-dynamic'

const range = (s: string | null, e: string | null) => (s ? `${formatTime(s)}${e ? ` – ${formatTime(e)}` : ''}` : '')

export default async function InviteFunctionPage({ params }: { params: Promise<{ code: string; functionId: string }> }) {
  const { code, functionId } = await params
  const data = await loadInvitation(code)
  if (data.status !== 'ok') {
    const gate = data as InviteGate
    if (gate.status === 'needs_pin' || gate.status === 'wrong_pin') return <PinGate code={code} gate={gate} />
    if (gate.status === 'locked') return <LockedGate gate={gate} />
    return <NotFoundGate gate={gate} unavailable={gate.status === 'unavailable'} />
  }
  const inv = data as Invitation
  // Only functions this family is invited to are ever returned by the database
  const index = inv.functions.findIndex(f => f.id === functionId)
  if (index === -1) notFound()
  const fn = inv.functions[index]
  const theme = themeFor(index, inv.functions.length)
  const date = eventDateParts(fn.event_date)
  const badge = rsvpBadge(fn.rsvp)
  const map = mapsUrl(fn)
  const cal = calendarUrl(fn, `${inv.settings.bride_name} & ${inv.settings.groom_name}`)
  const going = fn.rsvp?.status === 'confirmed' ? inv.family.members.filter(m => fn.rsvp?.member_ids.includes(m.id)).map(m => m.name) : []
  const dot = ['#D9A441', '#D9A441', '#8E1F2F', '#5B7C4F', '#8E1F2F']

  return (
    <main className="mx-auto min-h-screen max-w-[480px] bg-[#FFF8EE] font-data text-[#3B1424]">
      <section className="relative flex h-[340px] flex-col justify-between overflow-hidden" style={{ background: theme.band }}>
        <Mandala className="inv-mandala pointer-events-none absolute left-1/2 top-[-40px] w-[460px] max-w-none -translate-x-1/2 opacity-40" />
        <div className="relative px-5 py-[18px]">
          <Link href={`/invite/${code}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF8EE]/90 px-3.5 py-2.5 text-sm font-bold text-[#5C1A33]">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M11 18l-6-6 6-6" /></svg>
            All celebrations
          </Link>
        </div>
        <div className="relative rounded-t-[22px] bg-[#3A0B20] px-5 pb-5 pt-[18px] text-[#FFF6E9]">
          <p className="inv-rise text-xs uppercase tracking-[3px] text-[#F2C46D]">{date.long}</p>
          <h1 className="inv-rise mt-1.5 font-display text-[44px] font-semibold leading-none" style={{ animationDelay: '0.12s' }}>{fn.name}</h1>
        </div>
      </section>

      <section className="px-5 pt-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#E3EEDD] px-4 py-3.5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#3E5A35]">Your reply</p>
            <p className="mt-0.5 text-[15px] text-[#2F4628]">{going.length ? going.join(', ') : badge.label}</p>
          </div>
          <Link href={`/invite/${code}/rsvp`} className="px-1 py-2.5 text-sm font-bold text-[#3E5A35]">{fn.rsvp?.status && fn.rsvp.status !== 'invited' ? 'Change' : 'Reply'}</Link>
        </div>
      </section>

      {(fn.segments.length > 0 || fn.start_time) && (
        <section className="px-5 pt-7">
          <h2 className="inv-reveal mb-3.5 font-display text-[28px] font-semibold text-[#4A1029]">When to arrive</h2>
          {fn.segments.length > 0 ? (
            <ol className="ml-2 flex flex-col gap-[18px] border-l-2 border-[#E2C9A6] pl-[18px]">
              {fn.segments.map((sg, i) => (
                <li key={i} className="inv-reveal relative">
                  <span aria-hidden="true" className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-[#FFF8EE]" style={{ background: dot[i % dot.length] }} />
                  {sg.start_time && <p className="text-[13px] font-bold text-[#8E1F2F]">{range(sg.start_time, sg.end_time)}</p>}
                  <p className="mt-0.5 text-[17px] font-bold">{sg.name}</p>
                  {(sg.location || sg.notes) && <p className="mt-0.5 text-[13px] leading-relaxed text-[#5A3A43]">{[sg.location, sg.notes].filter(Boolean).join(' · ')}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[17px] font-bold">{range(fn.start_time, fn.end_time)}</p>
          )}
        </section>
      )}

      {(fn.venue_name || fn.venue_address || fn.location) && (
        <section className="px-5 pt-7">
          <h2 className="inv-reveal mb-3.5 font-display text-[28px] font-semibold text-[#4A1029]">Where</h2>
          <div className="inv-reveal flex flex-col gap-2.5 rounded-[18px] border border-[#EBD9C3] bg-white px-4 py-3.5">
            <p className="text-base font-bold">{fn.venue_name || fn.location}</p>
            {fn.venue_address && <p className="text-[13px] leading-relaxed text-[#5A3A43]">{fn.venue_address}</p>}
            <div className="grid grid-cols-2 gap-2">
              {map && <a href={map} target="_blank" rel="noopener noreferrer" className="flex h-[46px] items-center justify-center rounded-xl bg-[#5C1A33] text-sm font-bold text-white">Open in Maps</a>}
              {cal && <a href={cal} target="_blank" rel="noopener noreferrer" className="flex h-[46px] items-center justify-center rounded-xl border border-[#D9C2A8] text-sm font-bold text-[#5C1A33]">Add to calendar</a>}
            </div>
          </div>
        </section>
      )}

      {(fn.dress_code || fn.dress_colors?.length) && (
        <section className="px-5 pt-7">
          <h2 className="inv-reveal mb-2.5 font-display text-[28px] font-semibold text-[#4A1029]">What to wear</h2>
          {fn.dress_code && <p className="mb-3 text-sm text-[#5A3A43]">{fn.dress_code}</p>}
          <div className="flex gap-2.5">
            {(fn.dress_colors || []).map(c => (
              <span key={c} role="img" aria-label={`Colour ${c}`} className="h-11 w-11 rounded-full border border-black/10" style={{ background: c }} />
            ))}
          </div>
        </section>
      )}

      {fn.guest_note && (
        <section className="mx-5 mt-7 flex items-start gap-3 rounded-2xl bg-[#FBEEDB] p-4">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7A4B1E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16.5v.5" /></svg>
          <p className="whitespace-pre-line text-sm leading-relaxed text-[#5A3A1E]">{fn.guest_note}</p>
        </section>
      )}
      <div className="h-12" />
    </main>
  )
}
