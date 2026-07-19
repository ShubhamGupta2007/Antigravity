'use client'

import { useState } from 'react'

interface CategoryStyle {
  bg: string;
  text: string;
}

const emojiColorMap: Record<string, CategoryStyle> = {
  '🏰': { bg: 'bg-slate-600', text: 'text-white' },
  '🍽️': { bg: 'bg-stone-300', text: 'text-stone-900' },
  '🌺': { bg: 'bg-pink-600', text: 'text-white' },
  '📸': { bg: 'bg-blue-800', text: 'text-white' },
  '👗': { bg: 'bg-teal-500', text: 'text-white' },
  '💍': { bg: 'bg-cyan-200', text: 'text-cyan-900' },
  '🎵': { bg: 'bg-indigo-600', text: 'text-white' },
  '🚗': { bg: 'bg-red-600', text: 'text-white' },
  '🎁': { bg: 'bg-amber-300', text: 'text-amber-950' },
  '✨': { bg: 'bg-yellow-300', text: 'text-yellow-950' },
}

const getCategoryStyle = (emoji: string | undefined): CategoryStyle => {
  if (emoji && emojiColorMap[emoji]) return emojiColorMap[emoji]
  
  const fallbackStyles: CategoryStyle[] = [
    { bg: 'bg-fuchsia-600', text: 'text-white' },
    { bg: 'bg-emerald-300', text: 'text-emerald-950' },
    { bg: 'bg-violet-600', text: 'text-white' },
    { bg: 'bg-sky-200', text: 'text-sky-950' },
    { bg: 'bg-rose-500', text: 'text-white' },
    { bg: 'bg-lime-300', text: 'text-lime-950' }
  ]
  
  if (!emoji) return fallbackStyles[0]
  
  // Deterministic fallback based on emoji char code
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
    return `₹${val.toLocaleString('en-IN')}`
  }

  return (
    <div className="pt-6 border-t border-marigold/20 relative z-10 animate-in fade-in duration-500 mt-6">
      <h3 className="text-sm font-display font-bold text-maroon flex items-center gap-2 mb-4">
        <span className="p-1.5 bg-marigold/20 rounded-lg leading-none text-xs shadow-sm">🎨</span> Allocation Breakdown
      </h3>
      
      <div className="relative pt-1 pb-1 mb-4 group/bar">
        <div className="w-full h-8 bg-white rounded-2xl flex overflow-hidden shadow-inner border border-marigold/20" onMouseLeave={() => setHoveredId(null)}>
          {categoryStats.filter(c => c.maxBudget > 0).map((cat, idx) => {
            const pct = (cat.maxBudget / masterBudget) * 100
            const style = getCategoryStyle(cat.emoji)
            const isHovered = hoveredId === cat.id
            const isFaded = hoveredId !== null && hoveredId !== cat.id

            return (
              <div 
                key={cat.id}
                onMouseEnter={() => setHoveredId(cat.id)}
                onClick={() => handleScroll(cat.id)}
                className={`${style.bg} h-full transition-all duration-300 cursor-pointer relative border-r border-ivory/20 ${isHovered ? 'opacity-100 scale-y-125 shadow-lg z-10' : (isFaded ? 'opacity-40 grayscale-[50%]' : 'opacity-90 hover:opacity-100')}`}
                style={{ width: `${pct}%` }}
                title={`${cat.name}: ${formatLakhs(cat.maxBudget)}`}
              >
                {pct > 15 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-[10px] font-bold ${style.text} truncate px-1 transition-opacity ${isFaded ? 'opacity-0' : 'opacity-100'}`}>{cat.name}</span>
                  </div>
                )}
                {/* Floating tooltip on hover if small percent */}
                {pct <= 15 && isHovered && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-maroon text-white text-[10px] py-1 px-2 rounded font-bold shadow-lg whitespace-nowrap z-50">
                    {cat.name}
                  </div>
                )}
              </div>
            )
          })}
          {Math.max(0, masterBudget - totalBudget) > 0 && (
            <div 
              className={`bg-gray-200 h-full transition-all duration-300 relative cursor-pointer ${hoveredId === 'unallocated' ? 'opacity-100 scale-y-125 shadow-lg z-10 bg-gray-300' : (hoveredId ? 'opacity-40 grayscale-[50%]' : 'opacity-90')}`}
              style={{ width: `${(Math.max(0, masterBudget - totalBudget) / masterBudget) * 100}%` }}
              onMouseEnter={() => setHoveredId('unallocated')}
              onMouseLeave={() => setHoveredId(null)}
              title={`Unallocated: ${formatLakhs(Math.max(0, masterBudget - totalBudget))}`}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3" onMouseLeave={() => setHoveredId(null)}>
        {categoryStats.filter(c => c.maxBudget > 0).map((cat, idx) => {
          const pct = masterBudget > 0 ? Math.round((cat.maxBudget / masterBudget) * 100) : 0
          const style = getCategoryStyle(cat.emoji)
          const isHovered = hoveredId === cat.id
          const isFaded = hoveredId !== null && hoveredId !== cat.id

          return (
            <div 
              key={cat.id} 
              onMouseEnter={() => setHoveredId(cat.id)}
              onClick={() => handleScroll(cat.id)}
              className={`flex items-center space-x-2.5 bg-white p-2 rounded-xl border cursor-pointer transition-all duration-300 shadow-sm
                ${isHovered ? 'border-maroon ring-1 ring-maroon/20 scale-[1.02] shadow-md bg-ivory/30' : 'border-marigold/15 hover:border-marigold/40'}
                ${isFaded ? 'opacity-40 grayscale-[30%]' : 'opacity-100'}`}
            >
              <div className={`w-2.5 h-2.5 rounded-full ${style.bg} shadow-inner flex-shrink-0 transition-transform duration-300 ${isHovered ? 'scale-150' : ''}`} />
              <div className="flex flex-col min-w-0">
                <span className={`text-xs font-bold truncate transition-colors duration-300 ${isHovered ? 'text-maroon' : 'text-maroon/80'}`}>{cat.name}</span>
                <span className="text-[10px] text-maroon/60 font-data">{pct}% • Limit: {formatLakhs(cat.maxBudget)}</span>
              </div>
            </div>
          )
        })}
        {Math.max(0, masterBudget - totalBudget) > 0 && (
          <div 
            onMouseEnter={() => setHoveredId('unallocated')}
            className={`flex items-center space-x-2.5 bg-white p-2 rounded-xl border transition-all duration-300 shadow-sm cursor-pointer
              ${hoveredId === 'unallocated' ? 'border-gray-400 scale-[1.02] shadow-md ring-1 ring-gray-300 bg-gray-50' : 'border-marigold/15 hover:border-marigold/40'}
              ${hoveredId && hoveredId !== 'unallocated' ? 'opacity-40 grayscale-[30%]' : 'opacity-100'}`}
          >
            <div className={`w-2.5 h-2.5 rounded-full bg-gray-300 shadow-inner flex-shrink-0 transition-transform duration-300 ${hoveredId === 'unallocated' ? 'scale-150' : ''}`} />
            <div className="flex flex-col min-w-0">
              <span className={`text-xs font-bold truncate transition-colors duration-300 ${hoveredId === 'unallocated' ? 'text-gray-700' : 'text-maroon/80'}`}>Unallocated Target</span>
              <span className="text-[10px] text-maroon/60 font-data">
                {Math.round((Math.max(0, masterBudget - totalBudget) / masterBudget) * 100)}% • Limit: {formatLakhs(Math.max(0, masterBudget - totalBudget))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
