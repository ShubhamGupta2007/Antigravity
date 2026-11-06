'use client'

import { MessageCircle, Inbox } from 'lucide-react'
import { format } from 'date-fns'
import { inviteUrl, reminderMessage, whatsappUrl } from '@/lib/invite'

export type ReplyFamily = {
  id: string
  name: string
  status: 'invited' | 'confirmed' | 'declined'
  respondedAt: string | null
  inviteCode: string | null
  phone: string | null
  guests: number
}

export type GuestMessage = { familyName: string; note: string | null; travel: string | null; submittedAt: string }

/** Who has replied from their invitation, who to remind, and what they wrote. */
export default function FunctionReplies({
  functionName,
  families,
  messages,
  couple
}: {
  functionName: string
  families: ReplyFamily[]
  messages: GuestMessage[]
  couple: { bride_name?: string | null; groom_name?: string | null }
}) {
  const confirmed = families.filter(f => f.status === 'confirmed')
  const declined = families.filter(f => f.status === 'declined')
  const awaiting = families.filter(f => f.status === 'invited')

  const remind = (f: ReplyFamily) => {
    if (!f.inviteCode) return
    const url = inviteUrl(window.location.origin, f.inviteCode)
    window.open(whatsappUrl(reminderMessage(f.name, couple, url, functionName), f.phone), '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="rounded-2xl border border-marigold/20 bg-white p-6 shadow-sm">
      <h2 className="mb-3 flex items-center border-b border-marigold/10 pb-3 font-display text-xl font-semibold text-maroon">
        <Inbox className="mr-2 h-5 w-5" /> Replies
      </h2>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center font-data">
        <div className="rounded-xl bg-mehendi/10 p-2.5"><p className="text-xl font-bold text-mehendi">{confirmed.length}</p><p className="text-[10px] font-semibold uppercase text-maroon/60">Coming</p></div>
        <div className="rounded-xl bg-rust-red/10 p-2.5"><p className="text-xl font-bold text-rust-red">{declined.length}</p><p className="text-[10px] font-semibold uppercase text-maroon/60">Not coming</p></div>
        <div className="rounded-xl bg-marigold/15 p-2.5"><p className="text-xl font-bold text-maroon">{awaiting.length}</p><p className="text-[10px] font-semibold uppercase text-maroon/60">Waiting</p></div>
      </div>

      {awaiting.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 font-data text-[10px] font-bold uppercase tracking-wider text-maroon/50">Still to reply</h3>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {awaiting.map(f => (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-ivory/60 px-3 py-2 font-data text-xs">
                <span className="truncate font-semibold text-maroon">{f.name}</span>
                {f.inviteCode && (
                  <button type="button" onClick={() => remind(f)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mehendi px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90" aria-label={`Remind ${f.name} on WhatsApp`}>
                    <MessageCircle className="h-3 w-3" /> Remind
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmed.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 font-data text-[10px] font-bold uppercase tracking-wider text-maroon/50">Coming</h3>
          <ul className="space-y-1 font-data text-xs text-maroon/80">
            {confirmed.map(f => (
              <li key={f.id} className="flex justify-between gap-2">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-maroon/50">{f.guests} {f.guests === 1 ? 'guest' : 'guests'}{f.respondedAt ? ` · ${format(new Date(f.respondedAt), 'd MMM')}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {messages.length > 0 && (
        <div>
          <h3 className="mb-2 font-data text-[10px] font-bold uppercase tracking-wider text-maroon/50">Messages from guests</h3>
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {messages.map((m, i) => (
              <li key={i} className="rounded-lg border border-marigold/15 bg-ivory/50 p-2.5 font-data text-xs">
                <p className="font-semibold text-maroon">{m.familyName} <span className="font-normal text-maroon/40">· {format(new Date(m.submittedAt), 'd MMM')}</span></p>
                {m.note && <p className="mt-1 whitespace-pre-line text-maroon/80">{m.note}</p>}
                {m.travel && <p className="mt-1 text-maroon/60">🚆 {m.travel}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
