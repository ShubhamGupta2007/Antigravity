'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/client'

/** Approve or remove a name a guest added from their invitation. */
export default function PendingMemberActions({ memberId, name }: { memberId: string; name: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'approved' | 'removed' | null>(null)

  const approve = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setBusy(true)
    const { error } = await createClient().from('family_members').update({ pending_approval: false }).eq('id', memberId)
    setBusy(false)
    if (error) return toast.error(`Could not approve: ${error.message}`)
    setDone('approved')
    router.refresh()
  }
  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Remove ${name}? They were added by the family from their invitation.`)) return
    setBusy(true)
    const { error } = await createClient().from('family_members').delete().eq('id', memberId)
    setBusy(false)
    if (error) return toast.error(`Could not remove: ${error.message}`)
    setDone('removed')
    router.refresh()
  }

  if (done) return <span className="text-[10px] font-semibold text-mehendi">{done === 'approved' ? 'Approved' : 'Removed'}</span>
  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded-full bg-marigold/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-maroon" title="Added by the family from their invitation">added by guest</span>
      <button type="button" disabled={busy} onClick={approve} className="rounded-full bg-mehendi px-2 py-0.5 text-[10px] font-bold text-white disabled:opacity-50">Approve</button>
      <button type="button" disabled={busy} onClick={remove} className="rounded-full border border-rust-red/30 px-2 py-0.5 text-[10px] font-bold text-rust-red disabled:opacity-50">Remove</button>
    </span>
  )
}
