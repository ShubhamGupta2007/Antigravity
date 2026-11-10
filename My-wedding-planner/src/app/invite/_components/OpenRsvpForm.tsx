'use client'

import { useState, useTransition } from 'react'
import { submitOpenRsvp } from '../open/[code]/actions'
import type { OpenFunction } from '@/lib/invite'

type Day = { key: string; label: string; items: OpenFunction[] }

/**
 * The general invitation's reply: name, phone, coming or not, which days, how many,
 * help with a room or travel, and a message. Replying again with the same phone changes it.
 */
export default function OpenRsvpForm({ code, days, closed, deadline }: { code: string; days: Day[]; closed: boolean; deadline: string | null }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [attending, setAttending] = useState<boolean | null>(null)
  const [picked, setPicked] = useState<string[]>(() => days.flatMap(d => d.items.map(f => f.id)))
  const [people, setPeople] = useState(1)
  const [kids, setKids] = useState(0)
  const [help, setHelp] = useState(false)
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // left empty by people; filled by bots
  const [result, setResult] = useState<'idle' | 'sent' | 'error' | 'closed' | 'name' | 'phone'>('idle')
  const [pending, startTransition] = useTransition()

  const digits = phone.replace(/\D/g, '')
  const canSend = name.trim().length > 0 && digits.length >= 10 && attending !== null && (!attending || picked.length > 0)

  const toggleDay = (d: Day) => {
    const ids = d.items.map(f => f.id)
    const allOn = ids.every(id => picked.includes(id))
    setPicked(prev => (allOn ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]))
  }

  const send = () => {
    if (website) return setResult('sent')
    startTransition(async () => {
      const res = await submitOpenRsvp(code, {
        name: name.trim(),
        phone: digits,
        attending: !!attending,
        function_ids: attending ? picked : [],
        people: attending ? people : 0,
        kids: attending ? Math.min(kids, people - 1) : 0,
        needs_help: help,
        message: message.trim()
      })
      if (res.status === 'ok') setResult('sent')
      else if (res.status === 'closed') setResult('closed')
      else if (res.status === 'invalid') setResult(res.field === 'phone' ? 'phone' : 'name')
      else setResult('error')
    })
  }

  if (result === 'sent') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[26px] bg-white px-6 py-10 text-center shadow-[0_14px_34px_rgba(74,16,41,0.10)]">
        <div className="inv-pop grid h-20 w-20 place-items-center rounded-full bg-[#5B7C4F]">
          <svg role="img" aria-label="Reply sent" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        <p className="font-display text-[36px] font-semibold text-[#4A1029]">{attending ? 'See you there!' : 'Thank you'}</p>
        <p className="max-w-[300px] text-[15px] leading-relaxed text-[#5A3A43]">
          {attending ? 'We’ve got your reply. Our family will be in touch.' : 'We’ll miss you. Thank you for letting us know.'}
        </p>
        <p className="text-[13px] text-[#6B4A52]">To change it, send again with the same phone number{deadline ? ` before ${deadline}` : ''}.</p>
        <button type="button" onClick={() => setResult('idle')} className="mt-1 h-12 rounded-full border border-[#C9A98E] bg-white px-6 text-sm font-bold text-[#5C1A33]">Change my reply</button>
      </div>
    )
  }

  const field = 'h-[52px] w-full rounded-2xl border border-[#D9C2A8] bg-white px-4 text-[16px] text-[#3B1424] outline-none focus:ring-2 focus:ring-[#C9973F]'
  const choice = (on: boolean, tone: 'yes' | 'no' = 'yes') =>
    `inv-chip min-h-[52px] rounded-2xl border-[1.5px] px-4 text-[15px] font-bold ${on ? (tone === 'yes' ? 'border-[#5B7C4F] bg-[#5B7C4F] text-white' : 'border-[#8E1F2F] bg-[#8E1F2F] text-white') : 'border-[#DCCBB6] bg-white text-[#3B1424]'}`

  return (
    <form onSubmit={e => { e.preventDefault(); if (canSend) send() }} className="flex flex-col gap-5 rounded-[26px] bg-white p-5 shadow-[0_14px_34px_rgba(74,16,41,0.10)]">
      {closed && <p role="status" className="rounded-2xl bg-[#FBEBD0] p-4 text-sm text-[#6B3F0E]">Replies closed{deadline ? ` on ${deadline}` : ''}. Please call the family.</p>}

      <label className="flex flex-col gap-1.5 text-[15px] font-bold text-[#3B1424]">
        Your name
        <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required disabled={closed} className={field} placeholder="e.g. Ravi Kumar" />
      </label>
      {result === 'name' && <p role="alert" className="-mt-3 text-sm text-[#8E1F2F]">Please write your name.</p>}

      <label className="flex flex-col gap-1.5 text-[15px] font-bold text-[#3B1424]">
        Phone number
        <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" required disabled={closed} className={field} placeholder="98765 43210" />
        <span className="text-[13px] font-normal text-[#6B4A52]">Only so we can reach you. Send again with this number to change your reply.</span>
      </label>
      {result === 'phone' && <p role="alert" className="-mt-3 text-sm text-[#8E1F2F]">Please check your phone number (10 digits).</p>}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[15px] font-bold text-[#3B1424]">Will you come?</legend>
        <div className="grid grid-cols-1 gap-2">
          <button type="button" disabled={closed} aria-pressed={attending === true} onClick={() => setAttending(true)} className={choice(attending === true)}>Yes, I’ll be there 🙏</button>
          <button type="button" disabled={closed} aria-pressed={attending === false} onClick={() => setAttending(false)} className={choice(attending === false, 'no')}>Sadly, I can’t come</button>
        </div>
      </fieldset>

      {attending && (
        <>
          <fieldset className="inv-unfold flex flex-col gap-2">
            <legend className="mb-1.5 text-[15px] font-bold text-[#3B1424]">Which days?</legend>
            {days.map(d => {
              const on = d.items.every(f => picked.includes(f.id))
              return (
                <button key={d.key} type="button" aria-pressed={on} onClick={() => toggleDay(d)} disabled={closed}
                  className={`inv-chip flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left ${on ? 'border-[#5B7C4F] bg-[#EEF4EA]' : 'border-[#DCCBB6] bg-white'}`}>
                  <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-[1.5px] text-sm ${on ? 'border-[#5B7C4F] bg-[#5B7C4F] text-white' : 'border-[#C9A98E] bg-white'}`}>{on ? '✓' : ''}</span>
                  <span>
                    <span className="block text-[15px] font-bold text-[#3B1424]">{d.label}</span>
                    <span className="block text-[13px] text-[#6B4A52]">{d.items.map(f => f.name).join(', ')}</span>
                  </span>
                </button>
              )
            })}
          </fieldset>

          <div className="inv-unfold flex flex-col gap-3">
            {([['How many of you, with you?', people, setPeople, 1, 30], ['Children among them', kids, setKids, 0, Math.max(0, people - 1)]] as const).map(([label, value, set, min, max]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-bold text-[#3B1424]">{label}</span>
                <div className="flex items-center rounded-full border-[1.5px] border-[#DCCBB6] bg-[#FFF8EE]">
                  <button type="button" disabled={closed || value <= min} onClick={() => set(Math.max(min, value - 1))} aria-label={`One less: ${label}`} className="grid h-11 w-11 place-items-center text-xl font-bold text-[#5C1A33] disabled:opacity-30">−</button>
                  <span className="w-8 text-center font-display text-2xl font-bold text-[#4A1029]" aria-live="polite">{value}</span>
                  <button type="button" disabled={closed || value >= max} onClick={() => set(Math.min(max, value + 1))} aria-label={`One more: ${label}`} className="grid h-11 w-11 place-items-center text-xl font-bold text-[#5C1A33] disabled:opacity-30">+</button>
                </div>
              </div>
            ))}
          </div>

          <label className="inv-unfold flex cursor-pointer items-center gap-3 rounded-2xl bg-[#FFF8EE] px-4 py-3.5 text-[15px] font-semibold text-[#3B1424]">
            <input type="checkbox" checked={help} onChange={e => setHelp(e.target.checked)} disabled={closed} className="h-5 w-5 accent-[#5C1A33]" />
            I need help with a room or travel
          </label>
        </>
      )}

      <label className="flex flex-col gap-1.5 text-[15px] font-bold text-[#3B1424]">
        A message for us <span className="-mt-1 text-[13px] font-normal text-[#6B4A52]">(you can skip this)</span>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} disabled={closed} placeholder="Blessings, food preferences, arriving by train…"
          className="w-full resize-y rounded-2xl border border-[#D9C2A8] bg-white px-4 py-3 text-[16px] font-normal outline-none focus:ring-2 focus:ring-[#C9973F]" />
      </label>

      {/* Hidden from people; bots fill it in */}
      <input type="text" name="website" value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

      {result === 'error' && <p role="alert" className="text-sm text-[#8E1F2F]">We couldn’t send that. Please check your connection and try again.</p>}
      {result === 'closed' && <p role="alert" className="text-sm text-[#8E1F2F]">Replies have closed. Please call the family.</p>}

      {!closed && (
        <button type="submit" disabled={pending || !canSend}
          className="h-[58px] rounded-full bg-[#3A0B20] text-[17px] font-bold text-[#F2C46D] shadow-[0_12px_26px_rgba(58,11,32,0.28)] transition-opacity disabled:opacity-40">
          {pending ? 'Sending…' : 'Send my reply'}
        </button>
      )}
    </form>
  )
}
