'use client'

import { useState, useMemo } from 'react'

export function ExpenseAnalytics({ expenses, categories, functions }: { expenses: any[], categories: any[], functions: any[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [groupBy, setGroupBy] = useState<'category' | 'function'>('category')

  // Calculate totals based on current grouping
  const data = useMemo(() => {
    if (groupBy === 'category') {
      return categories.map(c => {
        const total = expenses
          .filter(e => e.category_id === c.id)
          .reduce((sum, e) => sum + Number(e.effectiveAmount || e.amount), 0)
        return { id: c.id, name: c.name, emoji: c.emoji || '📦', total }
      }).filter(c => c.total > 0).sort((a, b) => b.total - a.total)
    } else {
      // Group by function
      const fnData = functions.map(f => {
        const total = expenses
          .filter(e => e.function_id === f.id)
          .reduce((sum, e) => sum + Number(e.effectiveAmount || e.amount), 0)
        return { id: f.id, name: f.name, emoji: '✨', total }
      })
      
      // Also calculate 'General' / Unlinked expenses
      const unlinkedTotal = expenses
        .filter(e => !e.function_id)
        .reduce((sum, e) => sum + Number(e.effectiveAmount || e.amount), 0)
        
      if (unlinkedTotal > 0) {
        fnData.push({ id: 'general', name: 'General (Unlinked)', emoji: '💸', total: unlinkedTotal })
      }
      
      return fnData.filter(f => f.total > 0).sort((a, b) => b.total - a.total)
    }
  }, [expenses, categories, functions, groupBy])

  const totalSpent = data.reduce((sum, item) => sum + item.total, 0)
  
  if (totalSpent === 0) return null

  // SVG parameters
  const size = 160
  const center = size / 2
  const strokeWidth = 24
  const radius = center - strokeWidth / 2
  const circumference = 2 * Math.PI * radius

  let currentOffset = 0
  const colors = ['#5C1A33', '#5B7C4F', '#D97706', '#B23A2E', '#0F766E', '#9A3412', '#2563EB', '#DB2777', '#4F46E5']

  const slices = data.map((item, i) => {
    const percent = item.total / totalSpent
    const strokeLength = percent * circumference
    const slice = {
      ...item,
      percent,
      strokeLength,
      strokeDasharray: `${strokeLength} ${circumference}`,
      strokeDashoffset: -currentOffset,
      color: colors[i % colors.length]
    }
    currentOffset += strokeLength
    return slice
  })

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val)
  }

  return (
    <div className="bg-white rounded-2xl border border-marigold/30 p-5 shadow-sm mb-6 flex flex-col animate-in fade-in zoom-in-95 duration-500">
      
      {/* Header and Toggle */}
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-display font-bold text-maroon flex items-center gap-2">
          <span className="p-1.5 bg-marigold/20 rounded-lg leading-none text-xs shadow-sm">📊</span> Spending Breakdown
        </h3>
        
        <div className="flex bg-ivory p-1 rounded-lg border border-marigold/30 text-xs font-data">
          <button 
            onClick={() => setGroupBy('category')}
            className={`px-3 py-1 rounded-md transition-colors ${groupBy === 'category' ? 'bg-maroon text-ivory font-bold shadow-sm' : 'text-maroon/70 hover:text-maroon'}`}
          >
            By Category
          </button>
          <button 
            onClick={() => setGroupBy('function')}
            className={`px-3 py-1 rounded-md transition-colors ${groupBy === 'function' ? 'bg-maroon text-ivory font-bold shadow-sm' : 'text-maroon/70 hover:text-maroon'}`}
          >
            By Function
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
        {/* Donut Chart */}
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90 drop-shadow-sm">
            {slices.map((slice, i) => (
              <circle
                key={slice.id}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={hoveredIndex === i ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={slice.strokeDasharray}
                strokeDashoffset={slice.strokeDashoffset}
                className="transition-all duration-300 ease-out cursor-pointer hover:opacity-90"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            {hoveredIndex !== null ? (
              <>
                <span className="text-xl leading-none mb-1">{slices[hoveredIndex].emoji}</span>
                <span className="text-[9px] font-data text-maroon/60 uppercase tracking-widest max-w-[80px] truncate">{slices[hoveredIndex].name}</span>
                <span className="text-xs font-bold text-maroon mt-0.5">{Math.round(slices[hoveredIndex].percent * 100)}%</span>
              </>
            ) : (
              <>
                <span className="text-[10px] font-data text-maroon/60 uppercase tracking-widest">Total</span>
                <span className="text-sm font-bold text-maroon mt-0.5 font-data">{formatCurrency(totalSpent)}</span>
              </>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 w-full space-y-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
          {slices.map((slice, i) => (
            <div 
              key={slice.id}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`flex justify-between items-center text-sm p-1.5 rounded-lg cursor-pointer transition-colors ${hoveredIndex === i ? 'bg-marigold/10' : 'hover:bg-ivory'}`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: slice.color }} />
                <span className="truncate text-maroon/80 font-medium">{slice.emoji} {slice.name}</span>
              </div>
              <span className="font-bold font-data text-maroon ml-2">{formatCurrency(slice.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
