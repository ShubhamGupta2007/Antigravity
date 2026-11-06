'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MandalaStar } from './Decor'
import { verifyInvitePin } from '../[code]/actions'
import type { InviteGate } from '@/lib/invite'

function ContactLine({ contact }: { contact?: InviteGate['contact'] }) {
  if (!contact?.name && !contact?.phone) return <>Please contact the family and we&apos;ll send you the right link.</>
  return (
    <>
      Call {contact?.name || 'us'}
      {contact?.phone && (
        <> on <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="font-bold text-[#F2C46D] underline">{contact.phone}</a></>
      )}{' '}
      and we&apos;ll send you the right link.
    </>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#3A0B20] px-7 pb-10 pt-[9vh] font-data text-[#FFF6E9]">
      <MandalaStar className="inv-mandala pointer-events-none absolute -bottom-[240px] -right-[200px] w-[520px] max-w-none opacity-20" />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col">{children}</div>
    </main>
  )
}

/** The one-time "is it you?" check: last 4 digits of the family's mobile number. */
export function PinGate({ code, gate }: { code: string; gate: InviteGate }) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState<string>(gate.status === 'wrong_pin' ? 'wrong_pin' : '')
  const [pending, startTransition] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const res = await verifyInvitePin(code, pin)
      if (res.status === 'ok') router.refresh()
      else setStatus(res.status)
    })
  }

  if (status === 'locked') return <LockedGate gate={gate} />

  return (
    <Shell>
      <p className="inv-rise text-xs uppercase tracking-[4px] text-[#E9CBA7]">Namaste</p>
      <h1 className="inv-rise mt-2.5 font-display text-[44px] font-semibold leading-[1.05]" style={{ animationDelay: '0.15s' }}>Just making sure it&apos;s you</h1>
      <p className="inv-rise mt-4 text-[15px] leading-relaxed text-[#F3DFC4]" style={{ animationDelay: '0.3s' }}>
        This invitation is for the {gate.family_name ? `${gate.family_name} family` : 'family it was sent to'}. Enter the last 4 digits of the mobile number we have for your family{gate.hint ? ` (ending in ••${gate.hint})` : ''}.
      </p>
      <form onSubmit={submit} className="inv-rise mt-9 flex flex-col" style={{ animationDelay: '0.45s' }}>
        <label htmlFor="pin" className="text-[13px] font-bold text-[#E9CBA7]">Last 4 digits</label>
        <input
          id="pin"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          placeholder="• • • •"
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setStatus('') }}
          className="mt-2 h-16 rounded-2xl border border-[#C9973F] bg-white/5 text-center font-display text-4xl font-bold tracking-[18px] text-[#FFF6E9] outline-none focus:ring-2 focus:ring-[#F2C46D]"
        />
        {status === 'wrong_pin' && <p role="alert" className="mt-2.5 text-[13px] text-[#FFB4A8]">That doesn&apos;t match. Please try again.</p>}
        {status === 'unavailable' && <p role="alert" className="mt-2.5 text-[13px] text-[#FFB4A8]">Something went wrong. Please try again in a moment.</p>}
        <button
          type="submit"
          disabled={pin.length !== 4 || pending}
          className="mt-6 h-14 rounded-full bg-[#F2C46D] text-base font-bold text-[#3A0B20] transition-opacity disabled:opacity-40"
        >
          {pending ? 'Checking…' : 'Open our invitation'}
        </button>
      </form>
      <p className="mt-auto pt-10 text-[13px] leading-relaxed text-[#D9B89A]">
        We ask only once on each phone. Number changed, or not your family? <ContactLine contact={gate.contact} />
      </p>
    </Shell>
  )
}

export function LockedGate({ gate }: { gate: InviteGate }) {
  return (
    <Shell>
      <h1 className="inv-rise font-display text-[40px] font-semibold leading-[1.05]">Let&apos;s try again in a little while</h1>
      <p className="inv-rise mt-4 text-[15px] leading-relaxed text-[#F3DFC4]" style={{ animationDelay: '0.15s' }}>
        There were too many tries, so this invitation is paused for 15 minutes. <ContactLine contact={gate.contact} />
      </p>
    </Shell>
  )
}

export function NotFoundGate({ gate, unavailable = false }: { gate: InviteGate; unavailable?: boolean }) {
  return (
    <Shell>
      <h1 className="inv-rise font-display text-[40px] font-semibold leading-[1.05]">
        {unavailable ? 'We couldn’t open your invitation' : 'This invitation link isn’t right'}
      </h1>
      <p className="inv-rise mt-4 text-[15px] leading-relaxed text-[#F3DFC4]" style={{ animationDelay: '0.15s' }}>
        {unavailable ? 'Please try again in a moment. ' : 'It may have been copied only in part. '}
        <ContactLine contact={gate.contact} />
      </p>
    </Shell>
  )
}
