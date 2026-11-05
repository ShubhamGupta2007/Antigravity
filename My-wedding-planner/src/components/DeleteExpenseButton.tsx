'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export function DeleteExpenseButton({ 
  expenseId, 
  vendorName,
  redirectUrl,
  variant = 'icon' 
}: { 
  expenseId: string
  vendorName?: string
  redirectUrl?: string
  variant?: 'icon' | 'full'
}) {
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const label = vendorName ? `"${vendorName}"` : "this expense"
    if (!window.confirm(`Are you sure you want to delete ${label}? This will remove the transaction record and its budget allocations.`)) {
      return
    }

    setIsDeleting(true)
    try {
      // Delete splits first just in case DB doesn't have cascade
      await supabase.from('expense_splits').delete().eq('expense_id', expenseId)
      
      const { error } = await supabase.from('expenses').delete().eq('id', expenseId)
      if (error) {
        toast.error(`Error deleting expense: ${error.message}`)
        setIsDeleting(false)
        return
      }

      toast.success('Expense deleted successfully')
      if (redirectUrl) {
        router.push(redirectUrl)
      }
      router.refresh()
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`)
      setIsDeleting(false)
    }
  }

  if (variant === 'full') {
    return (
      <Button 
        type="button"
        variant="outline"
        className="w-full border-rust-red/40 text-rust-red hover:bg-rust-red/10 h-11 text-sm font-medium rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        <Trash2 className="w-4 h-4" />
        {isDeleting ? 'Deleting Expense...' : 'Delete Expense'}
      </Button>
    )
  }

  return (
    <Button 
      type="button"
      variant="ghost" 
      size="icon" 
      className="h-6 w-6 text-maroon/40 hover:text-rust-red hover:bg-rust-red/10 rounded-md transition-colors cursor-pointer"
      onClick={handleDelete}
      disabled={isDeleting}
      title="Delete Expense"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </Button>
  )
}
export default DeleteExpenseButton

