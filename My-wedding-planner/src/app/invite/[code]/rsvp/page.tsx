import Link from 'next/link'
import { deadlineLabel, familyTitle, isRsvpClosed, type Invitation, type InviteGate } from '@/lib/invite'
import { loadInvitation } from '../load'
import RsvpForm from '../../_components/RsvpForm'
import { LockedGate, NotFoundGate, PinGate } from '../../_components/Gate'

export const dynamic = 'force-dynamic'

export default async function InviteRsvpPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const data = await loadInvitation(code)
  if (data.status !== 'ok') {
    const gate = data as InviteGate
    if (gate.status === 'needs_pin' || gate.status === 'wrong_pin') return <PinGate code={code} gate={gate} />
    if (gate.status === 'locked') return <LockedGate gate={gate} />
    return <NotFoundGate gate={gate} unavailable={gate.status === 'unavailable'} />
  }
  const inv = data as Invitation
  const namesMode = inv.family.members.length > 0
  const title = familyTitle(inv.family.name)

  return (
    <main className="mx-auto min-h-screen max-w-[480px] bg-[#FFF8EE] font-data text-[#3B1424]">
      <header className="rounded-b-[28px] bg-[#3A0B20] px-[22px] pb-8 pt-5 text-[#FFF6E9]">
        <Link href={`/invite/${code}`} className="inline-flex items-center gap-1.5 py-2 text-sm font-bold text-[#F2C46D]">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M11 18l-6-6 6-6" /></svg>
          Invitation
        </Link>
        <h1 className="inv-rise mt-3.5 font-display text-[44px] font-semibold leading-none">{namesMode ? 'Who’s coming?' : 'Will you join us?'}</h1>
        <p className="inv-rise mt-2.5 text-[15px] leading-relaxed text-[#F3DFC4]" style={{ animationDelay: '0.15s' }}>
          {namesMode
            ? 'Everyone is ticked as coming. Untick anyone who can’t make it, or add someone we missed.'
            : `${title.replace(/^The /, '')}, tap how many of you will be with us at each celebration.`}
        </p>
      </header>
      <RsvpForm
        code={code}
        familyName={title}
        members={inv.family.members}
        functions={inv.functions}
        closed={isRsvpClosed(inv.settings)}
        deadline={deadlineLabel(inv.settings)}
        initialNote={inv.last_response?.note || ''}
        initialTravel={inv.last_response?.travel || ''}
        showTravel={inv.family.is_local === false || inv.family.needs_room}
      />
    </main>
  )
}
