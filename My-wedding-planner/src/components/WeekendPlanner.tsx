import Link from 'next/link'
import { BLOCKED, HOLIDAYS, shortDay, timeLeft, todayIST, weekendLabel, weekendsLeft } from '@/lib/planCalendar'

export type PlannerTask = { id: string; title: string; deadline: string | null; priority_tier: string; status: string }

const DOT: Record<string, string> = {
  urgent: 'bg-rust-red',
  must_have: 'bg-marigold',
  good_to_have: 'bg-mehendi',
  if_time_permits: 'bg-maroon/30'
}

/**
 * How much time is left (days, weekends, holidays, blocked days) and every open task placed
 * under the weekend it has to be done by.
 */
export default function WeekendPlanner({ tasks }: { tasks: PlannerTask[] }) {
  const today = todayIST()
  const t = timeLeft(today)
  const weekends = weekendsLeft(today)
  const open = tasks.filter(x => x.status !== 'done' && x.deadline)
  const overdue = open.filter(x => x.deadline!.slice(0, 10) < today).sort((a, b) => a.deadline!.localeCompare(b.deadline!))
  const noDate = tasks.filter(x => x.status !== 'done' && !x.deadline).length

  return (
    <section className="mt-10 w-full">
      {/* Time left */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { v: t.days, l: 'days left' },
          { v: t.weekends, l: t.weekends === 1 ? 'weekend left' : 'weekends left' },
          { v: t.holidays.length, l: t.holidays.length === 1 ? 'holiday' : 'holidays' },
          { v: t.workingDays, l: 'working days' }
        ].map(x => (
          <div key={x.l} className="rounded-2xl border border-marigold/25 bg-white px-4 py-3 text-center shadow-sm">
            <p className="font-display text-3xl font-bold leading-none text-maroon">{x.v}</p>
            <p className="mt-1 font-data text-[11px] uppercase tracking-wide text-maroon/60">{x.l}</p>
          </div>
        ))}
      </div>
      {(t.holidays.length > 0 || t.blocked.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 font-data text-[11px]">
          {t.holidays.map(h => <span key={h.date} className="rounded-full bg-mehendi/10 px-2.5 py-1 text-mehendi">🎉 {shortDay(h.date)} · {h.label}</span>)}
          {t.blocked.map(b => <span key={b.date} className="rounded-full bg-rust-red/10 px-2.5 py-1 text-rust-red">🚫 {shortDay(b.date)} · {b.label}</span>)}
        </div>
      )}

      {/* Weekend by weekend */}
      <div className="mt-8 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-maroon md:text-2xl">Weekend planner</h2>
        <Link href="/tasks/add" className="font-data text-xs font-semibold text-maroon underline decoration-marigold/50 underline-offset-4">+ Add a task</Link>
      </div>
      <p className="mt-1 font-data text-xs text-maroon/60">
        Every open task sits under the weekend it has to be done by.{noDate > 0 ? ` ${noDate} task${noDate === 1 ? ' has' : 's have'} no date yet.` : ''}
      </p>

      {overdue.length > 0 && (
        <div className="mt-4 rounded-2xl border border-rust-red/30 bg-rust-red/5 p-4">
          <p className="font-data text-xs font-bold uppercase tracking-wide text-rust-red">Overdue · {overdue.length}</p>
          <ul className="mt-2 space-y-1.5">
            {overdue.map(x => (
              <li key={x.id} className="flex items-center gap-2 font-data text-sm text-maroon">
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[x.priority_tier] || 'bg-maroon/30'}`} />
                <span className="min-w-0 flex-1 truncate">{x.title}</span>
                <span className="shrink-0 text-[11px] text-rust-red">{shortDay(x.deadline!.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="relative mt-4 space-y-3 border-l-2 border-marigold/30 pl-5">
        {weekends.map((w, i) => {
          const due = open
            .filter(x => { const d = x.deadline!.slice(0, 10); return d >= w.from && d <= w.to && d >= today })
            .sort((a, b) => a.deadline!.localeCompare(b.deadline!))
          const notes = [
            ...HOLIDAYS.filter(h => h.date >= w.from && h.date <= w.to).map(h => ({ ...h, kind: 'holiday' as const })),
            ...BLOCKED.filter(b => b.date >= w.from && b.date <= w.to).map(b => ({ ...b, kind: 'blocked' as const }))
          ]
          const long = w.extra.some(h => h.date < w.sat || h.date > w.sun)
          return (
            <li key={w.sat} className="relative">
              <span className={`absolute -left-[27px] top-3 h-3 w-3 rounded-full border-2 border-ivory ${due.length ? 'bg-maroon' : 'bg-marigold/50'}`} aria-hidden="true" />
              <div className={`rounded-2xl border bg-white p-4 shadow-sm ${w.isFinal ? 'border-maroon/40' : 'border-marigold/25'}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-lg font-semibold text-maroon">
                    {weekendLabel(w)}
                    <span className="ml-2 font-data text-[11px] font-normal text-maroon/50">Weekend {i + 1}</span>
                  </p>
                  <div className="flex flex-wrap gap-1 font-data text-[10px] font-bold">
                    {long && <span className="rounded-full bg-mehendi/15 px-2 py-0.5 text-mehendi">Long weekend</span>}
                    {w.isFinal && <span className="rounded-full bg-maroon px-2 py-0.5 text-ivory">Last one · Engagement Sunday</span>}
                    {due.length > 0 && <span className="rounded-full bg-marigold/20 px-2 py-0.5 text-maroon">{due.length} to do</span>}
                  </div>
                </div>
                {notes.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 font-data text-[11px]">
                    {notes.map(n => (
                      <span key={n.date} className={n.kind === 'holiday' ? 'text-mehendi' : 'font-semibold text-rust-red'}>
                        {n.kind === 'holiday' ? '🎉' : '🚫'} {shortDay(n.date)} · {n.label}
                      </span>
                    ))}
                  </div>
                )}
                {due.length === 0 ? (
                  <p className="mt-2 font-data text-xs italic text-maroon/40">Nothing due. A free weekend.</p>
                ) : (
                  <ul className="mt-2.5 space-y-1.5">
                    {due.map(x => (
                      <li key={x.id} className="flex items-start gap-2 font-data text-sm text-maroon">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[x.priority_tier] || 'bg-maroon/30'}`} />
                        <span className="min-w-0 flex-1">{x.title}</span>
                        <span className="shrink-0 pt-0.5 text-[11px] text-maroon/50">by {shortDay(x.deadline!.slice(0, 10)).split(',')[0]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 font-data text-[10px] text-maroon/40">Holidays from published 2026–27 lists; festival dates can shift by a day.</p>
    </section>
  )
}
