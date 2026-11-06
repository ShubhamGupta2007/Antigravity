'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Link2, MessageCircle } from 'lucide-react'
import { inviteMessage, inviteUrl, whatsappUrl } from '@/lib/invite'

type Couple = { bride_name?: string | null; groom_name?: string | null }

/** "Copy invite link" and "Share on WhatsApp" for one family, as menu rows or compact buttons. */
export default function InviteShare({
  code,
  familyName,
  phone,
  couple,
  variant = 'menu'
}: {
  code: string | null | undefined
  familyName: string
  phone?: string | null
  couple: Couple
  variant?: 'menu' | 'buttons'
}) {
  const [copied, setCopied] = useState(false)
  if (!code) return null

  const link = () => inviteUrl(window.location.origin, code)
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(link())
      setCopied(true)
      toast.success('Invite link copied')
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy this invite link', link())
    }
  }
  const share = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.open(whatsappUrl(inviteMessage(familyName, couple, link()), phone), '_blank', 'noopener,noreferrer')
  }

  if (variant === 'buttons') {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-marigold/40 bg-white px-3 text-xs font-semibold text-maroon hover:bg-marigold/10">
          <Link2 className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy invite link'}
        </button>
        <button type="button" onClick={share} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-mehendi px-3 text-xs font-semibold text-white hover:opacity-90">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </button>
      </div>
    )
  }
  return (
    <>
      <button type="button" onClick={copy} className="flex w-full items-center px-4 py-2.5 text-left font-data text-xs text-maroon hover:bg-marigold/15">
        <Link2 className="mr-2 h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Copy invite link'}
      </button>
      <button type="button" onClick={share} className="flex w-full items-center px-4 py-2.5 text-left font-data text-xs text-maroon hover:bg-mehendi/15">
        <MessageCircle className="mr-2 h-3.5 w-3.5" /> Share on WhatsApp
      </button>
    </>
  )
}
