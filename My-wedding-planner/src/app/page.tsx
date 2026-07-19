import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { SignOutButton } from '@/components/SignOutButton'
import { WeddingCountdown } from '@/components/WeddingCountdown'
import { Users, Wallet, CalendarHeart, ListTodo, Bell, Image as ImageIcon } from 'lucide-react'

// Hardcoded wedding date: Jan 19, 2027
const WEDDING_DATE = new Date('2027-01-19T00:00:00')

export default async function Home() {
  const supabase = await createClient()

  // Middleware already protects this, but we fetch the user
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('name, side, role')
    .eq('id', user.id)
    .single()

  const isAdmin = dbUser?.role === 'admin'
  const cookieStore = await cookies()
  const guestView = cookieStore.get('guest_view')?.value === '1'
  const isEffectivelyGuest = dbUser?.role === 'guest' || dbUser?.role === 'pending' || guestView

  const features = [
    ...(isAdmin && !isEffectivelyGuest ? [
      { name: 'Guest List', icon: Users, href: '/guests', color: 'bg-marigold/20 text-maroon' },
      { name: 'Budget', icon: Wallet, href: '/budget', color: 'bg-mehendi/20 text-mehendi' },
    ] : []),
    { name: 'Functions', icon: CalendarHeart, href: '/functions', color: 'bg-rani-pink/20 text-rani-pink' },
    ...(!isEffectivelyGuest ? [
      { name: 'Tasks', icon: ListTodo, href: '/tasks', color: 'bg-rust-red/20 text-rust-red' },
    ] : []),
    { name: 'Photos', icon: ImageIcon, href: '/photos', color: 'bg-maroon/20 text-maroon' },
  ]

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-5xl mx-auto bg-ivory pb-20">
      {/* Top Utility Bar */}
      <div className="flex justify-between items-center py-2 border-b border-marigold/10 mb-4 text-sm font-data">
        {dbUser ? (
          <p className="text-maroon/70">
            Welcome, <strong className="font-semibold text-maroon">{dbUser.name}</strong> 
            <span className="ml-2 inline-block bg-marigold/10 text-maroon border border-marigold/20 font-semibold text-xs px-2 py-0.5 rounded-full">
              {dbUser.side === 'groom' ? "Satyam's Side 🤵" : "Swati's Side 👰"}
            </span>
          </p>
        ) : (
          <div></div>
        )}
        <SignOutButton />
      </div>

      {/* Elegant Wedding Invitation Banner */}
      <header className="relative w-full border-4 border-double border-marigold/40 rounded-3xl p-8 md:p-12 bg-white/60 backdrop-blur-md shadow-md flex flex-col items-center justify-center text-center mt-2 mb-10 overflow-hidden">
        {/* Subtle decorative corners */}
        <div className="absolute top-3 left-3 w-4 h-4 border-t border-l border-marigold/40"></div>
        <div className="absolute top-3 right-3 w-4 h-4 border-t border-r border-marigold/40"></div>
        <div className="absolute bottom-3 left-3 w-4 h-4 border-b border-l border-marigold/40"></div>
        <div className="absolute bottom-3 right-3 w-4 h-4 border-b border-r border-marigold/40"></div>

        <span className="text-xs uppercase tracking-widest text-maroon/60 font-data mb-2">Shubh Vivah</span>
        <h1 className="text-4xl md:text-6xl font-display font-medium text-maroon tracking-normal leading-tight mb-2">
          Swati & Satyam
        </h1>
        <p className="text-lg md:text-xl font-display italic text-maroon/80 tracking-wide">
          Are getting married!
        </p>
        <div className="text-xs md:text-sm font-data text-maroon/60 uppercase tracking-widest mt-3 border-t border-b border-marigold/20 py-2 px-6">
          January 19, 2027 • New Delhi
        </div>
        
        <div className="flex flex-wrap justify-center items-center gap-3 mt-6">
          <span className="inline-block bg-marigold/10 text-maroon border border-marigold/30 font-semibold text-xs px-3 py-1 rounded-full font-data shadow-sm">
            #Swayam2027 💍
          </span>
        </div>
      </header>

      <section className="flex flex-col items-center justify-center space-y-6 mt-4">
        <h2 className="text-xl md:text-2xl font-display font-medium text-maroon/80 text-center">
          The big day is approaching...
        </h2>
        <WeddingCountdown targetDate={WEDDING_DATE} />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 md:mt-16 w-full">
        {/* Left Column (Features) */}
        <section className="md:col-span-2">
          <h2 className="text-xl md:text-2xl font-display font-semibold text-maroon mb-6">Features</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 md:gap-6">
            {features.map((feat) => (
              <Link key={feat.name} href={feat.href} className="group">
                <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm border border-marigold/20 hover:border-marigold transition-colors hover:shadow-md h-full">
                  <div className={`p-4 rounded-full mb-3 md:mb-4 ${feat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <feat.icon className="w-8 h-8 md:w-10 md:h-10" />
                  </div>
                  <span className="font-data font-medium text-maroon text-center">{feat.name}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Right Column (Reminders) */}
        <section className="md:col-span-1">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl md:text-2xl font-display font-semibold text-maroon">Reminders</h2>
            <Bell className="w-5 h-5 md:w-6 md:h-6 text-maroon/50" />
          </div>
          <div className="p-6 md:p-8 bg-white rounded-2xl shadow-sm border border-marigold/20 text-center flex flex-col items-center justify-center h-[200px] md:h-auto md:min-h-[250px]">
            <Bell className="w-12 h-12 text-marigold/30 mb-4" />
            <p className="text-sm md:text-base font-data text-maroon/70">
              You have no upcoming reminders.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
