'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/client'
import { DEFAULT_KID_AGE } from '@/lib/functionPlanning'

/**
 * One-tap Adult / Kid switch for a family member (imports add everyone as an
 * adult). A member whose age is under the kid age is a kid by age, so the
 * switch is shown but locked. For someone with an adult age (a grown-up son or
 * daughter) the switch means "kid's lifafa": they stay an adult guest for the
 * headcount and rooms, and only gifting treats them as a kid.
 */
export default function KidToggle({
  memberId,
  age,
  initialIsKid,
  canEdit
}: {
  memberId: string
  age: number | null
  initialIsKid: boolean
  canEdit: boolean
}) {
  const [isKid, setIsKid] = useState(initialIsKid)
  const [saving, setSaving] = useState(false)
  const kidByAge = age !== null && age !== undefined && age < DEFAULT_KID_AGE
  const adultByAge = age !== null && age !== undefined && age >= DEFAULT_KID_AGE
  const showKid = isKid || kidByAge
  const locked = !canEdit || kidByAge || saving

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (locked) return
    const next = !isKid
    setIsKid(next)
    setSaving(true)
    const { error } = await createClient().from('family_members').update({ is_kid_for_gifting: next }).eq('id', memberId)
    setSaving(false)
    if (error) {
      setIsKid(!next)
      toast.error(`Could not update: ${error.message}`)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={locked}
      aria-pressed={showKid}
      title={
        kidByAge
          ? `Kid by age (${age})`
          : adultByAge
            ? showKid
              ? 'Adult guest who gets a kid’s lifafa. Tap to give an adult’s lifafa'
              : 'Tap to give a kid’s lifafa (stays an adult guest for rooms and headcount)'
            : canEdit ? `Tap to mark as ${showKid ? 'adult' : 'kid'}` : undefined
      }
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border transition-colors ${
        showKid ? 'bg-rani-pink/10 text-rani-pink border-rani-pink/20' : 'bg-maroon/5 text-maroon/60 border-maroon/10'
      } ${locked ? 'cursor-default' : 'cursor-pointer hover:border-maroon/40'} ${saving ? 'opacity-60' : ''}`}
    >
      {showKid ? (adultByAge ? '🎁 Kid’s lifafa' : '🧸 Kid') : '🧑 Adult'}
    </button>
  )
}
