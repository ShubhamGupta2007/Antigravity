import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Settings, Pencil, Filter, X, Calendar, Clock } from 'lucide-react'
import { BudgetOverviewInteractive } from '@/components/BudgetOverviewInteractive'
import { ExpenseAnalytics } from '@/components/ExpenseAnalytics'
import { AllocationBreakdown } from '@/components/AllocationBreakdown'
import { DeleteExpenseButton } from '@/components/DeleteExpenseButton'
import { CategoryFilterDropdown } from '@/components/CategoryFilterDropdown'
import { QuickEditAllocationModal } from '@/components/QuickEditAllocationModal'
import { ExpenseLogView } from '@/components/ExpenseLogView'

// Helper to format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount)
}

const formatLakhs = (value: number) => {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(1)}L`
  }
  if (value >= 1000) {
    return `₹${(value / 1000).toFixed(0)}k`
  }
  return `₹${value}`
}

interface PageProps {
  searchParams: Promise<{ viewSide?: string; tab?: string; sort?: string; category?: string; categories?: string }>
}

export default async function BudgetDashboard({ searchParams }: PageProps) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Fetch side and role
  const { data: dbUser } = await supabase.from('users').select('side, role').eq('id', user.id).single()
  const side = dbUser?.side
  const role = dbUser?.role || 'regular'

  const cookieStore = await cookies()
  const isGuestView = cookieStore.get('guest_view')?.value === '1'
  const isEffectivelyGuest = role === 'guest' || role === 'pending' || isGuestView

  if (isEffectivelyGuest) {
    redirect('/')
  }

  // Access validation:
  const isSuperAdmin = role === 'admin'
  
  let hasAccess = isSuperAdmin || role === 'planner' || role === 'bride' || role === 'groom'
  if (!hasAccess) {
    const { data: perm } = await supabase
      .from('feature_permissions')
      .select('can_view')
      .eq('user_id', user.id)
      .eq('feature', 'budget')
      .eq('can_view', true)
      .maybeSingle()
    hasAccess = !!perm
  }

  if (!hasAccess) {
    redirect('/')
  }

  // Resolve access grants
  const { data: grant } = await supabase
    .from('access_grants')
    .select('scope')
    .eq('grantee_user_id', user.id)
    .eq('feature', 'budget')
    .maybeSingle()

  const resolvedSearchParams = await searchParams
  const urlViewSide = resolvedSearchParams.viewSide
  const activeTab = resolvedSearchParams.tab || 'planner'
  const sortParam = resolvedSearchParams.sort || 'allocation'
  
  // Support both single category and multi-category selection
  const rawCategoriesParam = resolvedSearchParams.categories || resolvedSearchParams.category || ''
  const selectedCategoryIds = rawCategoriesParam 
    ? rawCategoriesParam.split(',').map(s => s.trim()).filter(Boolean)
    : []
  const hasCategoryFilter = selectedCategoryIds.length > 0
  const categoryParamQuery = rawCategoriesParam ? `&categories=${rawCategoriesParam}` : ''
  
  // Validate permissions for target viewSide
  const canViewCombined = isSuperAdmin || grant?.scope === 'combined'
  const canViewOtherSide = isSuperAdmin || grant?.scope === 'other_side' || grant?.scope === 'combined'
  
  let activeSide: 'groom' | 'bride' | 'combined' = (urlViewSide as any) || side || 'groom'
  if (activeSide === 'combined' && !canViewCombined) {
    activeSide = (side as any) || 'groom'
  }
  if ((activeSide === 'groom' || activeSide === 'bride') && activeSide !== side && !canViewOtherSide) {
    activeSide = (side as any) || 'groom'
  }

  // Fetch all categories
  const { data: categories } = await supabase.from('categories').select('*').order('name')

  // Fetch all functions
  const { data: functions } = await supabase.from('functions').select('id, name').order('name')

  // Fetch master budget depending on activeSide
  let masterBudget = 0
  if (activeSide === 'combined') {
    const { data: configs } = await supabase.from('side_configurations').select('master_budget')
    masterBudget = (configs || []).reduce((acc, curr) => acc + Number(curr.master_budget), 0)
  } else {
    const { data: config } = await supabase
      .from('side_configurations')
      .select('master_budget')
      .eq('side', activeSide)
      .maybeSingle()
    masterBudget = config ? Number(config.master_budget) : 0
  }

  // Fetch expenses list details for Expense Manager log
  const { data: rawExpenses } = await supabase
    .from('expenses')
    .select(`
      id, amount, category_id, sub_item_id, function_id, vendor_quick_name, payment_method, status, due_date, notes, created_at,
      categories (name, emoji),
      category_sub_items (name),
      functions (name),
      expense_splits (side, amount)
    `)
    .order('created_at', { ascending: false })
  
  // Filter expenses list by activeSide if not combined
  const loggedExpenses = (rawExpenses || []).filter(e => {
    if (activeSide === 'combined') return true
    const splitsList = e.expense_splits || []
    return splitsList.some((s: any) => s.side === activeSide)
  })

  // Filtered expenses based on category query param(s)
  const displayedExpenses = hasCategoryFilter
    ? loggedExpenses.filter(e => e.category_id && selectedCategoryIds.includes(e.category_id))
    : loggedExpenses

  // Selected category objects if filter is active
  const selectedCategoryObjs = hasCategoryFilter
    ? (categories || []).filter(c => selectedCategoryIds.includes(c.id))
    : []

  // Calculate paid vs due cash flow metrics (based on displayed expenses)
  let totalPaid = 0
  let totalPending = 0

  displayedExpenses.forEach(e => {
    const amount = activeSide === 'combined'
      ? Number(e.amount)
      : (e.expense_splits || []).find((s: any) => s.side === activeSide)?.amount || 0
    
    if (e.status === 'paid') {
      totalPaid += Number(amount)
    } else {
      totalPending += Number(amount)
    }
  })

  // Fetch edit history logs if admin
  let historyLogs: any[] = []
  if (isSuperAdmin) {
    const { data: logs } = await supabase
      .from('expense_edit_history')
      .select(`
        id, field_changed, old_value, new_value, edited_at,
        expenses (vendor_quick_name),
        users (name)
      `)
      .order('edited_at', { ascending: false })
      .limit(10)
    historyLogs = logs || []
  }

  // Fetch category budgets
  let budgetQuery = supabase.from('category_budgets').select('*')
  if (activeSide !== 'combined') {
    budgetQuery = budgetQuery.eq('side', activeSide)
  }
  const { data: budgets } = await budgetQuery
  
  // Fetch category sub-items
  const { data: subItems } = await supabase.from('category_sub_items').select('*')
  
  // Fetch splits depending on activeSide
  let splitsQuery = supabase.from('expense_splits').select('amount, expenses!inner(category_id, sub_item_id)')
  if (activeSide !== 'combined') {
    splitsQuery = splitsQuery.eq('side', activeSide)
  }
  const { data: splits } = await splitsQuery
  
  // Calculate totals
  let totalBudget = 0
  let totalSpent = 0
  
  // Calculate per category
  const categoryStats = (categories || []).map(cat => {
    const catBudgets = (budgets || []).filter(b => b.category_id === cat.id)
    const maxBudget = catBudgets.reduce((acc, curr) => acc + Number(curr.max_budget), 0)
    totalBudget += maxBudget
    
    const catSplits = (splits || []).filter(s => {
      const exp = Array.isArray(s.expenses) ? s.expenses[0] : s.expenses
      return exp?.category_id === cat.id
    })
    const spent = catSplits.reduce((acc, curr) => acc + Number(curr.amount), 0)
    totalSpent += spent

    // Count logged transactions for this category
    const catExpenseCount = loggedExpenses.filter(e => e.category_id === cat.id).length
    
    // Map sub items and compute their spent details
    const catSubItems = (subItems || []).filter(s => s.category_id === cat.id).map(item => {
      const itemSplits = catSplits.filter(s => {
        const exp = Array.isArray(s.expenses) ? s.expenses[0] : s.expenses
        return exp?.sub_item_id === item.id
      })
      const itemSpent = itemSplits.reduce((acc, curr) => acc + Number(curr.amount), 0)
      const itemPercentage = Number(item.target_budget) > 0 
        ? (itemSpent / Number(item.target_budget)) * 100 
        : (itemSpent > 0 ? 100 : 0)

      return {
        ...item,
        spent: itemSpent,
        percentage: Math.min(itemPercentage, 100),
        overbudget: itemSpent > Number(item.target_budget) && Number(item.target_budget) > 0,
        nearlimit: itemSpent >= Number(item.target_budget) * 0.9 && itemSpent < Number(item.target_budget) && Number(item.target_budget) > 0
      }
    })
    
    const percentage = maxBudget > 0 ? (spent / maxBudget) * 100 : (spent > 0 ? 100 : 0)
    
    return {
      ...cat,
      maxBudget,
      spent,
      expenseCount: catExpenseCount,
      percentage: Math.min(percentage, 100),
      overbudget: spent > maxBudget && maxBudget > 0,
      nearlimit: spent >= maxBudget * 0.9 && spent < maxBudget && maxBudget > 0,
      subItemsList: catSubItems
    }
  })

  // Sort based on URL param
  if (sortParam === 'spent') {
    categoryStats.sort((a, b) => b.spent - a.spent)
  } else if (sortParam === 'name') {
    categoryStats.sort((a, b) => a.name.localeCompare(b.name))
  } else {
    // default: allocation (maxBudget)
    categoryStats.sort((a, b) => b.maxBudget - a.maxBudget)
  }

  const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
  
  // Determine color for dial
  let ringColor = 'stroke-mehendi'
  if (overallPercentage >= 100) ringColor = 'stroke-rust-red'
  else if (overallPercentage >= 80) ringColor = 'stroke-marigold'

  return (
    <main className="min-h-screen bg-ivory text-maroon p-4 md:p-8 max-w-4xl mx-auto pb-24 md:pb-28">
      {/* Top Navigation */}
      <div className="flex justify-between items-center mb-6">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-maroon hover:bg-marigold/20">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold text-maroon">Wedding Budget</h1>
          <p className="text-xs font-data text-maroon/60">Manage & Track Expenses</p>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Side Toggle Control (If Allowed) */}
      {(canViewCombined || canViewOtherSide) && (
        <div className="flex justify-center mb-6">
          <div className="bg-white p-1 rounded-full border border-marigold/30 shadow-sm flex items-center space-x-1">
            <Link href={`?viewSide=groom&tab=${activeTab}${categoryParamQuery}`}>
              <button
                className={`px-4 py-1.5 rounded-full text-xs font-data transition-all ${
                  activeSide === 'groom'
                    ? 'bg-maroon text-ivory font-bold shadow-sm'
                    : 'text-maroon/70 hover:text-maroon'
                }`}
              >
                Groom Side
              </button>
            </Link>
            <Link href={`?viewSide=bride&tab=${activeTab}${categoryParamQuery}`}>
              <button
                className={`px-4 py-1.5 rounded-full text-xs font-data transition-all ${
                  activeSide === 'bride'
                    ? 'bg-maroon text-ivory font-bold shadow-sm'
                    : 'text-maroon/70 hover:text-maroon'
                }`}
              >
                Bride Side
              </button>
            </Link>
            {canViewCombined && (
              <Link href={`?viewSide=combined&tab=${activeTab}${categoryParamQuery}`}>
                <button
                  className={`px-4 py-1.5 rounded-full text-xs font-data transition-all ${
                    activeSide === 'combined'
                      ? 'bg-maroon text-ivory font-bold shadow-sm'
                      : 'text-maroon/70 hover:text-maroon'
                  }`}
                >
                  Combined
                </button>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Tab Switcher: Budget Planner vs Expense Manager */}
      <div className="flex border-b border-marigold/30 mb-6 font-data text-sm">
        <Link 
          href={`?viewSide=${activeSide}&tab=planner${categoryParamQuery}`}
          className={`flex-1 text-center py-3 font-semibold transition-all border-b-2 flex items-center justify-center space-x-2 ${
            activeTab === 'planner'
              ? 'border-maroon text-maroon'
              : 'border-transparent text-maroon/50 hover:text-maroon'
          }`}
        >
          <span>🎯 Budget Planner</span>
        </Link>
        <Link 
          href={`?viewSide=${activeSide}&tab=expenses${categoryParamQuery}`}
          className={`flex-1 text-center py-3 font-semibold transition-all border-b-2 flex items-center justify-center space-x-2 ${
            activeTab === 'expenses'
              ? 'border-maroon text-maroon'
              : 'border-transparent text-maroon/50 hover:text-maroon'
          }`}
        >
          <span>💸 Expense Manager</span>
          {loggedExpenses.length > 0 && (
            <span className="bg-marigold/20 text-maroon text-[11px] px-2 py-0.5 rounded-full font-bold">
              {hasCategoryFilter ? `${displayedExpenses.length}/${loggedExpenses.length}` : loggedExpenses.length}
            </span>
          )}
        </Link>
      </div>

      {activeTab === 'planner' ? (
        /* ================= BUDGET PLANNER TAB ================= */
        <div className="space-y-6">
          {/* Main Top Overview Card */}
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-marigold/30 text-center relative overflow-hidden">
            {/* Contextual Adjust Allocations button */}
            {(isSuperAdmin || role === 'planner') && (
              <div className="flex justify-end mb-2">
                <Link href="/budget/setup">
                  <Button variant="outline" size="sm" className="h-8 text-xs font-data border-marigold/40 text-maroon hover:bg-marigold/15 shadow-sm">
                    ✏️ Adjust Allocations
                  </Button>
                </Link>
              </div>
            )}
            {masterBudget === 0 && totalBudget === 0 ? (
              <div className="py-6 space-y-3">
                <span className="text-4xl block">✨</span>
                <h3 className="text-lg font-display font-bold text-maroon">Welcome to Wedding Budget</h3>
                <p className="text-xs font-data text-maroon/60 max-w-sm mx-auto">
                  Set up your master budget target and assign category limits to track expenses seamlessly.
                </p>
                {(isSuperAdmin || role === 'planner') && (
                  <Link href="/budget/setup" className="inline-block pt-2">
                    <Button className="bg-maroon text-ivory hover:bg-maroon/90 shadow-md">
                      🚀 Set Up Wedding Budget
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <>
                <BudgetOverviewInteractive
                  masterBudget={masterBudget}
                  totalBudget={totalBudget}
                  totalSpent={totalSpent}
                  categoryStats={categoryStats}
                />
                <AllocationBreakdown
                  masterBudget={masterBudget}
                  totalBudget={totalBudget}
                  categoryStats={categoryStats}
                />
              </>
            )}
          </section>

          {/* Categories Progress list */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
              <h2 className="text-md font-display font-semibold text-maroon">By Category</h2>
              <div className="flex items-center space-x-2 text-xs font-data bg-white px-3 py-1.5 rounded-full border border-marigold/20 shadow-sm">
                <span className="text-maroon/50 font-semibold mr-1">Sort by:</span>
                <Link href={`?viewSide=${activeSide}&tab=${activeTab}&sort=allocation`} className={`transition-colors ${sortParam === 'allocation' ? 'font-bold text-maroon' : 'text-maroon/60 hover:text-maroon'}`}>Limit</Link>
                <span className="text-marigold/30">•</span>
                <Link href={`?viewSide=${activeSide}&tab=${activeTab}&sort=spent`} className={`transition-colors ${sortParam === 'spent' ? 'font-bold text-maroon' : 'text-maroon/60 hover:text-maroon'}`}>Spent</Link>
                <span className="text-marigold/30">•</span>
                <Link href={`?viewSide=${activeSide}&tab=${activeTab}&sort=name`} className={`transition-colors ${sortParam === 'name' ? 'font-bold text-maroon' : 'text-maroon/60 hover:text-maroon'}`}>A-Z</Link>
              </div>
            </div>
            
            {masterBudget === 0 && totalBudget === 0 ? (
              <div className="text-center p-8 bg-white rounded-2xl border border-marigold/30 space-y-4">
                <p className="text-maroon/80 font-data text-sm max-w-xs mx-auto leading-relaxed">
                  Define your wedding spending limits per category (Venue, Catering, Florals, etc.) to get started.
                </p>
                {(isSuperAdmin || role === 'planner') && (
                  <Link href="/budget/setup" className="inline-block">
                    <Button className="bg-maroon text-ivory hover:bg-maroon/90 shadow-sm font-medium">
                      ⚙️ Set Up Budgets & Targets
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {categoryStats.map(cat => {
                  const hasDetails = cat.description || (cat.subItemsList && cat.subItemsList.length > 0)
                  return (
                    <div key={cat.id} id={`cat-${cat.id}`} className="bg-white p-5 rounded-3xl shadow-sm hover:shadow-md transition-shadow border border-marigold/30 relative overflow-hidden">
                      {hasDetails ? (
                        <details className="group">
                          <summary className="list-none cursor-pointer outline-none block">
                            <div className="flex justify-between items-center gap-4">
                              <div className="flex items-center space-x-4 flex-1 min-w-0">
                              <div className="w-14 h-14 rounded-full bg-ivory border border-marigold/40 flex items-center justify-center text-3xl shadow-sm flex-shrink-0">
                                {cat.emoji}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center flex-wrap gap-1.5">
                                  <span className="font-display font-bold text-lg md:text-xl text-maroon block leading-tight truncate">{cat.name}</span>
                                  {cat.overbudget && (
                                    <span className="bg-rust-red/10 text-rust-red text-[10px] px-2 py-0.5 rounded-full font-bold border border-rust-red/20 shadow-sm">🚨 Over</span>
                                  )}
                                  {cat.nearlimit && (
                                    <span className="bg-marigold/20 text-maroon text-[10px] px-2 py-0.5 rounded-full font-bold border border-marigold/30 shadow-sm">⚠️ Near Limit</span>
                                  )}
                                </div>
                                <div className="flex items-center flex-wrap gap-2 mt-2">
                                  <div className="inline-flex items-center space-x-1.5 bg-marigold/10 text-maroon/80 font-bold border border-marigold/30 px-3 py-1 rounded-full text-[11px] hover:bg-marigold/20 hover:text-maroon transition-colors shadow-sm">
                                    <span>📋 View details</span>
                                    <span className="text-[9px] group-open:rotate-180 transition-transform inline-block">▼</span>
                                  </div>
                                  <Link
                                    href={`?viewSide=${activeSide}&tab=expenses&category=${cat.id}`}
                                    className="inline-flex items-center space-x-1 bg-ivory hover:bg-marigold/25 text-maroon font-bold border border-marigold/30 px-2.5 py-1 rounded-full text-[11px] transition-colors shadow-sm"
                                    title={`View all ${cat.name} expenses`}
                                  >
                                    <span>💸 {cat.expenseCount} {cat.expenseCount === 1 ? 'expense' : 'expenses'} →</span>
                                  </Link>
                                </div>
                              </div>
                            </div>
                            <div className="text-right flex flex-col items-end flex-shrink-0">
                              <div className="font-sans font-extrabold text-xl md:text-2xl text-maroon tracking-tight">{formatCurrency(cat.spent)}</div>
                              <div className="font-data text-[11px] text-maroon/60 font-semibold bg-marigold/10 px-2.5 py-0.5 rounded-full mt-1 border border-marigold/20">
                                Limit: {formatLakhs(cat.maxBudget)}
                              </div>
                            </div>
                          </div>
                          
                          {/* Overall Progress Bar - Moved up to be always visible */}
                          <div className="mt-3 flex items-center gap-3">
                            <div className="flex-1 h-2 bg-marigold/15 rounded-full overflow-hidden relative shadow-inner">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${cat.overbudget ? 'bg-rust-red' : (cat.percentage >= 80 ? 'bg-marigold' : 'bg-maroon')}`}
                                style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                              />
                            </div>
                            <span className={`text-[10px] font-bold font-data ${cat.overbudget ? 'text-rust-red' : 'text-maroon/60'}`}>
                              {Math.round(cat.percentage)}%
                            </span>
                          </div>
                        </summary>

                        {/* Expanded Details Panel */}
                        <div className="mt-4 pt-4 border-t border-marigold/15 space-y-4 animate-in slide-in-from-top-2 duration-200">
                          {cat.description && (
                            <div className="bg-ivory/40 p-3 rounded-xl border border-marigold/15 text-xs font-data text-maroon/80 whitespace-pre-line leading-relaxed shadow-inner">
                              📝 <strong>Notes:</strong> {cat.description}
                            </div>
                          )}

                          {cat.subItemsList && cat.subItemsList.length > 0 && (
                            <div className="space-y-3 px-1">
                              <h4 className="text-[10px] uppercase font-bold tracking-wider text-maroon/50 font-data">📊 Itemized Sub-Budgets</h4>
                              <div className="space-y-3">
                                {cat.subItemsList.map((item: any) => {
                                  const alertColor = item.overbudget 
                                    ? 'bg-rust-red' 
                                    : (item.nearlimit ? 'bg-marigold' : 'bg-maroon/70')
                                  return (
                                    <div key={item.id} className="space-y-1.5 pl-3 border-l-2 border-marigold/30">
                                      <div className="flex justify-between items-center text-xs font-data">
                                        <span className="text-maroon/80 font-bold">{item.name}</span>
                                        <div className="flex items-center space-x-2">
                                          <span className="font-sans font-bold text-maroon">{formatCurrency(item.spent)}</span>
                                          <span className="text-maroon/50 text-[10px]">of {formatLakhs(Number(item.target_budget))}</span>
                                          
                                          {item.overbudget && (
                                            <span className="bg-rust-red/10 text-rust-red text-[8px] px-1.5 py-0.5 rounded-full font-bold">🚨 Over</span>
                                          )}
                                          {item.nearlimit && (
                                            <span className="bg-marigold/10 text-maroon text-[8px] px-1.5 py-0.5 rounded-full font-bold">⚠️</span>
                                          )}
                                        </div>
                                      </div>
                                      {/* Sub-item mini progress bar */}
                                      <div className="w-full h-2 bg-marigold/15 rounded-full overflow-hidden mt-1 relative">
                                        <div 
                                          className={`h-full rounded-full ${alertColor}`}
                                          style={{ width: `${Math.min(item.percentage, 100)}%` }}
                                        />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Action links: Edit Allocation modal & filtered Expense Manager */}
                          <div className="pt-2 flex items-center justify-between gap-2 border-t border-marigold/15">
                            {(isSuperAdmin || role === 'planner') ? (
                              <QuickEditAllocationModal
                                categoryId={cat.id}
                                categoryName={cat.name}
                                categoryEmoji={cat.emoji}
                                currentLimit={cat.maxBudget}
                                currentDescription={cat.description || ''}
                                subItems={cat.subItemsList || []}
                                activeSide={activeSide}
                              />
                            ) : <div />}
                            <Link 
                              href={`?viewSide=${activeSide}&tab=expenses&category=${cat.id}`}
                              className="text-xs font-data font-bold text-maroon hover:text-maroon/80 underline decoration-marigold/50 underline-offset-4 flex items-center space-x-1"
                            >
                              <span>View all {cat.name} expenses ({cat.expenseCount}) in Expense Manager</span>
                              <span>→</span>
                            </Link>
                          </div>
                        </div>
                      </details>
                    ) : (
                      <div className="outline-none block">
                        <div className="flex justify-between items-center gap-4">
                          <div className="flex items-center space-x-4 flex-1 min-w-0">
                            <div className="w-14 h-14 rounded-full bg-ivory border border-marigold/40 flex items-center justify-center text-3xl shadow-sm flex-shrink-0">
                              {cat.emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-display font-bold text-lg md:text-xl text-maroon block leading-tight truncate">{cat.name}</span>
                              <div className="mt-2 flex items-center flex-wrap gap-2">
                                <Link
                                  href={`?viewSide=${activeSide}&tab=expenses&category=${cat.id}`}
                                  className="inline-flex items-center space-x-1 bg-ivory hover:bg-marigold/25 text-maroon font-bold border border-marigold/30 px-2.5 py-1 rounded-full text-[11px] transition-colors shadow-sm"
                                  title={`View all ${cat.name} expenses`}
                                >
                                  <span>💸 {cat.expenseCount} {cat.expenseCount === 1 ? 'expense' : 'expenses'} →</span>
                                </Link>
                                {(isSuperAdmin || role === 'planner') && (
                                  <QuickEditAllocationModal
                                    categoryId={cat.id}
                                    categoryName={cat.name}
                                    categoryEmoji={cat.emoji}
                                    currentLimit={cat.maxBudget}
                                    currentDescription={cat.description || ''}
                                    subItems={cat.subItemsList || []}
                                    activeSide={activeSide}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end flex-shrink-0">
                            <div className="font-sans font-extrabold text-xl md:text-2xl text-maroon tracking-tight">{formatCurrency(cat.spent)}</div>
                            <div className="font-data text-[11px] text-maroon/60 font-semibold bg-marigold/10 px-2.5 py-0.5 rounded-full mt-1 border border-marigold/20">
                              Limit: {formatLakhs(cat.maxBudget)}
                            </div>
                          </div>
                        </div>
                        {/* Overall Progress Bar */}
                        <div className="mt-4 flex items-center gap-3">
                          <div className="flex-1 h-2 bg-marigold/15 rounded-full overflow-hidden relative shadow-inner">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${cat.overbudget ? 'bg-rust-red' : (cat.percentage >= 80 ? 'bg-marigold' : 'bg-maroon')}`}
                              style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-bold font-data ${cat.overbudget ? 'text-rust-red' : 'text-maroon/60'}`}>
                            {Math.round(cat.percentage)}%
                          </span>
                        </div>
                      </div>
                    )}
                      
                    {cat.overbudget && (
                      <p className="text-xs text-rust-red mt-2.5 font-data flex items-center font-bold">
                        <span className="mr-1">⚠️</span> Over budget limit by {formatCurrency(cat.spent - cat.maxBudget)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            )}
          </section>
        </div>
      ) : (
        /* ================= EXPENSE MANAGER TAB ================= */
        <div className="space-y-6">
          {/* Category Multi-Filter Dropdown */}
          <CategoryFilterDropdown
            categories={(categories || []).map(c => ({
              id: c.id,
              name: c.name,
              emoji: c.emoji,
              count: loggedExpenses.filter(e => e.category_id === c.id).length
            }))}
            selectedCategoryIds={selectedCategoryIds}
            activeSide={activeSide}
            totalExpensesCount={loggedExpenses.length}
          />

          {/* Paid vs Due Cash Flow Summary Card */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-mehendi/25 p-4 rounded-2xl shadow-sm text-center">
              <span className="text-[10px] font-data text-maroon/50 uppercase tracking-wider block mb-1">
                {hasCategoryFilter && selectedCategoryObjs.length === 1
                  ? `${selectedCategoryObjs[0].name} Paid`
                  : hasCategoryFilter
                    ? `Selected (${selectedCategoryObjs.length}) Paid`
                    : 'Total Paid'}
              </span>
              <span className="text-xl font-bold font-data text-mehendi">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="bg-white border border-rust-red/25 p-4 rounded-2xl shadow-sm text-center">
              <span className="text-[10px] font-data text-maroon/50 uppercase tracking-wider block mb-1">
                {hasCategoryFilter && selectedCategoryObjs.length === 1
                  ? `${selectedCategoryObjs[0].name} Due`
                  : hasCategoryFilter
                    ? `Selected (${selectedCategoryObjs.length}) Due`
                    : 'Remaining Due'}
              </span>
              <span className="text-xl font-bold font-data text-rust-red">{formatCurrency(totalPending)}</span>
            </div>
          </div>

          {/* Transactions Log Section */}
          <section className="space-y-4">
            {!hasCategoryFilter && (
              <ExpenseAnalytics 
                expenses={loggedExpenses.map(e => ({
                  ...e, 
                  effectiveAmount: activeSide === 'combined' ? e.amount : ((e.expense_splits as any[])?.find(s => s.side === activeSide)?.amount || e.amount)
                }))} 
                categories={categories || []} 
                functions={functions || []}
              />
            )}

            <div className="flex justify-between items-center mb-3">
              <h2 className="text-md font-display font-semibold text-maroon">
                {hasCategoryFilter && selectedCategoryObjs.length === 1
                  ? `${selectedCategoryObjs[0].emoji} ${selectedCategoryObjs[0].name} Expenses (${displayedExpenses.length})`
                  : hasCategoryFilter
                    ? `Filtered Expenses (${displayedExpenses.length})`
                    : `Expenses Log (${displayedExpenses.length})`}
              </h2>
              <span className="text-[11px] font-data text-maroon/50 font-medium">
                Sorted by most recent
              </span>
            </div>

            {displayedExpenses.length === 0 ? (
              <div className="text-center p-8 bg-white rounded-2xl border border-marigold/30 space-y-4">
                <p className="text-maroon/80 font-data text-sm max-w-xs mx-auto">
                  {hasCategoryFilter
                    ? `No expenses logged under the selected ${selectedCategoryObjs.length > 1 ? `${selectedCategoryObjs.length} categories` : selectedCategoryObjs[0]?.name || 'category'} yet.`
                    : 'No transaction items logged yet. Keep receipts and bills organised by logging your first expense!'}
                </p>
                <div className="flex justify-center gap-3">
                  {hasCategoryFilter && (
                    <Link href={`?viewSide=${activeSide}&tab=expenses`}>
                      <Button variant="outline" className="border-marigold/40 text-maroon text-xs">
                        View All Expenses
                      </Button>
                    </Link>
                  )}
                  <Link href={`/budget/add${selectedCategoryIds.length === 1 ? `?category=${selectedCategoryIds[0]}` : ''}`}>
                    <Button className="bg-maroon text-ivory hover:bg-maroon/90 shadow-sm font-medium text-xs">
                      💸 Log Expense
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <ExpenseLogView
                expenses={displayedExpenses as any}
                activeSide={activeSide}
              />
            )}
          </section>
        </div>
      )}

      {/* Modification History (Admins Only) */}
      {isSuperAdmin && historyLogs.length > 0 && (
        <section className="mt-8 space-y-4">
          <h2 className="text-lg font-display font-semibold text-maroon font-serif">Modification History Log</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-4 space-y-3">
            {historyLogs.map(log => {
              const expenseObj = log.expenses as any;
              const userObj = log.users as any;
              return (
                <div key={log.id} className="text-xs font-data text-maroon/80 border-b border-marigold/10 pb-2 last:border-b-0 last:pb-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-maroon font-display">
                      {expenseObj?.vendor_quick_name || "Unnamed Expense"}
                    </span>
                    <span className="text-[10px] text-maroon/40 font-semibold">
                      {new Date(log.edited_at).toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-maroon/70">
                    Field <code className="bg-marigold/10 px-1 rounded text-[10px]">{log.field_changed}</code> changed from{' '}
                    <span className="font-semibold text-rust-red">&ldquo;{log.old_value || 'none'}&rdquo;</span> to{' '}
                    <span className="font-semibold text-mehendi">&ldquo;{log.new_value || 'none'}&rdquo;</span>
                  </p>
                  <p className="text-[10px] text-maroon/50 mt-0.5">
                    Edited by: <span className="font-medium text-maroon/70">{userObj?.name || 'System'}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Floating Action Button */}
      <Link href="/budget/add">
        <div className="fixed bottom-20 md:bottom-8 right-6 z-40 bg-maroon text-ivory px-6 py-4 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:scale-105 hover:bg-maroon/90 transition-all flex items-center justify-center cursor-pointer group border border-marigold/20">
          <Plus className="w-5 h-5 mr-2" />
          <span className="font-bold text-sm">Log Expense</span>
        </div>
      </Link>
    </main>
  )
}
