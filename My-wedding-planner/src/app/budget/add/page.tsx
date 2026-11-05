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

type Installment = {
  id: string
  type: 'percent' | 'flat'
  value: string
  status: 'paid' | 'due'
  date: string
  payment_method: string
  notes: string
}

// Indian Currency Formatter helper
const formatIndianCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0
  }).format(amount)
}

function AddExpenseForm() {
  const [categories, setCategories] = useState<Category[]>([])
  const [functions, setFunctions] = useState<any[]>([])
  const [allSubItems, setAllSubItems] = useState<any[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  
  const [isScheduleMode, setIsScheduleMode] = useState(false)
  const [totalContractValue, setTotalContractValue] = useState('')
  const [singleAmount, setSingleAmount] = useState('')
  const [singleDate, setSingleDate] = useState(() => new Date().toISOString().split('T')[0])

  const [installments, setInstallments] = useState<Installment[]>([
    { id: '1', type: 'percent', value: '20', status: 'paid', date: new Date().toISOString().split('T')[0], payment_method: 'upi', notes: 'Advance Booking Token' },
    { id: '2', type: 'percent', value: '80', status: 'due', date: '', payment_method: 'bank_transfer', notes: 'Final Settlement' }
  ])

  const addInstallment = () => {
    setInstallments([
      ...installments, 
      { id: Math.random().toString(), type: 'percent', value: '0', status: 'due', date: '', payment_method: 'bank_transfer', notes: 'Installment' }
    ])
  }
  
  const updateInstallment = (id: string, field: keyof Installment, val: string) => {
    setInstallments(installments.map(m => m.id === id ? { ...m, [field]: val } : m))
  }
  
  const removeInstallment = (id: string) => {
    setInstallments(installments.filter(m => m.id !== id))
  }

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
      if ((dbUser?.role !== 'admin' && dbUser?.role !== 'bride' && dbUser?.role !== 'groom' && dbUser?.role !== 'planner')) {
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

  // Calculation for installments total in schedule mode
  const baseContractNum = parseFloat(totalContractValue) || 0
  const computedInstallments = installments.map(m => {
    const val = parseFloat(m.value) || 0
    let amt = 0
    if (m.type === 'percent') {
      amt = (val / 100) * baseContractNum
    } else {
      amt = val
    }
    return { ...m, amt }
  })

  const totalInstallmentsSum = computedInstallments.reduce((acc, curr) => acc + curr.amt, 0)
  const installmentDifference = baseContractNum - totalInstallmentsSum
  const isMatchContract = Math.abs(installmentDifference) < 0.01

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    // Extract formData synchronously before any await calls
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
    const selectedFunctionId = chosenCategory?.function_id || (formData.get('function_id') as string) || functionId || null

    // Resolve funding side based on linked function hosting side
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
      // Fallback for admin users who do not have a defined 'side'
      isJoint = true
    }

    const vendorQuickName = formData.get('vendor')
    const globalNotes = formData.get('notes') as string

    if (isScheduleMode) {
      const baseAmount = Number(totalContractValue)
      if (baseAmount <= 0) {
        setError("Total contract value must be greater than zero.")
        setLoading(false)
        return
      }

      if (!isMatchContract) {
        setError(`Installments total (₹${formatIndianCurrency(totalInstallmentsSum)}) must match the Total Contract Value (₹${formatIndianCurrency(baseAmount)}). Difference: ₹${formatIndianCurrency(Math.abs(installmentDifference))}`)
        setLoading(false)
        return
      }
      
      const insertPromises = installments.map(async (m) => {
        let amt = 0
        if (m.type === 'percent') {
          amt = (Number(m.value) / 100) * baseAmount
        } else {
          amt = Number(m.value)
        }

        const instDate = m.date || new Date().toISOString().split('T')[0]
        const expData: any = {
          amount: amt,
          category_id,
          sub_item_id,
          function_id: selectedFunctionId,
          vendor_quick_name: vendorQuickName,
          payment_method: m.payment_method || 'bank_transfer',
          status: m.status,
          due_date: m.status === 'due' ? instDate : null,
          created_at: new Date(instDate + 'T12:00:00Z').toISOString(),
          notes: m.notes ? `${m.notes} - ${globalNotes || ''}` : globalNotes,
          created_by: user.id
        }

        const { data: expense, error } = await supabase.from('expenses').insert(expData).select().single()
        
        if (error) {
          throw new Error(error.message)
        }
        
        if (expense) {
          if (isJoint) {
            const half = amt / 2
            await supabase.from('expense_splits').insert([
              { expense_id: expense.id, side: 'groom', amount: half },
              { expense_id: expense.id, side: 'bride', amount: half }
            ])
          } else if (fundedSide) {
            await supabase.from('expense_splits').insert({
              expense_id: expense.id,
              side: fundedSide,
              amount: amt
            })
          }
        }
      })

      try {
        await Promise.all(insertPromises)
      } catch (err: any) {
        setError(err.message)
        setLoading(false)
        return
      }
    } else {
      const amount = Number(formData.get('amount'))
      if (amount <= 0) {
        setError("Amount must be greater than zero.")
        setLoading(false)
        return
      }

      const expDate = singleDate || new Date().toISOString().split('T')[0]
      const { data: expense, error: expError } = await supabase.from('expenses').insert({
        amount,
        category_id,
        sub_item_id,
        function_id: selectedFunctionId,
        vendor_quick_name: vendorQuickName,
        payment_method: formData.get('payment_method') || 'upi',
        status: formData.get('status'),
        due_date: formData.get('status') === 'due' ? (formData.get('due_date') as string || expDate) : null,
        created_at: new Date(expDate + 'T12:00:00Z').toISOString(),
        notes: globalNotes,
        created_by: user.id
      }).select().single()

      if (expError) {
        setError(expError.message)
        setLoading(false)
        return
      }

      if (expense) {
        if (isJoint) {
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
    }

    if (functionId || selectedFunctionId) {
      router.push(`/functions/${selectedFunctionId || functionId}`)
    } else {
      router.push('/budget?tab=expenses')
    }
    router.refresh()
  }

  if (fetching) return <div className="p-6">Loading...</div>

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center space-x-2 bg-marigold/10 p-3 rounded-lg border border-marigold/20 mb-4">
        <input 
          type="checkbox" 
          id="isScheduleMode" 
          checked={isScheduleMode} 
          onChange={(e) => setIsScheduleMode(e.target.checked)}
          className="w-4 h-4 text-maroon rounded border-marigold/50 focus:ring-maroon cursor-pointer"
        />
        <Label htmlFor="isScheduleMode" className="font-bold text-maroon cursor-pointer">
          Multi-part Payment Plan (Advance, Installments)
        </Label>
      </div>

      {isScheduleMode ? (
        <div className="space-y-4 bg-white p-4 rounded-xl border border-marigold/30 shadow-sm animate-in fade-in duration-300">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="totalContractValue">Total Contract Value (₹)</Label>
              {baseContractNum > 0 && (
                <span className="text-xs font-data font-bold text-maroon bg-marigold/15 px-2.5 py-0.5 rounded-full border border-marigold/30">
                  ₹{formatIndianCurrency(baseContractNum)}
                </span>
              )}
            </div>
            <Input 
              id="totalContractValue" 
              name="totalContractValue" 
              type="number" 
              step="any" 
              required={isScheduleMode} 
              className="bg-ivory border-marigold/50 text-lg font-bold" 
              value={totalContractValue} 
              onChange={e => setTotalContractValue(e.target.value)} 
              placeholder="e.g. 1000000"
            />
          </div>
          
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center">
              <Label className="text-maroon font-bold">Payment Plan Breakdown</Label>
              <Button type="button" variant="outline" size="sm" onClick={addInstallment} className="text-xs h-7 border-marigold/50 hover:bg-marigold/20 cursor-pointer">
                + Add Installment
              </Button>
            </div>
            
            {installments.map((m, i) => {
              const currentAmt = computedInstallments[i]?.amt || 0
              return (
                <div key={m.id} className="p-3 bg-ivory/50 rounded-lg border border-marigold/20 relative space-y-3 shadow-inner">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-maroon/70 bg-marigold/20 px-2 py-0.5 rounded">Installment {i + 1}</span>
                      {baseContractNum > 0 && currentAmt > 0 && (
                        <span className="text-xs font-data font-semibold text-mehendi bg-mehendi/10 px-2 py-0.5 rounded">
                          ₹{formatIndianCurrency(currentAmt)}
                        </span>
                      )}
                    </div>
                    {installments.length > 1 && (
                      <button type="button" onClick={() => removeInstallment(m.id)} className="text-red-500 hover:text-red-700 text-xs font-bold cursor-pointer">Remove</button>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <div className="w-1/3 space-y-1">
                      <Label className="text-[10px]">Type</Label>
                      <select value={m.type} onChange={(e) => updateInstallment(m.id, 'type', e.target.value)} className="w-full text-xs h-8 rounded border-marigold/50 bg-white px-1">
                        <option value="percent">% of Total</option>
                        <option value="flat">Flat Amount (₹)</option>
                      </select>
                    </div>
                    <div className="w-2/3 space-y-1">
                      <Label className="text-[10px]">Value</Label>
                      <Input type="number" step="any" value={m.value} onChange={(e) => updateInstallment(m.id, 'value', e.target.value)} required className="h-8 text-xs bg-white font-data" placeholder={m.type === 'percent' ? 'e.g. 20' : 'e.g. 50000'} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Status</Label>
                      <select value={m.status} onChange={(e) => updateInstallment(m.id, 'status', e.target.value)} className="w-full text-xs h-8 rounded border-marigold/50 bg-white px-1">
                        <option value="paid">Paid</option>
                        <option value="due">Due / Unpaid</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Date</Label>
                      <Input type="date" value={m.date} onChange={(e) => updateInstallment(m.id, 'date', e.target.value)} required={m.status === 'due'} className="h-8 text-xs bg-white" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Payment Method</Label>
                      <select value={m.payment_method} onChange={(e) => updateInstallment(m.id, 'payment_method', e.target.value)} className="w-full text-xs h-8 rounded border-marigold/50 bg-white px-1">
                        <option value="upi">UPI</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Note</Label>
                      <Input type="text" value={m.notes} onChange={(e) => updateInstallment(m.id, 'notes', e.target.value)} className="h-8 text-xs bg-white" placeholder="e.g. Advance Booking Token" />
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Reconciliation / Match Status Card */}
            {baseContractNum > 0 && (
              <div className={`p-3 rounded-xl border text-xs font-data transition-colors flex justify-between items-center ${
                isMatchContract 
                  ? 'bg-mehendi/10 border-mehendi/30 text-mehendi' 
                  : 'bg-rust-red/10 border-rust-red/30 text-rust-red'
              }`}>
                <div>
                  <span className="font-bold block">
                    {isMatchContract ? '✓ Installments Match Contract' : '⚠️ Installment Total Mismatch'}
                  </span>
                  <span className="text-[11px] opacity-80">
                    Allocated: ₹{formatIndianCurrency(totalInstallmentsSum)} of ₹{formatIndianCurrency(baseContractNum)}
                  </span>
                </div>
                {!isMatchContract && (
                  <span className="font-bold text-xs">
                    {installmentDifference > 0 ? `Remaining: ₹${formatIndianCurrency(installmentDifference)}` : `Over by: ₹${formatIndianCurrency(Math.abs(installmentDifference))}`}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2 animate-in fade-in duration-300">
          <div className="flex justify-between items-center">
            <Label htmlFor="amount">Amount (₹)</Label>
            {parseFloat(singleAmount) > 0 && (
              <span className="text-xs font-data font-bold text-maroon bg-marigold/15 px-2.5 py-0.5 rounded-full border border-marigold/30">
                ₹{formatIndianCurrency(parseFloat(singleAmount))}
              </span>
            )}
          </div>
          <Input 
            id="amount" 
            name="amount" 
            type="number" 
            step="any" 
            required={!isScheduleMode} 
            value={singleAmount}
            onChange={(e) => setSingleAmount(e.target.value)}
            placeholder="e.g. 50000"
            className="bg-white border-marigold/50 text-lg font-data" 
          />
        </div>
      )}

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
                <option key={s.id} value={s.id}>{s.name} (Limit: ₹{formatIndianCurrency(s.target_budget)})</option>
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

      {!isScheduleMode && (
        <>
          <div className="grid grid-cols-2 gap-4 animate-in fade-in">
            <div className="space-y-2">
              <Label htmlFor="expense_date">Transaction Date</Label>
              <Input 
                id="expense_date" 
                name="expense_date" 
                type="date" 
                value={singleDate} 
                onChange={(e) => setSingleDate(e.target.value)} 
                className="bg-white border-marigold/50" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select id="status" name="status" required={!isScheduleMode} className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm">
                <option value="paid">Paid</option>
                <option value="due">Due / Unpaid</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 animate-in fade-in">
            <div className="space-y-2">
              <Label htmlFor="payment_method">Payment Method</Label>
              <select id="payment_method" name="payment_method" required={!isScheduleMode} className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm">
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date (if unpaid)</Label>
              <Input id="due_date" name="due_date" type="date" className="bg-white border-marigold/50" />
            </div>
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" placeholder="Any details..." className="bg-white border-marigold/50" />
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm text-center font-medium">
          {error}
        </div>
      )}

      <Button 
        type="submit" 
        disabled={loading || categories.length === 0 || (isScheduleMode && !isMatchContract)} 
        className="w-full bg-maroon text-ivory hover:bg-maroon/90 py-6 mt-4 cursor-pointer font-bold text-base shadow-md disabled:opacity-50"
      >
        {loading ? 'Saving...' : isScheduleMode ? `Save Payment Plan (${installments.length} Installments • ₹${formatIndianCurrency(baseContractNum)})` : 'Save Expense'}
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
