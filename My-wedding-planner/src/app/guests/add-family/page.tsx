'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

export default function AddFamilyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-ivory text-maroon">
        <p className="font-data animate-pulse">Loading form...</p>
      </div>
    }>
      <AddFamilyForm />
    </Suspense>
  )
}

function AddFamilyForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  
  const router = useRouter()
  const searchParams = useSearchParams()

  // Form states for pill selectors
  const [side, setSide] = useState<'groom' | 'bride'>('groom')
  const [relationTier, setRelationTier] = useState<string>('tier_2')
  const [isLocal, setIsLocal] = useState<boolean>(true)
  const [addAnother, setAddAnother] = useState<boolean>(false)
  
  // Duplicate check states
  const [existingNames, setExistingNames] = useState<string[]>([])
  const [existingRelationships, setExistingRelationships] = useState<string[]>([])
  const [familyNameVal, setFamilyNameVal] = useState('')
  
  const isDuplicate = existingNames.includes(familyNameVal.toLowerCase().trim())

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  useEffect(() => {
    // Read query params for defaults
    const sideParam = searchParams.get('side')
    if (sideParam === 'groom' || sideParam === 'bride') {
      setSide(sideParam)
    }
    const tierParam = searchParams.get('relation_tier')
    if (tierParam) {
      setRelationTier(tierParam)
    }
  }, [searchParams])

  useEffect(() => {
    async function checkAdmin() {
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
      } else {
        setAuthorized(true)
      }
    }
    checkAdmin()
  }, [router, supabase])

  useEffect(() => {
    async function loadNames() {
      const { data } = await supabase.from('families').select('family_name, relationship')
      if (data) {
        setExistingNames(data.map(f => f.family_name.toLowerCase().trim()))
        const rels = Array.from(new Set(data.map(f => f.relationship).filter(Boolean) as string[])).sort()
        setExistingRelationships(rels)
      }
    }
    if (authorized) {
      loadNames()
    }
  }, [authorized, supabase])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    const formData = new FormData(form)
    const familyName = formData.get('family_name') as string
    const relationship = formData.get('relationship') as string
    const contactPerson = formData.get('contact_person') as string
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError("You must be logged in to add a family.")
      setLoading(false)
      return
    }

    const { data: family, error: insertError } = await supabase
      .from('families')
      .insert({
        family_name: familyName,
        relationship: relationship,
        side: side,
        relation_tier: relationTier,
        expected_adults_count: parseInt(formData.get('expected_adults_count') as string) || 1,
        expected_kids_count: parseInt(formData.get('expected_kids_count') as string) || 0,
        is_local: isLocal,
        contact_person: contactPerson,
        contact_phone: formData.get('contact_phone'),
        city: formData.get('city'),
        created_by: user.id
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    // Automatically add the primary contact person as a member of this family
    if (contactPerson && contactPerson.trim() !== '') {
      const { error: memberError } = await supabase
        .from('family_members')
        .insert({
          family_id: family.id,
          name: contactPerson,
          relation_to_head: 'Head'
        })
      if (memberError) {
        console.error('Error inserting contact person as member:', memberError.message)
      }
    }

    setLoading(false)

    if (addAnother) {
      // Clear specific form inputs (family name, contact name, contact phone, city)
      setFamilyNameVal('')
      
      const contactInput = form.querySelector('#contact_person') as HTMLInputElement
      const phoneInput = form.querySelector('#contact_phone') as HTMLInputElement
      const cityInput = form.querySelector('#city') as HTMLInputElement
      const relationshipInput = form.querySelector('#relationship') as HTMLInputElement
      
      if (contactInput) contactInput.value = ''
      if (phoneInput) phoneInput.value = ''
      if (cityInput) cityInput.value = ''
      if (relationshipInput) relationshipInput.value = ''

      setSuccessMsg(`Successfully added "${familyName}"!`)
      setExistingNames(prev => [...prev, familyName.toLowerCase().trim()])
      
      // Refresh router background queries quietly
      router.refresh()
    } else {
      // Success! Navigate back to guests dashboard
      router.push('/guests')
      router.refresh()
    }
  }

  if (authorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ivory text-maroon">
        <p className="font-data animate-pulse">Verifying permissions...</p>
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
        <h1 className="text-2xl font-display font-semibold text-maroon">Add Family</h1>
      </header>

      {error && (
        <div className="p-4 mb-6 bg-rust-red/10 border border-rust-red/20 text-rust-red rounded-lg text-sm">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-4 mb-6 bg-mehendi/10 border border-mehendi/20 text-mehendi rounded-lg text-sm flex items-center">
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="family_name">Family Name (e.g. Sharma Family)</Label>
          <Input 
            id="family_name" 
            name="family_name" 
            value={familyNameVal}
            onChange={(e) => setFamilyNameVal(e.target.value)}
            required 
            className="bg-white border-marigold/50" 
          />
          {familyNameVal.trim() !== '' && isDuplicate && (
            <p className="text-xs text-rust-red font-data flex items-center mt-1">
              ⚠️ A family with this name already exists in the list.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="relationship">Relationship (e.g. Friends to Dad, Maternal Family)</Label>
          <Input 
            id="relationship" 
            name="relationship" 
            list="relationships-list"
            placeholder="e.g. Friends to Dad"
            required 
            className="bg-white border-marigold/50" 
          />
          <datalist id="relationships-list">
            {existingRelationships.map(rel => (
              <option key={rel} value={rel} />
            ))}
          </datalist>
        </div>

        {/* Side Selector Pills */}
        <div className="space-y-2">
          <Label>Which Side?</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSide('groom')}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${
                side === 'groom'
                  ? 'bg-maroon text-ivory border-maroon shadow-sm'
                  : 'bg-white text-maroon/70 border-marigold/30 hover:bg-marigold/10'
              }`}
            >
              Ladkewale 🤵‍♂️
            </button>
            <button
              type="button"
              onClick={() => setSide('bride')}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${
                side === 'bride'
                  ? 'bg-maroon text-ivory border-maroon shadow-sm'
                  : 'bg-white text-maroon/70 border-marigold/30 hover:bg-marigold/10'
              }`}
            >
              Ladkiwale 👰‍♀️
            </button>
          </div>
        </div>

        {/* Relation Tier Selector Pills */}
        <div className="space-y-2">
          <Label>Relation / Category</Label>
          <div className="flex flex-col gap-2">
            {[
              { id: 'tier_1', label: 'Immediate Family (Hosts) 👑' },
              { id: 'tier_2', label: 'Close Circle (Rishtedaar & Friends) 🤝' },
              { id: 'tier_3', label: 'Extended Circle & Neighbors 🏡' }
            ].map(tier => (
              <button
                key={tier.id}
                type="button"
                onClick={() => setRelationTier(tier.id)}
                className={`w-full py-2.5 px-4 text-xs font-semibold rounded-xl border text-left transition-all ${
                  relationTier === tier.id
                    ? 'bg-maroon text-ivory border-maroon shadow-sm font-medium'
                    : 'bg-white text-maroon/70 border-marigold/30 hover:bg-marigold/10'
                }`}
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>

        {/* Headcount grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="expected_adults_count">Expected Adults</Label>
            <Input id="expected_adults_count" name="expected_adults_count" type="number" min="1" defaultValue="1" required className="bg-white border-marigold/50" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expected_kids_count">Expected Kids</Label>
            <Input id="expected_kids_count" name="expected_kids_count" type="number" min="0" defaultValue="0" required className="bg-white border-marigold/50" />
          </div>
        </div>

        {/* Location Type Selector Pills */}
        <div className="space-y-2">
          <Label>Location Type</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsLocal(true)}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${
                isLocal
                  ? 'bg-maroon text-ivory border-maroon shadow-sm'
                  : 'bg-white text-maroon/70 border-marigold/30 hover:bg-marigold/10'
              }`}
            >
              Local 🚗
            </button>
            <button
              type="button"
              onClick={() => setIsLocal(false)}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${
                !isLocal
                  ? 'bg-maroon text-ivory border-maroon shadow-sm'
                  : 'bg-white text-maroon/70 border-marigold/30 hover:bg-marigold/10'
              }`}
            >
              Outstation (Needs Room) ✈️
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" placeholder="e.g. New Delhi" className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact_person">Primary Contact Person</Label>
          <Input id="contact_person" name="contact_person" className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact_phone">Contact Phone Number</Label>
          <Input id="contact_phone" name="contact_phone" type="tel" className="bg-white border-marigold/50" />
        </div>

        {/* Keep Adding Checkbox */}
        <div className="flex items-center space-x-2 border-t border-marigold/20 pt-4 mt-6">
          <input
            id="add_another"
            type="checkbox"
            checked={addAnother}
            onChange={(e) => setAddAnother(e.target.checked)}
            className="w-4 h-4 accent-maroon border-marigold/50 rounded focus:ring-maroon"
          />
          <Label htmlFor="add_another" className="text-xs text-maroon/80 font-data cursor-pointer select-none">
            Keep adding more families (stay on this page after saving)
          </Label>
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-maroon text-ivory hover:bg-maroon/90 py-6">
          {loading ? 'Saving...' : 'Save Family'}
        </Button>
      </form>
    </main>
  )
}
