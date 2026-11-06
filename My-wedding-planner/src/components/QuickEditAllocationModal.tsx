'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface SubItem {
  id?: string
  category_id: string
  name: string
  target_budget: number
  is_auto?: boolean | null
}

interface QuickEditAllocationModalProps {
  categoryId: string
  categoryName: string
  categoryEmoji: string
  currentLimit: number
  currentDescription: string
  subItems: SubItem[]
  activeSide: string
}

export function QuickEditAllocationModal({
  categoryId,
  categoryName,
  categoryEmoji,
  currentLimit,
  currentDescription,
  subItems,
  activeSide
}: QuickEditAllocationModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [limit, setLimit] = useState<number>(currentLimit)
  const [description, setDescription] = useState(currentDescription || '')
  // Auto-managed lines (e.g. "Lifafas & Gifts") are shown read-only and never edited here
  const autoItems = (subItems || []).filter(s => s.is_auto)
  const editableSubItems = (subItems || []).filter(s => !s.is_auto)
  const [items, setItems] = useState<SubItem[]>(editableSubItems)
  const [saving, setSaving] = useState(false)
  
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  const handleOpen = () => {
    setLimit(currentLimit)
    setDescription(currentDescription || '')
    setItems(editableSubItems)
    setIsOpen(true)
  }

  const handleClose = () => {
    setIsOpen(false)
  }

  // Calculate sum of sub-items and check if it exceeds limit
  const subItemsTotal = [...autoItems, ...items].reduce((acc, curr) => acc + (Number(curr.target_budget) || 0), 0)
  const isSubOver = Number(limit) > 0 && subItemsTotal > Number(limit)
  const subOverAmount = isSubOver ? subItemsTotal - Number(limit) : 0

  const handleAddSubItem = () => {
    setItems([
      ...items,
      {
        category_id: categoryId,
        name: '',
        target_budget: 0
      }
    ])
  }

  const handleRemoveSubItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const handleUpdateSubItem = (idx: number, field: 'name' | 'target_budget', val: any) => {
    setItems(items.map((item, i) => i === idx ? { ...item, [field]: val } : item))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const targetSide = activeSide === 'combined' ? 'groom' : activeSide

      // 1. Update / upsert category budget
      const { error: budgetErr } = await supabase
        .from('category_budgets')
        .upsert(
          {
            category_id: categoryId,
            side: targetSide,
            max_budget: Number(limit) || 0
          },
          { onConflict: 'category_id,side' }
        )

      if (budgetErr) throw budgetErr

      // 2. Update category description
      const { error: catErr } = await supabase
        .from('categories')
        .update({ description })
        .eq('id', categoryId)

      if (catErr) throw catErr

      // 3. Sync sub-items: remove deleted, upsert modified
      const { data: existingSubItems } = await supabase
        .from('category_sub_items')
        .select('id')
        .eq('category_id', categoryId)
        .eq('is_auto', false)

      const existingIds = (existingSubItems || []).map(s => s.id)
      const currentIds = items.filter(s => !!s.id).map(s => s.id)
      const toDeleteIds = existingIds.filter(id => !currentIds.includes(id))

      if (toDeleteIds.length > 0) {
        await supabase.from('category_sub_items').delete().in('id', toDeleteIds)
      }

      for (const item of items) {
        if (!item.name.trim()) continue
        if (item.id) {
          await supabase
            .from('category_sub_items')
            .update({
              name: item.name.trim(),
              target_budget: Number(item.target_budget) || 0
            })
            .eq('id', item.id)
        } else {
          await supabase
            .from('category_sub_items')
            .insert({
              category_id: categoryId,
              name: item.name.trim(),
              target_budget: Number(item.target_budget) || 0
            })
        }
      }

      toast.success(`Updated limit & details for ${categoryName}!`)
      setIsOpen(false)
      router.refresh()
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Failed to update allocation')
    } finally {
      setSaving(false)
    }
  }

  const formatLakhs = (val: number) => {
    if (val >= 100000) return `₹${(val / 100000).toFixed(2)}L`
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`
    return `₹${val}`
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center space-x-1 text-xs font-data font-semibold text-maroon/70 hover:text-maroon bg-marigold/10 hover:bg-marigold/20 px-2.5 py-1 rounded-full border border-marigold/25 transition-colors shadow-sm"
        title="Edit allocation limit & itemized sub-budgets"
      >
        <Pencil className="w-3 h-3 text-maroon/60" />
        <span>Edit Allocation</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-marigold/40 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-marigold/20">
              <div className="flex items-center space-x-3">
                <span className="text-3xl p-2 bg-ivory rounded-2xl border border-marigold/30 shadow-inner">
                  {categoryEmoji}
                </span>
                <div>
                  <h3 className="font-display font-bold text-lg text-maroon">{categoryName}</h3>
                  <p className="text-xs font-data text-maroon/60">
                    Adjust spending limit & breakdown ({activeSide === 'combined' ? 'Combined' : activeSide.toUpperCase()})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="text-maroon/50 hover:text-maroon p-1.5 rounded-full hover:bg-marigold/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Category Spending Limit */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="cat-limit" className="text-xs font-bold text-maroon">
                    Category Spending Limit (₹)
                  </Label>
                  <span className="text-xs font-data font-bold text-maroon bg-marigold/15 px-2 py-0.5 rounded-full">
                    {formatLakhs(Number(limit) || 0)}
                  </span>
                </div>
                <Input
                  id="cat-limit"
                  type="number"
                  min="0"
                  step="any"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  placeholder="e.g. 500000"
                  className="bg-ivory border-marigold/50 text-base font-bold font-data text-maroon"
                />
              </div>

              {/* Notes & Description */}
              <div className="space-y-1.5">
                <Label htmlFor="cat-desc" className="text-xs font-bold text-maroon">
                  Notes & Details
                </Label>
                <textarea
                  id="cat-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Notes, scope, specific vendor agreements, etc."
                  className="w-full text-xs font-data bg-ivory border border-marigold/50 rounded-xl p-3 text-maroon focus:outline-none focus:ring-2 focus:ring-maroon/20"
                />
              </div>

              {/* Itemized Sub-Budgets */}
              <div className="space-y-2 pt-2 border-t border-marigold/15">
                <div className="flex justify-between items-center">
                  <div>
                    <Label className="text-xs font-bold text-maroon block">
                      📊 Itemized Sub-Budgets (Optional)
                    </Label>
                    <span className="text-[10px] text-maroon/50 font-data">
                      Total: {formatLakhs(subItemsTotal)} of {formatLakhs(Number(limit) || 0)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSubItem}
                    className="text-[11px] font-bold text-maroon bg-marigold/20 hover:bg-marigold/30 px-2.5 py-1 rounded-lg border border-marigold/30 transition-colors"
                  >
                    + Add Item
                  </button>
                </div>

                {isSubOver && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs font-data flex items-start gap-2">
                    <span className="text-sm">⚠️</span>
                    <div>
                      <span className="font-bold">Sub-budgets exceed category limit: </span>
                      <span>
                        Total of sub-items ({formatLakhs(subItemsTotal)}) is {formatLakhs(subOverAmount)} higher than the category limit ({formatLakhs(Number(limit) || 0)}).
                      </span>
                    </div>
                  </div>
                )}

                {autoItems.map(sub => (
                  <div key={sub.id} className="flex items-center justify-between gap-2 bg-mehendi/5 p-2.5 rounded-xl border border-mehendi/20 text-xs" title="Calculated from this function's gifting rules. Change it from the function's page.">
                    <span className="font-semibold text-maroon">🎁 {sub.name} <span className="text-[10px] font-normal text-maroon/50">auto from gifting rules</span></span>
                    <span className="font-data font-bold text-maroon">{formatLakhs(Number(sub.target_budget) || 0)}</span>
                  </div>
                ))}

                {items.length === 0 && autoItems.length === 0 ? (
                  <p className="text-[11px] text-maroon/50 italic bg-ivory/50 p-2.5 rounded-xl border border-dashed border-marigold/30 text-center">
                    No itemized sub-budgets added yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((sub, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-ivory/60 p-2 rounded-xl border border-marigold/25">
                        <Input
                          type="text"
                          placeholder="Item name (e.g. Albums)"
                          value={sub.name}
                          onChange={(e) => handleUpdateSubItem(idx, 'name', e.target.value)}
                          className="h-8 text-xs bg-white flex-1"
                        />
                        <div className="w-28 relative">
                          <Input
                            type="number"
                            min="0"
                            placeholder="Limit"
                            value={sub.target_budget || ''}
                            onChange={(e) => handleUpdateSubItem(idx, 'target_budget', Number(e.target.value))}
                            className="h-8 text-xs bg-white pr-2"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubItem(idx)}
                          className="text-rust-red/70 hover:text-rust-red p-1 rounded-md"
                          title="Remove item"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end items-center gap-2.5 pt-4 border-t border-marigold/20">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={saving}
                  className="border-marigold/40 text-maroon hover:bg-marigold/10 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-maroon hover:bg-maroon/90 text-ivory text-xs font-bold shadow-md"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

