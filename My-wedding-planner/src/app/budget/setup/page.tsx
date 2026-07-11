'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'

type Category = {
  id: string
  name: string
  emoji: string
}

type CategoryBudget = {
  category_id: string
  max_budget: number
}

export default function BudgetSetupPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [userSide, setUserSide] = useState<string | null>(null)
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
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
      if (dbUser?.role !== 'admin') {
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
      }

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
      }

      setLoading(false)
    }
    fetchData()
  }, [router, supabase])

  const handleBudgetChange = (categoryId: string, value: string) => {
    setBudgets(prev => ({
      ...prev,
      [categoryId]: Number(value)
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    
    if (!userSide) {
      setError("Could not determine your side.")
      setSaving(false)
      return
    }

    const updates = Object.entries(budgets).map(([categoryId, maxBudget]) => ({
      category_id: categoryId,
      side: userSide,
      max_budget: maxBudget
    }))

    // Upsert budget limits
    const { error: upsertError } = await supabase
      .from('category_budgets')
      .upsert(updates, { onConflict: 'category_id,side' })

    if (upsertError) {
      setError(upsertError.message)
      setSaving(false)
      return
    }

    router.push('/budget')
    router.refresh()
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

      <div className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6 space-y-6">
        <p className="text-sm font-data text-maroon/70">
          Enter your planned max budget for each category. This will only apply to {userSide === 'groom' ? "Satyam's" : "Swati's"} side.
        </p>

        {categories.length === 0 ? (
          <div className="text-sm text-maroon/50 italic">Categories not seeded yet. (Run the SQL script!)</div>
        ) : (
          <div className="space-y-4">
            {categories.map(category => (
              <div key={category.id} className="flex items-center space-x-4">
                <div className="flex-1 flex items-center space-x-2">
                  <span className="text-xl">{category.emoji}</span>
                  <Label htmlFor={category.id} className="text-maroon font-data">{category.name}</Label>
                </div>
                <div className="w-32 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-maroon/50">₹</span>
                  <Input 
                    id={category.id}
                    type="number"
                    min="0"
                    placeholder="0"
                    className="pl-8 bg-ivory border-marigold/50 font-data text-right"
                    value={budgets[category.id] || ''}
                    onChange={(e) => handleBudgetChange(category.id, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button 
        onClick={handleSave} 
        disabled={saving || categories.length === 0} 
        className="w-full bg-maroon text-ivory hover:bg-maroon/90 py-6 mt-8"
      >
        <Save className="w-4 h-4 mr-2" />
        {saving ? 'Saving...' : 'Save Budgets'}
      </Button>
    </main>
  )
}
