// Time left before the wedding: weekends, holidays and blocked days, for the home page's
// weekend planner. Dates are plain YYYY-MM-DD in India time.

export const WEDDING_DAY = '2027-01-19'
/** First function day; the last weekend before it is the final one for errands */
export const FIRST_FUNCTION_DAY = '2027-01-17'

export type DayNote = { date: string; label: string }

/**
 * Public holidays before the wedding (from published 2026–27 holiday lists; festival dates can
 * shift by a day, so check locally).
 */
export const HOLIDAYS: DayNote[] = [
  { date: '2026-11-24', label: 'Guru Nanak Jayanti' },
  { date: '2026-12-25', label: 'Christmas' },
  { date: '2027-01-01', label: 'New Year (restricted)' },
  { date: '2027-01-13', label: 'Lohri' },
  { date: '2027-01-14', label: 'Makar Sankranti' }
]

/** Days already taken for something else */
export const BLOCKED: DayNote[] = [{ date: '2026-12-15', label: 'Chandan in Muzaffarnagar' }]

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const at = (s: string) => new Date(`${s}T00:00:00Z`)
const addDays = (s: string, n: number) => {
  const d = at(s)
  d.setUTCDate(d.getUTCDate() + n)
  return ymd(d)
}
export const dayDiff = (a: string, b: string) => Math.round((at(b).getTime() - at(a).getTime()) / 86400000)

/** Today in India, as YYYY-MM-DD */
export function todayIST(now = new Date()) {
  return ymd(new Date(now.getTime() + 5.5 * 3600 * 1000))
}

export type Weekend = {
  sat: string
  sun: string
  /** Holidays on the Friday before or the Monday after, or on the weekend itself */
  extra: DayNote[]
  /** Days counted in this weekend's slot: everything after the previous Sunday up to this Sunday */
  from: string
  to: string
  isFinal: boolean
}

/** Weekends left before the first function, each with the span of days it covers. */
export function weekendsLeft(today = todayIST()): Weekend[] {
  const weekends: Weekend[] = []
  // first Saturday on or after today (a Sunday today still counts as this weekend)
  let sat = today
  const dow = at(today).getUTCDay() // 0 Sun … 6 Sat
  if (dow === 0) sat = addDays(today, -1)
  else sat = addDays(today, (6 - dow + 7) % 7)
  let prevSun = addDays(today, -1)
  while (sat < FIRST_FUNCTION_DAY) {
    const sun = addDays(sat, 1)
    const span = [addDays(sat, -1), sat, sun, addDays(sun, 1)]
    weekends.push({
      sat,
      sun,
      extra: HOLIDAYS.filter(h => span.includes(h.date)),
      from: addDays(prevSun, 1),
      to: sun,
      isFinal: false
    })
    prevSun = sun
    sat = addDays(sat, 7)
  }
  if (weekends.length) weekends[weekends.length - 1].isFinal = true
  return weekends
}

/** Days left, weekend days, holidays and working days until the wedding. */
export function timeLeft(today = todayIST()) {
  const days = Math.max(0, dayDiff(today, WEDDING_DAY))
  let weekendDays = 0
  for (let i = 0; i < days; i++) {
    const dow = at(addDays(today, i)).getUTCDay()
    if (dow === 0 || dow === 6) weekendDays++
  }
  const holidays = HOLIDAYS.filter(h => h.date >= today && h.date < WEDDING_DAY)
  const weekdayHolidays = holidays.filter(h => ![0, 6].includes(at(h.date).getUTCDay())).length
  const blocked = BLOCKED.filter(b => b.date >= today && b.date < WEDDING_DAY)
  return {
    days,
    weeks: Math.floor(days / 7),
    weekends: weekendsLeft(today).length,
    weekendDays,
    holidays,
    blocked,
    workingDays: Math.max(0, days - weekendDays - weekdayHolidays)
  }
}

/** "Sat 14 – Sun 15 Nov" */
export function weekendLabel(w: Weekend) {
  const s = at(w.sat)
  const e = at(w.sun)
  const m = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
  return `Sat ${s.getUTCDate()}${m(s) === m(e) ? '' : ` ${m(s)}`} – Sun ${e.getUTCDate()} ${m(e)}`
}

export function shortDay(s: string) {
  return at(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}
