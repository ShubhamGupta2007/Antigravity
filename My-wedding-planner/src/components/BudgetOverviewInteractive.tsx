'use client'

import { useState } from 'react'

export function BudgetOverviewInteractive({ 
  masterBudget, 
  totalBudget, 
  totalSpent,
  categoryStats 
}: { 
  masterBudget: number
  totalBudget: number
  totalSpent: number
  categoryStats: any[] 
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const formatLakhs = (val: number) => {
    if (val >= 100000) return `₹${(val / 100000).toFixed(2)}L`
    return `₹${val.toLocaleString('en-IN')}`
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val)
  }

  // Mathematics for the 3 segments
  const spentPct = masterBudget > 0 ? (totalSpent / masterBudget) * 100 : 0
  const allocatedRemaining = Math.max(0, totalBudget - totalSpent)
  const allocatedRemainingPct = masterBudget > 0 ? (allocatedRemaining / masterBudget) * 100 : 0
  const unallocated = Math.max(0, masterBudget - totalBudget)
  const unallocatedPct = masterBudget > 0 ? (unallocated / masterBudget) * 100 : 0

  const safeToSpend = masterBudget - totalSpent

  return (
    <div className="relative z-10 animate-in fade-in duration-500">
      
      {/* Top Level Summary Numbers */}
      <div className="text-center mb-8">
        <h2 className="text-xs font-data font-bold text-maroon/40 uppercase tracking-widest mb-2">Budget Summary</h2>
        <div className="flex flex-col items-center justify-center">
          <span className="text-[11px] font-data text-mehendi uppercase tracking-widest font-bold mb-1 bg-mehendi/10 px-2 py-0.5 rounded-full border border-mehendi/20">
            ✓ Safe to spend
          </span>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-5xl font-display font-bold text-maroon drop-shadow-sm">{formatCurrency(safeToSpend)}</span>
          </div>
          <span className="text-xs font-data text-maroon/50 mt-2 font-medium">
            (of {formatCurrency(masterBudget)} target)
          </span>
        </div>
      </div>

      {/* Horizontal Multi-Segment Progress Bar */}
      <div className="relative pt-1 pb-1 mb-6 group/bar">
        <div className="w-full h-8 bg-ivory rounded-2xl flex overflow-hidden shadow-inner border border-mehendi/20" onMouseLeave={() => setHoveredId(null)}>
          
          {/* Spent Segment (Red) */}
          {spentPct > 0 && (
            <div 
              className="bg-rust-red h-full transition-all duration-300 relative border-r border-white/20 cursor-pointer hover:opacity-90"
              style={{ width: `${spentPct}%` }}
              onMouseEnter={() => setHoveredId('spent')}
              title={`Spent: ${formatLakhs(totalSpent)}`}
            />
          )}

          {/* Allocated Remaining Segment (Yellow) */}
          {allocatedRemainingPct > 0 && (
            <div 
              className="bg-marigold h-full transition-all duration-300 relative border-r border-white/20 cursor-pointer hover:opacity-90"
              style={{ width: `${allocatedRemainingPct}%` }}
              onMouseEnter={() => setHoveredId('allocated')}
              title={`Allocated & Unspent: ${formatLakhs(allocatedRemaining)}`}
            />
          )}

          {/* Unallocated Segment (Green) */}
          {unallocatedPct > 0 && (
            <div 
              className="bg-mehendi h-full transition-all duration-300 relative cursor-pointer hover:opacity-90"
              style={{ width: `${unallocatedPct}%` }}
              onMouseEnter={() => setHoveredId('unallocated')}
              title={`Unallocated: ${formatLakhs(unallocated)}`}
            />
          )}
        </div>
      </div>

      {/* Clearer Stats Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        
        {/* Spent */}
        <div 
          className={`bg-white rounded-2xl border transition-all duration-300 p-4 flex flex-col justify-center items-center shadow-sm ${hoveredId === 'spent' ? 'border-rust-red ring-1 ring-rust-red/20 scale-[1.02] bg-ivory/30' : 'border-rust-red/20 hover:border-rust-red/50'}`}
          onMouseEnter={() => setHoveredId('spent')}
          onMouseLeave={() => setHoveredId(null)}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rust-red shadow-sm" />
            <span className="text-[11px] font-data text-rust-red/80 uppercase tracking-wider font-bold">Spent</span>
          </div>
          <span className="font-display font-bold text-lg text-rust-red">{formatCurrency(totalSpent)}</span>
        </div>

        {/* Allocated Remaining */}
        <div 
          className={`bg-white rounded-2xl border transition-all duration-300 p-4 flex flex-col justify-center items-center shadow-sm ${hoveredId === 'allocated' ? 'border-marigold ring-1 ring-marigold/30 scale-[1.02] bg-ivory/30' : 'border-marigold/20 hover:border-marigold/50'}`}
          onMouseEnter={() => setHoveredId('allocated')}
          onMouseLeave={() => setHoveredId(null)}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-marigold shadow-sm" />
            <span className="text-[11px] font-data text-maroon/70 uppercase tracking-wider font-bold text-center">Allocated (Left)</span>
          </div>
          <span className="font-display font-bold text-lg text-maroon">{formatCurrency(allocatedRemaining)}</span>
        </div>

        {/* Unallocated */}
        <div 
          className={`bg-white rounded-2xl border transition-all duration-300 p-4 flex flex-col justify-center items-center shadow-sm ${hoveredId === 'unallocated' ? 'border-mehendi ring-1 ring-mehendi/30 scale-[1.02] bg-ivory/30' : 'border-mehendi/30 hover:border-mehendi/60'}`}
          onMouseEnter={() => setHoveredId('unallocated')}
          onMouseLeave={() => setHoveredId(null)}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-mehendi shadow-sm" />
            <span className="text-[11px] font-data text-mehendi/90 uppercase tracking-wider font-bold">Unallocated</span>
          </div>
          <span className={`font-display font-bold text-lg ${unallocated < 0 ? 'text-rust-red' : 'text-mehendi'}`}>
            {formatCurrency(unallocated)}
          </span>
        </div>

      </div>
    </div>
  )
}
