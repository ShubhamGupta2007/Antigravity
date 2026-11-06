'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { submitInviteRsvp, type RsvpPayload } from '../[code]/actions'
import { eventDateParts, themeFor, type InviteFunction, type InviteMember } from '@/lib/invite'

type NameAnswer = { selected: string[]; declined: boolean }
type CountAnswer = { size: number | null; kids: number }

const SIZES = [1, 2, 3, 4, 5, 6, 7, 8]
const KID_CHOICES = [{ v: 0, t: 'None' }, { v: 1, t: '1' }, { v: 2, t: '2' }, { v: 3, t: '3 or more' }]

function guestsLabel(n: number, kids: number) {
  const base = `${n}${n >= 8 ? '+' : ''} ${n === 1 ? 'guest' : 'guests'}`
  return kids > 0 ? `${base} · ${kids >= 3 ? '3+' : kids} ${kids === 1 ? 'child' : 'children'}` : base
}

export default function RsvpForm({
  code,
  familyName,
  members,
  functions,
  closed,
  deadline,
  initialNote,
  initialTravel,
  showTravel
}: {
  code: string
  familyName: string
  members: InviteMember[]
  functions: InviteFunction[]
  closed: boolean
  deadline: string | null
  initialNote: string
  initialTravel: string
  showTravel: boolean
}) {
  const namesMode = members.length > 0
  const [added, setAdded] = useState<string[]>([]) // names typed in this visit
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState(initialNote)
  const [travel, setTravel] = useState(initialTravel)
  const [placeNames, setPlaceNames] = useState('')
  const [result, setResult] = useState<'idle' | 'sent' | 'closed' | 'error'>('idle')
  const [pending, startTransition] = useTransition()

  const [names, setNames] = useState<Record<string, NameAnswer>>(() =>
    Object.fromEntries(functions.map(f => [f.id, {
      // Not replied yet: everyone starts as coming; they untick whoever can't make it
      selected: f.rsvp?.status === 'confirmed' ? f.rsvp.member_ids : f.rsvp?.status === 'declined' ? [] : members.map(m => m.id),
      declined: f.rsvp?.status === 'declined'
    }]))
  )
  const [counts, setCounts] = useState<Record<string, CountAnswer>>(() =>
    Object.fromEntries(functions.map(f => {
      if (f.rsvp?.status === 'declined') return [f.id, { size: 0, kids: 0 }]
      if (f.rsvp?.status === 'confirmed') {
        const total = (f.rsvp.adults || 0) + (f.rsvp.kids || 0)
        return [f.id, { size: Math.min(8, Math.max(1, total)), kids: Math.min(3, f.rsvp.kids || 0) }]
      }
      // Not replied yet: start from the count the family was invited with, if we have one
      const planned = (f.rsvp?.adults || 0) + (f.rsvp?.kids || 0)
      return [f.id, planned > 0 ? { size: Math.min(8, planned), kids: Math.min(3, f.rsvp?.kids || 0) } : { size: null, kids: 0 }]
    }))
  )

  // Everyone who can be ticked: the family's members, then names added in this visit
  const people = useMemo(
    () => [
      ...members.map(m => ({ key: m.id, name: m.name, isKid: m.is_kid, isNew: m.added_by_guest })),
      ...added.map(n => ({ key: `new:${n}`, name: n, isKid: false, isNew: true }))
    ],
    [members, added]
  )

  const toggle = (fnId: string, key: string) =>
    setNames(prev => {
      const cur = prev[fnId]
      const on = cur.selected.includes(key)
      return { ...prev, [fnId]: { declined: false, selected: on ? cur.selected.filter(k => k !== key) : [...cur.selected, key] } }
    })

  const addName = (fnId: string) => {
    const name = draft.trim().slice(0, 80)
    setAddingFor(null)
    setDraft('')
    if (!name || people.some(p => p.name.toLowerCase() === name.toLowerCase())) return
    setAdded(prev => [...prev, name])
    // Coming to every celebration unless the family said they can't make that one; they can untick anywhere
    setNames(prev =>
      Object.fromEntries(
        Object.entries(prev).map(([id, a]) => [
          id,
          id === fnId ? { declined: false, selected: [...a.selected, `new:${name}`] } : a.declined ? a : { ...a, selected: [...a.selected, `new:${name}`] }
        ])
      )
    )
  }

  const answered = functions.filter(f =>
    namesMode ? names[f.id].declined || names[f.id].selected.length > 0 : counts[f.id].size !== null
  ).length

  const send = () => {
    const payload: RsvpPayload = {
      functions: functions.flatMap((f): RsvpPayload['functions'] => {
        if (namesMode) {
          const a = names[f.id]
          if (a.declined || a.selected.length === 0) return a.declined ? [{ function_id: f.id, status: 'declined' as const }] : []
          return [{
            function_id: f.id,
            status: 'confirmed' as const,
            member_ids: a.selected.filter(k => !k.startsWith('new:')),
            new_names: a.selected.filter(k => k.startsWith('new:')).map(k => k.slice(4))
          }]
        }
        const c = counts[f.id]
        if (c.size === null) return []
        if (c.size === 0) return [{ function_id: f.id, status: 'declined' as const }]
        const kids = Math.min(c.kids, c.size - 1)
        return [{ function_id: f.id, status: 'confirmed' as const, adults: c.size - kids, kids }]
      }),
      note: [note.trim(), !namesMode && placeNames.trim() ? `Names: ${placeNames.trim()}` : ''].filter(Boolean).join('\n'),
      travel: travel.trim()
    }
    startTransition(async () => {
      const res = await submitInviteRsvp(code, payload)
      if (res.status === 'ok') {
        setResult('sent')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else setResult(res.status === 'closed' ? 'closed' : 'error')
    })
  }

  if (result === 'sent') {
    const lines = functions.flatMap(f => {
      if (namesMode) {
        const a = names[f.id]
        if (!a.selected.length) return a.declined ? [`${f.name}: we’ll miss you`] : []
        return [`${f.name}: coming 🙏`]
      }
      const c = counts[f.id]
      if (c.size === null) return []
      return [c.size === 0 ? `${f.name}: we’ll miss you` : `${f.name}: coming 🙏`]
    })
    return (
      <section className="flex flex-col items-center gap-3.5 px-6 py-14 text-center">
        <div className="inv-pop relative flex h-[104px] w-[104px] items-center justify-center rounded-full bg-[#5B7C4F]">
          <svg role="img" aria-label="Reply sent" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          {[['-70px', '-60px', '#F59E0B'], ['72px', '-54px', '#E25822'], ['-80px', '30px', '#F7B733'], ['78px', '40px', '#F59E0B'], ['0px', '-86px', '#E2771C'], ['10px', '84px', '#F7B733']].map(([dx, dy, c]) => (
            <span key={dx + dy} aria-hidden="true" className="inv-spark" style={{ background: c, ['--dx' as string]: dx, ['--dy' as string]: dy }} />
          ))}
        </div>
        <h2 className="inv-rise mt-2 font-display text-[40px] font-semibold text-[#4A1029]" style={{ animationDelay: '0.2s' }}>Thank you!</h2>
        <ul className="inv-rise space-y-1 text-base leading-relaxed text-[#5A3A43]" style={{ animationDelay: '0.35s' }}>
          {lines.map(l => <li key={l}>{l}</li>)}
        </ul>
        <p className="inv-rise text-[13px] text-[#6B4A52]" style={{ animationDelay: '0.45s' }}>
          You can change this from the same link{deadline ? ` until ${deadline}` : ''}.
        </p>
        <button type="button" onClick={() => setResult('idle')} className="mt-2.5 h-[50px] rounded-full border border-[#C9A98E] bg-white px-7 text-[15px] font-bold text-[#5C1A33]">
          Change our reply
        </button>
        <Link href={`/invite/${code}`} className="p-2.5 text-sm font-bold text-[#8E1F2F]">Back to the invitation</Link>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4 px-5 py-6">
      {closed && (
        <p role="status" className="rounded-2xl bg-[#FBEBD0] p-4 text-sm leading-relaxed text-[#6B3F0E]">
          Replies closed{deadline ? ` on ${deadline}` : ''}. To change anything, please call the family.
        </p>
      )}

      {functions.map((f, i) => {
        const theme = themeFor(i, functions.length)
        const date = eventDateParts(f.event_date)
        return (
          <article key={f.id} className="inv-rise overflow-hidden rounded-[22px] border border-[#EFDFCB] bg-white shadow-[0_10px_26px_rgba(74,16,41,0.07)]" style={{ animationDelay: `${0.1 + i * 0.12}s` }}>
            <div className="flex items-baseline justify-between gap-2.5 px-[18px] py-4" style={{ background: theme.band, color: theme.ink }}>
              <h2 className="font-display text-[26px] font-semibold leading-tight">{f.name}</h2>
              <span className="shrink-0 text-[13px] font-bold">{date.weekday.slice(0, 3)} {date.short}</span>
            </div>

            {namesMode ? (() => {
              const a = names[f.id]
              const quiet = !a.declined && a.selected.length === 0
              return (
                <div className="flex flex-col gap-3 px-[18px] py-4">
                  <div role="group" aria-label={`Who is coming to ${f.name}`} className="flex flex-wrap gap-2">
                    {people.map(p => {
                      const on = a.selected.includes(p.key)
                      return (
                        <button
                          key={p.key}
                          type="button"
                          disabled={closed}
                          onClick={() => toggle(f.id, p.key)}
                          aria-pressed={on}
                          className={`inv-chip inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] py-0 pl-2.5 pr-3.5 text-sm font-bold ${on ? 'border-[#5B7C4F] bg-[#5B7C4F] text-white' : p.isNew ? 'border-[#C9A98E] bg-white text-[#3B1424]' : 'border-[#DCCBB6] bg-white text-[#3B1424]'}`}
                        >
                          <span aria-hidden="true" className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${on ? 'bg-white text-[#3E5A35]' : 'bg-[#F3E7D8] text-[#7A5560]'}`}>{on ? '✓' : '+'}</span>
                          {p.name}
                          {p.isNew && <span className="text-[10px] uppercase tracking-wide opacity-80">new</span>}
                        </button>
                      )
                    })}
                    {addingFor !== f.id && !closed && (
                      <button type="button" onClick={() => { setAddingFor(f.id); setDraft('') }} className="inv-chip min-h-11 rounded-full border-[1.5px] border-dashed border-[#C9A98E] bg-[#FFFCF7] px-3.5 text-sm font-bold text-[#8E1F2F]">
                        + Add someone
                      </button>
                    )}
                  </div>
                  {addingFor === f.id && (
                    <div className="inv-unfold flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <label htmlFor={`add-${f.id}`} className="sr-only">Name of the person joining</label>
                        <input
                          id={`add-${f.id}`}
                          autoFocus
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addName(f.id) } }}
                          placeholder="Their name, e.g. Nani ji"
                          className="h-[46px] min-w-0 flex-1 rounded-full border-[1.5px] border-[#C9A98E] bg-white px-4 text-[15px] outline-none focus:ring-2 focus:ring-[#C9973F]"
                        />
                        <button type="button" onClick={() => addName(f.id)} className="h-[46px] rounded-full bg-[#5B7C4F] px-[18px] text-sm font-bold text-white">Add</button>
                      </div>
                      <p className="text-xs text-[#6B4A52]">We&apos;ll add them to your invitation after a quick check.</p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[#F3E7D8] pt-2.5">
                    <span aria-live="polite" className={quiet ? 'text-sm font-semibold text-[#7A5560]' : `font-display text-xl font-semibold italic ${a.declined ? 'text-[#8E1F2F]' : 'text-[#3E5A35]'}`}>
                      {a.declined
                        ? 'We’ll miss you'
                        : a.selected.length === people.length && people.length > 1
                          ? 'Everyone’s coming'
                          : a.selected.length
                            ? `Coming: ${a.selected.map(k => people.find(p => p.key === k)?.name).filter(Boolean).join(', ')}`
                            : 'Tap the names of who’s coming'}
                    </span>
                    {!closed && (
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => setNames(prev => ({ ...prev, [f.id]: { declined: false, selected: people.map(p => p.key) } }))} className="min-h-10 rounded-full border border-[#D9C2A8] bg-[#FFF8EE] px-3 text-[13px] font-bold text-[#5C1A33]">Everyone</button>
                        <button type="button" onClick={() => setNames(prev => ({ ...prev, [f.id]: { declined: true, selected: [] } }))} className="min-h-10 rounded-full border border-[#E3C3C9] bg-white px-3 text-[13px] font-bold text-[#8E1F2F]">Can&apos;t make it</button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })() : (() => {
              const c = counts[f.id]
              const set = (patch: Partial<CountAnswer>) => setCounts(prev => ({ ...prev, [f.id]: { ...prev[f.id], ...patch } }))
              const declined = c.size === 0
              const coming = (c.size || 0) > 0
              return (
                <div className="flex flex-col gap-3 px-[18px] pb-[18px] pt-4">
                  <p id={`q-${f.id}`} className="text-[15px] font-bold">How many from your family?</p>
                  <div role="radiogroup" aria-labelledby={`q-${f.id}`} className="grid grid-cols-4 gap-2">
                    {SIZES.map(n => {
                      const sel = c.size === n
                      return (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={sel}
                          aria-label={n === 8 ? '8 or more' : n === 1 ? 'Just me' : `${n} people`}
                          disabled={closed}
                          onClick={() => set({ size: n, kids: Math.min(c.kids, n - 1) })}
                          className={`inv-chip h-14 rounded-full border-[1.5px] font-display text-[28px] font-bold ${sel ? 'border-[#5C1A33] bg-[#5C1A33] text-[#FFE6A8]' : 'border-[#E4D3BE] bg-[#FFF8EE] text-[#4A1029]'}`}
                        >
                          {n === 8 ? '8+' : n}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={closed}
                    onClick={() => set({ size: 0, kids: 0 })}
                    aria-pressed={declined}
                    className={`inv-chip h-[46px] rounded-full border-[1.5px] text-sm font-bold ${declined ? 'border-[#8E1F2F] bg-[#8E1F2F] text-white' : 'border-[#E3C3C9] bg-white text-[#8E1F2F]'}`}
                  >
                    We can&apos;t make it this time
                  </button>
                  {coming && (c.size || 0) > 1 && (
                    <div className="inv-unfold flex flex-col gap-2.5 border-t border-[#F3E7D8] pt-3">
                      <p id={`k-${f.id}`} className="text-[15px] font-bold">Any children among them?</p>
                      <div role="radiogroup" aria-labelledby={`k-${f.id}`} className="flex flex-wrap gap-2">
                        {KID_CHOICES.filter(k => k.v === 0 || k.v < (c.size || 0)).map(k => {
                          const sel = c.kids === k.v
                          return (
                            <button key={k.v} type="button" role="radio" aria-checked={sel} disabled={closed} onClick={() => set({ kids: k.v })}
                              className={`inv-chip min-h-11 rounded-full border-[1.5px] px-4 text-sm font-bold ${sel ? 'border-[#5B7C4F] bg-[#5B7C4F] text-white' : 'border-[#DCCBB6] bg-white text-[#3B1424]'}`}>
                              {k.t}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {(declined || coming) && (
                    <p aria-live="polite" className={`inv-unfold text-center font-display text-xl italic ${declined ? 'text-[#8E1F2F]' : 'text-[#3E5A35]'}`}>
                      {declined ? 'We’ll miss you' : guestsLabel(c.size || 0, Math.min(c.kids, (c.size || 1) - 1))}
                    </p>
                  )}
                </div>
              )
            })()}
          </article>
        )
      })}

      {!namesMode && (
        <>
          <label htmlFor="place-names" className="mt-2 text-[15px] font-bold">
            Their names <span className="text-[13px] font-normal text-[#6B4A52]">(optional, for name cards &amp; seating)</span>
          </label>
          <textarea id="place-names" rows={3} value={placeNames} onChange={e => setPlaceNames(e.target.value)} disabled={closed}
            placeholder="e.g. Anil ji, Meena ji, Kavya, Ishaan"
            className="w-full resize-y rounded-2xl border border-[#D9C2A8] bg-white px-3.5 py-3 text-[15px] outline-none focus:ring-2 focus:ring-[#C9973F]" />
        </>
      )}

      <label htmlFor="note" className="mt-2 text-[15px] font-bold">
        A note for the couple <span className="text-[13px] font-normal text-[#6B4A52]">(optional)</span>
      </label>
      <textarea id="note" rows={3} value={note} onChange={e => setNote(e.target.value)} disabled={closed}
        placeholder="Blessings, food preferences…"
        className="w-full resize-y rounded-2xl border border-[#D9C2A8] bg-white px-3.5 py-3 text-[15px] outline-none focus:ring-2 focus:ring-[#C9973F]" />

      {showTravel && (
        <>
          <label htmlFor="travel" className="text-[15px] font-bold">
            Arriving by <span className="text-[13px] font-normal text-[#6B4A52]">(so we can pick you up)</span>
          </label>
          <input id="travel" value={travel} onChange={e => setTravel(e.target.value)} disabled={closed}
            placeholder="e.g. Shatabdi, 16 Jan, 11:20 AM"
            className="h-[50px] w-full rounded-2xl border border-[#D9C2A8] bg-white px-3.5 text-[15px] outline-none focus:ring-2 focus:ring-[#C9973F]" />
        </>
      )}

      {result === 'closed' && <p role="alert" className="text-sm text-[#8E1F2F]">Replies have closed. Please call the family to change anything.</p>}
      {result === 'error' && <p role="alert" className="text-sm text-[#8E1F2F]">We couldn&apos;t send that. Please check your connection and try again.</p>}

      {!closed && (
        <button
          type="button"
          onClick={send}
          disabled={pending || answered === 0}
          className="mt-3 h-[58px] rounded-full bg-[#3A0B20] text-[17px] font-bold text-[#F2C46D] shadow-[0_12px_26px_rgba(58,11,32,0.28)] transition-opacity disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Send our reply'}
        </button>
      )}
      <p className="sr-only">Reply for {familyName}</p>
    </section>
  )
}
