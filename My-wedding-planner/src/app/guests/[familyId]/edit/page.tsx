'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function EditFamilyPage({ params }: { params: Promise<{ familyId: string }> }) {
  const resolvedParams = use(params)
  const familyId = resolvedParams.familyId

  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [existingRelationships, setExistingRelationships] = useState<string[]>([])
  const [formDataState, setFormDataState] = useState({
    family_name: '',
    relationship: '',
    side: 'groom',
    relation_tier: 'tier_2',
    expected_adults_count: 1,
    expected_kids_count: 0,
    is_local: 'true',
    city: '',
    contact_person: '',
    contact_phone: ''
  })

  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Check admin auth
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        router.push('/guests')
        return
      }
      setAuthorized(true)

      // Fetch existing relationships for dropdown
      const { data: relData } = await supabase.from('families').select('relationship')
      if (relData) {
        const rels = Array.from(new Set(relData.map(f => f.relationship).filter(Boolean) as string[])).sort()
        setExistingRelationships(rels)
      }

      // Fetch existing family details
      const { data: family, error: fetchError } = await supabase
        .from('families')
        .select('*')
        .eq('id', familyId)
        .single()

      if (fetchError) {
        setError(fetchError.message)
      } else if (family) {
        setFormDataState({
          family_name: family.family_name || '',
          relationship: family.relationship || '',
          side: family.side || 'groom',
          relation_tier: family.relation_tier || 'tier_2',
          expected_adults_count: family.expected_adults_count || 1,
          expected_kids_count: family.expected_kids_count || 0,
          is_local: family.is_local ? 'true' : 'false',
          city: family.city || '',
          contact_person: family.contact_person || '',
          contact_phone: family.contact_phone || ''
        })
      }
      setFetching(false)
    }
    init()
  }, [familyId, router, supabase])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormDataState(prev => ({
      ...prev,
      [name]: value
    }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('families')
      .update({
        family_name: formDataState.family_name,
        relationship: formDataState.relationship,
        side: formDataState.side,
        relation_tier: formDataState.relation_tier,
        expected_adults_count: parseInt(formDataState.expected_adults_count as any) || 1,
        expected_kids_count: parseInt(formDataState.expected_kids_count as any) || 0,
        is_local: formDataState.is_local === 'true',
        contact_person: formDataState.contact_person,
        contact_phone: formDataState.contact_phone,
        city: formDataState.city
      })
      .eq('id', familyId)

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Redirect to guests dashboard
    router.push('/guests')
    router.refresh()
  }

  async function handleDelete() {
    const confirmDelete = window.confirm("Are you sure you want to delete this family? This will also delete all of its members and cannot be undone.")
    if (!confirmDelete) return

    setLoading(true)
    setError(null)

    // First delete all family members (foreign key relation might have cascade, but deleting explicitly is safe)
    const { error: membersDeleteError } = await supabase
      .from('family_members')
      .delete()
      .eq('family_id', familyId)

    if (membersDeleteError) {
      setError(membersDeleteError.message)
      setLoading(false)
      return
    }

    const { error: familyDeleteError } = await supabase
      .from('families')
      .delete()
      .eq('id', familyId)

    if (familyDeleteError) {
      setError(familyDeleteError.message)
      setLoading(false)
      return
    }

    router.push('/guests')
    router.refresh()
  }

  if (authorized === null || fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ivory text-maroon">
        <p className="font-data animate-pulse">Loading family details...</p>
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
        <h1 className="text-2xl font-display font-semibold text-maroon">Edit Family</h1>
      </header>

      {error && <div className="p-4 mb-6 bg-rust-red/10 border border-rust-red/20 text-rust-red rounded-lg text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="family_name">Family Name</Label>
          <Input id="family_name" name="family_name" value={formDataState.family_name} onChange={handleChange} required className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="relationship">Relationship (e.g. Friends to Dad, Maternal Family)</Label>
          <Input id="relationship" name="relationship" list="edit-relationships-list" value={formDataState.relationship} onChange={handleChange} required placeholder="e.g. Friends to Dad" className="bg-white border-marigold/50" />
          <datalist id="edit-relationships-list">
            {existingRelationships.map(rel => (
              <option key={rel} value={rel} />
            ))}
          </datalist>
        </div>

        <div className="space-y-2">
          <Label htmlFor="side">Which Side?</Label>
          <select id="side" name="side" value={formDataState.side} onChange={handleChange} required className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm">
            <option value="groom">Ladkewale (Groom's Side)</option>
            <option value="bride">Ladkiwale (Bride's Side)</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="relation_tier">Relation / Category</Label>
          <select id="relation_tier" name="relation_tier" value={formDataState.relation_tier} onChange={handleChange} required className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm">
            <option value="tier_1">Immediate Family (Hosts) 👑</option>
            <option value="tier_2">Close Circle (Rishtedaar & Close Friends) 🤝</option>
            <option value="tier_3">Extended Circle & Neighbors (Mehman, Padosi & Colleagues) 🏡</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="expected_adults_count">Expected Adults</Label>
            <Input id="expected_adults_count" name="expected_adults_count" type="number" min="1" value={formDataState.expected_adults_count} onChange={handleChange} required className="bg-white border-marigold/50" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expected_kids_count">Expected Kids</Label>
            <Input id="expected_kids_count" name="expected_kids_count" type="number" min="0" value={formDataState.expected_kids_count} onChange={handleChange} required className="bg-white border-marigold/50" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="is_local">Location Type</Label>
          <select id="is_local" name="is_local" value={formDataState.is_local} onChange={handleChange} required className="flex h-10 w-full rounded-md border border-marigold/50 bg-white px-3 py-2 text-sm">
            <option value="true">Local</option>
            <option value="false">Outstation (Needs Accommodation)</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" value={formDataState.city} onChange={handleChange} placeholder="e.g. New Delhi" className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact_person">Primary Contact Person</Label>
          <Input id="contact_person" name="contact_person" value={formDataState.contact_person} onChange={handleChange} className="bg-white border-marigold/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact_phone">Contact Phone Number</Label>
          <Input id="contact_phone" name="contact_phone" value={formDataState.contact_phone} onChange={handleChange} type="tel" className="bg-white border-marigold/50" />
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-maroon text-ivory hover:bg-maroon/90 py-6 mt-4">
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="w-full mt-4 text-xs font-semibold text-rust-red/80 hover:text-rust-red bg-rust-red/5 hover:bg-rust-red/10 border border-rust-red/20 py-3 rounded-xl transition-all"
        >
          🗑️ Delete Family Card
        </button>
      </form>
    </main>
  )
}
