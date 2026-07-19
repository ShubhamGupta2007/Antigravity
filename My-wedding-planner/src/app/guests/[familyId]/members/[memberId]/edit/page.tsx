'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function EditMemberPage({ params }: { params: Promise<{ familyId: string, memberId: string }> }) {
  const resolvedParams = use(params)
  const familyId = resolvedParams.familyId
  const memberId = resolvedParams.memberId
  
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [member, setMember] = useState<{ name: string, age: number | null, relation_to_head: string | null, gender: string, is_kid_for_gifting: boolean } | null>(null)
  const [familyName, setFamilyName] = useState<string | null>(null)
  
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  useEffect(() => {
    async function checkAdminAndFetch() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()
        
      if (profile?.role !== 'admin') {
        router.push('/guests')
        return
      } else {
        setAuthorized(true)
        // Fetch family name
        const { data: family } = await supabase.from('families').select('family_name').eq('id', familyId).single()
        if (family) setFamilyName(family.family_name)
      }

      // Fetch member details
      const { data: memberData, error: memberError } = await supabase
        .from('family_members')
        .select('*')
        .eq('id', memberId)
        .single()
        
      if (memberError) {
        setError("Member not found.")
      } else if (memberData) {
        setMember({
          name: memberData.name,
          age: memberData.age,
          relation_to_head: memberData.relation_to_head,
          gender: memberData.gender || 'Unknown',
          is_kid_for_gifting: memberData.is_kid_for_gifting || false
        })
      }
      setFetching(false)
    }
    checkAdminAndFetch()
  }, [router, supabase, memberId])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    
    const age = formData.get('age')
    
    const { error: updateError } = await supabase
      .from('family_members')
      .update({
        name: formData.get('name'),
        age: age ? parseInt(age as string) : null,
        relation_to_head: formData.get('relation_to_head'),
        gender: formData.get('gender') || 'Unknown',
        is_kid_for_gifting: formData.get('is_kid_for_gifting') === 'on'
      })
      .eq('id', memberId)

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Success! Navigate back to guests dashboard
    router.push('/guests')
    router.refresh()
  }

  if (authorized === null || fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ivory text-maroon">
        <p className="font-data animate-pulse">Loading member details...</p>
      </div>
    )
  }

  if (!member && !fetching) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-ivory text-maroon space-y-4">
        <p className="font-data text-rust-red">Error: {error}</p>
        <Link href="/guests">
          <Button className="bg-maroon text-ivory">Back to Guests</Button>
        </Link>
      </div>
    )
  }

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-lg mx-auto bg-ivory pb-20">
      <header className="flex items-center space-x-4 py-4 border-b border-marigold/30 mb-8">
        <Link href="/guests">
          <Button variant="ghost" size="icon" className="text-maroon/70 hover:text-maroon hover:bg-marigold/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-display font-semibold text-maroon">
          Edit Member {familyName ? `in ${familyName.toLowerCase().endsWith('family') ? familyName : `${familyName} Family`}` : ''}
        </h1>
      </header>

      {error && <div className="p-4 mb-6 bg-rust-red/10 border border-rust-red/20 text-rust-red rounded-lg text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input id="name" name="name" defaultValue={member?.name} required className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="relation_to_head">Relation to Family Head</Label>
          <Input id="relation_to_head" name="relation_to_head" defaultValue={member?.relation_to_head || ''} placeholder="e.g. Son, Daughter, Wife, Self" required className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="age">Age (Optional)</Label>
          <Input id="age" name="age" type="number" defaultValue={member?.age || ''} className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gender">Gender</Label>
          <select 
            id="gender" 
            name="gender" 
            className="flex h-10 w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-marigold/50"
            defaultValue={member?.gender || 'Unknown'}
            key={member?.gender}
          >
            <option value="Unknown">Unknown</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div className="flex items-center space-x-2 bg-marigold/10 p-4 rounded-md border border-marigold/30">
          <input 
            type="checkbox" 
            id="is_kid_for_gifting" 
            name="is_kid_for_gifting" 
            defaultChecked={member?.is_kid_for_gifting}
            className="h-4 w-4 rounded border-marigold/50 text-maroon focus:ring-maroon accent-maroon"
          />
          <div className="space-y-1 leading-none">
            <Label htmlFor="is_kid_for_gifting" className="font-semibold text-maroon cursor-pointer">Treat as Kid for Gifting</Label>
            <p className="text-xs text-maroon/60 font-data">Check this if the member should not receive an individual gift/lifafa (e.g. unmarried children of the family).</p>
          </div>
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-maroon text-ivory hover:bg-maroon/90 py-6 mt-4">
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </form>
    </main>
  )
}
