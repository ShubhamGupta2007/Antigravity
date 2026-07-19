'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Search } from 'lucide-react'
import Link from 'next/link'

export default function BudgetSettingsPage() {
  const [usersList, setUsersList] = useState<any[]>([])
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [userSearch, setUserSearch] = useState('')
  const [userSide, setUserSide] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
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
      if (dbUser?.role !== 'admin' && dbUser?.role !== 'bride' && dbUser?.role !== 'groom') {
        router.push('/')
        return
      }
      if (dbUser?.side) {
        setUserSide(dbUser.side)
      }

      if (dbUser?.side) {
        // Fetch regular users on the same side
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name, role')
          .eq('side', dbUser.side)
          .eq('role', 'regular')
        
        setUsersList(usersData || [])

        // Fetch existing budget feature permissions
        const { data: permData } = await supabase
          .from('feature_permissions')
          .select('user_id')
          .eq('feature', 'budget')
          .eq('can_view', true)
        
        const initialPermissions: Record<string, boolean> = {}
        permData?.forEach(p => {
          initialPermissions[p.user_id] = true
        })
        setPermissions(initialPermissions)
      }

      setLoading(false)
    }
    fetchData()
  }, [router, supabase])

  const handlePermissionToggle = async (userId: string, isChecked: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [userId]: isChecked
    }))
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError("Not logged in.")
      return
    }

    if (isChecked) {
      const { error: delError } = await supabase
        .from('feature_permissions')
        .delete()
        .eq('user_id', userId)
        .eq('feature', 'budget')
      
      if (delError) {
        setError(`Failed to toggle permission: ${delError.message}`)
        setPermissions(prev => ({ ...prev, [userId]: false }))
        return
      }

      const { error: insError } = await supabase.from('feature_permissions').insert({
        user_id: userId,
        feature: 'budget',
        can_view: true,
        granted_by: user.id
      })

      if (insError) {
        setError(`Failed to toggle permission: ${insError.message}`)
        setPermissions(prev => ({ ...prev, [userId]: false }))
      }
    } else {
      const { error: delError } = await supabase
        .from('feature_permissions')
        .delete()
        .eq('user_id', userId)
        .eq('feature', 'budget')

      if (delError) {
        setError(`Failed to toggle permission: ${delError.message}`)
        setPermissions(prev => ({ ...prev, [userId]: true }))
      }
    }
  }

  if (loading) return <div className="min-h-screen p-6 flex items-center justify-center">Loading...</div>

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h1 className="text-2xl md:text-3xl font-display font-semibold text-maroon mb-6 hidden md:block">Budget Controls</h1>

      {error && <div className="p-4 mb-6 bg-rust-red/10 text-rust-red rounded-lg text-sm">{error}</div>}

      {/* Permissions Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold text-maroon">Family Member Permissions</h2>
        <p className="text-xs font-data text-maroon/60">
          Grant or revoke visibility for the Budget dashboard to family members on your side.
        </p>

        {usersList.length === 0 ? (
          <p className="text-xs text-maroon/50 italic py-2">No other family members found on your side.</p>
        ) : (
          <div className="space-y-4">
            {/* Search filter */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-maroon/40" />
              <Input 
                placeholder="Search family member..." 
                className="pl-9 bg-ivory border-marigold/50 font-data text-xs h-9"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>

            <div className="divide-y divide-marigold/10 max-h-60 overflow-y-auto pr-2 space-y-1">
              {usersList
                .filter(u => u.name?.toLowerCase().includes(userSearch.toLowerCase()))
                .map(userItem => (
                  <div key={userItem.id} className="flex items-center justify-between py-3">
                    <div>
                      <span className="text-sm font-data font-medium text-maroon">{userItem.name}</span>
                      <span className="text-[10px] text-maroon/50 block capitalize">{userItem.role} User</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={permissions[userItem.id] || false}
                        onChange={(e) => handlePermissionToggle(userItem.id, e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mehendi"></div>
                    </label>
                  </div>
                ))}
              {usersList.filter(u => u.name?.toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                <p className="text-xs text-maroon/50 italic py-4 text-center">No matching family members found.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 text-center">
        <Link href="/budget">
          <Button className="bg-maroon text-ivory hover:bg-maroon/90 py-6 w-full shadow-md font-medium">
            Done & Return
          </Button>
        </Link>
      </div>
    </div>
  )
}
