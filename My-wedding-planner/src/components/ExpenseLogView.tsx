'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, Clock, Pencil, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeleteExpenseButton } from '@/components/DeleteExpenseButton'

interface ExpenseItem {
  id: string
  amount: number
  category_id: string
  sub_item_id?: string | null
  function_id?: string | null
  vendor_quick_name?: string | null
  payment_method?: string | null
  status: 'paid' | 'due'
  due_date?: string | null
  notes?: string | null
  created_at: string
  categories?: { name: string; emoji: string } | null
  category_sub_items?: { name: string } | null
  functions?: { name: string } | null
  expense_splits?: any[]
}

interface ExpenseLogProps {
  expenses: ExpenseItem[]
  activeSide: 'groom' | 'bride' | 'combined'
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount)
}

export function ExpenseLogView({ expenses, activeSide }: ExpenseLogProps) {
  const [expandedVendorKeys, setExpandedVendorKeys] = useState<Record<string, boolean>>({})

  const toggleVendorExpand = (key: string) => {
    setExpandedVendorKeys(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  // Calculate effective amount for a single expense based on user/view side
  const getEffectiveAmount = (e: ExpenseItem) => {
    if (activeSide === 'combined') return Number(e.amount)
    const split = (e.expense_splits || []).find((s: any) => s.side === activeSide)
    return split ? Number(split.amount) : Number(e.amount)
  }

  type VendorGroup = {
    key: string
    vendorName: string
    categoryName: string
    categoryEmoji: string
    functionName?: string | null
    subItemName?: string | null
    totalAmount: number
    paidAmount: number
    dueAmount: number
    items: ExpenseItem[]
    latestDate: string
  }

  const groupsMap: Record<string, VendorGroup> = {}

  expenses.forEach(e => {
    const rawVendor = e.vendor_quick_name?.trim()
    const categoryName = e.categories?.name || 'General'
    const isVendorGeneric = !rawVendor || rawVendor.toLowerCase() === 'generic vendor'
    const isVendorSameAsCategory = rawVendor && rawVendor.toLowerCase() === categoryName.toLowerCase()

    let displayVendor = rawVendor
    if (isVendorGeneric || isVendorSameAsCategory) {
      displayVendor = e.category_sub_items?.name || categoryName
    }

    const catId = e.category_id || 'no-cat'
    const key = `${catId}__${(displayVendor || 'vendor').toLowerCase()}`
    const amt = getEffectiveAmount(e)

    if (!groupsMap[key]) {
      groupsMap[key] = {
        key,
        vendorName: displayVendor || 'Generic Expense',
        categoryName,
        categoryEmoji: e.categories?.emoji || '💸',
        functionName: e.functions?.name,
        subItemName: e.category_sub_items?.name,
        totalAmount: 0,
        paidAmount: 0,
        dueAmount: 0,
        items: [],
        latestDate: e.created_at
      }
    }

    groupsMap[key].items.push(e)
    groupsMap[key].totalAmount += amt
    if (e.status === 'paid') {
      groupsMap[key].paidAmount += amt
    } else {
      groupsMap[key].dueAmount += amt
    }
    if (new Date(e.created_at) > new Date(groupsMap[key].latestDate)) {
      groupsMap[key].latestDate = e.created_at
    }
  })

  // Sort groups by latest transaction date
  const sortedGroups = Object.values(groupsMap).sort((a, b) => 
    new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
  )

  return (
    <div className="space-y-3">
      {sortedGroups.map(group => {
        // Sort items in this group chronologically
        const sortedItems = [...group.items].sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        const isMulti = sortedItems.length > 1
        const isExpanded = isMulti ? (expandedVendorKeys[group.key] ?? true) : false
        const singleItem = sortedItems[0]

        const isSameEventAndCat = group.functionName && group.categoryName && 
          group.functionName.trim().toLowerCase() === group.categoryName.trim().toLowerCase()

        // For single payment items:
        const singleCreatedAt = singleItem?.created_at ? new Date(singleItem.created_at) : null
        const singleDate = singleCreatedAt 
          ? singleCreatedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : null
        const singleTime = singleCreatedAt
          ? singleCreatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
          : null

        return (
          <div 
            key={group.key}
            className="bg-white rounded-2xl shadow-sm border border-marigold/25 hover:border-marigold/60 transition-all overflow-hidden"
          >
            {/* Header Card */}
            <div 
              onClick={() => isMulti && toggleVendorExpand(group.key)}
              className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isMulti ? 'cursor-pointer hover:bg-ivory/30' : ''}`}
            >
              <div className="flex items-center space-x-3.5">
                <span className="text-3xl bg-ivory p-2 rounded-2xl border border-marigold/20 shadow-xs flex-shrink-0">
                  {group.categoryEmoji}
                </span>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-display font-bold text-lg text-maroon leading-tight">
                      {group.vendorName}
                    </span>
                    {isMulti && (
                      <span className="bg-marigold/20 text-maroon text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {sortedItems.length} payments
                      </span>
                    )}
                  </div>
                  
                  {/* Category & Event Badges */}
                  <div className="flex items-center flex-wrap gap-1.5 mt-1 font-data">
                    <span className="inline-flex items-center text-[10px] font-semibold text-maroon/70 bg-marigold/15 border border-marigold/30 px-2 py-0.5 rounded-md">
                      {isSameEventAndCat ? `🎪 ${group.categoryName}` : `${group.categoryEmoji} ${group.categoryName}`}
                    </span>
                    {group.subItemName && group.vendorName !== group.subItemName && (
                      <span className="inline-flex items-center text-[10px] font-medium text-maroon/60 bg-ivory border border-marigold/20 px-2 py-0.5 rounded-md">
                        ↳ {group.subItemName}
                      </span>
                    )}
                    {group.functionName && !isSameEventAndCat && (
                      <span className="inline-flex items-center text-[10px] font-medium text-mehendi bg-mehendi/10 border border-mehendi/20 px-2 py-0.5 rounded-md">
                        🎪 {group.functionName}
                      </span>
                    )}
                  </div>

                  {/* If single item, show timestamp directly on header */}
                  {!isMulti && singleDate && (
                    <div className="flex items-center space-x-2 text-[10px] text-maroon/50 font-data mt-1">
                      <span className="flex items-center">
                        <Calendar className="w-2.5 h-2.5 mr-0.5 text-maroon/40" />
                        {singleDate}
                      </span>
                      <span>•</span>
                      <span className="flex items-center">
                        <Clock className="w-2.5 h-2.5 mr-0.5 text-maroon/40" />
                        {singleTime}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Total Amount & Status */}
              <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-marigold/15">
                <div className="text-left sm:text-right">
                  <span className="text-[10px] font-data text-maroon/50 block font-semibold uppercase tracking-wider">
                    {isMulti ? 'Total Contract' : 'Amount'}
                  </span>
                  <span className="font-sans font-extrabold text-xl text-maroon tracking-tight">
                    {formatCurrency(group.totalAmount)}
                  </span>
                  {isMulti ? (
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-data font-semibold">
                      {group.paidAmount > 0 && (
                        <span className="text-mehendi bg-mehendi/10 px-1.5 py-0.2 rounded">
                          Paid: {formatCurrency(group.paidAmount)}
                        </span>
                      )}
                      {group.dueAmount > 0 && (
                        <span className="text-rust-red bg-rust-red/10 px-1.5 py-0.2 rounded">
                          Due: {formatCurrency(group.dueAmount)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full inline-block mt-0.5 font-bold uppercase font-data ${
                        singleItem.status === 'paid' ? 'bg-mehendi/15 text-mehendi' : 'bg-rust-red/15 text-rust-red'
                      }`}>
                        {singleItem.status}
                      </span>
                    </div>
                  )}
                </div>

                {/* Edit & Delete for Single Item */}
                {!isMulti ? (
                  <div className="flex items-center space-x-1 pl-2">
                    <Link href={`/budget/${singleItem.id}/edit`}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-maroon/50 hover:text-maroon hover:bg-marigold/20" title="Edit Expense">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                    <DeleteExpenseButton 
                      expenseId={singleItem.id} 
                      vendorName={group.vendorName} 
                    />
                  </div>
                ) : (
                  <button 
                    type="button"
                    className="p-1.5 rounded-full text-maroon/60 hover:bg-marigold/20 ml-1 transition-colors"
                    aria-label="Toggle details"
                  >
                    <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>
            </div>

            {/* Single item notes / due details if present */}
            {!isMulti && (singleItem.notes || (singleItem.status === 'due' && singleItem.due_date)) && (
              <div className="text-xs font-data text-maroon/65 px-4 py-2 bg-ivory/30 border-t border-marigold/10 flex justify-between items-center">
                <span className="truncate max-w-[280px] italic">{singleItem.notes || `Paid via ${singleItem.payment_method}`}</span>
                {singleItem.status === 'due' && singleItem.due_date && (
                  <span className="text-[10px] font-semibold text-rust-red bg-rust-red/5 px-2 py-0.5 rounded border border-rust-red/20">
                    Due: {new Date(singleItem.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            )}

            {/* Multi-part Installments Breakdown */}
            {isMulti && isExpanded && (
              <div className="bg-ivory/40 border-t border-marigold/20 p-3.5 space-y-2.5 animate-in slide-in-from-top-1 duration-150">
                <span className="text-[10px] font-data uppercase tracking-wider font-bold text-maroon/50 block px-1">
                  Payment Plan Breakdown ({sortedItems.length} installments)
                </span>

                {sortedItems.map((item, idx) => {
                  const createdAtDate = item.created_at ? new Date(item.created_at) : null
                  const formattedDate = createdAtDate 
                    ? createdAtDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : null
                  const amt = getEffectiveAmount(item)
                  const noteLabel = item.notes?.split('-')[0]?.trim() || `Installment #${idx + 1}`

                  return (
                    <div 
                      key={item.id}
                      className="bg-white p-3 rounded-xl border border-marigold/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-maroon font-data">
                            #{idx + 1} {noteLabel}
                          </span>
                          <span className={`text-[9px] px-2 py-0.2 rounded-full font-bold uppercase font-data ${
                            item.status === 'paid' ? 'bg-mehendi/15 text-mehendi' : 'bg-rust-red/15 text-rust-red'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-[10px] text-maroon/60 font-data">
                          {formattedDate && (
                            <span className="flex items-center">
                              <Calendar className="w-2.5 h-2.5 mr-0.5 text-maroon/40" />
                              {formattedDate}
                            </span>
                          )}
                          <span>•</span>
                          <span>via {item.payment_method || 'bank_transfer'}</span>
                          {item.status === 'due' && item.due_date && (
                            <span className="text-rust-red font-semibold bg-rust-red/10 px-1 rounded">
                              Target: {new Date(item.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end space-x-2.5 border-t sm:border-t-0 pt-1.5 sm:pt-0 border-marigold/10">
                        <span className="font-sans font-bold text-maroon text-base">
                          {formatCurrency(amt)}
                        </span>
                        <div className="flex items-center space-x-1">
                          <Link href={`/budget/${item.id}/edit`}>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-maroon/50 hover:text-maroon hover:bg-marigold/20" title="Edit Installment">
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </Link>
                          <DeleteExpenseButton 
                            expenseId={item.id} 
                            vendorName={group.vendorName} 
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
