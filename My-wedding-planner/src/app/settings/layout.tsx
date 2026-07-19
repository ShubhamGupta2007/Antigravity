'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, Wallet, Shield, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isGuestView, setIsGuestView] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  
  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  ))

  useEffect(() => {
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data: dbUser } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()
        
      if (dbUser) {
        setRole(dbUser.role)
      }
    }
    loadRole()
  }, [supabase])

  const navItems = [
    { name: 'Profile', href: '/settings/profile', icon: User },
    { name: 'Users', href: '/settings/users', icon: Shield },
  ]

  const visibleNavItems = navItems.filter(item => {
    // Only full Admins can see the Users tab
    if (item.name === 'Users' && role !== 'admin') {
      return false
    }
    return true
  })

  return (
    <main className="min-h-screen flex flex-col md:flex-row max-w-6xl mx-auto bg-ivory pb-24 md:pb-0 w-full">
      {/* Mobile Top Navigation */}
      <div className="md:hidden flex overflow-x-auto p-4 border-b border-marigold/30 bg-ivory gap-2 no-scrollbar shrink-0">
        {visibleNavItems.map(item => {
          const isActive = pathname === item.href
          return (
            <Link key={item.name} href={item.href} className="shrink-0">
              <div className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-colors",
                isActive ? "bg-maroon text-ivory" : "bg-marigold/10 text-maroon/70"
              )}>
                <item.icon className="w-4 h-4" />
                {item.name}
              </div>
            </Link>
          )
        })}
      </div>

      {/* Desktop Left Sub-Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-marigold/30 p-6 shrink-0 h-[calc(100vh-2rem)] overflow-y-auto">
        <h2 className="text-2xl font-display font-bold text-maroon mb-6">Settings</h2>
        
        <nav className="space-y-2 flex-1">
          {visibleNavItems.map(item => {
            const isActive = pathname === item.href
            return (
              <Link key={item.name} href={item.href}>
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all group",
                  isActive 
                    ? "bg-marigold/20 text-maroon" 
                    : "text-maroon/60 hover:bg-marigold/10 hover:text-maroon"
                )}>
                  <item.icon className={cn("w-5 h-5", isActive ? "text-maroon" : "text-maroon/50 group-hover:text-maroon")} />
                  {item.name}
                </div>
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 overflow-x-hidden">
        {/* Mobile Guest Toggle */}
        {(role === 'admin' || role === 'planner') && (
          <div className="md:hidden p-4 border-b border-marigold/10 bg-white/50 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-maroon" />
              <span className="font-bold text-maroon text-sm">Preview as Guest</span>
            </div>
            <button 
              onClick={() => setIsGuestView(!isGuestView)}
              className={cn("flex w-10 h-5 rounded-full p-1 transition-colors duration-300", isGuestView ? "bg-maroon" : "bg-marigold/50")}
            >
              <div className={cn("w-3 h-3 bg-white rounded-full transition-transform duration-300", isGuestView ? "translate-x-5" : "translate-x-0")} />
            </button>
          </div>
        )}

        <div className="p-4 md:p-8">
          {children}
        </div>
      </div>
    </main>
  )
}
