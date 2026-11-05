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

  // Mathematics for the segments & over-allocation
  const isOverAllocated = totalBudget > masterBudget
  const overAllocatedAmount = totalBudget - masterBudget
  const unallocated = Math.max(0, masterBudget - totalBudget)

  // Segment widths relative to the larger of totalBudget or masterBudget
  const denominator = Math.max(masterBudget, totalBudget, 1)
  const spentPct = (totalSpent / denominator) * 100
  const allocatedRemaining = Math.max(0, totalBudget - totalSpent)
  const allocatedRemainingPct = (allocatedRemaining / denominator) * 100
  const unallocatedPct = !isOverAllocated ? (unallocated / denominator) * 100 : 0

  // Target headroom: money left under master target
  const targetRemaining = masterBudget - totalSpent
  const isSpentOverMaster = totalSpent > masterBudget

  return (
    <div className="relative z-10 animate-in fade-in duration-500">
      
      {/* Top Level Summary Numbers */}
      <div className="text-center mb-6">
        <h2 className="text-xs font-data font-bold text-maroon/40 uppercase tracking-widest mb-2">Budget Summary</h2>
        <div className="flex flex-col items-center justify-center">
          <span className={`text-[11px] font-data uppercase tracking-widest font-bold mb-1 px-3 py-0.5 rounded-full border ${
            isSpentOverMaster
              ? 'text-rust-red bg-rust-red/10 border-rust-red/20'
              : isOverAllocated
                ? 'text-amber-700 bg-amber-50 border-amber-300'
                : 'text-mehendi bg-mehendi/10 border-mehendi/20'
          }`}>
            {isSpentOverMaster 
              ? '🚨 Over Master Target' 
              : isOverAllocated 
                ? '⚠️ Remaining Target (Plan Over-Allocated)' 
                : '✓ Safe to spend'}
          </span>

          <div className="flex items-baseline justify-center gap-2">
            <span className={`text-5xl font-sans font-extrabold drop-shadow-sm tracking-tight ${
              isSpentOverMaster 
                ? 'text-rust-red' 
                : isOverAllocated 
                  ? 'text-amber-700' 
                  : 'text-maroon'
            }`}>
              {formatCurrency(targetRemaining)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 mt-2 text-xs font-data">
            <span className="text-maroon/60 font-medium">
              Target: <strong>{formatCurrency(masterBudget)}</strong>
            </span>
            <span className="text-maroon/30">•</span>
            <span className="text-maroon/60 font-medium">
              Planned Categories: <strong className={isOverAllocated ? 'text-rust-red font-bold' : ''}>{formatCurrency(totalBudget)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Over-Allocation Explanatory Warning Banner */}
      {isOverAllocated && (
        <div className="mb-5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left animate-in fade-in">
          <div className="flex items-start sm:items-center space-x-2.5">
            <span className="text-2xl bg-white p-1 rounded-full border border-amber-500/30 flex-shrink-0">⚠️</span>
            <div>
              <span className="font-sans font-bold text-xs text-amber-900 block uppercase tracking-wide">
                Caution: Category Limits Exceed Budget Target by {formatCurrency(overAllocatedAmount)}
              </span>
              <span className="text-[11px] font-data text-maroon/75 leading-relaxed">
                You have {formatCurrency(targetRemaining)} left before reaching your {formatCurrency(masterBudget)} target, but your planned category limits sum to {formatCurrency(totalBudget)}.
              </span>
            </div>
          </div>
          <span className="text-xs font-sans font-bold text-amber-900 bg-white px-2.5 py-1 rounded-full border border-amber-500/30 shadow-xs flex-shrink-0 self-start sm:self-auto">
            +{Math.round((overAllocatedAmount / masterBudget) * 100)}% Over Target
          </span>
        </div>
      )}

      {/* Horizontal Multi-Segment Progress Bar */}
      <div className="relative pt-1 pb-1 mb-6 group/bar">
        <div className="w-full h-8 bg-ivory rounded-2xl flex overflow-hidden shadow-inner border border-marigold/20" onMouseLeave={() => setHoveredId(null)}>
          
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

          {/* Unallocated Segment (Green) - Only appears when within budget */}
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
          className={`bg-white rounded-2xl border transition-all duration-300 p-4 flex flex-col justify-center items-center shadow-sm ${hoveredId === 'spent' ? 'border-rust-red ring-2 ring-rust-red/30 scale-[1.02] bg-rust-red/5' : 'border-rust-red/30 hover:border-rust-red/60'}`}
          onMouseEnter={() => setHoveredId('spent')}
          onMouseLeave={() => setHoveredId(null)}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rust-red shadow-sm" />
            <span className="text-xs font-sans text-rust-red uppercase tracking-wider font-bold">Spent</span>
          </div>
          <span className="font-sans font-extrabold text-2xl text-rust-red tracking-tight">{formatCurrency(totalSpent)}</span>
        </div>

        {/* Allocated Remaining */}
        <div 
          className={`bg-white rounded-2xl border transition-all duration-300 p-4 flex flex-col justify-center items-center shadow-sm ${hoveredId === 'allocated' ? 'border-marigold ring-2 ring-marigold/40 scale-[1.02] bg-marigold/10' : 'border-marigold/40 hover:border-marigold/70'}`}
          onMouseEnter={() => setHoveredId('allocated')}
          onMouseLeave={() => setHoveredId(null)}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-marigold shadow-sm" />
            <span className="text-xs font-sans text-maroon uppercase tracking-wider font-bold text-center">Allocated (Left)</span>
          </div>
          <span className="font-sans font-extrabold text-2xl text-maroon tracking-tight">{formatCurrency(allocatedRemaining)}</span>
        </div>

        {/* Unallocated OR Over-allocated Indicator */}
        <div 
          className={`bg-white rounded-2xl border transition-all duration-300 p-4 flex flex-col justify-center items-center shadow-sm ${
            isOverAllocated
              ? 'border-rust-red ring-2 ring-rust-red/20 bg-rust-red/5'
              : (hoveredId === 'unallocated' ? 'border-mehendi ring-2 ring-mehendi/40 scale-[1.02] bg-mehendi/10' : 'border-mehendi/40 hover:border-mehendi/70')
          }`}
          onMouseEnter={() => setHoveredId(isOverAllocated ? 'overallocated' : 'unallocated')}
          onMouseLeave={() => setHoveredId(null)}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${isOverAllocated ? 'bg-rust-red' : 'bg-mehendi'} shadow-sm`} />
            <span className={`text-xs font-sans uppercase tracking-wider font-bold ${isOverAllocated ? 'text-rust-red' : 'text-mehendi'}`}>
              {isOverAllocated ? '🚨 Over-Allocated' : 'Unallocated'}
            </span>
          </div>
          <span className={`font-sans font-extrabold text-2xl tracking-tight ${isOverAllocated ? 'text-rust-red' : 'text-mehendi'}`}>
            {isOverAllocated ? `+${formatCurrency(overAllocatedAmount)}` : formatCurrency(unallocated)}
          </span>
        </div>

      </div>
    </div>
  )
}
