'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Filter, Check, ChevronDown, X } from 'lucide-react'

interface CategoryOption {
  id: string
  name: string
  emoji: string
  count: number
}

interface CategoryFilterDropdownProps {
  categories: CategoryOption[]
  selectedCategoryIds: string[]
  activeSide: string
  totalExpensesCount: number
}

export function CategoryFilterDropdown({
  categories,
  selectedCategoryIds,
  activeSide,
  totalExpensesCount
}: CategoryFilterDropdownProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const updateUrl = (newSelectedIds: string[]) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('viewSide', activeSide)
    params.set('tab', 'expenses')
    if (newSelectedIds.length > 0) {
      params.set('categories', newSelectedIds.join(','))
    } else {
      params.delete('categories')
    }
    // Also clean up singular 'category' if present
    params.delete('category')
    router.push(`?${params.toString()}`)
  }

  const handleToggleCategory = (catId: string) => {
    let next: string[]
    if (selectedCategoryIds.includes(catId)) {
      next = selectedCategoryIds.filter(id => id !== catId)
    } else {
      next = [...selectedCategoryIds, catId]
    }
    updateUrl(next)
  }

  const handleSelectAll = () => {
    updateUrl([])
    setIsOpen(false)
  }

  const isAllSelected = selectedCategoryIds.length === 0

  // Display label on the dropdown button
  let buttonLabel = `✨ All Categories (${totalExpensesCount})`
  if (selectedCategoryIds.length === 1) {
    const single = categories.find(c => c.id === selectedCategoryIds[0])
    if (single) buttonLabel = `${single.emoji} ${single.name} (${single.count})`
  } else if (selectedCategoryIds.length > 1) {
    buttonLabel = `📌 ${selectedCategoryIds.length} Categories Selected`
  }

  return (
    <div className="bg-white p-3 rounded-2xl border border-marigold/30 shadow-sm space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs font-data text-maroon/70">
          <Filter className="w-4 h-4 text-maroon/50 flex-shrink-0" />
          <span className="font-semibold text-maroon">Filter Categories:</span>
          <span className="text-[11px] text-maroon/50">(select one or multiple)</span>
        </div>

        {/* Dropdown Box */}
        <div className="relative flex-1 sm:max-w-xs" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between bg-ivory border border-marigold/40 rounded-xl px-3.5 py-2 text-xs font-data font-medium text-maroon focus:outline-none focus:ring-2 focus:ring-maroon/20 focus:border-maroon transition-all shadow-inner hover:border-maroon/50"
          >
            <span className="truncate pr-2">{buttonLabel}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-maroon/60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu Popup */}
          {isOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-marigold/30 rounded-2xl shadow-xl z-50 max-h-72 overflow-y-auto p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-100">
              {/* Option: All */}
              <button
                type="button"
                onClick={handleSelectAll}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-data transition-colors ${
                  isAllSelected
                    ? 'bg-maroon/10 text-maroon font-bold'
                    : 'text-maroon/70 hover:bg-marigold/10 hover:text-maroon'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${isAllSelected ? 'bg-maroon border-maroon text-ivory' : 'border-maroon/30 bg-white'}`}>
                    {isAllSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span>✨ All Categories</span>
                </div>
                <span className="text-[10px] text-maroon/50 font-semibold">{totalExpensesCount}</span>
              </button>

              <div className="border-t border-marigold/20 my-1" />

              {/* Category Checkbox Options */}
              {categories.map(cat => {
                const isChecked = selectedCategoryIds.includes(cat.id)
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleToggleCategory(cat.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-data transition-colors ${
                      isChecked
                        ? 'bg-maroon/10 text-maroon font-bold'
                        : 'text-maroon/70 hover:bg-marigold/10 hover:text-maroon'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate pr-2">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isChecked ? 'bg-maroon border-maroon text-ivory' : 'border-maroon/30 bg-white'}`}>
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="text-base leading-none">{cat.emoji}</span>
                      <span className="truncate">{cat.name}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${isChecked ? 'bg-maroon text-ivory' : 'bg-marigold/15 text-maroon/70'}`}>
                      {cat.count}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Selected category pill chips (if any filtered) */}
      {!isAllSelected && (
        <div className="flex items-center flex-wrap gap-1.5 pt-1.5 border-t border-marigold/15 text-xs font-data">
          <span className="text-[10px] text-maroon/50 font-semibold uppercase mr-1">Active:</span>
          {selectedCategoryIds.map(id => {
            const cat = categories.find(c => c.id === id)
            if (!cat) return null
            return (
              <span
                key={id}
                className="inline-flex items-center space-x-1 bg-maroon/10 border border-maroon/20 text-maroon px-2 py-0.5 rounded-full text-[11px] font-semibold"
              >
                <span>{cat.emoji}</span>
                <span>{cat.name}</span>
                <button
                  type="button"
                  onClick={() => handleToggleCategory(id)}
                  className="hover:text-rust-red ml-1"
                  title="Remove filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )
          })}
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-[10px] text-rust-red hover:underline ml-auto font-semibold"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
