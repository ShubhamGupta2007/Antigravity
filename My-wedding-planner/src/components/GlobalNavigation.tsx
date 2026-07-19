'use client'

import { useState, useEffect } from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Wallet, Users, CalendarHeart, Settings, LogOut, Eye, EyeOff } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export default function GlobalNavigation() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  if (pathname === '/login') return null

  const navItems = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Budget', href: '/budget', icon: Wallet },
    { name: 'Guests', href: '/guests', icon: Users },
    { name: 'Events', href: '/functions', icon: CalendarHeart },
    { name: 'Settings', href: '/settings', icon: Settings },
  ]

  const [isGuestView, setIsGuestView] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  
  useEffect(() => {
    // Sync initial state from cookie
    const guestCookie = document.cookie.split('; ').find(row => row.startsWith('guest_view='))
    if (guestCookie && guestCookie.split('=')[1] === '1') {
      setIsGuestView(true)
    }
  }, [])

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

  const visibleNavItems = navItems.filter(item => {
    // If they are a guest (or pending) or have toggled guest view, hide Budget and Guests
    if ((role === 'guest' || role === 'pending' || isGuestView) && (item.name === 'Budget' || item.name === 'Guests')) {
      return false
    }
    return true
  })

  const handleLogout = async () => {
    document.cookie = 'guest_view=0; path=/; max-age=0' // Clear cookie on logout
    await supabase.auth.signOut()
    toast.success("Logged out successfully")
    router.push('/login')
  }

  return (
    <>
      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-marigold/30 z-50 px-6 py-3 pb-safe flex justify-between items-center shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {visibleNavItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className="flex flex-col items-center justify-center space-y-1 relative w-12"
            >
              <div className={cn(
                "p-2 rounded-xl transition-all duration-300",
                isActive ? "bg-maroon text-ivory shadow-md scale-110" : "text-maroon/50 hover:bg-marigold/20 hover:text-maroon"
              )}>
                <item.icon strokeWidth={isActive ? 2.5 : 2} className="w-5 h-5" />
              </div>
              <span className={cn(
                "text-[10px] font-bold transition-all duration-300 font-sans tracking-wide",
                isActive ? "text-maroon opacity-100" : "text-transparent opacity-0 absolute -bottom-4"
              )}>
                {item.name}
              </span>
            </Link>
          )
        })}
      </div>

      {/* Desktop Left Sidebar */}
      <div className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-marigold/30 z-50 shadow-sm transition-all duration-300">
        <div className="p-6 flex justify-start items-center">
          <div className="w-10 h-10 bg-maroon rounded-full flex items-center justify-center text-ivory font-display text-xl shadow-md shrink-0">
            S
          </div>
          <div className="ml-3 flex flex-col overflow-hidden">
            <span className="font-display font-bold text-lg text-maroon truncate leading-tight">
              Swati & Satyam
            </span>
            <span className="text-[10px] font-data text-maroon/60 tracking-widest uppercase mt-0.5">
              #Swayam2027
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-2 px-4 py-6 mt-4">
          {visibleNavItems.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200 group",
                  isActive 
                    ? "bg-maroon text-ivory shadow-md" 
                    : "text-maroon/60 hover:bg-marigold/15 hover:text-maroon"
                )}
              >
                <item.icon strokeWidth={isActive ? 2.5 : 2} className={cn("w-6 h-6 shrink-0 transition-transform duration-200", !isActive && "group-hover:scale-110")} />
                <span className={cn("font-bold", isActive ? "text-ivory" : "text-maroon/80 group-hover:text-maroon")}>
                  {item.name}
                </span>
              </Link>
            )
          })}
        </div>

        <div className="p-4 mt-auto border-t border-marigold/30 space-y-2">
          {/* Guest View Toggle - Only visible to admins and planners */}
            {(role === 'admin' || role === 'planner') && (
              <button
                onClick={() => {
                  const newState = !isGuestView;
                  setIsGuestView(newState);
                  // Set or clear a cookie so server‑less pages can see guest mode
                  document.cookie = `guest_view=${newState ? '1' : '0'}; path=/; max-age=86400`;
                  router.refresh();
                }}
                className="w-full flex justify-between items-center px-4 py-3 rounded-2xl hover:bg-marigold/15 transition-all group"
              >
                <div className="flex items-center gap-3">
                  {isGuestView ? <Eye className="w-5 h-5 text-maroon" /> : <EyeOff className="w-5 h-5 text-maroon/60" />}
                  <span className="font-bold text-maroon/80 group-hover:text-maroon text-sm">Guest Mode</span>
                </div>
                <div className={cn("flex w-10 h-5 rounded-full p-1 transition-colors duration-300", isGuestView ? "bg-maroon" : "bg-marigold/50")}
                >
                  <div className={cn("w-3 h-3 bg-white rounded-full transition-transform duration-300", isGuestView ? "translate-x-5" : "translate-x-0")}
                  />
                </div>
              </button>
            )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-maroon/60 hover:bg-rust-red/10 hover:text-rust-red transition-all duration-200 group"
          >
            <LogOut strokeWidth={2} className="w-6 h-6 shrink-0 group-hover:scale-110 transition-transform duration-200" />
            <span className="font-bold group-hover:text-rust-red text-maroon/80">Logout</span>
          </button>
        </div>
      </div>
    </>
  )
}
