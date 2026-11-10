'use server'

import { createClient } from '@/lib/server'
import type { OpenRsvpPayload } from '@/lib/invite'

/** A reply from the general invitation link. Replying again with the same phone updates it. */
export async function submitOpenRsvp(code: string, payload: OpenRsvpPayload) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_open_rsvp', { p_code: code, p_payload: payload })
  if (error || !data) {
    console.error('submit_open_rsvp failed', error)
    return { status: 'unavailable' as const }
  }
  return data as { status: 'ok' | 'closed' | 'not_found' | 'invalid'; field?: 'name' | 'phone' }
}
