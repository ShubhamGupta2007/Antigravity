// Guest invitation data: types, loading by invite code, and small display helpers.
// All reads go through the get_invitation() database function (see 14_guest_invitations.sql).

import { format } from 'date-fns'
import { formatTime, parseEventDate } from '@/lib/functionPlanning'

export type InviteMember = { id: string; name: string; is_kid: boolean; added_by_guest: boolean }

export type InviteRsvp = {
  status: 'invited' | 'confirmed' | 'declined' | null
  adults: number | null
  kids: number | null
  responded_at: string | null
  member_ids: string[]
} | null

export type InviteSegment = { name: string; start_time: string | null; end_time: string | null; location: string | null; notes: string | null }

export type InviteFunction = {
  id: string
  name: string
  event_date: string | null
  start_time: string | null
  end_time: string | null
  location: string | null
  venue_name: string | null
  venue_address: string | null
  map_url: string | null
  dress_code: string | null
  dress_colors: string[] | null
  guest_note: string | null
  segments: InviteSegment[]
  rsvp: InviteRsvp
}

export type InviteSettings = {
  bride_name: string
  groom_name: string
  wedding_date: string | null
  city: string | null
  rsvp_deadline: string | null
  greeting: string | null
  families_line: string | null
  groom_family_name: string | null
  bride_family_name: string | null
  contact_name: string | null
  contact_phone: string | null
  story: string | null
}

export type Invitation = {
  status: 'ok'
  family: {
    name: string
    side: string | null
    is_local: boolean | null
    city: string | null
    needs_room: boolean
    rooms_assigned: number | null
    room_numbers: string | null
    members: InviteMember[]
  }
  settings: InviteSettings
  functions: InviteFunction[]
  last_response: { note: string | null; travel: string | null; submitted_at: string } | null
}

export type InviteGate = {
  status: 'not_found' | 'locked' | 'needs_pin' | 'wrong_pin' | 'unavailable'
  hint?: string | null
  family_name?: string | null
  contact?: { name: string | null; phone: string | null } | null
}

export const pinCookieName = (code: string) => `inv_${code.replace(/[^A-Za-z0-9]/g, '').slice(0, 32)}`

/** "Sharma" -> "The Sharma Family"; leaves names that already say family alone. */
export function familyTitle(name: string) {
  const n = name.trim()
  if (/family$/i.test(n)) return /^the\s/i.test(n) ? n : `The ${n}`
  return `The ${n} Family`
}

/** "Sharma" -> "Sharma Family" for greetings ("Dear Sharma Family"). */
export function familyGreetingName(name: string) {
  const n = name.trim()
  return /family$/i.test(n) ? n.replace(/^the\s+/i, '') : `${n} Family`
}

export function eventDateParts(date: string | null) {
  if (!date) return { weekday: '', short: '', long: '' }
  const d = parseEventDate(date)
  return { weekday: format(d, 'EEEE'), short: format(d, 'd MMM'), long: format(d, 'EEEE, d MMMM yyyy') }
}

export function timeLabel(fn: Pick<InviteFunction, 'start_time' | 'end_time' | 'segments'>) {
  if (!fn.start_time) return ''
  return `${formatTime(fn.start_time)} onwards`
}

export function venueLine(fn: Pick<InviteFunction, 'venue_name' | 'location' | 'venue_address'>) {
  return fn.venue_name || fn.location || ''
}

export function mapsUrl(fn: Pick<InviteFunction, 'map_url' | 'venue_name' | 'venue_address' | 'location'>) {
  if (fn.map_url) return fn.map_url
  const q = [fn.venue_name, fn.venue_address || fn.location].filter(Boolean).join(', ')
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
}

/** Google Calendar "add event" link in India time. */
export function calendarUrl(fn: InviteFunction, coupleLine: string) {
  if (!fn.event_date) return null
  const day = fn.event_date.slice(0, 10).replace(/-/g, '')
  const hhmm = (t: string | null) => (t ? t.slice(0, 5).replace(':', '') + '00' : null)
  const start = hhmm(fn.start_time)
  let dates: string
  if (start) {
    const endT = hhmm(fn.end_time)
    // Past-midnight endings and missing ends: give it 3 hours on the same day as a sensible default
    const end = endT && endT > start ? endT : String(Math.min(2359, Number(start.slice(0, 4)) + 300)).padStart(4, '0') + '00'
    dates = `${day}T${start}/${day}T${end}`
  } else {
    const next = parseEventDate(fn.event_date)
    next.setDate(next.getDate() + 1)
    dates = `${day}/${format(next, 'yyyyMMdd')}`
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${fn.name} · ${coupleLine}`,
    dates,
    ctz: 'Asia/Kolkata',
    location: [fn.venue_name, fn.venue_address || fn.location].filter(Boolean).join(', ')
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function rsvpBadge(rsvp: InviteRsvp) {
  if (rsvp?.status === 'confirmed') {
    const n = rsvp.member_ids.length || (rsvp.adults || 0) + (rsvp.kids || 0)
    return { label: n ? `You’re coming · ${n} ${n === 1 ? 'guest' : 'guests'}` : 'You’re coming', tone: 'yes' as const }
  }
  if (rsvp?.status === 'declined') return { label: 'Not attending', tone: 'no' as const }
  return { label: 'Awaiting your reply', tone: 'wait' as const }
}

export function isRsvpClosed(settings: InviteSettings) {
  if (!settings.rsvp_deadline) return false
  const today = format(new Date(), 'yyyy-MM-dd')
  return today > settings.rsvp_deadline
}

export function deadlineLabel(settings: InviteSettings) {
  return settings.rsvp_deadline ? format(parseEventDate(settings.rsvp_deadline), 'd MMMM') : null
}

/** Celebration card colours, cycling through the palette in date order. */
export const EVENT_THEMES = [
  { band: '#F4D9E1', ink: '#6E1F37' },
  { band: '#DDE8C8', ink: '#2F4628' },
  { band: '#FBE3B8', ink: '#6B3F0E' },
  { band: '#5C1A33', ink: '#FFE6A8' },
  { band: '#D7E3F0', ink: '#22385C' }
]
export function themeFor(index: number, total: number) {
  // The last celebration (usually the wedding) gets the deep maroon card
  if (index === total - 1) return EVENT_THEMES[3]
  return EVENT_THEMES[[0, 1, 2, 4][index % 4]]
}
