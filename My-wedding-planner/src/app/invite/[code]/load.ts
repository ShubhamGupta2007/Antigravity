import { cookies } from 'next/headers'
import { createClient } from '@/lib/server'
import { pinCookieName, type Invitation, type InviteGate } from '@/lib/invite'

/** Loads the invitation for a code, using the phone digits saved on this device (if any). */
export async function loadInvitation(code: string): Promise<Invitation | InviteGate> {
  const cookieStore = await cookies()
  const pin = cookieStore.get(pinCookieName(code))?.value || null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_invitation', { p_code: code, p_pin: pin })
  if (error || !data) {
    console.error('get_invitation failed', error)
    return { status: 'unavailable' }
  }
  return data as Invitation | InviteGate
}
