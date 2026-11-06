import Link from 'next/link'
import { format } from 'date-fns'
import { formatTime, parseEventDate } from '@/lib/functionPlanning'
import {
  deadlineLabel,
  familyGreetingName,
  familyTitle,
  rsvpBadge,
  themeFor,
  venueLine,
  type Invitation,
  type InviteGate
} from '@/lib/invite'
import { loadInvitation } from './load'
import Envelope from '../_components/Envelope'
import Fireworks from '../_components/Fireworks'
import { LockedGate, NotFoundGate, PinGate } from '../_components/Gate'
import { Mandala, MandalaStar, Petals, Toran } from '../_components/Decor'

export const dynamic = 'force-dynamic'

export default async function InvitationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const data = await loadInvitation(code)

  if (data.status !== 'ok') {
    const gate = data as InviteGate
    if (gate.status === 'needs_pin' || gate.status === 'wrong_pin') return <PinGate code={code} gate={gate} />
    if (gate.status === 'locked') return <LockedGate gate={gate} />
    return <NotFoundGate gate={gate} unavailable={gate.status === 'unavailable'} />
  }

  const inv = data as Invitation
  const s = inv.settings
  const title = familyTitle(inv.family.name)
  const greeting = familyGreetingName(inv.family.name)
  const weddingDate = s.wedding_date ? format(parseEventDate(s.wedding_date), 'dd · MM · yyyy') : null
  const deadline = deadlineLabel(s)
  const awaiting = inv.functions.filter(f => !f.rsvp?.status || f.rsvp.status === 'invited').length
  // Celebrations grouped by day, in order
  const dayMap = new Map<string, typeof inv.functions>()
  inv.functions.forEach(fn => {
    const key = fn.event_date ? fn.event_date.slice(0, 10) : 'later'
    dayMap.set(key, [...(dayMap.get(key) || []), fn])
  })
  const days = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items], i, all) => {
      const d = key === 'later' ? null : parseEventDate(key)
      return {
        key,
        items: [...items].sort((a, b) => (a.start_time || '99').localeCompare(b.start_time || '99')),
        dayNum: d ? format(d, 'd') : '–',
        month: d ? format(d, 'MMM') : '',
        weekday: d ? format(d, 'EEEE') : 'Date to follow',
        theme: themeFor(i, all.length)
      }
    })
  // What they've told us so far, shown only with the reply
  const replied = inv.functions.filter(f => f.rsvp?.status === 'confirmed' || f.rsvp?.status === 'declined')
  const families = [
    s.groom_family_name && { label: 'Ladkewale', name: s.groom_family_name, cls: 'bg-[#FBEEDB] text-[#7A4B1E]' },
    s.bride_family_name && { label: 'Ladkiwale', name: s.bride_family_name, cls: 'bg-[#F7E3E6] text-[#8A2E45]' }
  ].filter(Boolean) as { label: string; name: string; cls: string }[]

  return (
    <>
      <Envelope code={code} title={title} bride={s.bride_name} groom={s.groom_name} />

      <main className="mx-auto max-w-[480px] bg-[#FFF8EE] font-data text-[#3B1424] shadow-[0_0_60px_rgba(0,0,0,0.35)]">
        {/* Hero */}
        <section className="relative flex min-h-[100svh] flex-col items-center overflow-hidden bg-[#3A0B20] px-6 text-center text-[#FFF6E9]">
          <Mandala className="inv-mandala pointer-events-none absolute left-1/2 top-[11%] w-[700px] max-w-none -translate-x-1/2 opacity-20" />
          <MandalaStar className="inv-mandala-back pointer-events-none absolute left-1/2 top-[32%] w-[340px] max-w-none -translate-x-1/2 opacity-25" />
          <Fireworks />
          <Toran />
          <Petals />

          <p className="inv-rise mt-24 font-[family-name:var(--font-devanagari)] text-lg text-[#F2C46D]" style={{ animationDelay: '0.1s' }}>॥ श्री गणेशाय नमः ॥</p>
          <p className="inv-rise mt-10 text-xs uppercase tracking-[4px] text-[#E9CBA7]" style={{ animationDelay: '0.35s' }}>Together with their families</p>
          <div className="inv-rise mt-4" style={{ animationDelay: '0.6s' }}>
            <h1 className="inv-gold pb-3 font-[family-name:var(--font-script)] text-[92px] leading-[1]">{s.bride_name}</h1>
          </div>
          <p className="inv-rise my-1.5 font-display text-[34px] italic text-[#F2C46D]" style={{ animationDelay: '0.85s' }}>weds</p>
          <div className="inv-rise" style={{ animationDelay: '1.05s' }}>
            <p className="inv-gold pb-3 font-[family-name:var(--font-script)] text-[92px] leading-[1]">{s.groom_name}</p>
          </div>
          {weddingDate && (
            <div className="inv-rise mt-9 flex items-center gap-3.5" style={{ animationDelay: '1.3s' }}>
              <span aria-hidden="true" className="h-px w-10 bg-[#C9973F]" />
              <p className="text-base tracking-[4px] text-[#F3DFC4]">{weddingDate}</p>
              <span aria-hidden="true" className="h-px w-10 bg-[#C9973F]" />
            </div>
          )}
          {s.city && <p className="inv-rise mt-2.5 font-display text-xl italic text-[#E9CBA7]" style={{ animationDelay: '1.45s' }}>{s.city}</p>}

          <div aria-hidden="true" className="inv-cue absolute bottom-8 flex flex-col items-center gap-1.5 text-[11px] uppercase tracking-[3px] text-[#E9CBA7]">
            Scroll
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </div>
        </section>

        {/* Personal note */}
        <section className="px-7 pb-6 pt-16 text-center">
          <div className="inv-reveal">
            <p className="text-xs uppercase tracking-[4px] text-[#8A5A44]">A personal invitation</p>
            <h2 className="mt-3 font-display text-[40px] font-semibold leading-[1.05] text-[#5C1A33]">Dear {greeting}</h2>
            <p className="mt-5 whitespace-pre-line text-base leading-[1.7] text-[#5A3A43]">
              {s.greeting || 'With the blessings of our elders, we would be honoured to have you with us as our families come together. Your presence would make these days complete.'}
            </p>
            {s.families_line && <p className="mt-5 font-display text-xl italic text-[#8E1F2F]">{s.families_line}</p>}
          </div>
        </section>

        {/* Couple monogram (replaced by the couple's photo once shared) */}
        <section className="px-5 pt-3">
          <figure className="inv-reveal relative m-0 flex h-[460px] flex-col items-center justify-center overflow-hidden rounded-t-[195px] rounded-b-[20px] border-8 border-white bg-[#4A1029] shadow-[0_20px_50px_rgba(74,16,41,0.18)]">
            <Mandala className="inv-mandala pointer-events-none absolute left-1/2 top-1/2 w-[520px] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-25" />
            <p className="relative font-display text-[96px] font-bold leading-none text-[#F2C46D]">{s.bride_name.charAt(0)}<span className="mx-2 text-5xl italic text-[#E9CBA7]">&amp;</span>{s.groom_name.charAt(0)}</p>
            <figcaption className="relative mt-4 text-xs uppercase tracking-[4px] text-[#E9CBA7]">{s.bride_name} &amp; {s.groom_name}</figcaption>
          </figure>
        </section>

        {/* Their celebrations, day by day */}
        <section className="px-5 pt-16">
          <div className="inv-reveal text-center">
            <p className="text-xs uppercase tracking-[4px] text-[#8A5A44]">Save the dates</p>
            <h2 className="mb-8 mt-2.5 font-display text-[42px] font-semibold leading-none text-[#4A1029]">Celebrate with us</h2>
          </div>
          <div className="flex flex-col gap-4">
            {days.map((day, d) => (
              <article key={day.key} className="inv-reveal overflow-hidden rounded-[22px] border border-[#EFDFCB] bg-white shadow-[0_10px_28px_rgba(74,16,41,0.07)]">
                <header className="flex items-center gap-4 border-b border-[#F3E7D8] px-5 py-4">
                  <div className="flex h-[58px] w-[54px] shrink-0 flex-col items-center justify-center rounded-2xl" style={{ background: day.theme.band, color: day.theme.ink }}>
                    <span className="font-display text-[28px] font-bold leading-none">{day.dayNum}</span>
                    <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[2px]">{day.month}</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[3px] text-[#8A5A44]">Day {d + 1}</p>
                    <p className="font-display text-[22px] font-semibold leading-tight text-[#4A1029]">{day.weekday}</p>
                  </div>
                </header>
                <ul className="divide-y divide-[#F3E7D8]">
                  {day.items.map(fn => {
                    const venue = venueLine(fn)
                    return (
                      <li key={fn.id}>
                        <Link href={`/invite/${code}/f/${fn.id}`} className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[#FFF8EE]">
                          <span className="w-[68px] shrink-0 pt-1.5 text-[13px] font-bold leading-tight text-[#8E1F2F]">
                            {fn.start_time ? formatTime(fn.start_time) : 'Time soon'}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-display text-[26px] font-semibold leading-tight text-[#3B1424]">{fn.name}</span>
                            {venue && <span className="mt-0.5 block text-sm text-[#6B4A52]">{venue}</span>}
                            {(fn.dress_code || fn.dress_colors?.length) && (
                              <span className="mt-1.5 flex items-center gap-1.5 text-xs text-[#6B4A52]">
                                {(fn.dress_colors || []).slice(0, 4).map(c => (
                                  <span key={c} aria-hidden="true" className="h-3 w-3 rounded-full border border-black/10" style={{ background: c }} />
                                ))}
                                {fn.dress_code}
                              </span>
                            )}
                          </span>
                          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A98E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-2.5 shrink-0 transition-transform group-hover:translate-x-0.5"><path d="M9 6l6 6-6 6" /></svg>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </article>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-[#8A5A44]">Tap a celebration for timings, venue and what to wear.</p>
        </section>

        {/* Reply */}
        <section className="inv-reveal relative mx-5 mt-10 overflow-hidden rounded-[26px] bg-[#3A0B20] px-6 py-8 text-center text-[#FFF6E9]">
          <svg aria-hidden="true" viewBox="0 0 200 200" className="absolute -right-[90px] -top-[110px] w-[260px] opacity-20">
            <g fill="none" stroke="#F2C46D" strokeWidth="0.8"><circle cx="100" cy="100" r="90" /><circle cx="100" cy="100" r="60" /><circle cx="100" cy="100" r="30" /></g>
          </svg>
          <p className="relative font-display text-[34px] font-semibold leading-[1.05]">Will you join us?</p>
          {replied.length > 0 ? (
            <ul className="relative mx-auto mt-4 max-w-[300px] space-y-1.5 text-left text-sm text-[#F3DFC4]">
              {inv.functions.map(f => {
                const b = rsvpBadge(f.rsvp)
                return (
                  <li key={f.id} className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-1.5">
                    <span className="font-semibold text-[#FFF6E9]">{f.name}</span>
                    <span className={b.tone === 'yes' ? 'text-[#BFD8B0]' : b.tone === 'no' ? 'text-[#F2B8C0]' : 'text-[#E9CBA7]'}>
                      {b.tone === 'yes' ? 'Coming' : b.tone === 'no' ? 'Not coming' : 'No reply yet'}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="relative mt-3 text-[15px] leading-relaxed text-[#F3DFC4]">
              Let us know who is coming to each celebration{deadline ? `. Please reply by ${deadline}.` : '.'}
            </p>
          )}
          <Link
            href={`/invite/${code}/rsvp`}
            className="relative mx-auto mt-5 flex h-[54px] max-w-[280px] items-center justify-center rounded-full bg-[#F2C46D] text-base font-bold text-[#3A0B20]"
          >
            {awaiting === inv.functions.length ? 'Send our reply' : 'Change our reply'}
          </Link>
        </section>

        {/* Stay (only for families with rooms) */}
        {inv.family.needs_room && (
          <section className="px-5 pt-12">
            <div className="inv-reveal flex items-start gap-3.5 rounded-[22px] border border-[#EFDFCB] bg-white p-5">
              <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#8E1F2F" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><path d="M3 20V8l9-5 9 5v12" /><path d="M9 20v-6h6v6" /></svg>
              <div>
                <p className="font-display text-[26px] font-semibold text-[#4A1029]">Your stay</p>
                <p className="mt-1.5 text-[15px] font-bold">
                  {inv.family.room_numbers ? `Room${/[,&]/.test(inv.family.room_numbers) ? 's' : ''} ${inv.family.room_numbers}` : `${inv.family.rooms_assigned || 1} room${(inv.family.rooms_assigned || 1) > 1 ? 's' : ''} kept for you`}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[#5A3A43]">We&apos;ll be happy to pick you up. Share your train or flight in your reply.</p>
              </div>
            </div>
          </section>
        )}

        {/* Story */}
        {s.story && (
          <section className="px-5 pt-14">
            <div className="inv-reveal text-center">
              <p className="text-xs uppercase tracking-[4px] text-[#8A5A44]">Our story</p>
              <h2 className="mb-4 mt-2.5 font-display text-[40px] font-semibold leading-none text-[#4A1029]">Two families, one celebration</h2>
              <p className="whitespace-pre-line text-[15px] leading-[1.7] text-[#5A3A43]">{s.story}</p>
            </div>
          </section>
        )}

        {/* Families */}
        {families.length > 0 && (
          <section className="px-5 pt-12">
            <div className={`inv-reveal grid gap-2.5 ${families.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {families.map(f => (
                <div key={f.label} className={`rounded-[18px] p-[18px] text-center ${f.cls}`}>
                  <p className="text-[11px] uppercase tracking-[3px]">{f.label}</p>
                  <p className="mt-2 font-display text-[22px] font-semibold text-[#4A1029]">{f.name}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Good to know */}
        <section className="px-5 pt-12">
          <h2 className="inv-reveal mb-2 font-display text-[34px] font-semibold text-[#4A1029]">Good to know</h2>
          <details className="border-b border-[#EBD9C3] py-4">
            <summary className="cursor-pointer text-[15px] font-bold">What should we wear?</summary>
            <p className="mt-2 text-sm leading-relaxed text-[#5A3A43]">Each celebration has its own colours, shown in the schedule and on its details page.</p>
          </details>
          <details className="border-b border-[#EBD9C3] py-4">
            <summary className="cursor-pointer text-[15px] font-bold">Can we change our reply later?</summary>
            <p className="mt-2 text-sm leading-relaxed text-[#5A3A43]">Yes, from this same link{deadline ? ` until ${deadline}` : ''}.</p>
          </details>
          {(s.contact_name || s.contact_phone) && (
            <details className="border-b border-[#EBD9C3] py-4">
              <summary className="cursor-pointer text-[15px] font-bold">Who do we call?</summary>
              <p className="mt-2 text-sm leading-relaxed text-[#5A3A43]">
                {s.contact_name}{s.contact_phone && <> · <a href={`tel:${s.contact_phone.replace(/\s/g, '')}`} className="font-bold text-[#8E1F2F] underline">{s.contact_phone}</a></>}
              </p>
            </details>
          )}
        </section>

        <footer className="mt-14 bg-[#3A0B20] px-6 pb-14 pt-12 text-center text-[#F3DFC4]">
          <p className="inv-gold pb-1 font-[family-name:var(--font-script)] text-[40px]">With love, {s.bride_name} &amp; {s.groom_name}</p>
          <p className="mt-3.5 text-xs text-[#D9B89A]">This invitation is only for {title.replace(/^The /, 'the ')}.</p>
        </footer>
      </main>
    </>
  )
}
