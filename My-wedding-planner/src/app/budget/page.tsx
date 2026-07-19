import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Settings, Pencil } from 'lucide-react'
import { BudgetOverviewInteractive } from '@/components/BudgetOverviewInteractive'
import { ExpenseAnalytics } from '@/components/ExpenseAnalytics'
import { AllocationBreakdown } from '@/components/AllocationBreakdown'

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
  searchParams: Promise<{ viewSide?: string; tab?: string; sort?: string }>
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

  // Access validation:
  const isAdmin = role === 'admin' || role === 'bride' || role === 'groom'
  
  let hasAccess = isAdmin
  if (!isAdmin) {
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
  
  // Validate permissions for target viewSide
  const canViewCombined = isAdmin || grant?.scope === 'combined'
  const canViewOtherSide = isAdmin || grant?.scope === 'other_side' || grant?.scope === 'combined'
  
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
      id, amount, category_id, function_id, vendor_quick_name, payment_method, status, due_date, notes, created_at,
      categories (name, emoji),
      expense_splits (side, amount)
    `)
    .order('created_at', { ascending: false })
  
  // Filter expenses list by activeSide if not combined
  const loggedExpenses = (rawExpenses || []).filter(e => {
    if (activeSide === 'combined') return true
    const splitsList = e.expense_splits || []
    return splitsList.some((s: any) => s.side === activeSide)
  })

  // Calculate paid vs due cash flow metrics
  let totalPaid = 0
  let totalPending = 0

  loggedExpenses.forEach(e => {
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
  if (isAdmin) {
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
  
  // Fetch budgets depending on activeSide
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

  const isSetup = totalBudget > 0 || totalSpent > 0

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-lg mx-auto bg-ivory pb-24">
      <header className="flex items-center justify-between py-4 border-b border-marigold/30 mb-6">
        <div className="flex items-center space-x-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-display font-semibold text-maroon font-serif">Budget</h1>
        </div>
        <div className="flex items-center space-x-2">
          {isAdmin && (
            <Link href="/budget/setup">
              <Button variant="outline" className="border-marigold/40 text-maroon hover:bg-marigold/10 text-xs py-1 h-8">
                ⚙️ Setup Limits
              </Button>
            </Link>
          )}
          <Link href="/budget/add">
            <Button className="bg-maroon text-ivory hover:bg-maroon/90 text-xs py-1 h-8 shadow-sm font-medium">
              💸 Log Expense
            </Button>
          </Link>
        </div>
      </header>

      {/* Side selection toggles */}
      {(isAdmin || grant) && (
        <div className="grid grid-cols-3 gap-1 bg-marigold/10 p-1 rounded-full mb-6">
          <Link href={`?viewSide=groom&tab=${activeTab}`} className={`py-2 text-center text-xs font-semibold rounded-full transition-all duration-300 ${
            activeSide === 'groom' ? 'bg-maroon text-ivory shadow-sm' : 'text-maroon/70 hover:text-maroon'
          }`}>
            🤵‍♂️ Groom's
          </Link>
          <Link href={`?viewSide=bride&tab=${activeTab}`} className={`py-2 text-center text-xs font-semibold rounded-full transition-all duration-300 ${
            activeSide === 'bride' ? 'bg-maroon text-ivory shadow-sm' : 'text-maroon/70 hover:text-maroon'
          }`}>
            👰‍♀️ Bride's
          </Link>
          <Link 
            href={canViewCombined ? `?viewSide=combined&tab=${activeTab}` : "#"} 
            className={`py-2 text-center text-xs font-semibold rounded-full transition-all duration-300 ${
              !canViewCombined ? 'opacity-30 cursor-not-allowed' :
              activeSide === 'combined' ? 'bg-maroon text-ivory shadow-sm' : 'text-maroon/70 hover:text-maroon'
            }`}
          >
            🤝 Combined
          </Link>
        </div>
      )}

      {/* Sub-tabs segment switcher */}
      <div className="flex border-b border-marigold/30 mb-6 font-data text-sm">
        <Link 
          href={`?viewSide=${activeSide}&tab=planner`}
          className={`flex-1 text-center py-2.5 font-medium border-b-2 transition-all duration-300 ${
            activeTab === 'planner' 
              ? 'border-maroon text-maroon font-bold' 
              : 'border-transparent text-maroon/60 hover:text-maroon'
          }`}
        >
          📊 Budget Planner
        </Link>
        <Link 
          href={`?viewSide=${activeSide}&tab=expenses`}
          className={`flex-1 text-center py-2.5 font-medium border-b-2 transition-all duration-300 ${
            activeTab === 'expenses' 
              ? 'border-maroon text-maroon font-bold' 
              : 'border-transparent text-maroon/60 hover:text-maroon'
          }`}
        >
          💸 Expense Manager
        </Link>
      </div>

      {activeTab === 'planner' ? (
        /* ================= BUDGET PLANNER TAB ================= */
        <div className="space-y-6">
          {/* Unified Budget Overview & Allocations Section */}
          <section className="bg-gradient-to-br from-white to-ivory rounded-3xl border border-marigold/30 shadow-md p-6 relative overflow-hidden space-y-8">
            {/* Background pattern decoration */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-marigold/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-mehendi/5 rounded-full blur-2xl pointer-events-none" />
            
            {/* Unified Master Overview */}
            {masterBudget > 0 && (
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
                {isAdmin && (
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
                                <div className="inline-flex items-center space-x-1.5 mt-2 bg-marigold/10 text-maroon/80 font-bold border border-marigold/30 px-3 py-1 rounded-full text-[11px] hover:bg-marigold/20 hover:text-maroon transition-colors shadow-sm">
                                  <span>📋 View details</span>
                                  <span className="text-[9px] group-open:rotate-180 transition-transform inline-block">▼</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right flex flex-col items-end flex-shrink-0">
                              <div className="font-display font-bold text-xl md:text-2xl text-maroon">{formatCurrency(cat.spent)}</div>
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
                                          <span className="font-bold text-maroon">{formatCurrency(item.spent)}</span>
                                          <span className="text-maroon/50 text-[10px]">of {formatLakhs(Number(item.target_budget))}</span>
                                          
                                          {item.overbudget && (
                                            <span className="bg-rust-red/10 text-rust-red text-[8px] px-1.5 py-0.5 rounded-full font-bold">🚨 Over</span>
                                          )}
                                          {item.nearlimit && (
                                            <span className="bg-marigold/10 text-maroon text-[8px] px-1.5 py-0.5 rounded-full font-bold">⚠️</span>
                                          )}
                                        </div>
                                      </div>
                                      {/* Sub-item mini progress bar - Thickened and clarified */}
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
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end flex-shrink-0">
                            <div className="font-display font-bold text-xl md:text-2xl text-maroon">{formatCurrency(cat.spent)}</div>
                            <div className="font-data text-[11px] text-maroon/60 font-semibold bg-marigold/10 px-2.5 py-0.5 rounded-full mt-1 border border-marigold/20">
                              Limit: {formatLakhs(cat.maxBudget)}
                            </div>
                          </div>
                        </div>
                        {/* Overall Progress Bar - Moved up to be always visible */}
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
          {/* Paid vs Due Cash Flow Summary Card */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-mehendi/25 p-4 rounded-2xl shadow-sm text-center">
              <span className="text-[10px] font-data text-maroon/50 uppercase tracking-wider block mb-1">Total Paid</span>
              <span className="text-xl font-bold font-data text-mehendi">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="bg-white border border-rust-red/25 p-4 rounded-2xl shadow-sm text-center">
              <span className="text-[10px] font-data text-maroon/50 uppercase tracking-wider block mb-1">Remaining Due</span>
              <span className="text-xl font-bold font-data text-rust-red">{formatCurrency(totalPending)}</span>
            </div>
          </div>

          {/* Transactions Log Section */}
          <section className="space-y-4">
            <ExpenseAnalytics 
              expenses={loggedExpenses.map(e => ({
                ...e, 
                effectiveAmount: activeSide === 'combined' ? e.amount : ((e.expense_splits as any[])?.find(s => s.side === activeSide)?.amount || e.amount)
              }))} 
              categories={categories || []} 
              functions={functions || []}
            />

            <h2 className="text-md font-display font-semibold text-maroon mb-3">Expenses Log ({loggedExpenses.length})</h2>

            {loggedExpenses.length === 0 ? (
              <div className="text-center p-8 bg-white rounded-2xl border border-marigold/30 space-y-4">
                <p className="text-maroon/80 font-data text-sm max-w-xs mx-auto">
                  No transaction items logged yet. Keep receipts and bills organised by logging your first expense!
                </p>
                <Link href="/budget/add" className="inline-block">
                  <Button className="bg-maroon text-ivory hover:bg-maroon/90 shadow-sm font-medium">
                    💸 Log First Expense
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {loggedExpenses.map(e => (
                  <div key={e.id} className="bg-white p-4 rounded-xl shadow-sm border border-marigold/20 hover:border-marigold transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xl">{(e.categories as any)?.emoji || '💸'}</span>
                        <div>
                          <span className="font-data font-medium text-maroon block">{(e.categories as any)?.name || 'General'}</span>
                          <span className="text-[10px] text-maroon/50 block font-data">{e.vendor_quick_name || 'Generic Vendor'}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-maroon block font-data">{formatCurrency(activeSide === 'combined' ? e.amount : ((e.expense_splits as any[])?.find(s => s.side === activeSide)?.amount || e.amount))}</span>
                          <Link href={`/budget/${e.id}/edit`}>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-maroon/50 hover:text-maroon hover:bg-marigold/20">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </div>
                        <div className="text-right">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full inline-block mt-1 font-semibold tracking-wider uppercase font-data ${
                            e.status === 'paid' ? 'bg-mehendi/15 text-mehendi' : 'bg-rust-red/15 text-rust-red'
                          }`}>
                            {e.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    {(e.notes || e.due_date || (e.payment_method && e.payment_method !== 'cash')) && (
                      <div className="text-xs font-data text-maroon/65 mt-2 pt-2 border-t border-marigold/10 flex justify-between items-center">
                        <span className="truncate max-w-[200px] italic">{e.notes || `Paid via ${e.payment_method}`}</span>
                        {e.status === 'due' && e.due_date && (
                          <span className="text-[10px] font-semibold text-rust-red bg-rust-red/5 px-1.5 py-0.5 rounded">
                            Due: {new Date(e.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modification History (Admins Only) */}
      {isAdmin && historyLogs.length > 0 && (
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
    </main>
  )
}
