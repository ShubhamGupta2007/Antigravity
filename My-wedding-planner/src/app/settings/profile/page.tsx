'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save, ShieldAlert, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function ProfileSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [side, setSide] = useState('groom')
  const [role, setRole] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: dbUser, error: fetchError } = await supabase
        .from('users')
        .select('name, side, role')
        .eq('id', user.id)
        .single()
      
      if (fetchError) {
        console.error("Error fetching user profile:", fetchError)
      }
      
      setEmail(user.email || '')
      if (dbUser) {
        setName(dbUser.name || '')
        setSide(dbUser.side || 'groom')
        setRole(dbUser.role || 'guest')
      }
      setLoading(false)
    }
    loadProfile()
  }, [supabase, router])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('users')
      .update({ name })
      .eq('id', user.id)

    setSaving(false)
    if (error) {
      toast.error(`Failed to update profile: ${error.message}`)
    } else {
      setHasUnsavedChanges(false)
      toast.success("Profile updated successfully!")
      router.refresh()
    }
  }

  const handleRequestAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('users')
      .update({ role: 'pending' })
      .eq('id', user.id)

    if (error) {
      toast.error(`Failed to send request: ${error.message}`)
    } else {
      setRole('pending')
      toast.success("Request sent to Admin successfully!")
    }
  }

  if (loading) return <div className="min-h-screen p-6 flex items-center justify-center font-data">Loading...</div>

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h1 className="text-2xl md:text-3xl font-display font-semibold text-maroon mb-6 hidden md:block">Profile Settings</h1>

      <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl shadow-sm border border-marigold/20 space-y-6">
        <div className="space-y-2">
          <Label className="font-bold text-maroon">Full Name</Label>
          <Input 
            value={name} 
            onChange={(e) => {
              setName(e.target.value)
              setHasUnsavedChanges(true)
            }}
            placeholder="Enter your name"
            className="border-marigold/30 focus:border-marigold bg-ivory/30"
          />
        </div>

        <div className="space-y-2">
          <Label className="font-bold text-maroon">Email Address</Label>
          <Input 
            value={email} 
            disabled
            className="border-marigold/30 bg-gray-100 text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-maroon/60 font-data">Email cannot be changed directly.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="font-bold text-maroon flex items-center justify-between">
              Wedding Side
            </Label>
            <select 
              value={side}
              disabled
              className="w-full h-10 px-3 py-2 rounded-md border border-marigold/30 focus:outline-none bg-gray-100 text-gray-500 cursor-not-allowed text-sm font-semibold"
            >
              <option value="groom">Groom's Side</option>
              <option value="bride">Bride's Side</option>
              <option value="both">Both</option>
            </select>
            <p className="text-[10px] md:text-xs text-maroon/50 font-data leading-tight">Requires Admin approval to change.</p>
          </div>
          
          <div className="space-y-3">
            <Label className="font-bold text-maroon flex items-center justify-between">
              Account Role
            </Label>
            <Input 
              value={role === 'admin' ? 'Super Admin' : role === 'planner' ? 'Planner' : role === 'pending' ? 'Pending Approval...' : 'Guest'} 
              disabled
              className="border-marigold/30 bg-gray-100 text-gray-500 cursor-not-allowed font-semibold"
            />
            
            {role === 'guest' && (
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleRequestAccess}
                className="w-full text-xs font-bold border-marigold/50 text-maroon hover:bg-marigold/10"
              >
                <ShieldAlert className="w-3 h-3 mr-2" />
                Request Planner Access
              </Button>
            )}
            {role === 'pending' && (
              <div className="w-full text-xs font-bold bg-marigold/20 text-maroon p-2 rounded-md flex items-center justify-center">
                <CheckCircle2 className="w-3 h-3 mr-2 text-mehendi" />
                Request Sent
              </div>
            )}
            
            {(role === 'admin' || role === 'planner') && (
              <p className="text-[10px] md:text-xs text-maroon/50 font-data leading-tight">
                {role === 'admin' ? 'You have full Super Admin access.' : 'You have full Planner access.'}
              </p>
            )}
          </div>
        </div>

        <div className="pt-4 relative">
          {hasUnsavedChanges && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-marigold text-maroon text-xs font-bold px-3 py-1 rounded-full shadow-md animate-bounce whitespace-nowrap">
              ⚠️ Unsaved changes
            </div>
          )}
          <Button 
            type="submit" 
            disabled={saving || !hasUnsavedChanges} 
            className="w-full bg-maroon text-ivory hover:bg-maroon/90 py-6 font-bold text-lg"
          >
            <Save className="w-5 h-5 mr-2" />
            {saving ? 'Saving...' : 'Save Profile'}
          </Button>
        </div>
      </form>
    </div>
  )
}
