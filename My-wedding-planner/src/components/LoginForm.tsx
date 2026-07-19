'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  // Sign up specific fields
  const [name, setName] = useState('')
  const [side, setSide] = useState<'groom' | 'bride'>('groom')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  
  const router = useRouter()
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) {
      const msg = typeof error.message === 'object' ? JSON.stringify(error.message) : error.message
      setError(msg === '{}' ? 'Something went wrong, please try again later or contact guptashubham20072000@gmail.com if the issue persists.' : msg)
      setLoading(false)
      return
    }
    
    router.push('/')
    router.refresh()
  }

  const handleMagicLink = async () => {
    if (!email) {
      setError("Please enter your email first")
      return
    }
    
    setLoading(true)
    setError(null)
    setMessage(null)
    
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      }
    })
    
    if (error) {
      const msg = typeof error.message === 'object' ? JSON.stringify(error.message) : error.message
      setError(msg === '{}' ? 'Something went wrong, please try again later or contact guptashubham20072000@gmail.com if the issue persists.' : msg)
    } else {
      setMessage("Magic link sent! Check your email to sign in securely.")
    }
    setLoading(false)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          name,
          side
        }
      }
    })
    
    if (error) {
      const msg = typeof error.message === 'object' ? JSON.stringify(error.message) : error.message
      setError(msg === '{}' ? 'Something went wrong, please try again later or contact guptashubham20072000@gmail.com if the issue persists.' : msg)
    } else if (data?.user?.identities?.length === 0) {
      setError("An account with this email already exists. Please sign in instead.")
    } else {
      setMessage("Account created! Check your email for a confirmation link.")
      setMode('signin')
      setPassword('')
    }
    setLoading(false)
  }

  return (
    <div className="w-full max-w-sm mx-auto space-y-6">
      
      {/* Tabs */}
      <div className="flex border-b border-marigold/30 mb-6">
        <button 
          className={`flex-1 py-2 font-display text-lg ${mode === 'signin' ? 'text-maroon border-b-2 border-maroon font-semibold' : 'text-maroon/50'}`}
          onClick={() => { setMode('signin'); setError(null); setMessage(null); }}
        >
          Sign In
        </button>
        <button 
          className={`flex-1 py-2 font-display text-lg ${mode === 'signup' ? 'text-maroon border-b-2 border-maroon font-semibold' : 'text-maroon/50'}`}
          onClick={() => { setMode('signup'); setError(null); setMessage(null); }}
        >
          Sign Up
        </button>
      </div>

      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-display font-semibold tracking-tight text-maroon">
          Swati & Satyam
        </h1>
        <span className="inline-block bg-marigold/20 text-maroon font-semibold text-xs px-2 py-0.5 rounded-full border border-marigold/30 shadow-sm mb-2">
          #Swayam2026 💍
        </span>
        <p className="text-sm text-maroon/70 font-data mt-2">
          {mode === 'signin' ? 'Sign in to the wedding dashboard' : 'Create an account to join the dashboard'}
        </p>
      </div>

      {error && <p className="text-sm text-red-600 font-data bg-red-50 p-3 rounded-md border border-red-200">{error}</p>}
      {message && <p className="text-sm text-mehendi font-data bg-mehendi/10 p-3 rounded-md border border-mehendi/20">{message}</p>}
      
      {mode === 'signin' ? (
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-ivory border-marigold/50 focus-visible:ring-maroon"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-ivory border-marigold/50 focus-visible:ring-maroon"
            />
          </div>
          
          <Button 
            type="submit" 
            className="w-full bg-maroon text-ivory hover:bg-maroon/90"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
          
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-marigold/30"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-ivory px-2 text-maroon/50 font-data">Or</span>
            </div>
          </div>

          <Button 
            type="button"
            variant="outline"
            className="w-full border-marigold/50 text-maroon hover:bg-marigold/10"
            onClick={handleMagicLink}
            disabled={loading}
          >
            Email me a Magic Link
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signup-name">Full Name</Label>
            <Input
              id="signup-name"
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="bg-ivory border-marigold/50 focus-visible:ring-maroon"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-side">Which side are you on?</Label>
            <select 
              id="signup-side"
              value={side}
              onChange={(e) => setSide(e.target.value as 'groom' | 'bride')}
              className="flex h-10 w-full rounded-md border border-marigold/50 bg-ivory px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="groom">Ladkewale 🤵‍♂️ (Satyam's Baraati / Team Groom)</option>
              <option value="bride">Ladkiwale 👰‍♀️ (Swati's Gang / Team Bride)</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-email">Email Address</Label>
            <Input
              id="signup-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-ivory border-marigold/50 focus-visible:ring-maroon"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-password">Create Password</Label>
            <Input
              id="signup-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="bg-ivory border-marigold/50 focus-visible:ring-maroon"
            />
          </div>
          
          <Button 
            type="submit" 
            className="w-full bg-maroon text-ivory hover:bg-maroon/90"
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </Button>
        </form>
      )}
    </div>
  )
}
