'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

export default function DeleteFunctionButton({ functionId }: { functionId: string }) {
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this function? This action cannot be undone.")) {
      return
    }

    setIsDeleting(true)
    
    // Clean up related data first
    await supabase.from('function_attendance').delete().eq('function_id', functionId)
    await supabase.from('function_required_guests').delete().eq('function_id', functionId)
    
    // Also clean up any budget categories and expenses tied to this function
    await supabase.from('expenses').delete().eq('function_id', functionId)
    await supabase.from('categories').delete().eq('function_id', functionId)

    const { error } = await supabase
      .from('functions')
      .delete()
      .eq('id', functionId)
      
    if (error) {
      alert(`Error deleting function: ${error.message}`)
      setIsDeleting(false)
    } else {
      router.push('/functions')
      router.refresh()
    }
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      className="border-rust-red/50 text-rust-red hover:bg-rust-red/10 h-8 px-3 ml-auto text-xs"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      <Trash2 className="w-4 h-4 mr-1.5" />
      {isDeleting ? 'Deleting...' : 'Delete'}
    </Button>
  )
}
