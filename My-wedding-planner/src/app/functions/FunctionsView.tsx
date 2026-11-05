'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { Calendar, MapPin, Users, LayoutGrid, ListOrdered, AlertTriangle, Gift } from 'lucide-react'
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
  plannedGifting: number
  segments: FunctionSegment[]
}

type View = 'timeline' | 'cards'
const VIEW_KEY = 'functions-view'

const sideBadge = (side: FunctionCard['hosting_side']) =>
  side === 'groom'
    ? { cls: 'bg-marigold/20 text-maroon', label: '🤵‍♂️ Groom' }
    : side === 'bride'
      ? { cls: 'bg-rani-pink/10 text-rani-pink', label: '👰‍♀️ Bride' }
      : { cls: 'bg-mehendi/10 text-mehendi', label: '🤝 Joint' }

const timeRange = (start: string | null, end: string | null) =>
  start ? `${formatTime(start)}${end ? ` – ${formatTime(end)}` : ''}` : 'Time TBD'

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
      <div className="inline-flex bg-marigold/10 p-0.5 rounded-lg text-xs font-data" role="tablist" aria-label="Functions view">
        {([
          { id: 'timeline', label: 'Timeline', icon: ListOrdered },
          { id: 'cards', label: 'Cards', icon: LayoutGrid }
        ] as const).map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => changeView(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md transition-all ${view === tab.id ? 'bg-maroon text-ivory shadow-xs font-semibold' : 'text-maroon/70 hover:text-maroon'}`}
          >
            <tab.icon className="w-3.5 h-3.5" /> {tab.label}
          </button>
        ))}
      </div>

      {view === 'cards' ? <CardsView functions={functions} /> : <TimelineView functions={functions} />}
    </div>
  )
}

function CardsView({ functions }: { functions: FunctionCard[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {functions.map(f => {
        const badge = sideBadge(f.hosting_side)
        return (
          <Link key={f.id} href={`/functions/${f.id}`} className="group">
            <div className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-5 hover:border-marigold transition-colors h-full flex flex-col">
              <div className="flex justify-between items-start gap-2 mb-4">
                <h3 className="text-xl font-display font-semibold text-maroon group-hover:text-marigold transition-colors">{f.name}</h3>
                <span className={`text-xs px-2 py-1 rounded-full font-data whitespace-nowrap ${badge.cls}`}>{badge.label}</span>
              </div>
              <div className="space-y-2 mt-auto">
                <div className="flex items-center text-sm font-data text-maroon/70">
                  <Calendar className="w-4 h-4 mr-2 text-marigold" />
                  <span>{format(parseEventDate(f.event_date), 'MMM do, yyyy')}</span>
                  {f.start_time && <span className="ml-2 border-l border-maroon/20 pl-2">{formatTime(f.start_time)}</span>}
                </div>
                {f.location && (
                  <div className="flex items-center text-sm font-data text-maroon/70">
                    <MapPin className="w-4 h-4 mr-2 text-marigold" />
                    <span className="truncate">{f.location}</span>
                  </div>
                )}
                <div className="flex items-center text-sm font-data text-maroon/70 pt-2 border-t border-marigold/10 mt-3">
                  <Users className="w-4 h-4 mr-2 text-marigold" />
                  <span>{f.total} expected</span>
                  {f.total > 0 && <span className="ml-1 text-maroon/50 text-xs">({f.adults} adults{f.kids ? `, ${f.kids} kids` : ''})</span>}
                </div>
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
  const firstDay = dayKeys.length ? parseEventDate(dayKeys[0]) : null

  return (
    <div className="space-y-8">
      {dayKeys.map((key, dayIdx) => {
        const date = parseEventDate(key)
        const dayFns = sortSegments(days.get(key) || [])
        const dayNumber = firstDay ? Math.round((date.getTime() - firstDay.getTime()) / 86400000) + 1 : dayIdx + 1
        const dayGuests = dayFns.reduce((s, f) => s + f.total, 0)

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
          <section key={key} aria-label={format(date, 'EEEE d MMMM yyyy')}>
            <header className="sticky top-0 z-10 bg-ivory/95 backdrop-blur-sm py-2 mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-marigold/30">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-display font-bold text-maroon leading-none">{format(date, 'd')}</span>
                <span className="text-sm font-display font-semibold text-maroon">{format(date, 'MMMM yyyy')}</span>
                <span className="text-sm font-data text-maroon/60">{format(date, 'EEEE')}</span>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-bold text-marigold bg-marigold/10 px-2 py-0.5 rounded-full">Day {dayNumber}</span>
              <span className="ml-auto text-xs font-data text-maroon/60">
                {dayFns.length} {dayFns.length === 1 ? 'function' : 'functions'}{dayGuests > 0 ? ` • ${dayGuests} guests` : ''}
              </span>
            </header>

            <ol className="relative border-l-2 border-marigold/30 ml-3 space-y-5">
              {dayFns.map(f => {
                const badge = sideBadge(f.hosting_side)
                const clashWith = clashes.get(f.id)
                const parts = sortSegments(f.segments)
                return (
                  <li key={f.id} className="ml-5">
                    <span className="absolute -left-[9px] mt-4 w-4 h-4 rounded-full bg-maroon border-[3px] border-ivory shadow" aria-hidden />
                    <Link href={`/functions/${f.id}`} className="group block bg-white rounded-2xl border border-marigold/20 hover:border-marigold shadow-sm transition-colors p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-data font-bold text-maroon/70">{timeRange(f.start_time, f.end_time)}</p>
                          <h3 className="text-lg font-display font-semibold text-maroon group-hover:text-marigold transition-colors">{f.name}</h3>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-data whitespace-nowrap ${badge.cls}`}>{badge.label}</span>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs font-data text-maroon/70">
                        {f.location && <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1 text-marigold" />{f.location}</span>}
                        <span className="flex items-center"><Users className="w-3.5 h-3.5 mr-1 text-marigold" />{f.total} expected{f.total > 0 ? ` (${f.adults} adults${f.kids ? `, ${f.kids} kids` : ''})` : ''}</span>
                        {f.plannedGifting > 0 && <span className="flex items-center"><Gift className="w-3.5 h-3.5 mr-1 text-marigold" />₹{f.plannedGifting.toLocaleString('en-IN')} lifafas</span>}
                      </div>

                      {clashWith && (
                        <p className="mt-2 text-[11px] font-data text-rust-red flex items-center">
                          <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Overlaps with {clashWith.join(', ')}
                        </p>
                      )}

                      {parts.length > 0 && (
                        <ul className="mt-3 pt-3 border-t border-marigold/10 space-y-1.5">
                          {parts.map(p => (
                            <li key={p.id} className="flex gap-3 text-xs font-data">
                              <span className="w-32 shrink-0 text-maroon/60 tabular-nums">{timeRange(p.start_time, p.end_time)}</span>
                              <span className="text-maroon font-medium min-w-0">
                                {p.name}
                                {p.location && <span className="text-maroon/50 font-normal"> • {p.location}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
