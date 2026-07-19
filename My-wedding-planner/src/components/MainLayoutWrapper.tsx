'use client'

import { usePathname } from 'next/navigation'
import GlobalNavigation from './GlobalNavigation'

export default function MainLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname === '/login'

  if (isAuthPage) {
    return <>{children}</>
  }

  return (
    <div className="flex flex-col min-h-screen md:pl-20 lg:pl-64 pb-20 md:pb-0 relative">
      <GlobalNavigation />
      <div className="flex-1 w-full">
        {children}
      </div>
    </div>
  )
}
