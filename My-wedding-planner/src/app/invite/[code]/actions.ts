'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/server'
import { pinCookieName } from '@/lib/invite'

/** Checks the last 4 digits and, if right, remembers them on this device for this invitation. */
export async function verifyInvitePin(code: string, pin: string) {
  const clean = String(pin || '').replace(/\D/g, '').slice(0, 4)
  if (clean.length !== 4) return { status: 'wrong_pin' as const }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_invitation', { p_code: code, p_pin: clean })
  if (error || !data) return { status: 'unavailable' as const }
  const status = (data as { status: string }).status
  if (status === 'ok') {
    const cookieStore = await cookies()
    cookieStore.set(pinCookieName(code), clean, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: `/invite/${code}`,
      maxAge: 60 * 60 * 24 * 180
    })
  }
  return { status: status as 'ok' | 'wrong_pin' | 'locked' | 'not_found' }
}

export type RsvpPayload = {
  functions: Array<
    | { function_id: string; status: 'declined' }
    | { function_id: string; status: 'confirmed'; member_ids: string[]; new_names: string[] }
    | { function_id: string; status: 'confirmed'; adults: number; kids: number }
  >
  note?: string
  travel?: string
}

export async function submitInviteRsvp(code: string, payload: RsvpPayload) {
  const cookieStore = await cookies()
  const pin = cookieStore.get(pinCookieName(code))?.value || null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_invitation_rsvp', { p_code: code, p_pin: pin, p_payload: payload })
  if (error || !data) {
    console.error('submit_invitation_rsvp failed', error)
    return { status: 'unavailable' as const }
  }
  return data as { status: 'ok' | 'closed' | 'needs_pin' | 'wrong_pin' | 'locked' | 'not_found'; saved?: number }
}
