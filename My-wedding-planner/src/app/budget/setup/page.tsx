'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save, Search, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import EmojiPicker from 'emoji-picker-react'

type Category = {
  id: string
  name: string
  emoji: string
  function_id?: string | null
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

  // Add Category Modal States
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryEmoji, setNewCategoryEmoji] = useState('✨')
  const [newCategoryDesc, setNewCategoryDesc] = useState('')
  const [newCategoryFunctionId, setNewCategoryFunctionId] = useState('')
  const [isEventAllotment, setIsEventAllotment] = useState(false)
  const [createNewEventInModal, setCreateNewEventInModal] = useState(false)
  const [newEventDate, setNewEventDate] = useState('')
  const [newEventHostingSide, setNewEventHostingSide] = useState<'groom' | 'bride' | 'joint'>('joint')
  const [addingCategory, setAddingCategory] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  // Edit Modal States
  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [editingEmojiId, setEditingEmojiId] = useState<string | null>(null)
  const [tempDescription, setTempDescription] = useState('')
  const [tempModalCategoryName, setTempModalCategoryName] = useState('')
  const [tempModalFunctionId, setTempModalFunctionId] = useState<string>('')

  // Inline Rename States
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [tempCategoryName, setTempCategoryName] = useState('')
  
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
      if ((dbUser?.role !== 'admin' && dbUser?.role !== 'bride' && dbUser?.role !== 'groom' && dbUser?.role !== 'planner')) {
        router.push('/')
        return
      }
      if (dbUser?.side) {
        setUserSide(dbUser.side)
        setNewEventHostingSide(dbUser.side as any)
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
      const { data: funcData } = await supabase.from('functions').select('id, name, event_date').order('name')
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

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm("Are you sure you want to delete this allotment? All its budget targets will be removed.")) return
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
    toast.success('Allotment deleted successfully')
  }

  // Duplicate Check Helpers
  const normalizedNewName = newCategoryName.trim().toLowerCase()
  const isDuplicateInCategories = categories.some(c => c.name.trim().toLowerCase() === normalizedNewName)
  const isDuplicateInFunctions = functionsList.some(f => f.name.trim().toLowerCase() === normalizedNewName)
  const hasAddDuplicate = !!normalizedNewName && (isDuplicateInCategories || isDuplicateInFunctions)

  const handleConfirmInlineRename = (categoryId: string) => {
    const trimmed = tempCategoryName.trim()
    if (!trimmed) {
      setEditingNameId(null)
      return
    }
    const normalized = trimmed.toLowerCase()
    const isDup = categories.some(c => c.id !== categoryId && c.name.trim().toLowerCase() === normalized) ||
                  functionsList.some(f => f.name.trim().toLowerCase() === normalized)
    
    if (isDup) {
      toast.error(`An allotment or event named "${trimmed}" already exists. Please choose a unique name.`)
      return
    }

    setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, name: trimmed } : c))
    setHasUnsavedChanges(true)
    setEditingNameId(null)
    toast.success(`Renamed to "${trimmed}"`)
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCategoryName.trim()) return

    if (hasAddDuplicate) {
      toast.error(`An allotment or event named "${newCategoryName.trim()}" already exists.`)
      return
    }

    setAddingCategory(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    let assignedFunctionId: string | null = null

    // If user chose to create a new event for this allotment
    if (isEventAllotment) {
      if (createNewEventInModal) {
        if (!newEventDate) {
          setError("Please select an event date for the new function.")
          setAddingCategory(false)
          return
        }

        const { data: newFunc, error: funcErr } = await supabase
          .from('functions')
          .insert({
            name: newCategoryName.trim(),
            event_date: newEventDate,
            hosting_side: newEventHostingSide,
            max_budget: 0,
            created_by: user?.id
          })
          .select()
          .single()

        if (funcErr) {
          setError(`Failed to create calendar event: ${funcErr.message}`)
          setAddingCategory(false)
          return
        }

        assignedFunctionId = newFunc?.id || null
        if (newFunc) {
          setFunctionsList(prev => [...prev, newFunc])
        }
      } else if (newCategoryFunctionId) {
        assignedFunctionId = newCategoryFunctionId
      }
    }

    const { data: newCat, error: insertErr } = await supabase
      .from('categories')
      .insert({
        name: newCategoryName.trim(),
        emoji: newCategoryEmoji.trim() || '✨',
        description: newCategoryDesc.trim() || null,
        function_id: assignedFunctionId
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
      setIsEventAllotment(false)
      setCreateNewEventInModal(false)
      setNewEventDate('')
      setIsAddModalOpen(false)
      setHasUnsavedChanges(true)
      toast.success(`Added allotment "${newCat.name}"`)
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

    // 2. Update category names, descriptions, emojis and function_ids
    for (const cat of categories) {
      const desc = descriptions[cat.id] || null
      const { error: descError } = await supabase
        .from('categories')
        .update({ 
          name: cat.name.trim(),
          description: desc, 
          emoji: cat.emoji,
          function_id: cat.function_id || null
        })
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
    toast.success('Budget limits & allocations saved successfully!')
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

      {error && <div className="p-4 mb-6 bg-rust-red/10 border border-rust-red/20 text-rust-red rounded-lg text-sm">{error}</div>}

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
        
        {/* Positive, Unified Guidance Banner */}
        <div className="bg-marigold/10 border-l-4 border-marigold p-3.5 rounded-xl text-xs font-data text-maroon/80 flex items-start gap-2.5 shadow-sm">
          <span className="text-base leading-none">💡</span>
          <div className="space-y-1">
            <p className="font-bold text-maroon">Unified Event & General Allotments</p>
            <p className="leading-relaxed">
              Manage targets for both <strong>general categories</strong> (Photography, Outfits, Jewelry) and <strong>specific events</strong> (Haldi, Sangeet, Reception). Adding an allotment lets you specify whether it applies generally or ties to a wedding function.
            </p>
          </div>
        </div>

        <p className="text-xs font-data text-maroon/70">
          Click on any name or pencil icon to rename it. Adjust sliders or enter numeric limits.
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
              const linkedFunc = functionsList.find(f => f.id === category.function_id)

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
                        {editingNameId === category.id ? (
                          <div className="flex items-center gap-1.5 py-0.5">
                            <Input 
                              type="text"
                              value={tempCategoryName}
                              onChange={(e) => setTempCategoryName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleConfirmInlineRename(category.id)
                                } else if (e.key === 'Escape') {
                                  setEditingNameId(null)
                                }
                              }}
                              autoFocus
                              className="h-8 text-sm font-display font-bold bg-ivory border-marigold/60 text-maroon px-2 py-0.5 rounded shadow-inner"
                              placeholder="Allotment name"
                            />
                            <button
                              type="button"
                              onClick={() => handleConfirmInlineRename(category.id)}
                              className="w-7 h-7 flex items-center justify-center rounded bg-mehendi/15 text-mehendi hover:bg-mehendi/25 font-bold text-xs cursor-pointer"
                              title="Save name"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingNameId(null)}
                              className="w-7 h-7 flex items-center justify-center rounded bg-maroon/10 text-maroon/60 hover:bg-maroon/20 text-xs font-bold cursor-pointer"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group/name">
                            <span 
                              onClick={() => {
                                setEditingNameId(category.id)
                                setTempCategoryName(category.name)
                              }}
                              className="font-display font-bold text-base md:text-lg text-maroon block truncate cursor-pointer hover:underline decoration-dashed decoration-marigold/60"
                              title="Click to rename"
                            >
                              {category.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNameId(category.id)
                                setTempCategoryName(category.name)
                              }}
                              className="opacity-40 group-hover/name:opacity-100 text-maroon/60 hover:text-maroon transition-opacity p-0.5 cursor-pointer"
                              title="Rename allotment"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Event vs General Badge */}
                        <div className="flex items-center gap-1.5 mt-1">
                          {category.function_id ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold font-data bg-mehendi/15 text-mehendi px-2 py-0.5 rounded-full border border-mehendi/25">
                              🎪 Event: {linkedFunc?.name || 'Linked Event'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold font-data bg-marigold/15 text-maroon/70 px-2 py-0.5 rounded-full border border-marigold/25">
                              ✨ General Allotment
                            </span>
                          )}
                        </div>

                        {descriptions[category.id] ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDescriptionId(category.id)
                              setTempDescription(descriptions[category.id] || '')
                              setTempModalCategoryName(category.name)
                              setTempModalFunctionId(category.function_id || '')
                              setTempSubItems(subItems[category.id] || [])
                            }}
                            className="text-[11px] md:text-xs text-maroon/70 font-data block text-left mt-1.5 hover:text-maroon underline decoration-dotted line-clamp-2 leading-snug cursor-pointer"
                          >
                            📝 {descriptions[category.id]}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDescriptionId(category.id)
                              setTempDescription('')
                              setTempModalCategoryName(category.name)
                              setTempModalFunctionId(category.function_id || '')
                              setTempSubItems(subItems[category.id] || [])
                            }}
                            className="text-[11px] md:text-xs text-marigold hover:text-maroon font-data block text-left mt-1.5 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <span className="text-lg leading-none">+</span> Add details & sub-items
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
                        className="text-maroon/30 hover:text-rust-red bg-maroon/5 hover:bg-rust-red/10 rounded-full transition-colors w-8 h-8 flex items-center justify-center font-bold cursor-pointer"
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
                      step="5000"
                      value={currentVal}
                      onChange={(e) => handleBudgetChange(category.id, e.target.value)}
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-maroon"
                      style={trackStyle}
                    />
                    <div className="flex justify-between items-center text-[10px] font-data text-maroon/50">
                      <span>₹0</span>
                      <span className="font-semibold text-maroon/80">{formatLakhs(currentVal)} allocated</span>
                      <span>{formatLakhs(sliderMax)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <Button 
          type="button" 
          variant="outline" 
          onClick={() => {
            setNewCategoryName('')
            setNewCategoryEmoji('✨')
            setNewCategoryDesc('')
            setNewCategoryFunctionId('')
            setIsEventAllotment(false)
            setCreateNewEventInModal(false)
            setNewEventDate('')
            setIsAddModalOpen(true)
          }}
          className="w-full border-dashed border-marigold/60 text-maroon hover:bg-marigold/10 py-6 text-sm font-semibold rounded-xl cursor-pointer"
        >
          + Add Custom Allotment (Category or Event)
        </Button>
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
          className="w-full bg-maroon text-ivory hover:bg-maroon/90 py-6 shadow-md cursor-pointer font-bold"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save & Exit'}
        </Button>
      </div>

      {/* Description & Sub-Items Popup Modal */}
      {editingDescriptionId && (() => {
        const subItemsTotal = tempSubItems.reduce((acc, s) => acc + (s.target_budget || 0), 0)
        const parentLimit = budgets[editingDescriptionId] || 0
        const isSubOver = subItemsTotal > parentLimit

        return (
          <div className="fixed inset-0 bg-maroon/30 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl border border-marigold/30 p-6 w-full max-w-md shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center pb-2 border-b border-marigold/15">
                <div className="flex items-center gap-2">
                  <span className="text-xl">
                    {categories.find(c => c.id === editingDescriptionId)?.emoji || '📝'}
                  </span>
                  <h3 className="font-display font-bold text-maroon text-base">
                    Edit Allotment Details
                  </h3>
                </div>
                <button 
                  type="button"
                  onClick={() => setEditingDescriptionId(null)}
                  className="text-maroon/50 hover:text-maroon font-bold text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Allotment Name Input */}
              <div className="space-y-1">
                <Label className="text-[10px] text-maroon/60 font-semibold block">Allotment / Category Name</Label>
                <Input 
                  type="text" 
                  value={tempModalCategoryName}
                  onChange={(e) => setTempModalCategoryName(e.target.value)}
                  className="bg-ivory/50 border-marigold/40 text-xs h-9 text-maroon font-bold"
                  placeholder="e.g. Photography, Attire"
                />
              </div>

              {/* Linked Event / Function Dropdown */}
              <div className="space-y-1">
                <Label className="text-[10px] text-maroon/60 font-semibold block">Linked Event / Function (Optional)</Label>
                <select
                  value={tempModalFunctionId}
                  onChange={(e) => setTempModalFunctionId(e.target.value)}
                  className="w-full text-xs h-9 rounded-md border border-marigold/40 bg-ivory/50 px-2 font-data text-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
                >
                  <option value="">✨ General Allotment (Not tied to an event)</option>
                  {functionsList.map(f => (
                    <option key={f.id} value={f.id}>🎪 Event: {f.name}</option>
                  ))}
                </select>
              </div>

              {/* Freeform Notes Section */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-maroon/60 font-semibold block">General Notes / Breakdown</Label>
                <textarea
                  className="w-full rounded-lg border border-marigold/40 bg-ivory/50 p-2.5 text-xs font-data min-h-[70px] text-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
                  value={tempDescription}
                  onChange={(e) => setTempDescription(e.target.value)}
                  placeholder="e.g. general vendor contacts, menu rules, timelines"
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
                        className="text-rust-red hover:bg-rust-red/10 p-1 text-xs rounded transition-colors w-7 h-7 flex items-center justify-center font-bold cursor-pointer"
                        onClick={() => setTempSubItems(tempSubItems.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="text-xs text-maroon hover:underline flex items-center space-x-1 font-semibold cursor-pointer"
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
                  className="text-maroon/70 hover:bg-marigold/10 text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const trimmedName = tempModalCategoryName.trim()
                    if (trimmedName) {
                      const normalized = trimmedName.toLowerCase()
                      const isDup = categories.some(c => c.id !== editingDescriptionId && c.name.trim().toLowerCase() === normalized) ||
                                    functionsList.some(f => f.id !== tempModalFunctionId && f.name.trim().toLowerCase() === normalized)
                      if (isDup) {
                        toast.error(`An allotment or event named "${trimmedName}" already exists. Please choose a unique name.`)
                        return
                      }
                    }

                    const cleanItems = tempSubItems.filter(i => i.name.trim())
                    setDescriptions(prev => ({
                      ...prev,
                      [editingDescriptionId]: tempDescription
                    }))
                    setSubItems(prev => ({
                      ...prev,
                      [editingDescriptionId]: cleanItems
                    }))
                    
                    setCategories(prev => prev.map(c => {
                      if (c.id === editingDescriptionId) {
                        return { 
                          ...c, 
                          name: trimmedName || c.name,
                          function_id: tempModalFunctionId || null
                        }
                      }
                      return c
                    }))
                    
                    setHasUnsavedChanges(true)
                    setEditingDescriptionId(null)
                    toast.success('Updated allotment details')
                  }}
                  className="bg-maroon text-ivory hover:bg-maroon/90 text-xs font-semibold cursor-pointer"
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Add Category / Event Allotment Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-maroon/30 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-marigold/30 p-6 w-full max-w-md shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-marigold/15">
              <h3 className="font-display font-bold text-maroon text-base">✨ Add New Allotment</h3>
              <button 
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-maroon/50 hover:text-maroon font-bold text-sm cursor-pointer"
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
                    className="w-full h-10 bg-ivory border border-marigold/50 rounded-md text-xl flex items-center justify-center hover:bg-marigold/10 transition-colors shadow-inner cursor-pointer"
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
                  <Label className="text-[10px] text-maroon/50 block mb-1">Allotment Name</Label>
                  <Input 
                    type="text" 
                    placeholder="e.g. Photography, Sangeet, Jewelry" 
                    className={`bg-ivory border-marigold/50 font-data text-sm h-10 ${hasAddDuplicate ? 'border-rust-red focus-visible:ring-rust-red' : ''}`}
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              {/* Duplicate Name Warning Alert */}
              {hasAddDuplicate && (
                <div className="p-2.5 bg-rust-red/10 border border-rust-red/25 rounded-lg text-xs font-data text-rust-red flex items-center gap-2">
                  <span>⚠️</span>
                  <span>An allotment or event named &ldquo;<strong>{newCategoryName.trim()}</strong>&rdquo; already exists. Please choose a distinct name.</span>
                </div>
              )}

              {/* Event vs General Allotment Checkbox */}
              <div className="space-y-3 p-3 bg-ivory/50 rounded-xl border border-marigold/20">
                <div className="flex items-center space-x-2">
                  <input 
                    type="checkbox" 
                    id="isEventAllotment"
                    checked={isEventAllotment}
                    onChange={(e) => {
                      setIsEventAllotment(e.target.checked)
                      if (!e.target.checked) {
                        setCreateNewEventInModal(false)
                        setNewCategoryFunctionId('')
                      }
                    }}
                    className="w-4 h-4 text-maroon rounded border-marigold/50 focus:ring-maroon cursor-pointer"
                  />
                  <Label htmlFor="isEventAllotment" className="text-xs font-bold text-maroon cursor-pointer">
                    🎪 This allotment is for a specific Event / Function
                  </Label>
                </div>

                {isEventAllotment && (
                  <div className="space-y-3 pt-2 pl-6 border-l-2 border-marigold/30 animate-in slide-in-from-top-1 duration-150">
                    <div className="flex gap-4 text-xs font-data">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="radio" 
                          name="eventMode" 
                          checked={!createNewEventInModal} 
                          onChange={() => setCreateNewEventInModal(false)}
                          className="accent-maroon"
                        />
                        <span>Link existing event</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="radio" 
                          name="eventMode" 
                          checked={createNewEventInModal} 
                          onChange={() => setCreateNewEventInModal(true)}
                          className="accent-maroon"
                        />
                        <span>Create new event now</span>
                      </label>
                    </div>

                    {!createNewEventInModal ? (
                      <div className="space-y-1">
                        <Label className="text-[10px] text-maroon/60 font-semibold block">Select Existing Event</Label>
                        <select
                          className="flex w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-xs font-data"
                          value={newCategoryFunctionId}
                          onChange={(e) => setNewCategoryFunctionId(e.target.value)}
                        >
                          <option value="">-- Choose an event --</option>
                          {functionsList.map(f => (
                            <option key={f.id} value={f.id}>🎪 {f.name} {f.event_date ? `(${f.event_date})` : ''}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-maroon/60 font-semibold block">Event Date *</Label>
                          <Input 
                            type="date"
                            required={createNewEventInModal}
                            value={newEventDate}
                            onChange={(e) => setNewEventDate(e.target.value)}
                            className="bg-white border-marigold/50 text-xs h-8"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-maroon/60 font-semibold block">Hosting Side</Label>
                          <select
                            className="flex w-full rounded-md border border-marigold/50 bg-white px-2 py-1 text-xs font-data h-8"
                            value={newEventHostingSide}
                            onChange={(e) => setNewEventHostingSide(e.target.value as any)}
                          >
                            <option value="joint">Joint 🤝</option>
                            <option value="groom">Ladkewale 🤵‍♂️</option>
                            <option value="bride">Ladkiwale 👰‍♀️</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Optional Notes */}
              <div className="space-y-1">
                <Label className="text-[10px] text-maroon/50 block">Initial Notes / Description (Optional)</Label>
                <textarea
                  className="w-full rounded-lg border border-marigold/40 bg-ivory/50 p-2.5 text-xs font-data min-h-[60px] text-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
                  value={newCategoryDesc}
                  onChange={(e) => setNewCategoryDesc(e.target.value)}
                  placeholder="e.g. Budget estimate rules, vendor list"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-marigold/10">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-maroon/70 text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={addingCategory || !newCategoryName.trim() || hasAddDuplicate}
                  className="bg-maroon text-ivory text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {addingCategory ? 'Adding...' : isEventAllotment ? 'Add Event Allotment' : 'Add General Allotment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
