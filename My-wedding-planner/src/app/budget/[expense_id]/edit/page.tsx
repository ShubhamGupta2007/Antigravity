'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { DeleteExpenseButton } from '@/components/DeleteExpenseButton'

type Category = {
  id: string
  name: string
  emoji: string
  function_id?: string | null
}

const formatIndianCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0
  }).format(amount)
}

export default function EditExpenseForm({ params }: { params: Promise<{ expense_id: string }> }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [functions, setFunctions] = useState<any[]>([])
  const [allSubItems, setAllSubItems] = useState<any[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  
  const [expense, setExpense] = useState<any>(null)
  const [amountValue, setAmountValue] = useState<string>('')
  const [expenseDateValue, setExpenseDateValue] = useState<string>('')
  const [statusValue, setStatusValue] = useState<string>('paid')
  const [dueDateValue, setDueDateValue] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const resolvedParams = use(params)
  const expenseId = resolvedParams.expense_id

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single()
      if ((dbUser?.role !== 'admin' && dbUser?.role !== 'bride' && dbUser?.role !== 'groom' && dbUser?.role !== 'planner')) {
        router.push('/')
        return
      }

      // Fetch reference data
      const [catRes, funcRes, subRes, expRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('functions').select('id, name').order('name'),
        supabase.from('category_sub_items').select('*').order('name'),
        supabase.from('expenses').select('*').eq('id', expenseId).single()
      ])

      if (catRes.data) setCategories(catRes.data)
      if (funcRes.data) setFunctions(funcRes.data)
      if (subRes.data) setAllSubItems(subRes.data)
      
      if (expRes.data) {
        setExpense(expRes.data)
        setAmountValue(String(expRes.data.amount || ''))
        setSelectedCategoryId(expRes.data.category_id)
        setStatusValue(expRes.data.status || 'paid')
        const initialDate = expRes.data.status === 'due' && expRes.data.due_date 
          ? expRes.data.due_date 
          : (expRes.data.created_at ? new Date(expRes.data.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
        setExpenseDateValue(initialDate)
        setDueDateValue(expRes.data.due_date || initialDate)
      } else {
        console.error("Expense fetch error:", expRes.error)
        setError('Expense not found. ID: ' + expenseId + (expRes.error ? ' Error: ' + expRes.error.message : ''))
      }

      setFetching(false)
    }
    init()
  }, [supabase, router, expenseId])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    const category_id = formData.get('category_id') as string
    const sub_item_id = (formData.get('sub_item_id') as string) || null

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError("Not logged in")
      setLoading(false)
      return
    }

    const { data: dbUser } = await supabase.from('users').select('side').eq('id', user.id).single()
    
    const chosenCategory = categories.find(c => c.id === category_id)
    const selectedFunctionId = chosenCategory?.function_id || (formData.get('function_id') as string) || expense.function_id || null
    
    let fundedSide = dbUser?.side || user.user_metadata?.side
    let isJoint = false
    
    if (selectedFunctionId) {
      const { data: funcDetails } = await supabase
        .from('functions')
        .select('hosting_side')
        .eq('id', selectedFunctionId)
        .single()
      
      if (funcDetails?.hosting_side) {
        if (funcDetails.hosting_side === 'joint') {
          isJoint = true
        } else {
          fundedSide = funcDetails.hosting_side
        }
      }
    }

    if (!fundedSide && !isJoint) {
      isJoint = true
    }

    const vendorQuickName = formData.get('vendor')
    const globalNotes = formData.get('notes') as string
    const amount = Number(formData.get('amount'))
    const status = formData.get('status')
    
    const dbStatus = status === 'pending' ? 'due' : status

    const expDate = formData.get('expense_date') as string
    const dueDate = formData.get('due_date') as string
    const effectiveDueDate = dbStatus === 'due' ? (dueDate || expDate || null) : null

    const updatePayload: any = {
      amount,
      category_id,
      sub_item_id,
      function_id: selectedFunctionId,
      vendor_quick_name: vendorQuickName,
      payment_method: formData.get('payment_method') || 'bank_transfer',
      status: dbStatus,
      due_date: effectiveDueDate,
      notes: globalNotes
    }
    const recordDate = dbStatus === 'due' ? (effectiveDueDate || expDate) : expDate
    if (recordDate) {
      updatePayload.created_at = new Date(recordDate + 'T12:00:00Z').toISOString()
    }

    const { error: expError } = await supabase.from('expenses').update(updatePayload).eq('id', expenseId)

    if (expError) {
      setError(expError.message)
      setLoading(false)
      return
    }

    // Re-create splits to ensure correctness
    await supabase.from('expense_splits').delete().eq('expense_id', expenseId)

    if (isJoint) {
      await supabase.from('expense_splits').insert([
        { expense_id: expenseId, side: 'groom', amount: amount / 2 },
        { expense_id: expenseId, side: 'bride', amount: amount / 2 }
      ])
    } else if (fundedSide) {
      await supabase.from('expense_splits').insert({
        expense_id: expenseId,
        side: fundedSide,
        amount: amount
      })
    }
    
    router.push('/budget?tab=expenses')
    router.refresh()
  }

  if (fetching) return <div className="p-8 text-center text-maroon font-data animate-pulse">Loading expense data...</div>
  if (error && !expense) return <div className="p-8 text-center text-rust-red font-data">{error}</div>

  const visibleSubItems = allSubItems.filter(s => s.category_id === selectedCategoryId)
  
  // Is this category hard-linked to a function?
  const isFunctionLocked = !!categories.find(c => c.id === selectedCategoryId)?.function_id
  const numAmount = parseFloat(amountValue) || 0

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24 space-y-6">
      <div className="flex items-center space-x-4 mb-6">
        <Link href="/budget?tab=expenses">
          <Button variant="ghost" size="icon" className="text-maroon hover:bg-marigold/10 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-semibold text-maroon">Edit Expense</h1>
          <p className="text-sm font-data text-maroon/70">Update the details of your logged expense.</p>
        </div>
      </div>

      {error && <div className="bg-rust-red/10 border border-rust-red/20 text-rust-red p-3 rounded-md text-sm font-data">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-5 rounded-2xl border border-marigold/30 shadow-sm space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <select 
              name="category_id" 
              required
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-marigold/50 bg-ivory px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
            >
              <option value="">Select category...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
          </div>

          {visibleSubItems.length > 0 && (
            <div className="space-y-2">
              <Label>Specific Item (Optional)</Label>
              <select 
                name="sub_item_id" 
                defaultValue={expense.sub_item_id || ""}
                className="flex h-10 w-full rounded-md border border-marigold/50 bg-ivory px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
              >
                <option value="">General (No specific sub-item)</option>
                {visibleSubItems.map(s => (
                  <option key={s.id} value={s.id}>{s.name} (Limit: ₹{formatIndianCurrency(s.target_budget)})</option>
                ))}
              </select>
            </div>
          )}

          {!isFunctionLocked && functions.length > 0 && (
            <div className="space-y-2">
              <Label>Link to Function (Optional)</Label>
              <select 
                name="function_id" 
                defaultValue={expense.function_id || ""}
                className="flex h-10 w-full rounded-md border border-marigold/50 bg-ivory px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
              >
                <option value="">None / General Expense</option>
                {functions.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <p className="text-xs text-maroon/60 font-data">Linking auto-determines if this expense is Joint or solely funded based on the Function.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Vendor / Payee Name</Label>
            <Input name="vendor" defaultValue={expense.vendor_quick_name || ""} placeholder="e.g. Taj Hotels, ABC Decorators" className="bg-ivory" />
          </div>
          
          <div className="space-y-2">
            <Label>General Notes</Label>
            <Input name="notes" defaultValue={expense.notes || ""} placeholder="Any extra details?" className="bg-ivory" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-marigold/30 shadow-sm space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Amount (₹)</Label>
              {numAmount > 0 && (
                <span className="text-xs font-data font-bold text-maroon bg-marigold/15 px-2.5 py-0.5 rounded-full border border-marigold/30">
                  ₹{formatIndianCurrency(numAmount)}
                </span>
              )}
            </div>
            <Input 
              name="amount" 
              type="number" 
              step="any" 
              required 
              value={amountValue} 
              onChange={e => setAmountValue(e.target.value)}
              placeholder="0.00" 
              className="bg-ivory font-data text-lg font-bold" 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{statusValue === 'due' ? 'Payment Due Date' : 'Payment / Transaction Date'}</Label>
              <Input 
                name="expense_date" 
                type="date" 
                value={expenseDateValue}
                onChange={(e) => setExpenseDateValue(e.target.value)}
                className="bg-ivory font-data font-semibold text-maroon" 
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <select 
                name="status" 
                value={statusValue} 
                onChange={(e) => setStatusValue(e.target.value)}
                className="flex h-10 w-full rounded-md border border-marigold/50 bg-ivory px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon font-semibold"
              >
                <option value="paid">Paid</option>
                <option value="due">Pending / Due</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Payment Method</Label>
            <select name="payment_method" defaultValue={expense.payment_method || 'upi'} className="flex h-10 w-full rounded-md border border-marigold/50 bg-ivory px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon">
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <Button 
            type="submit" 
            disabled={loading}
            className="w-full bg-maroon text-ivory hover:bg-maroon/90 shadow-md h-12 text-lg font-medium rounded-xl cursor-pointer"
          >
            {loading ? 'Saving Changes...' : 'Save Changes'}
          </Button>

          <DeleteExpenseButton 
            expenseId={expenseId} 
            vendorName={expense.vendor_quick_name || undefined}
            redirectUrl="/budget?tab=expenses"
            variant="full"
          />
        </div>
      </form>
    </div>
  )
}
