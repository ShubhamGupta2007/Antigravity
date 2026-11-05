import { format } from 'date-fns'
import { parseEventDate } from '@/lib/functionPlanning'

export type FamilyShagun = {
  function_id: string
  family_id: string | null
  amount: number | null
  item: string | null
  functions?: { name: string; event_date: string | null } | null
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

/** Totals of what a family gave at each function (cash added up, gifts listed). */
export function summarizeShagun(entries: FamilyShagun[]) {
  const byFunction = new Map<string, { name: string; date: string | null; cash: number; items: string[] }>()
  entries.forEach(e => {
    const key = e.function_id
    const cur = byFunction.get(key) || { name: e.functions?.name || 'Function', date: e.functions?.event_date || null, cash: 0, items: [] }
    cur.cash += Number(e.amount) || 0
    if (e.item) cur.items.push(e.item)
    byFunction.set(key, cur)
  })
  const rows = Array.from(byFunction.values()).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  return { rows, cash: rows.reduce((s, r) => s + r.cash, 0), gifts: rows.reduce((s, r) => s + r.items.length, 0) }
}

/** Compact "gave ₹X" chip for list rows. */
export function ShagunBadge({ entries }: { entries: FamilyShagun[] }) {
  if (!entries.length) return null
  const { cash, gifts } = summarizeShagun(entries)
  return (
    <span
      className="inline-flex items-center text-[9px] font-bold bg-mehendi/10 text-mehendi border border-mehendi/20 px-1.5 py-0.5 rounded"
      title="Shagun this family gave at your functions"
    >
      🪙 gave {cash > 0 ? rupees(cash) : ''}{gifts > 0 ? `${cash > 0 ? ' + ' : ''}${gifts} gift${gifts === 1 ? '' : 's'}` : ''}
    </span>
  )
}

/** Per-function breakdown of shagun a family gave. */
export default function ShagunHistory({ entries }: { entries: FamilyShagun[] }) {
  if (!entries.length) return null
  const { rows, cash } = summarizeShagun(entries)
  return (
    <div className="space-y-1.5">
      <div className="font-bold text-maroon/40 uppercase tracking-wider text-[10px]">
        Shagun they gave us{cash > 0 ? ` • ${rupees(cash)} total` : ''}
      </div>
      <ul className="space-y-1">
        {rows.map(r => (
          <li key={r.name + r.date} className="flex flex-wrap justify-between gap-2 text-xs font-data bg-mehendi/5 border border-mehendi/15 rounded-lg px-2.5 py-1.5">
            <span className="text-maroon font-semibold">
              {r.name}
              {r.date && <span className="font-normal text-maroon/50"> • {format(parseEventDate(r.date), 'd MMM yyyy')}</span>}
            </span>
            <span className="text-maroon">
              {r.cash > 0 && <b>{rupees(r.cash)}</b>}
              {r.items.length > 0 && <span className="text-maroon/70">{r.cash > 0 ? ' + ' : ''}🎁 {r.items.join(', ')}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
