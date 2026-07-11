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

export default async function BudgetDashboard() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Fetch side and role
  const { data: dbUser } = await supabase.from('users').select('side, role').eq('id', user.id).single()
  const side = dbUser?.side
  const role = dbUser?.role || 'regular'

  if (role !== 'admin') {
    redirect('/')
  }

  if (!side) {
    return <div className="p-6">Error: Could not determine side.</div>
  }

  // Fetch all categories
  const { data: categories } = await supabase.from('categories').select('*').order('name')
  
  // Fetch budgets for this side
  const { data: budgets } = await supabase.from('category_budgets').select('*').eq('side', side)
  
  // Fetch expenses split to this side
  const { data: splits } = await supabase
    .from('expense_splits')
    .select('amount, expenses!inner(category_id)')
    .eq('side', side)

  // Calculate totals
  let totalBudget = 0
  let totalSpent = 0
  
  // Calculate per category
  const categoryStats = (categories || []).map(cat => {
    const budgetRow = (budgets || []).find(b => b.category_id === cat.id)
    const maxBudget = budgetRow ? Number(budgetRow.max_budget) : 0
    totalBudget += maxBudget
    
    const catSplits = (splits || []).filter(s => {
      const exp = Array.isArray(s.expenses) ? s.expenses[0] : s.expenses
      return exp?.category_id === cat.id
    })
    const spent = catSplits.reduce((acc, curr) => acc + Number(curr.amount), 0)
    totalSpent += spent
    
    const percentage = maxBudget > 0 ? (spent / maxBudget) * 100 : (spent > 0 ? 100 : 0)
    
    return {
      ...cat,
      maxBudget,
      spent,
      percentage: Math.min(percentage, 100),
      overbudget: spent > maxBudget && maxBudget > 0
    }
  })

  // Sort by highest percentage spent
  categoryStats.sort((a, b) => b.percentage - a.percentage)

  const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
  
  // Determine color for dial
  let ringColor = 'stroke-mehendi'
  if (overallPercentage >= 100) ringColor = 'stroke-rust-red'
  else if (overallPercentage >= 80) ringColor = 'stroke-marigold'

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-lg mx-auto bg-ivory pb-24">
      <header className="flex items-center justify-between py-4 border-b border-marigold/30 mb-6">
        <div className="flex items-center space-x-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-display font-semibold text-maroon">Budget</h1>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/budget/setup">
            <Button variant="ghost" size="icon" className="text-maroon/50 hover:text-maroon hover:bg-marigold/10">
              <Settings className="w-5 h-5" />
            </Button>
          </Link>
          <Link href="/budget/add">
            <Button size="icon" className="bg-maroon text-ivory hover:bg-maroon/90 rounded-full w-10 h-10 shadow-md">
              <Plus className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Rangoli Spend Dial */}
      <section className="flex flex-col items-center justify-center py-6">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle cx="50" cy="50" r="45" fill="none" className="stroke-marigold/20" strokeWidth="8" />
            {/* Progress circle */}
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
            <span className="text-sm font-data text-maroon/70 uppercase tracking-wider mb-1">Spent</span>
            <span className="text-2xl font-display font-bold text-maroon">{formatCurrency(totalSpent)}</span>
            {totalBudget > 0 && (
              <span className="text-xs font-data text-maroon/50 mt-1">of {formatCurrency(totalBudget)}</span>
            )}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mt-8 space-y-6">
        <h2 className="text-lg font-display font-semibold text-maroon mb-4">By Category</h2>
        
        {totalBudget === 0 && totalSpent === 0 ? (
          <div className="text-center p-6 bg-white rounded-2xl border border-marigold/30">
            <p className="text-maroon/70 font-data text-sm mb-4">You haven't set up your budget yet!</p>
            <Link href="/budget/setup">
              <Button className="bg-maroon text-ivory">Set Budgets</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {categoryStats.map(cat => (
              <div key={cat.id} className="bg-white p-4 rounded-xl shadow-sm border border-marigold/20">
                <div className="flex justify-between items-end mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{cat.emoji}</span>
                    <span className="font-data font-medium text-maroon">{cat.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-data font-semibold text-maroon">{formatCurrency(cat.spent)}</div>
                    <div className="font-data text-xs text-maroon/50">of {formatCurrency(cat.maxBudget)}</div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full h-2 bg-ivory rounded-full overflow-hidden mt-2 relative">
                  <div 
                    className={`h-full rounded-full ${cat.overbudget ? 'bg-rust-red' : (cat.percentage >= 80 ? 'bg-marigold' : 'bg-mehendi')}`}
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
                {cat.overbudget && (
                  <p className="text-xs text-rust-red mt-2 font-data flex items-center">
                    <span className="mr-1">⚠️</span> Over budget by {formatCurrency(cat.spent - cat.maxBudget)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
