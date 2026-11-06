'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { MapPin, Users, LayoutGrid, ListOrdered, AlertTriangle, ChevronRight } from 'lucide-react'
import { formatTime, parseEventDate, sortSegments, timeToMinutes, type FunctionSegment } from '@/lib/functionPlanning'

export type FunctionCard = {
  id: string
  name: string
  event_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  hosting_side: 'groom' | 'bride' | 'joint'
  adults: number
  kids: number
  total: number
  families: number
  confirmed: number
  plannedGifting: number
  /** Cash shagun received at this function (hosts only; 0 otherwise). */
  shagunReceived: number
  segments: FunctionSegment[]
  /** Calendar days from today (worked out on the server); negative once it has passed. */
  daysToGo: number
}

type View = 'timeline' | 'cards'
const VIEW_KEY = 'functions-view'

// One colour per hosting side, used for the accent strip and the badge
const SIDE = {
  groom: { label: '🤵‍♂️ Ladkewale', badge: 'bg-marigold/20 text-maroon', strip: 'bg-marigold' },
  bride: { label: '👰‍♀️ Ladkiwale', badge: 'bg-rani-pink/10 text-rani-pink', strip: 'bg-rani-pink' },
  joint: { label: '🤝 Joint', badge: 'bg-mehendi/10 text-mehendi', strip: 'bg-mehendi' }
} as const

const timeRange = (start: string | null, end: string | null) =>
  start ? `${formatTime(start)}${end ? ` – ${formatTime(end)}` : ''}` : 'Time to be set'

const countdown = (d: number) =>
  d < 0 ? { text: 'Done', cls: 'bg-maroon/5 text-maroon/50' }
    : d === 0 ? { text: 'Today', cls: 'bg-maroon text-ivory' }
      : d === 1 ? { text: 'Tomorrow', cls: 'bg-marigold text-[#3A0B20]' }
        : { text: `In ${d} days`, cls: 'bg-marigold/15 text-maroon' }

/** Minutes range for overlap checks; a missing end time is treated as 1 hour. */
function interval(f: FunctionCard) {
  const s = timeToMinutes(f.start_time)
  if (s === null) return null
  let e = timeToMinutes(f.end_time)
  if (e === null) e = s + 60
  if (e <= s) e += 24 * 60 // runs past midnight
  return [s, e] as const
}

export default function FunctionsView({ functions }: { functions: FunctionCard[] }) {
  const [view, setView] = useState<View>('timeline')

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a saved preference after hydration
      if (saved === 'cards' || saved === 'timeline') setView(saved)
    } catch {
      // storage unavailable: keep the default
    }
  }, [])

  const changeView = (next: View) => {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_KEY, next)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-data text-[10px] font-bold uppercase tracking-widest text-maroon/50">All functions</h2>
        <div className="inline-flex rounded-full border border-marigold/30 bg-white p-0.5 font-data text-xs" role="tablist" aria-label="Functions view">
          {([
            { id: 'timeline', label: 'By day', icon: ListOrdered },
            { id: 'cards', label: 'Cards', icon: LayoutGrid }
          ] as const).map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={view === tab.id}
              onClick={() => changeView(tab.id)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-all ${view === tab.id ? 'bg-maroon font-semibold text-ivory' : 'text-maroon/70 hover:text-maroon'}`}
            >
              <tab.icon className="h-3.5 w-3.5" /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'cards' ? <CardsView functions={functions} /> : <TimelineView functions={functions} />}
    </div>
  )
}

/** Guests line: "84 guests · 30 confirmed" */
function Guests({ f }: { f: FunctionCard }) {
  if (f.total === 0) return <span className="text-maroon/40">No guests yet</span>
  return (
    <span>
      {f.total} guests
      {f.confirmed > 0 && <span className="text-mehendi"> · {f.confirmed} confirmed</span>}
    </span>
  )
}

function CardsView({ functions }: { functions: FunctionCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {functions.map(f => {
        const side = SIDE[f.hosting_side] || SIDE.joint
        const cd = countdown(f.daysToGo)
        const date = parseEventDate(f.event_date)
        return (
          <Link
            key={f.id}
            href={`/functions/${f.id}`}
            className={`group relative flex flex-col overflow-hidden rounded-2xl border border-marigold/25 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-marigold hover:shadow-md ${f.daysToGo < 0 ? 'opacity-60' : ''}`}
          >
            <span className={`h-1.5 ${side.strip}`} aria-hidden="true" />
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-xl border border-marigold/30 bg-ivory px-2.5 py-1.5 text-center">
                  <p className="font-data text-[9px] font-bold uppercase text-maroon/60">{format(date, 'MMM')}</p>
                  <p className="font-display text-2xl font-bold leading-none text-maroon">{format(date, 'd')}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-display text-xl font-semibold text-maroon">{f.name}</h3>
                  <p className="font-data text-xs text-maroon/60">{format(date, 'EEEE')} · {timeRange(f.start_time, f.end_time)}</p>
                </div>
              </div>

              <div className="mt-3 space-y-1 font-data text-xs text-maroon/70">
                {f.location && (
                  <p className="flex items-center truncate"><MapPin className="mr-1.5 h-3.5 w-3.5 shrink-0 text-marigold" />{f.location}</p>
                )}
                <p className="flex items-center"><Users className="mr-1.5 h-3.5 w-3.5 shrink-0 text-marigold" /><Guests f={f} /></p>
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                <span className={`rounded-full px-2 py-0.5 font-data text-[10px] font-semibold ${side.badge}`}>{side.label}</span>
                <span className={`rounded-full px-2 py-0.5 font-data text-[10px] font-bold ${cd.cls}`}>{cd.text}</span>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function TimelineView({ functions }: { functions: FunctionCard[] }) {
  // Group by date, then order each day by start time
  const days = new Map<string, FunctionCard[]>()
  functions.forEach(f => {
    const key = f.event_date.slice(0, 10)
    days.set(key, [...(days.get(key) || []), f])
  })
  const dayKeys = Array.from(days.keys()).sort()

  return (
    <div className="space-y-8">
      {dayKeys.map((key, dayIdx) => {
        const date = parseEventDate(key)
        const dayFns = sortSegments(days.get(key) || [])
        const dayNumber = dayIdx + 1
        const past = dayFns.every(f => f.daysToGo < 0)
        const cd = countdown(dayFns[0].daysToGo)

        // Overlapping functions on the same day
        const clashes = new Map<string, string[]>()
        dayFns.forEach((a, i) => {
          const ia = interval(a)
          if (!ia) return
          dayFns.slice(i + 1).forEach(b => {
            const ib = interval(b)
            if (!ib) return
            if (ia[0] < ib[1] && ib[0] < ia[1]) {
              clashes.set(a.id, [...(clashes.get(a.id) || []), b.name])
              clashes.set(b.id, [...(clashes.get(b.id) || []), a.name])
            }
          })
        })

        return (
          <section key={key} aria-label={format(date, 'EEEE d MMMM yyyy')} className={`flex gap-3 sm:gap-5 ${past ? 'opacity-60' : ''}`}>
            {/* Date tile, sticks while scrolling the day */}
            <div className="w-14 shrink-0 sm:w-16">
              <div className="sticky top-3 rounded-2xl bg-maroon px-1 py-2 text-center text-ivory shadow-sm">
                <p className="font-data text-[9px] font-bold uppercase tracking-wider text-[#F2C46D]">Day {dayNumber}</p>
                <p className="font-display text-3xl font-bold leading-none">{format(date, 'd')}</p>
                <p className="font-data text-[10px] uppercase">{format(date, 'MMM')}</p>
                <p className="font-data text-[10px] text-ivory/70">{format(date, 'EEE')}</p>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-center gap-2 pt-1">
                <span className={`rounded-full px-2 py-0.5 font-data text-[10px] font-bold ${cd.cls}`}>{cd.text}</span>
                <span className="font-data text-xs text-maroon/50">
                  {format(date, 'EEEE, d MMMM')} · {dayFns.length} {dayFns.length === 1 ? 'function' : 'functions'}
                </span>
              </div>

              {dayFns.map(f => {
                const side = SIDE[f.hosting_side] || SIDE.joint
                const clashWith = clashes.get(f.id)
                const parts = sortSegments(f.segments)
                return (
                  <Link
                    key={f.id}
                    href={`/functions/${f.id}`}
                    className="group relative block overflow-hidden rounded-2xl border border-marigold/25 bg-white p-4 pl-5 shadow-sm transition hover:border-marigold hover:shadow-md"
                  >
                    <span className={`absolute inset-y-0 left-0 w-1.5 ${side.strip}`} aria-hidden="true" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-data text-xs font-bold text-maroon/60 tabular-nums">{timeRange(f.start_time, f.end_time)}</p>
                        <h3 className="truncate font-display text-2xl font-semibold leading-tight text-maroon">{f.name}</h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className={`rounded-full px-2 py-0.5 font-data text-[10px] font-semibold ${side.badge}`}>{side.label}</span>
                        <ChevronRight className="h-4 w-4 text-maroon/30 transition group-hover:translate-x-0.5" />
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-data text-xs text-maroon/70">
                      {f.location && <span className="flex items-center"><MapPin className="mr-1 h-3.5 w-3.5 text-marigold" />{f.location}</span>}
                      <span className="flex items-center"><Users className="mr-1 h-3.5 w-3.5 text-marigold" /><Guests f={f} /></span>
                      {f.plannedGifting > 0 && <span>🎁 ₹{f.plannedGifting.toLocaleString('en-IN')} lifafas</span>}
                      {f.shagunReceived > 0 && <span className="text-mehendi">🪙 ₹{f.shagunReceived.toLocaleString('en-IN')} received</span>}
                    </div>

                    {clashWith && (
                      <p className="mt-2 flex items-center font-data text-[11px] font-semibold text-rust-red">
                        <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Overlaps with {clashWith.join(', ')}
                      </p>
                    )}

                    {parts.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Parts of the function">
                        {parts.slice(0, 4).map(p => (
                          <li key={p.id} className="rounded-full bg-ivory px-2.5 py-1 font-data text-[11px] text-maroon ring-1 ring-marigold/25">
                            {p.start_time && <span className="font-semibold tabular-nums text-maroon/60">{formatTime(p.start_time)} </span>}
                            {p.name}
                          </li>
                        ))}
                        {parts.length > 4 && (
                          <li className="rounded-full px-2 py-1 font-data text-[11px] text-maroon/50">+{parts.length - 4} more</li>
                        )}
                      </ul>
                    )}
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
