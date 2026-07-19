import React from 'react'
import { LoginForm } from '@/components/LoginForm'
import { RangoliDial } from '@/components/RangoliDial'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-ivory">
      {/* Decorative top corner */}
      <div className="absolute top-0 left-0 w-32 h-32 bg-marigold/10 rounded-br-full -z-10" />
      
      <div className="w-full max-w-md flex flex-col items-center gap-8 py-12 px-6 bg-white/50 backdrop-blur-sm rounded-3xl border border-marigold/20 shadow-xl">
        <RangoliDial size={100} />
        <LoginForm />
      </div>

      {/* Decorative bottom corner */}
      <div className="absolute bottom-0 right-0 w-48 h-48 bg-rani-pink/5 rounded-tl-full -z-10" />
    </main>
  )
}
