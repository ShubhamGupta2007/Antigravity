import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { createClient } from '@/lib/server'
import { formatTime, parseEventDate } from '@/lib/functionPlanning'
import { colorName, isLight, styleLabel } from '@/lib/dressThemes'
import { calendarUrl, deadlineLabel, isRsvpClosed, mapsUrl, themeFor, tint, venueLine, type InviteFunction, type OpenFunction, type OpenInvitation } from '@/lib/invite'
import Fireworks from '../../_components/Fireworks'
import { GaneshJi, Petals, Toran } from '../../_components/Decor'
import OpenRsvpForm from '../../_components/OpenRsvpForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'You are invited', robots: { index: false, follow: false } }

const range = (s: string | null, e: string | null) => (s ? `${formatTime(s)}${e ? ` – ${formatTime(e)}` : ' onwards'}` : 'Time to be shared')

/**
 * The general invitation: one link for everyone on our side who isn't on the guest list.
 * Shows only the functions marked for it, day by day, the places, and a simple reply form.
 */
export default async function OpenInvitationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_open_invitation', { p_code: code })
  if (error || !data || (data as { status: string }).status !== 'ok') notFound()
  const inv = data as OpenInvitation
  const s = inv.settings
  const fns = inv.functions

  // Day by day
  const dayMap = new Map<string, OpenFunction[]>()
  fns.forEach(f => {
    const key = f.event_date ? f.event_date.slice(0, 10) : 'later'
    dayMap.set(key, [...(dayMap.get(key) || []), f])
  })
  const days = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, items], i, all) => {
    const d = key === 'later' ? null : parseEventDate(key)
    return {
      key,
      date: d,
      label: d ? format(d, 'EEE, d MMM') : 'Date to follow',
      long: d ? format(d, 'EEEE, d MMMM') : 'Date to follow',
      items: [...items].sort((a, b) => (a.start_time || '99').localeCompare(b.start_time || '99')),
      theme: themeFor(i, all.length)
    }
  })
  const first = days.find(d => d.date)?.date
  const last = [...days].reverse().find(d => d.date)?.date
  const dateLine = first && last
    ? first.getTime() === last.getTime() ? format(first, 'd MMMM yyyy') : `${format(first, 'd')}${format(first, 'MMM') === format(last, 'MMM') ? '' : ` ${format(first, 'MMM')}`} – ${format(last, 'd MMMM yyyy')}`
    : s.wedding_date ? format(parseEventDate(s.wedding_date), 'd MMMM yyyy') : ''

  // Unique places
  const places = new Map<string, OpenFunction[]>()
  fns.forEach(f => {
    const v = venueLine(f)
    if (v) places.set(v, [...(places.get(v) || []), f])
  })

  const deadline = deadlineLabel(s)
  const closed = isRsvpClosed(s)
  const hosts = inv.side === 'bride' ? s.bride_family_name : s.groom_family_name
  const couple = `${s.bride_name} & ${s.groom_name}`

  return (
    <main className="mx-auto max-w-[480px] bg-[#FFF8EE] pb-28 font-data text-[#3B1424] shadow-[0_0_60px_rgba(0,0,0,0.35)]">
      {/* Hero */}
      <section className="relative flex min-h-[92svh] flex-col items-center overflow-hidden bg-[#3A0B20] px-6 text-center text-[#FFF6E9]">
        <Fireworks />
        <Toran />
        <Petals />
        <GaneshJi className="inv-ganesh relative mt-20 h-20 w-auto" />
        <p className="inv-rise relative mt-2 font-[family-name:var(--font-devanagari)] text-lg text-[#F2C46D]" style={{ animationDelay: '0.2s' }}>॥ श्री गणेशाय नमः ॥</p>
        <p className="inv-rise relative mt-8 text-xs uppercase tracking-[4px] text-[#E9CBA7]" style={{ animationDelay: '0.4s' }}>
          {hosts ? `The ${hosts.replace(/^the\s+/i, '')} family invites you` : 'With the blessings of our families'}
        </p>
        <h1 className="inv-rise relative mt-4 flex flex-col items-center" style={{ animationDelay: '0.6s' }}>
          <span className="inv-gold pb-2 font-[family-name:var(--font-script)] text-[84px] leading-none">{s.groom_name}</span>
          <span className="my-1 font-display text-3xl italic text-[#F2C46D]">weds</span>
          <span className="inv-gold pb-2 font-[family-name:var(--font-script)] text-[84px] leading-none">{s.bride_name}</span>
        </h1>
        {dateLine && (
          <div className="inv-rise relative mt-7 flex items-center gap-3.5" style={{ animationDelay: '0.9s' }}>
            <span aria-hidden="true" className="h-px w-8 bg-[#C9973F]" />
            <p className="text-sm tracking-[3px] text-[#F3DFC4]">{dateLine}</p>
            <span aria-hidden="true" className="h-px w-8 bg-[#C9973F]" />
          </div>
        )}
        {s.city && <p className="inv-rise relative mt-2 font-display text-xl italic text-[#E9CBA7]" style={{ animationDelay: '1s' }}>{s.city}</p>}
        <a href="#reply" className="inv-rise relative mt-9 flex h-[52px] items-center rounded-full bg-[#F2C46D] px-8 text-[15px] font-bold text-[#3A0B20]" style={{ animationDelay: '1.2s' }}>
          🙏 Let us know you’re coming
        </a>
      </section>

      {/* Greeting */}
      <section className="px-7 pb-4 pt-14 text-center">
        <p className="text-xs uppercase tracking-[4px] text-[#8A5A44]">You are invited</p>
        <p className="mx-auto mt-4 max-w-[340px] whitespace-pre-line text-base leading-[1.7] text-[#5A3A43]">
          {s.greeting || 'With the blessings of our elders, we would love to have you with us as our families come together. Your presence would make these days complete.'}
        </p>
      </section>

      {/* Days at a glance */}
      <section id="days" className="scroll-mt-4 px-5 pt-10">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[4px] text-[#8A5A44]">Save the dates</p>
          <h2 className="mb-6 mt-2.5 font-display text-[42px] font-semibold leading-none text-[#4A1029]">Celebrate with us</h2>
        </div>
        {fns.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-[#6B4A52]">Details of the celebrations will be shared soon.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {days.map((day, i) => (
              <div key={day.key} className="overflow-hidden rounded-[22px] border border-[#EFDFCB] bg-white">
                <div className="flex items-center gap-3 border-b border-[#F3E7D8] px-4 py-3">
                  <span className="rounded-xl px-2.5 py-1 text-center" style={{ background: day.theme.band, color: day.theme.ink }}>
                    <span className="block font-display text-xl font-bold leading-none">{day.date ? format(day.date, 'd') : '–'}</span>
                    <span className="block text-[9px] font-bold uppercase tracking-[2px]">{day.date ? format(day.date, 'MMM') : ''}</span>
                  </span>
                  <p className="font-display text-xl font-semibold text-[#4A1029]">Day {i + 1} · {day.date ? format(day.date, 'EEEE') : 'to follow'}</p>
                </div>
                <ul>
                  {day.items.map(f => (
                    <li key={f.id}>
                      <a href={`#fn-${f.id}`} className="flex items-baseline gap-4 px-4 py-2.5 hover:bg-[#FFF8EE]">
                        <span className="w-[72px] shrink-0 text-[13px] font-bold text-[#8E1F2F]">{f.start_time ? formatTime(f.start_time) : '—'}</span>
                        <span className="font-display text-[22px] font-semibold leading-tight">{f.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Each celebration in its own colour */}
      <div className="mt-10 flex flex-col">
        {days.flatMap(day =>
          day.items.map(f => {
            const base = f.dress_colors?.[0] || null
            const style = styleLabel(f.dress_style)
            const cal = calendarUrl(f as InviteFunction, couple)
            const map = mapsUrl(f)
            return (
              <section key={f.id} id={`fn-${f.id}`} className="scroll-mt-4 px-6 py-12" style={{ background: tint(base, 0.82) }}>
                <p className="text-[11px] font-bold uppercase tracking-[3px] text-[#8A5A44]">{day.long}</p>
                <h3 className="mt-2 font-display text-[48px] font-semibold leading-none text-[#4A1029]">{f.name}</h3>
                <p className="mt-3 text-lg font-bold text-[#3B1424]">{range(f.start_time, f.end_time)}</p>
                {venueLine(f) && <p className="mt-1 text-[15px] text-[#5A3A43]">📍 {venueLine(f)}{f.venue_address ? `, ${f.venue_address}` : ''}</p>}
                {f.guest_note && <p className="mt-4 whitespace-pre-line text-[15px] leading-[1.7] text-[#5A3A43]">{f.guest_note}</p>}

                {f.segments.length > 0 && (
                  <ol className="mt-5 flex flex-col gap-2 border-l-2 border-[#C9A98E]/60 pl-4">
                    {f.segments.map((sg, k) => (
                      <li key={k} className="text-sm">
                        {sg.start_time && <span className="mr-2 font-bold text-[#8E1F2F]">{formatTime(sg.start_time)}</span>}
                        <span className="font-semibold">{sg.name}</span>
                      </li>
                    ))}
                  </ol>
                )}

                {(f.dress_colors?.length || f.dress_theme || style) && (
                  <div className="mt-6 rounded-2xl bg-white/70 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[3px] text-[#8A5A44]">Colour theme</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                      {f.dress_theme && <span className="font-display text-xl font-semibold text-[#4A1029]">{f.dress_theme}</span>}
                      {style && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#5C1A33] ring-1 ring-[#EBD9C3]">{style.icon} {style.label}</span>}
                    </div>
                    {(f.dress_colors?.length || 0) > 0 && (
                      <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
                        {(f.dress_colors || []).map(c => (
                          <li key={c} className="flex items-center gap-1.5 text-[13px] text-[#5A3A43]">
                            <span aria-hidden="true" className={`h-4 w-4 rounded-full ${isLight(c) ? 'ring-1 ring-black/15' : ''}`} style={{ background: c }} />
                            {colorName(c)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="mt-6 flex flex-wrap gap-2">
                  {cal && <a href={cal} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#C9A98E] bg-white px-4 py-2.5 text-sm font-bold text-[#5C1A33]">Add to calendar</a>}
                  {map && <a href={map} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#C9A98E] bg-white px-4 py-2.5 text-sm font-bold text-[#5C1A33]">Directions</a>}
                </div>
              </section>
            )
          })
        )}
      </div>

      {/* Places */}
      {places.size > 0 && (
        <section id="places" className="scroll-mt-4 px-5 pt-14">
          <h2 className="mb-4 text-center font-display text-[40px] font-semibold text-[#4A1029]">Places</h2>
          <div className="flex flex-col gap-3">
            {[...places.entries()].map(([name, list]) => {
              const map = mapsUrl(list[0])
              return (
                <div key={name} className="rounded-[20px] border border-[#EBD9C3] bg-white p-4">
                  <p className="text-[17px] font-bold">{name}</p>
                  {list[0].venue_address && <p className="mt-0.5 text-sm text-[#5A3A43]">{list[0].venue_address}</p>}
                  <p className="mt-1.5 text-[13px] text-[#6B4A52]">For {list.map(f => f.name).join(', ')}</p>
                  {map && <a href={map} target="_blank" rel="noopener noreferrer" className="mt-3 flex h-11 items-center justify-center rounded-xl bg-[#5C1A33] text-sm font-bold text-white">Open in Maps</a>}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Good to know */}
      <section className="px-5 pt-12">
        <h2 className="mb-2 font-display text-[34px] font-semibold text-[#4A1029]">Good to know</h2>
        <details className="border-b border-[#EBD9C3] py-4">
          <summary className="cursor-pointer text-[15px] font-bold">What should we wear?</summary>
          <p className="mt-2 text-sm leading-relaxed text-[#5A3A43]">Each celebration has its own colour theme, shown above. What you wear in those colours is up to you.</p>
        </details>
        <details className="border-b border-[#EBD9C3] py-4">
          <summary className="cursor-pointer text-[15px] font-bold">Can I change my reply?</summary>
          <p className="mt-2 text-sm leading-relaxed text-[#5A3A43]">Yes. Send it again with the same phone number{deadline ? ` before ${deadline}` : ''}.</p>
        </details>
        <details className="border-b border-[#EBD9C3] py-4">
          <summary className="cursor-pointer text-[15px] font-bold">Coming from out of town?</summary>
          <p className="mt-2 text-sm leading-relaxed text-[#5A3A43]">Tick “I need help with a room or travel” in your reply and the family will get in touch.</p>
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

      {/* Reply */}
      <section id="reply" className="scroll-mt-4 px-5 pt-14">
        <div className="mb-5 text-center">
          <p className="text-xs uppercase tracking-[4px] text-[#8A5A44]">Will you join us?</p>
          <h2 className="mt-2.5 font-display text-[40px] font-semibold leading-none text-[#4A1029]">Your reply</h2>
          <p className="mt-3 text-[15px] text-[#5A3A43]">Tell us soon, so we can plan for you{deadline ? `. Please reply by ${deadline}` : ''}.</p>
        </div>
        <OpenRsvpForm code={code} days={days.map(d => ({ key: d.key, label: d.label, items: d.items }))} closed={closed} deadline={deadline} />
      </section>

      <footer className="mt-14 bg-[#3A0B20] px-6 pb-16 pt-12 text-center text-[#F3DFC4]">
        <p className="inv-gold pb-1 font-[family-name:var(--font-script)] text-[40px]">With love, {couple}</p>
        {hosts && <p className="mt-3 text-sm text-[#D9B89A]">and the {hosts.replace(/^the\s+/i, '')} family</p>}
      </footer>

      {/* Sticky shortcuts */}
      <nav aria-label="Sections" className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-max items-center gap-1 rounded-full bg-[#3A0B20]/95 p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur">
        <a href="#days" className="rounded-full px-4 py-2 text-sm font-semibold text-[#F3DFC4]">Days</a>
        {places.size > 0 && <a href="#places" className="rounded-full px-4 py-2 text-sm font-semibold text-[#F3DFC4]">Places</a>}
        <a href="#reply" className="rounded-full bg-[#F2C46D] px-5 py-2 text-sm font-bold text-[#3A0B20]">Reply</a>
      </nav>
    </main>
  )
}
