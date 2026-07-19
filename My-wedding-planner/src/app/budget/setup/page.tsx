'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import EmojiPicker from 'emoji-picker-react'

type Category = {
  id: string
  name: string
  emoji: string
}

type CategoryBudget = {
  category_id: string
  max_budget: number
}

type SubItem = {
  id?: string
  category_id: string
  name: string
  target_budget: number
}

export default function BudgetSetupPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [descriptions, setDescriptions] = useState<Record<string, string>>({})
  const [functionsList, setFunctionsList] = useState<any[]>([])
  const [subItems, setSubItems] = useState<Record<string, SubItem[]>>({})
  const [tempSubItems, setTempSubItems] = useState<SubItem[]>([])
  
  const [userSide, setUserSide] = useState<string | null>(null)
  const [masterBudget, setMasterBudget] = useState<number>(0)
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryEmoji, setNewCategoryEmoji] = useState('✨')
  const [newCategoryDesc, setNewCategoryDesc] = useState('')
  const [newCategoryFunctionId, setNewCategoryFunctionId] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [editingEmojiId, setEditingEmojiId] = useState<string | null>(null)
  const [tempDescription, setTempDescription] = useState('')
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Fetch user side and role
      const { data: dbUser } = await supabase.from('users').select('side, role').eq('id', user.id).single()
      if (dbUser?.role !== 'admin' && dbUser?.role !== 'bride' && dbUser?.role !== 'groom') {
        router.push('/')
        return
      }
      if (dbUser?.side) {
        setUserSide(dbUser.side)
      }

      // Fetch categories
      const { data: catData, error: catError } = await supabase.from('categories').select('*').order('name')
      if (catError) {
        setError(catError.message)
      } else {
        setCategories(catData || [])
        const initialDescs: Record<string, string> = {}
        catData?.forEach(c => {
          initialDescs[c.id] = c.description || ''
        })
        setDescriptions(initialDescs)
      }

      // Fetch functions list for linking dropdown
      const { data: funcData } = await supabase.from('functions').select('id, name')
      setFunctionsList(funcData || [])

      // Fetch existing sub-items
      const { data: subData } = await supabase.from('category_sub_items').select('*').order('name')
      const groupedSubItems: Record<string, SubItem[]> = {}
      subData?.forEach(s => {
        if (!groupedSubItems[s.category_id]) {
          groupedSubItems[s.category_id] = []
        }
        groupedSubItems[s.category_id].push({
          id: s.id,
          category_id: s.category_id,
          name: s.name,
          target_budget: Number(s.target_budget)
        })
      })
      setSubItems(groupedSubItems)

      // Fetch existing budgets for this side
      if (dbUser?.side) {
        const { data: budData } = await supabase
          .from('category_budgets')
          .select('*')
          .eq('side', dbUser.side)
        
        const initialBudgets: Record<string, number> = {}
        budData?.forEach(b => {
          initialBudgets[b.category_id] = Number(b.max_budget)
        })
        setBudgets(initialBudgets)

        // Fetch master budget config
        const { data: configData } = await supabase
          .from('side_configurations')
          .select('master_budget')
          .eq('side', dbUser.side)
          .maybeSingle()
        
        if (configData) {
          setMasterBudget(Number(configData.master_budget))
        }
      }

      setLoading(false)
      // Reset after initial load
      setTimeout(() => setHasUnsavedChanges(false), 100)
    }
    fetchData()
  }, [router, supabase])

  const handleBudgetChange = (categoryId: string, value: string) => {
    setHasUnsavedChanges(true)
    setBudgets(prev => ({
      ...prev,
      [categoryId]: Number(value)
    }))
  }

  const handleDescriptionChange = (categoryId: string, value: string) => {
    setHasUnsavedChanges(true)
    setDescriptions(prev => ({
      ...prev,
      [categoryId]: value
    }))
  }

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm("Are you sure you want to delete this category? All its budget targets will be removed.")) return
    setError(null)

    // Delete from categories (category_budgets will cascade automatically)
    const { error: delError } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId)

    if (delError) {
      if (delError.message.includes('violates not-null constraint') || delError.message.includes('expenses')) {
        toast.error(`Cannot delete this category because there are already expenses logged against it. Please re-assign or delete those expenses first.`)
      } else {
        toast.error(`Failed to delete category: ${delError.message}`)
      }
      return
    }

    setCategories(prev => prev.filter(c => c.id !== categoryId))
    setBudgets(prev => {
      const copy = { ...prev }
      delete copy[categoryId]
      return copy
    })
    setDescriptions(prev => {
      const copy = { ...prev }
      delete copy[categoryId]
      return copy
    })
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCategoryName.trim()) return
    setAddingCategory(true)
    setError(null)

    const { data: newCat, error: insertErr } = await supabase
      .from('categories')
      .insert({
        name: newCategoryName.trim(),
        emoji: newCategoryEmoji.trim(),
        description: newCategoryDesc.trim() || null,
        function_id: newCategoryFunctionId || null
      })
      .select()
      .single()

    if (insertErr) {
      setError(`Failed to add category: ${insertErr.message}`)
      setAddingCategory(false)
      return
    }

    if (newCat) {
      setCategories(prev => [...prev, newCat])
      setDescriptions(prev => ({
        ...prev,
        [newCat.id]: newCat.description || ''
      }))
      setNewCategoryName('')
      setNewCategoryEmoji('✨')
      setNewCategoryDesc('')
      setNewCategoryFunctionId('')
      setIsAddModalOpen(false)
    }
    setAddingCategory(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    
    if (!userSide) {
      setError("Could not determine your side.")
      setSaving(false)
      return
    }

    // 1. Upsert side configurations (master budget limit)
    const { error: configError } = await supabase
      .from('side_configurations')
      .upsert({
        side: userSide,
        master_budget: masterBudget
      }, { onConflict: 'side' })

    if (configError) {
      setError(configError.message)
      setSaving(false)
      return
    }

    // 2. Update category descriptions and emojis
    for (const cat of categories) {
      const desc = descriptions[cat.id] || null
      const { error: descError } = await supabase
        .from('categories')
        .update({ description: desc, emoji: cat.emoji })
        .eq('id', cat.id)
      
      if (descError) {
        setError(`Failed to save details for category: ${descError.message}`)
        setSaving(false)
        return
      }
    }

    // 3. Upsert category budgets
    const updates = Object.entries(budgets).map(([categoryId, maxBudget]) => ({
      category_id: categoryId,
      side: userSide,
      max_budget: maxBudget
    }))

    if (updates.length > 0) {
      const { error: upsertError } = await supabase
        .from('category_budgets')
        .upsert(updates, { onConflict: 'category_id,side' })

      if (upsertError) {
        setError(upsertError.message)
        setSaving(false)
        return
      }
    }

    // 4. Save category sub-items
    if (categories.length > 0) {
      const { error: subClearErr } = await supabase
        .from('category_sub_items')
        .delete()
        .in('category_id', categories.map(c => c.id))
      
      if (subClearErr) {
        setError(`Failed to clear old sub-items: ${subClearErr.message}`)
        setSaving(false)
        return
      }
    }

    const subItemsToInsert = Object.entries(subItems).flatMap(([categoryId, list]) => 
      list.map(item => ({
        category_id: categoryId,
        name: item.name.trim(),
        target_budget: item.target_budget
      }))
    )

    if (subItemsToInsert.length > 0) {
      const { error: subInsertErr } = await supabase
        .from('category_sub_items')
        .insert(subItemsToInsert)
      
      if (subInsertErr) {
        setError(`Failed to save sub-items: ${subInsertErr.message}`)
        setSaving(false)
        return
      }
    }

    setHasUnsavedChanges(false)
    router.push('/budget')
    router.refresh()
  }

  const totalAllocated = Object.values(budgets).reduce((sum, val) => sum + (Number(val) || 0), 0)
  const unallocated = masterBudget - totalAllocated
  const isOverAllocated = unallocated < 0

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const formatLakhs = (value: number) => {
    if (value >= 100000) {
      return `₹${(value / 100000).toFixed(2)}L`
    }
    if (value >= 1000) {
      return `₹${(value / 1000).toFixed(0)}k`
    }
    return `₹${value}`
  }

  if (loading) return <div className="min-h-screen p-6 flex items-center justify-center">Loading...</div>

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-lg mx-auto bg-ivory pb-24">
      <header className="flex items-center space-x-4 py-4 border-b border-marigold/30 mb-6">
        <Link href="/budget">
          <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-display font-semibold text-maroon">Set Budgets</h1>
      </header>

      {error && <div className="p-4 mb-6 bg-rust-red/10 text-rust-red rounded-lg text-sm">{error}</div>}

      {/* Master Budget Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6 space-y-4 mb-6">
        <h2 className="text-md font-display font-semibold text-maroon">Master Budget Plan</h2>
        <div className="space-y-2">
          <Label htmlFor="master_budget_input">Overall Master Budget (₹)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-maroon/50 font-data">₹</span>
            <Input 
              id="master_budget_input"
              type="number"
              min="0"
              placeholder="e.g. 2000000"
              className="pl-8 bg-ivory border-marigold/50 font-data text-lg"
              value={masterBudget || ''}
              onChange={(e) => setMasterBudget(Number(e.target.value))}
            />
          </div>
        </div>
        
        {/* Unallocated Tracker Card */}
        <div className={`p-4 rounded-xl border font-data text-sm flex items-center justify-between transition-colors ${
          isOverAllocated ? 'bg-rust-red/10 border-rust-red text-rust-red' : 'bg-mehendi/10 border-mehendi/30 text-maroon'
        }`}>
          <div>
            <span className="font-semibold block">
              {isOverAllocated ? '⚠️ Over-allocated!' : '💰 Unallocated Budget'}
            </span>
            <span className="text-xs opacity-85">
              {isOverAllocated 
                ? `Category limits exceed overall budget by ${formatCurrency(Math.abs(unallocated))}` 
                : `Remaining to distribute among categories`}
            </span>
          </div>
          <div className="text-right">
            <span className="font-bold text-base block">{formatCurrency(unallocated)}</span>
            <span className="text-xs opacity-70">of {formatCurrency(masterBudget)} total</span>
          </div>
        </div>
      </div>

      {/* Category Budgets Setup Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6 space-y-6">
        <h2 className="text-md font-display font-semibold text-maroon">Category Allocations</h2>
        
        <div className="bg-marigold/10 border-l-4 border-marigold p-3 rounded-lg text-xs font-data text-maroon/80">
          <p className="font-semibold mb-1 flex items-center"><span className="mr-1">💡</span> Events vs. Categories</p>
          <p className="leading-relaxed">
            Do <span className="font-bold">not</span> add your events (e.g., Haldi, Sangeet) here! Add them in the <strong>Functions</strong> tab, which automatically creates a budget bucket for each event. This page is for <strong>general categories</strong> like Photography, Outfits, and Jewelry that span the entire wedding.
          </p>
        </div>

        <p className="text-xs font-data text-maroon/70">
          Adjust the sliders or type limits for each budget item. This applies to {userSide === 'groom' ? "Satyam's" : "Swati's"} side.
        </p>

        {categories.length === 0 ? (
          <div className="text-sm text-maroon/50 italic py-2">No budget categories created yet. Add your first category below!</div>
        ) : (
          <div className="space-y-6">
            {categories.map(category => {
              const currentVal = budgets[category.id] || 0
              const sliderMax = Math.max(masterBudget || 2000000, 2000000)
              const percent = Math.min((currentVal / sliderMax) * 100, 100)
              const trackStyle = {
                background: `linear-gradient(to right, #800000 0%, #800000 ${percent}%, #f3ebdf ${percent}%, #f3ebdf 100%)`
              }
              return (
                <div key={category.id} className="p-5 rounded-2xl border border-marigold/30 bg-white space-y-5 shadow-sm hover:shadow-md transition-shadow relative">
                  {/* Category Header */}
                  <div className="flex justify-between items-center gap-4">
                    <div className="flex items-center space-x-3.5 flex-1 min-w-0">
                      <div 
                        className="bg-ivory border border-marigold/40 w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-sm cursor-pointer hover:bg-marigold/20 relative flex-shrink-0"
                        onClick={() => setEditingEmojiId(editingEmojiId === category.id ? null : category.id)}
                        title="Click to change emoji"
                      >
                        {category.emoji || '💸'}
                        {editingEmojiId === category.id && (
                          <div className="absolute top-12 left-0 z-50" onClick={e => e.stopPropagation()}>
                            <div className="fixed inset-0 bg-transparent" onClick={() => setEditingEmojiId(null)} />
                            <div className="relative">
                              <EmojiPicker 
                                onEmojiClick={(e) => {
                                  setHasUnsavedChanges(true)
                                  setCategories(prev => prev.map(c => c.id === category.id ? { ...c, emoji: e.emoji } : c))
                                  setEditingEmojiId(null)
                                }} 
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-display font-bold text-base md:text-lg text-maroon block truncate">{category.name}</span>
                        {descriptions[category.id] ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDescriptionId(category.id)
                              setTempDescription(descriptions[category.id] || '')
                              setTempSubItems(subItems[category.id] || [])
                            }}
                            className="text-[11px] md:text-xs text-maroon/70 font-data block text-left mt-1 hover:text-maroon underline decoration-dotted line-clamp-2 leading-snug"
                          >
                            📝 {descriptions[category.id]}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDescriptionId(category.id)
                              setTempDescription('')
                              setTempSubItems(subItems[category.id] || [])
                            }}
                            className="text-[11px] md:text-xs text-marigold hover:text-maroon font-data block text-left mt-1 font-semibold flex items-center gap-1"
                          >
                            <span className="text-lg leading-none">+</span> Add details
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <div className="w-28 relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-maroon/40 font-bold">₹</span>
                        <Input 
                          type="number"
                          min="0"
                          placeholder="0"
                          className="pl-6 pr-2 bg-ivory/50 border-marigold/40 font-data text-sm text-right h-10 font-bold text-maroon shadow-inner rounded-lg"
                          value={currentVal || ''}
                          onChange={(e) => handleBudgetChange(category.id, e.target.value)}
                        />
                      </div>
                      <button 
                        onClick={() => handleDeleteCategory(category.id)}
                        className="text-maroon/30 hover:text-rust-red bg-maroon/5 hover:bg-rust-red/10 rounded-full transition-colors w-8 h-8 flex items-center justify-center font-bold"
                        title="Delete category"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Slider Control */}
                  <div className="space-y-2 pt-1 border-t border-marigold/10">
                    <input 
                      type="range"
                      min="0"
                      max={sliderMax}
                      step="10000"
                      style={trackStyle}
                      className="w-full cursor-pointer h-2.5 bg-marigold/20 rounded-full appearance-none transition-all duration-300 accent-maroon"
                      value={currentVal}
                      onChange={(e) => handleBudgetChange(category.id, e.target.value)}
                    />
                    <div className="flex justify-between text-[10px] md:text-xs font-data text-maroon/60 font-semibold px-1">
                      <span>₹0</span>
                      <span className="text-maroon font-bold bg-marigold/15 px-2.5 py-0.5 rounded-full shadow-sm">{formatLakhs(currentVal)}</span>
                      <span>Max: {formatLakhs(sliderMax)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Add Category Button */}
        <div className="border-t border-marigold/20 pt-6 mt-6 flex justify-center">
          <Button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="bg-maroon/10 text-maroon hover:bg-maroon hover:text-ivory py-6 px-8 rounded-full shadow-sm transition-all border border-maroon/20 font-bold"
          >
            + Add Custom Category / Event
          </Button>
        </div>
      </div>

      <div className="relative mt-8">
        {hasUnsavedChanges && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-marigold text-maroon text-xs md:text-sm font-bold px-4 py-2 rounded-full shadow-lg animate-bounce whitespace-nowrap border-2 border-ivory">
            ⚠️ You have unsaved changes!
          </div>
        )}
        <Button 
          onClick={handleSave} 
          disabled={saving} 
          className="w-full bg-maroon text-ivory hover:bg-maroon/90 py-6 shadow-md"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save & Exit'}
        </Button>
      </div>

      {/* Description Popup Modal */}
      {editingDescriptionId && (() => {
        const subItemsTotal = tempSubItems.reduce((acc, s) => acc + (s.target_budget || 0), 0)
        const parentLimit = budgets[editingDescriptionId] || 0
        const isSubOver = subItemsTotal > parentLimit

        return (
          <div className="fixed inset-0 bg-maroon/30 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl border border-marigold/30 p-6 w-full max-w-md shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center">
                <h3 className="font-display font-bold text-maroon text-base">📝 Category Notes & Sub-Items</h3>
                <button 
                  type="button"
                  onClick={() => setEditingDescriptionId(null)}
                  className="text-maroon/50 hover:text-maroon font-bold text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Freeform Notes Section */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-maroon/60 font-semibold block">General Notes / Breakdown</Label>
                <textarea
                  className="w-full rounded-lg border border-marigold/40 bg-ivory/50 p-2.5 text-xs font-data min-h-[70px] text-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
                  value={tempDescription}
                  onChange={(e) => setTempDescription(e.target.value)}
                  placeholder="e.g. general vendor contacts, menu rules, timelines"
                  autoFocus
                />
              </div>

              {/* Itemized Sub-Budgets Checklist Section */}
              <div className="space-y-3 pt-2 border-t border-marigold/10">
                <div className="flex justify-between items-center">
                  <Label className="text-[10px] text-maroon/60 font-semibold block">📊 Itemized Sub-Budgets</Label>
                  <span className="text-[10px] font-data text-maroon/50">Total: {formatLakhs(subItemsTotal)}</span>
                </div>

                {isSubOver && (
                  <div className="p-2 bg-rust-red/10 border border-rust-red/20 text-rust-red rounded text-[10px] font-semibold font-data leading-relaxed">
                    ⚠️ Itemized total ({formatLakhs(subItemsTotal)}) exceeds parent limit ({formatLakhs(parentLimit)}) by {formatLakhs(subItemsTotal - parentLimit)}!
                  </div>
                )}

                <div className="space-y-2">
                  {tempSubItems.map((item, idx) => (
                    <div key={idx} className="flex space-x-2 items-center">
                      <Input 
                        type="text" 
                        placeholder="Item (e.g. Lehenga)" 
                        className="bg-ivory/30 border-marigold/30 text-xs h-8 flex-1"
                        value={item.name}
                        onChange={(e) => {
                          const updated = [...tempSubItems]
                          updated[idx].name = e.target.value
                          setTempSubItems(updated)
                        }}
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-maroon/40 font-semibold">₹</span>
                        <Input 
                          type="number" 
                          placeholder="Budget" 
                          className="pl-5 pr-1.5 bg-ivory/30 border-marigold/30 text-xs h-8 text-right font-data"
                          value={item.target_budget || ''}
                          onChange={(e) => {
                            const updated = [...tempSubItems]
                            updated[idx].target_budget = Number(e.target.value)
                            setTempSubItems(updated)
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="text-rust-red hover:bg-rust-red/10 p-1 text-xs rounded transition-colors w-7 h-7 flex items-center justify-center font-bold"
                        onClick={() => setTempSubItems(tempSubItems.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="text-xs text-maroon hover:underline flex items-center space-x-1 font-semibold"
                  onClick={() => setTempSubItems([...tempSubItems, { category_id: editingDescriptionId, name: '', target_budget: 0 }])}
                >
                  + Add Sub-Item Row
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-4 border-t border-marigold/10">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setEditingDescriptionId(null)}
                  className="text-maroon/70 hover:bg-marigold/10 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const cleanItems = tempSubItems.filter(i => i.name.trim())
                    setDescriptions(prev => ({
                      ...prev,
                      [editingDescriptionId]: tempDescription
                    }))
                    setSubItems(prev => ({
                      ...prev,
                      [editingDescriptionId]: cleanItems
                    }))
                    setEditingDescriptionId(null)
                  }}
                  className="bg-maroon text-ivory hover:bg-maroon/90 text-xs font-semibold"
                >
                  Save Note & Sub-Items
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Add Category Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-maroon/30 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-marigold/30 p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-display font-bold text-maroon text-base">✨ Add Category / Event</h3>
              <button 
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-maroon/50 hover:text-maroon font-bold text-sm"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-1 relative">
                  <Label className="text-[10px] text-maroon/50 block mb-1">Emoji</Label>
                  <button 
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="w-full h-10 bg-ivory border border-marigold/50 rounded-md text-xl flex items-center justify-center hover:bg-marigold/10 transition-colors shadow-inner"
                  >
                    {newCategoryEmoji}
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute top-16 left-0 z-[100] shadow-2xl rounded-xl">
                      <EmojiPicker 
                        onEmojiClick={(emojiData) => {
                          setNewCategoryEmoji(emojiData.emoji)
                          setShowEmojiPicker(false)
                        }} 
                      />
                    </div>
                  )}
                </div>
                <div className="col-span-5">
                  <Label className="text-[10px] text-maroon/50 block mb-1">Category / Event Name</Label>
                  <Input 
                    type="text" 
                    placeholder="e.g. Gold Jewelry, Sangeet" 
                    className="bg-ivory border-marigold/50 font-data text-sm h-10"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="col-span-6">
                  <Label className="text-[10px] text-maroon/50 block mb-1">Link to Event (Optional)</Label>
                  <select
                    className="flex w-full rounded-md border border-marigold/50 bg-ivory px-3 py-2 text-sm font-data"
                    value={newCategoryFunctionId}
                    onChange={(e) => setNewCategoryFunctionId(e.target.value)}
                  >
                    <option value="">None (Item Chunk)</option>
                    {functionsList.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-6">
                  <Label className="text-[10px] text-maroon/50 block mb-1">Short Description</Label>
                  <Input 
                    type="text" 
                    placeholder="e.g. catering, rings, pre-wedding shoot" 
                    className="bg-ivory border-marigold/50 font-data text-sm h-10"
                    value={newCategoryDesc}
                    onChange={(e) => setNewCategoryDesc(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-marigold/10">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-maroon/70 hover:bg-marigold/10"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={addingCategory || !newCategoryName.trim()}
                  className="bg-maroon text-ivory hover:bg-maroon/90 font-semibold"
                >
                  {addingCategory ? 'Adding...' : 'Add Category'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
