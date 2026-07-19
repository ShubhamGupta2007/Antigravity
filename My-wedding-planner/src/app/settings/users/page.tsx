'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ShieldAlert, ShieldCheck, UserX, UserCheck, Search } from 'lucide-react'

type User = {
  id: string
  name: string | null
  email: string | null
  side: string | null
  role: string | null
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  const loadUsers = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }
    
    setCurrentUserId(user.id)

    // Check if current user is admin
    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (currentUser?.role !== 'admin') {
      setIsAdmin(false)
      setLoading(false)
      return
    }

    setIsAdmin(true)

    // Fetch all users
    const { data: allUsers, error } = await supabase
      .from('users')
      .select('id, name, email, side, role')
      .order('role', { ascending: false }) // Shows pending/admin first

    if (error) {
      toast.error('Failed to load users: ' + error.message)
    } else {
      setUsers(allUsers || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleUpdateRole = async (userId: string, newRole: string) => {
    const { error } = await supabase
      .from('users')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) {
      toast.error(`Failed to update role: ${error.message}`)
    } else {
      const roleNames: Record<string, string> = { admin: 'Super Admin', planner: 'Planner', guest: 'Guest' }
      toast.success(`User role updated to ${roleNames[newRole] || newRole}!`)
      loadUsers()
      router.refresh()
    }
  }

  const handleUpdateSide = async (userId: string, newSide: string) => {
    const { error } = await supabase
      .from('users')
      .update({ side: newSide })
      .eq('id', userId)

    if (error) {
      toast.error(`Failed to update side: ${error.message}`)
    } else {
      toast.success(`Wedding side updated successfully!`)
      loadUsers()
    }
  }

  if (loading) return <div className="p-6 font-data">Loading users...</div>

  if (!isAdmin) {
    return (
      <div className="p-6 text-center">
        <ShieldAlert className="w-12 h-12 text-maroon/30 mx-auto mb-4" />
        <h2 className="text-xl font-display font-semibold text-maroon mb-2">Access Denied</h2>
        <p className="text-maroon/70 font-data">You must be an Admin to view this page.</p>
      </div>
    )
  }

  const filteredUsers = users.filter(u => 
    (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.role || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-maroon">User Management</h1>
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-maroon/40" />
          <Input 
            placeholder="Search users by name or role..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white border-marigold/30 focus:border-marigold"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-marigold/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-ivory/50 border-b border-marigold/20">
                <th className="p-4 font-display font-semibold text-maroon text-sm">Name & Email</th>
                <th className="p-4 font-display font-semibold text-maroon text-sm">Side</th>
                <th className="p-4 font-display font-semibold text-maroon text-sm">Role</th>
                <th className="p-4 font-display font-semibold text-maroon text-sm text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id} className="border-b border-marigold/10 hover:bg-ivory/20 transition-colors">
                  <td className="p-4">
                    <p className="font-bold text-maroon">{u.name || 'Unnamed User'}</p>
                    <p className="text-xs text-maroon/60 font-data">{u.email || 'No Email'}</p>
                  </td>
                  <td className="p-4">
                    <select
                      value={u.side || 'groom'}
                      onChange={(e) => handleUpdateSide(u.id, e.target.value)}
                      className="text-xs border border-marigold/30 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-marigold"
                    >
                      <option value="groom">Groom</option>
                      <option value="bride">Bride</option>
                      <option value="both">Both</option>
                    </select>
                  </td>
                  <td className="p-4">
                    {u.role === 'pending' && (
                      <Badge className="bg-marigold text-maroon hover:bg-marigold">Pending Access</Badge>
                    )}
                    {u.role === 'admin' && (
                      <Badge className="bg-maroon text-ivory hover:bg-maroon">Super Admin</Badge>
                    )}
                    {u.role === 'planner' && (
                      <Badge className="bg-mehendi text-ivory hover:bg-mehendi">Planner</Badge>
                    )}
                    {(u.role === 'guest' || !u.role) && (
                      <Badge variant="outline" className="text-maroon/60 border-maroon/20">Guest</Badge>
                    )}
                  </td>
                  <td className="p-4 text-right space-x-2">
                    {u.role === 'pending' && (
                      <>
                        <Button 
                          size="sm" 
                          onClick={() => handleUpdateRole(u.id, 'planner')}
                          className="bg-mehendi text-ivory hover:bg-mehendi/90 h-8 text-xs"
                        >
                          <ShieldCheck className="w-3 h-3 mr-1" /> Approve (Planner)
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleUpdateRole(u.id, 'guest')}
                          className="border-maroon/20 text-maroon hover:bg-maroon/5 h-8 text-xs"
                        >
                          Deny
                        </Button>
                      </>
                    )}
                    
                    {(u.role === 'guest' || u.role === 'planner') && (
                      <>
                        {u.role === 'guest' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleUpdateRole(u.id, 'planner')}
                            className="border-mehendi text-mehendi hover:bg-mehendi/10 h-8 text-xs mr-2"
                          >
                            <UserCheck className="w-3 h-3 mr-1" /> Make Planner
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleUpdateRole(u.id, 'admin')}
                          className="border-marigold text-maroon hover:bg-marigold/10 h-8 text-xs"
                        >
                          <ShieldAlert className="w-3 h-3 mr-1" /> Make Admin
                        </Button>
                      </>
                    )}

                    {(u.role === 'admin' || u.role === 'planner') && (
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handleUpdateRole(u.id, 'guest')}
                        disabled={u.id === currentUserId}
                        className={cn("text-maroon/40 hover:text-maroon/80 h-8 text-xs px-2", u.id === currentUserId && "opacity-30 cursor-not-allowed")}
                        title={u.id === currentUserId ? "You cannot revoke your own access" : ""}
                      >
                        <UserX className="w-3 h-3 mr-1" /> Revoke to Guest
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-maroon/50 font-data">
                    {searchQuery ? "No users match your search." : "No users found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
