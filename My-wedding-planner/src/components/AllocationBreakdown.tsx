'use client'

import { useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

interface CategoryStyle {
  bg: string;
  text: string;
}

const emojiColorMap: Record<string, CategoryStyle> = {
  '🏰': { bg: 'bg-slate-600', text: 'text-white' },
  '🍽️': { bg: 'bg-stone-400', text: 'text-stone-900' },
  '🌺': { bg: 'bg-pink-600', text: 'text-white' },
  '📸': { bg: 'bg-blue-800', text: 'text-white' },
  '👗': { bg: 'bg-teal-500', text: 'text-white' },
  '💍': { bg: 'bg-cyan-300', text: 'text-cyan-950' },
  '🎵': { bg: 'bg-indigo-600', text: 'text-white' },
  '🚗': { bg: 'bg-red-600', text: 'text-white' },
  '🎁': { bg: 'bg-amber-300', text: 'text-amber-950' },
  '✨': { bg: 'bg-yellow-400', text: 'text-yellow-950' },
  '🏨': { bg: 'bg-emerald-600', text: 'text-white' },
  '🎉': { bg: 'bg-purple-600', text: 'text-white' },
  '🥇': { bg: 'bg-amber-500', text: 'text-white' },
  '📿': { bg: 'bg-orange-500', text: 'text-white' },
}

const getCategoryStyle = (emoji: string | undefined): CategoryStyle => {
  if (emoji && emojiColorMap[emoji]) return emojiColorMap[emoji]
  
  const fallbackStyles: CategoryStyle[] = [
    { bg: 'bg-fuchsia-600', text: 'text-white' },
    { bg: 'bg-emerald-400', text: 'text-emerald-950' },
    { bg: 'bg-violet-600', text: 'text-white' },
    { bg: 'bg-sky-400', text: 'text-sky-950' },
    { bg: 'bg-rose-500', text: 'text-white' },
    { bg: 'bg-lime-400', text: 'text-lime-950' }
  ]
  
  if (!emoji) return fallbackStyles[0]
  
  let hash = 0
  for (let i = 0; i < emoji.length; i++) {
    hash = emoji.charCodeAt(i) + ((hash << 5) - hash)
  }
  const idx = Math.abs(hash) % fallbackStyles.length
  return fallbackStyles[idx]
}

export function AllocationBreakdown({ 
  masterBudget, 
  totalBudget, 
  categoryStats 
}: { 
  masterBudget: number
  totalBudget: number
  categoryStats: any[] 
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const handleScroll = (id: string) => {
    const el = document.getElementById(`cat-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-4', 'ring-marigold', 'ring-opacity-50', 'scale-[1.02]', 'transition-all', 'duration-500')
      setTimeout(() => {
        el.classList.remove('ring-4', 'ring-marigold', 'ring-opacity-50', 'scale-[1.02]')
      }, 1500)
    }
  }

  const formatLakhs = (val: number) => {
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`
    return `₹${val.toLocaleString('en-IN')}`
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val)
  }

  // Filter categories with positive maxBudget and sort by descending allocation
  const budgetedCategories = [...categoryStats.filter(c => c.maxBudget > 0)].sort(
    (a, b) => b.maxBudget - a.maxBudget
  )

  const isOverAllocated = totalBudget > masterBudget
  const overAllocatedAmount = totalBudget - masterBudget

  // If allocations exceed masterBudget, base percentages on totalBudget so the proportions add up to 100%
  const effectiveBase = isOverAllocated ? totalBudget : masterBudget

  // Smart Tiering: Top 5 major budget drivers
  const shouldBundle = budgetedCategories.length > 6
  const topCategories = shouldBundle ? budgetedCategories.slice(0, 5) : budgetedCategories
  const otherCategories = shouldBundle ? budgetedCategories.slice(5) : []

  const otherTotalBudget = otherCategories.reduce((acc, curr) => acc + curr.maxBudget, 0)
  const otherPct = effectiveBase > 0 ? (otherTotalBudget / effectiveBase) * 100 : 0

  const unallocatedAmount = Math.max(0, masterBudget - totalBudget)
  const unallocatedPct = effectiveBase > 0 ? (unallocatedAmount / effectiveBase) * 100 : 0

  // Filtered other categories for drawer search
  const filteredOtherCategories = otherCategories.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="pt-6 border-t border-marigold/20 relative z-10 animate-in fade-in duration-500 mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-display font-bold text-maroon flex items-center gap-2">
            <span className="p-1.5 bg-marigold/20 rounded-lg leading-none text-xs shadow-sm">🎨</span> Allocation Breakdown
          </h3>
          {isOverAllocated && (
            <span className="bg-rust-red/10 text-rust-red text-[10px] font-bold px-2 py-0.5 rounded-full border border-rust-red/20 shadow-xs animate-pulse">
              🚨 Over Target (+{formatLakhs(overAllocatedAmount)})
            </span>
          )}
        </div>
        <span className="text-xs font-data text-maroon/60 font-medium">
          Planned: {formatLakhs(totalBudget)} of {formatLakhs(masterBudget)} Target
        </span>
      </div>
      
      {/* Visual Multi-Segment Proportional Progress Bar */}
      <div className="relative pt-1 pb-1 mb-4 group/bar">
        <div className="w-full h-8 bg-white rounded-2xl flex overflow-hidden shadow-inner border border-marigold/20" onMouseLeave={() => setHoveredId(null)}>
          {/* Top 5 Slices */}
          {topCategories.map((cat) => {
            const pct = effectiveBase > 0 ? (cat.maxBudget / effectiveBase) * 100 : 0
            const style = getCategoryStyle(cat.emoji)
            const isHovered = hoveredId === cat.id
            const isFaded = hoveredId !== null && hoveredId !== cat.id

            return (
              <div 
                key={cat.id}
                onMouseEnter={() => setHoveredId(cat.id)}
                onClick={() => handleScroll(cat.id)}
                className={`${style.bg} h-full transition-all duration-300 cursor-pointer relative border-r border-ivory/20 ${
                  isHovered ? 'opacity-100 scale-y-125 shadow-lg z-10' : (isFaded ? 'opacity-40 grayscale-[50%]' : 'opacity-90 hover:opacity-100')
                }`}
                style={{ width: `${pct}%` }}
                title={`${cat.name}: ${formatLakhs(cat.maxBudget)} (${Math.round(pct)}%)`}
              >
                {pct > 12 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-[10px] font-bold ${style.text} truncate px-1 transition-opacity ${isFaded ? 'opacity-0' : 'opacity-100'}`}>
                      {cat.name}
                    </span>
                  </div>
                )}
                {/* Tooltip for thin slices on hover */}
                {pct <= 12 && isHovered && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-maroon text-white text-[10px] py-1 px-2 rounded font-bold shadow-lg whitespace-nowrap z-50">
                    {cat.name} • {Math.round(pct)}%
                  </div>
                )}
              </div>
            )
          })}

          {/* Bundled "Other Allotments" Slice */}
          {shouldBundle && otherPct > 0 && (
            <div 
              onMouseEnter={() => setHoveredId('other-bundled')}
              onClick={() => setIsDrawerOpen(true)}
              className={`bg-slate-400 h-full transition-all duration-300 cursor-pointer relative border-r border-ivory/20 ${
                hoveredId === 'other-bundled' ? 'opacity-100 scale-y-125 shadow-lg z-10 bg-slate-500' : (hoveredId !== null ? 'opacity-40 grayscale-[50%]' : 'opacity-85 hover:opacity-100')
              }`}
              style={{ width: `${otherPct}%` }}
              title={`Other Allotments (${otherCategories.length} items): ${formatLakhs(otherTotalBudget)} (${Math.round(otherPct)}%)`}
            >
              {otherPct > 12 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-white truncate px-1">
                    Other ({otherCategories.length})
                  </span>
                </div>
              )}
              {otherPct <= 12 && hoveredId === 'other-bundled' && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-maroon text-white text-[10px] py-1 px-2 rounded font-bold shadow-lg whitespace-nowrap z-50">
                  Other ({otherCategories.length}) • {Math.round(otherPct)}%
                </div>
              )}
            </div>
          )}

          {/* Unallocated Target Slice (Only if within budget) */}
          {!isOverAllocated && unallocatedAmount > 0 && (
            <div 
              className={`bg-gray-200 h-full transition-all duration-300 relative cursor-pointer ${
                hoveredId === 'unallocated' ? 'opacity-100 scale-y-125 shadow-lg z-10 bg-gray-300' : (hoveredId ? 'opacity-40 grayscale-[50%]' : 'opacity-90')
              }`}
              style={{ width: `${unallocatedPct}%` }}
              onMouseEnter={() => setHoveredId('unallocated')}
              onMouseLeave={() => setHoveredId(null)}
              title={`Unallocated Target: ${formatLakhs(unallocatedAmount)} (${Math.round(unallocatedPct)}%)`}
            />
          )}
        </div>
      </div>

      {/* Primary Legend Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3" onMouseLeave={() => setHoveredId(null)}>
        {topCategories.map((cat) => {
          const pct = effectiveBase > 0 ? Math.round((cat.maxBudget / effectiveBase) * 100) : 0
          const style = getCategoryStyle(cat.emoji)
          const isHovered = hoveredId === cat.id
          const isFaded = hoveredId !== null && hoveredId !== cat.id

          return (
            <div 
              key={cat.id} 
              onMouseEnter={() => setHoveredId(cat.id)}
              onClick={() => handleScroll(cat.id)}
              className={`flex items-center space-x-2.5 bg-white p-2.5 rounded-xl border cursor-pointer transition-all duration-300 shadow-sm
                ${isHovered ? 'border-maroon ring-1 ring-maroon/20 scale-[1.02] shadow-md bg-ivory/30' : 'border-marigold/15 hover:border-marigold/40'}
                ${isFaded ? 'opacity-40 grayscale-[30%]' : 'opacity-100'}`}
            >
              <div className={`w-3 h-3 rounded-full ${style.bg} shadow-inner flex-shrink-0 transition-transform duration-300 ${isHovered ? 'scale-125' : ''}`} />
              <div className="flex flex-col min-w-0">
                <span className={`text-xs font-bold truncate transition-colors duration-300 ${isHovered ? 'text-maroon' : 'text-maroon/80'}`}>{cat.name}</span>
                <span className="text-[11px] text-maroon/60 font-data font-medium">{pct}% • Limit: {formatLakhs(cat.maxBudget)}</span>
              </div>
            </div>
          )
        })}

        {/* Bundled "Other Allotments" Card Pill */}
        {shouldBundle && otherCategories.length > 0 && (
          <div 
            onMouseEnter={() => setHoveredId('other-bundled')}
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className={`flex items-center justify-between bg-white p-2.5 rounded-xl border cursor-pointer transition-all duration-300 shadow-sm
              ${hoveredId === 'other-bundled' || isDrawerOpen ? 'border-slate-500 scale-[1.02] shadow-md ring-1 ring-slate-400 bg-slate-50' : 'border-marigold/20 hover:border-slate-400'}
              ${hoveredId && hoveredId !== 'other-bundled' ? 'opacity-40 grayscale-[30%]' : 'opacity-100'}`}
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-3 h-3 rounded-full bg-slate-400 shadow-inner flex-shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-slate-800 truncate">Other ({otherCategories.length} categories)</span>
                <span className="text-[11px] text-slate-600 font-data font-medium">
                  {Math.round(otherPct)}% • Limit: {formatLakhs(otherTotalBudget)}
                </span>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isDrawerOpen ? 'rotate-180 text-maroon' : ''}`} />
          </div>
        )}

        {/* Unallocated OR Over-allocated Card */}
        {isOverAllocated ? (
          <div 
            onMouseEnter={() => setHoveredId('overallocated')}
            className="flex items-center space-x-2.5 bg-rust-red/5 p-2.5 rounded-xl border border-rust-red/30 shadow-sm cursor-pointer"
          >
            <div className="w-3 h-3 rounded-full bg-rust-red shadow-inner flex-shrink-0 animate-pulse" />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold truncate text-rust-red">🚨 Over-Allocated Target</span>
              <span className="text-[11px] text-rust-red font-data font-semibold">
                +{formatCurrency(overAllocatedAmount)} over ₹30L
              </span>
            </div>
          </div>
        ) : unallocatedAmount > 0 ? (
          <div 
            onMouseEnter={() => setHoveredId('unallocated')}
            className={`flex items-center space-x-2.5 bg-white p-2.5 rounded-xl border transition-all duration-300 shadow-sm cursor-pointer
              ${hoveredId === 'unallocated' ? 'border-gray-400 scale-[1.02] shadow-md ring-1 ring-gray-300 bg-gray-50' : 'border-marigold/15 hover:border-marigold/40'}
              ${hoveredId && hoveredId !== 'unallocated' ? 'opacity-40 grayscale-[30%]' : 'opacity-100'}`}
          >
            <div className={`w-3 h-3 rounded-full bg-gray-300 shadow-inner flex-shrink-0 transition-transform duration-300 ${hoveredId === 'unallocated' ? 'scale-125' : ''}`} />
            <div className="flex flex-col min-w-0">
              <span className={`text-xs font-bold truncate transition-colors duration-300 ${hoveredId === 'unallocated' ? 'text-gray-700' : 'text-maroon/80'}`}>Unallocated</span>
              <span className="text-[11px] text-maroon/60 font-data font-medium">
                {Math.round(unallocatedPct)}% • Limit: {formatLakhs(unallocatedAmount)}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Collapsible Other Allotments Drawer */}
      {shouldBundle && isDrawerOpen && (
        <div className="mt-4 pt-4 border-t border-dashed border-marigold/30 space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-data font-bold text-maroon/70">
              📦 Other Categories ({otherCategories.length} items • Total: {formatLakhs(otherTotalBudget)})
            </span>
            {otherCategories.length > 5 && (
              <div className="relative w-full sm:w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-maroon/40" />
                <input
                  type="text"
                  placeholder="Filter category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs bg-white border border-marigold/30 rounded-lg pl-8 pr-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-maroon text-maroon font-data"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {filteredOtherCategories.map((cat) => {
              const pct = effectiveBase > 0 ? (cat.maxBudget / effectiveBase) * 100 : 0
              const style = getCategoryStyle(cat.emoji)
              return (
                <div 
                  key={cat.id} 
                  onClick={() => handleScroll(cat.id)}
                  className="flex items-center space-x-2 bg-ivory/50 hover:bg-white p-2 rounded-xl border border-marigold/20 hover:border-maroon/30 cursor-pointer transition-all shadow-xs"
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${style.bg} flex-shrink-0`} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-maroon truncate">{cat.emoji} {cat.name}</span>
                    <span className="text-[10px] text-maroon/60 font-data">
                      {pct >= 1 ? `${Math.round(pct)}%` : '<1%'} • {formatLakhs(cat.maxBudget)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
