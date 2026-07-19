import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Settings } from 'lucide-react'

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
  searchParams: Promise<{ viewSide?: string; tab?: string }>
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
      id, amount, vendor_quick_name, payment_method, status, due_date, notes, created_at,
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

  // Sort by highest percentage spent
  categoryStats.sort((a, b) => b.percentage - a.percentage)

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
            <Link href="/budget/settings">
              <Button variant="ghost" size="icon" className="text-maroon/50 hover:text-maroon hover:bg-marigold/10" title="Permissions Settings">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          )}
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
          {/* Spend dial comparing category budget sum vs. master budget limit */}
          <section className="flex flex-col items-center justify-center py-4 bg-white rounded-2xl border border-marigold/10 p-6 shadow-sm">
            <div className="relative w-40 h-40 flex items-center justify-center mb-4">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" className="stroke-marigold/15" strokeWidth="8" />
                <circle 
                  cx="50" cy="50" r="45" fill="none" 
                  className={`${ringColor} transition-all duration-1000 ease-out`} 
                  strokeWidth="8" 
                  strokeDasharray="283" 
                  strokeDashoffset={283 - (283 * Math.min(overallPercentage, 100)) / 100} 
                  strokeLinecap="round" 
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs font-data text-maroon/70 uppercase tracking-wider mb-0.5">Spent</span>
                <span className="text-xl font-display font-bold text-maroon">{formatCurrency(totalSpent)}</span>
                {masterBudget > 0 && (
                  <span className="text-[10px] font-data text-maroon/50 mt-0.5">of {formatCurrency(masterBudget)} target</span>
                )}
              </div>
            </div>

            {/* Unallocated balance card */}
            <div className="w-full text-center border-t border-marigold/10 pt-4 flex justify-between text-xs font-data text-maroon/70">
              <div>
                <span className="block text-maroon/50">Allocated Categories</span>
                <span className="font-semibold text-maroon">{formatCurrency(totalBudget)}</span>
              </div>
              <div className="border-l border-marigold/15 pl-4 text-right">
                <span className="block text-maroon/50">Unallocated Target</span>
                <span className={`font-semibold ${masterBudget - totalBudget < 0 ? 'text-rust-red' : 'text-mehendi'}`}>
                  {formatCurrency(masterBudget - totalBudget)}
                </span>
              </div>
            </div>
          </section>

          {/* Stacked Allocation Strip Indicator */}
          {masterBudget > 0 && (
            <section className="bg-white p-5 rounded-2xl border border-marigold/10 shadow-sm space-y-4 font-data">
              <div className="flex justify-between items-center text-xs font-semibold text-maroon">
                <span>🎨 Where the money goes</span>
                <span className="text-maroon/50 font-normal">Allocated: {formatCurrency(totalBudget)} of {formatCurrency(masterBudget)}</span>
              </div>
              
              <div className="w-full h-4 bg-marigold/10 rounded-full flex overflow-hidden shadow-inner border border-marigold/10">
                {categoryStats.filter(c => c.maxBudget > 0).map((cat, idx) => {
                  const pct = (cat.maxBudget / masterBudget) * 100
                  const colors = ['bg-maroon', 'bg-mehendi', 'bg-marigold', 'bg-rust-red', 'bg-slate-500', 'bg-teal-600', 'bg-amber-700']
                  const colorClass = colors[idx % colors.length]
                  return (
                    <div 
                      key={cat.id}
                      className={`${colorClass} h-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                      title={`${cat.name}: ${formatCurrency(cat.maxBudget)} (${Math.round(pct)}%)`}
                    />
                  )
                })}
                {Math.max(0, masterBudget - totalBudget) > 0 && (
                  <div 
                    className="bg-marigold/15 h-full transition-all duration-500 border-l border-marigold/20"
                    style={{ width: `${(Math.max(0, masterBudget - totalBudget) / masterBudget) * 100}%` }}
                    title={`Unallocated: ${formatCurrency(Math.max(0, masterBudget - totalBudget))}`}
                  />
                )}
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1 border-t border-marigold/5">
                {categoryStats.filter(c => c.maxBudget > 0).slice(0, 6).map((cat, idx) => {
                  const pct = Math.round((cat.maxBudget / masterBudget) * 100)
                  const colors = ['bg-maroon', 'bg-mehendi', 'bg-marigold', 'bg-rust-red', 'bg-slate-500', 'bg-teal-600', 'bg-amber-700']
                  const colorClass = colors[idx % colors.length]
                  return (
                    <span key={cat.id} className="text-[10px] text-maroon/70 flex items-center space-x-1 font-medium">
                      <span className={`w-2 h-2 rounded-full ${colorClass} inline-block`} />
                      <span>{cat.name} ({pct}%)</span>
                    </span>
                  )
                })}
                {Math.max(0, masterBudget - totalBudget) > 0 && (
                  <span className="text-[10px] text-maroon/70 flex items-center space-x-1 font-medium">
                    <span className="w-2 h-2 rounded-full bg-marigold/15 inline-block border border-marigold/30" />
                    <span>Unallocated ({Math.round((Math.max(0, masterBudget - totalBudget) / masterBudget) * 100)}%)</span>
                  </span>
                )}
              </div>
            </section>
          )}

          {/* Categories Progress list */}
          <section className="space-y-4">
            <h2 className="text-md font-display font-semibold text-maroon mb-3">By Category</h2>
            
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
                    <div key={cat.id} className="bg-white p-4 rounded-xl shadow-sm border border-marigold/20">
                      {hasDetails ? (
                        <details className="group">
                          <summary className="list-none cursor-pointer flex justify-between items-start outline-none">
                            <div className="flex items-start space-x-3 flex-1 pr-2">
                              <span className="text-2xl mt-0.5">{cat.emoji}</span>
                              <div className="flex-1">
                                <div className="flex items-center flex-wrap gap-1.5">
                                  <span className="font-data font-bold text-base text-maroon block leading-tight">{cat.name}</span>
                                  {cat.overbudget && (
                                    <span className="bg-rust-red/10 text-rust-red text-[9px] px-2 py-0.5 rounded-full font-bold border border-rust-red/20">🚨 Over Budget</span>
                                  )}
                                  {cat.nearlimit && (
                                    <span className="bg-marigold/20 text-maroon text-[9px] px-2 py-0.5 rounded-full font-bold border border-marigold/30">⚠️ Near Limit</span>
                                  )}
                                </div>
                                <div className="inline-flex items-center space-x-1 mt-1.5 bg-marigold/10 text-maroon font-bold border border-marigold/30 px-2 py-0.5 rounded text-[10px] hover:bg-marigold/25 transition-colors">
                                  <span>📋 View Notes / Sub-items</span>
                                  <span className="text-[8px] group-open:rotate-180 transition-transform inline-block">▼</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-data font-bold text-base text-maroon">{formatCurrency(cat.spent)}</div>
                              <div className="font-data text-xs text-maroon font-semibold">of {formatCurrency(cat.maxBudget)} limit</div>
                            </div>
                          </summary>

                          {/* Expanded Details Panel */}
                          <div className="mt-3 pt-3 border-t border-marigold/10 space-y-3.5 animate-in slide-in-from-top-1 duration-200">
                            {cat.description && (
                              <div className="bg-ivory/50 p-2.5 rounded-lg border border-marigold/10 text-xs font-data text-maroon/80 whitespace-pre-line leading-relaxed">
                                📝 <strong>Notes:</strong> {cat.description}
                              </div>
                            )}

                            {cat.subItemsList && cat.subItemsList.length > 0 && (
                              <div className="space-y-3 pl-1">
                                <h4 className="text-[9px] uppercase font-bold tracking-wider text-maroon/50 font-data">📊 Itemized Sub-Budgets</h4>
                                <div className="space-y-2.5">
                                  {cat.subItemsList.map((item: any) => {
                                    const alertColor = item.overbudget 
                                      ? 'bg-rust-red' 
                                      : (item.nearlimit ? 'bg-marigold' : 'bg-mehendi')
                                    return (
                                      <div key={item.id} className="space-y-1 pl-2.5 border-l-2 border-marigold/20">
                                        <div className="flex justify-between items-center text-xs font-data">
                                          <span className="text-maroon/80 font-medium">{item.name}</span>
                                          <div className="flex items-center space-x-1.5">
                                            <span className="font-bold text-maroon">{formatCurrency(item.spent)}</span>
                                            <span className="text-maroon/50 text-[10px]">of {formatLakhs(Number(item.target_budget))}</span>
                                            
                                            {item.overbudget && (
                                              <span className="bg-rust-red/10 text-rust-red text-[8px] px-1.5 py-0.5 rounded-full font-bold">🚨 Over</span>
                                            )}
                                            {item.nearlimit && (
                                              <span className="bg-marigold/10 text-maroon text-[8px] px-1.5 py-0.5 rounded-full font-bold">⚠️ Warning</span>
                                            )}
                                          </div>
                                        </div>
                                        {/* Sub-item mini progress bar */}
                                        <div className="w-full h-1 bg-ivory rounded-full overflow-hidden mt-1 relative">
                                          <div 
                                            className={`h-full rounded-full ${alertColor}`}
                                            style={{ width: `${item.percentage}%` }}
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
                        <div className="flex justify-between items-start outline-none">
                          <div className="flex items-start space-x-3 flex-1 pr-2">
                            <span className="text-2xl mt-0.5">{cat.emoji}</span>
                            <div>
                              <span className="font-data font-bold text-base text-maroon block leading-tight">{cat.name}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-data font-bold text-base text-maroon">{formatCurrency(cat.spent)}</div>
                            <div className="font-data text-xs text-maroon font-semibold">of {formatCurrency(cat.maxBudget)} limit</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Overall Progress Bar */}
                      <div className="w-full h-1.5 bg-ivory rounded-full overflow-hidden mt-3.5 relative">
                        <div 
                          className={`h-full rounded-full ${cat.overbudget ? 'bg-rust-red' : (cat.percentage >= 80 ? 'bg-marigold' : 'bg-mehendi')}`}
                          style={{ width: `${cat.percentage}%` }}
                        />
                      </div>
                      {cat.overbudget && (
                        <p className="text-xs text-rust-red mt-2 font-data flex items-center font-bold">
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
                        <span className="font-bold text-maroon block font-data">{formatCurrency(activeSide === 'combined' ? e.amount : ((e.expense_splits as any[])?.find(s => s.side === activeSide)?.amount || e.amount))}</span>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full inline-block mt-1 font-semibold tracking-wider uppercase font-data ${
                          e.status === 'paid' ? 'bg-mehendi/15 text-mehendi' : 'bg-rust-red/15 text-rust-red'
                        }`}>
                          {e.status}
                        </span>
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
