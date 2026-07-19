'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type Category = {
  id: string
  name: string
  emoji: string
  function_id?: string | null
}

function AddExpenseForm() {
  const [categories, setCategories] = useState<Category[]>([])
  const [functions, setFunctions] = useState<any[]>([])
  const [allSubItems, setAllSubItems] = useState<any[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const functionId = searchParams.get('function_id')

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

      // Check role
      const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (dbUser?.role !== 'admin' && dbUser?.role !== 'bride' && dbUser?.role !== 'groom') {
        router.push('/')
        return
      }

      const { data } = await supabase.from('categories').select('*').order('name')
      if (data) {
        setCategories(data)
        if (data.length > 0) setSelectedCategoryId(data[0].id)
      }

      const { data: funcData } = await supabase.from('functions').select('id, name').order('name')
      if (funcData) setFunctions(funcData)

      const { data: subData } = await supabase.from('category_sub_items').select('*').order('name')
      if (subData) setAllSubItems(subData)

      setFetching(false)
    }
    init()
  }, [supabase, router])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError("Not logged in")
      setLoading(false)
      return
    }

    const { data: dbUser } = await supabase.from('users').select('side').eq('id', user.id).single()

    const formData = new FormData(e.currentTarget)
    const amount = Number(formData.get('amount'))
    const category_id = formData.get('category_id') as string
    const sub_item_id = (formData.get('sub_item_id') as string) || null
    
    const chosenCategory = categories.find(c => c.id === category_id)
    const selectedFunctionId = chosenCategory?.function_id || (formData.get('function_id') as string) || functionId || null
    
    // Resolve funding side based on linked function hosting side
    let fundedSide = dbUser?.side
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

    // 1. Create expense
    const { data: expense, error: expError } = await supabase.from('expenses').insert({
      amount,
      category_id,
      sub_item_id,
      function_id: selectedFunctionId,
      vendor_quick_name: formData.get('vendor'),
      payment_method: formData.get('payment_method'),
      status: formData.get('status'),
      due_date: formData.get('due_date') || null,
      notes: formData.get('notes'),
      created_by: user.id
    }).select().single()

    if (expError) {
      setError(expError.message)
      setLoading(false)
      return
    }

    // 2. Add expense_splits automatically
    if (expense) {
      if (isJoint) {
        // Split 50/50
        const half = amount / 2
        await supabase.from('expense_splits').insert([
          { expense_id: expense.id, side: 'groom', amount: half },
          { expense_id: expense.id, side: 'bride', amount: half }
        ])
      } else if (fundedSide) {
        await supabase.from('expense_splits').insert({
          expense_id: expense.id,
          side: fundedSide,
          amount: amount
        })
      }
    }

    if (functionId || selectedFunctionId) {
      router.push(`/functions/${selectedFunctionId || functionId}`)
    } else {
      router.push('/budget')
    }
    router.refresh()
  }

  if (fetching) return <div className="p-6">Loading...</div>

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="amount">Amount (₹)</Label>
        <Input id="amount" name="amount" type="number" step="0.01" required className="bg-white border-marigold/50 text-lg" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="category_id">Category</Label>
        <select 
          id="category_id" 
          name="category_id" 
          required 
          className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm"
          value={selectedCategoryId}
          onChange={(e) => setSelectedCategoryId(e.target.value)}
        >
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
          ))}
        </select>
      </div>

      {(() => {
        const filtered = allSubItems.filter(s => s.category_id === selectedCategoryId)
        if (filtered.length === 0) return null
        return (
          <div className="space-y-2 animate-in slide-in-from-top-1 duration-150">
            <Label htmlFor="sub_item_id">Sub-item / Details (Optional)</Label>
            <select 
              id="sub_item_id" 
              name="sub_item_id" 
              className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm"
            >
              <option value="">-- Select Sub-item --</option>
              {filtered.map(s => (
                <option key={s.id} value={s.id}>{s.name} (Limit: ₹{s.target_budget})</option>
              ))}
            </select>
          </div>
        )
      })()}

      <div className="space-y-2">
        <Label htmlFor="function_id">Link to Function / Event (Optional)</Label>
        <select id="function_id" name="function_id" defaultValue={functionId || ''} className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm">
          <option value="">-- No Linked Function --</option>
          {functions.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="vendor">Vendor / Paid To (Optional)</Label>
        <Input id="vendor" name="vendor" placeholder="e.g. Shyam Tent House" className="bg-white border-marigold/50" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" required className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm">
            <option value="paid">Paid</option>
            <option value="due">Due / Unpaid</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment_method">Payment Method</Label>
          <select id="payment_method" name="payment_method" required className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm">
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="card">Card</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="due_date">Due Date (if unpaid)</Label>
        <Input id="due_date" name="due_date" type="date" className="bg-white border-marigold/50" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" placeholder="Any details..." className="bg-white border-marigold/50" />
      </div>

      <Button type="submit" disabled={loading || categories.length === 0} className="w-full bg-maroon text-ivory hover:bg-maroon/90 py-6 mt-4">
        {loading ? 'Saving...' : 'Save Expense'}
      </Button>
    </form>
  )
}

export default function AddExpensePage() {
  return (
    <main className="min-h-screen flex flex-col p-6 max-w-lg mx-auto bg-ivory pb-20">
      <header className="flex items-center space-x-4 py-4 border-b border-marigold/30 mb-6">
        <Link href="/budget">
          <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-display font-semibold text-maroon">Add Expense</h1>
      </header>

      <Suspense fallback={<div className="p-6">Loading form...</div>}>
        <AddExpenseForm />
      </Suspense>
    </main>
  )
}
