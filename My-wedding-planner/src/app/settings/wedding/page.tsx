'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Settings = {
  bride_name: string
  groom_name: string
  wedding_date: string | null
  city: string | null
  rsvp_deadline: string | null
  greeting: string | null
  families_line: string | null
  groom_family_name: string | null
  bride_family_name: string | null
  contact_name: string | null
  contact_phone: string | null
  story: string | null
}

const FIELDS: Array<{ key: keyof Settings; label: string; hint?: string; type?: 'text' | 'date' | 'textarea'; placeholder?: string }> = [
  { key: 'bride_name', label: 'Bride’s name' },
  { key: 'groom_name', label: 'Groom’s name' },
  { key: 'wedding_date', label: 'Wedding date', type: 'date' },
  { key: 'city', label: 'City', placeholder: 'e.g. Meerut' },
  { key: 'rsvp_deadline', label: 'Reply by', type: 'date', hint: 'Guests can change their reply until this day.' },
  { key: 'groom_family_name', label: 'Groom’s family (Ladkewale)', placeholder: 'e.g. The Gupta family' },
  { key: 'bride_family_name', label: 'Bride’s family (Ladkiwale)', placeholder: 'e.g. The Agarwal family' },
  { key: 'families_line', label: 'Signed by', hint: 'Under the personal note.', placeholder: 'e.g. With love, the Gupta & Agarwal families' },
  { key: 'greeting', label: 'Personal note', type: 'textarea', hint: 'Shown after “Dear <family name>”. Leave empty for the default.' },
  { key: 'story', label: 'Our story', type: 'textarea', hint: 'A few lines; leave empty to hide the section.' },
  { key: 'contact_name', label: 'Contact for travel & rooms', placeholder: 'e.g. Shubham' },
  { key: 'contact_phone', label: 'Their phone', placeholder: '+91 …' }
]

/** Wedding-wide details used on every guest invitation. */
export default function WeddingSettingsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('wedding_settings').select('*').eq('id', 1).maybeSingle().then(({ data, error: err }) => {
      if (err) setError('Run supabase/14_guest_invitations.sql in the Supabase SQL editor to set up invitations.')
      else setSettings((data as Settings) || null)
    })
  }, [supabase])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    const payload = Object.fromEntries(
      Object.entries(settings).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v])
    ) as Partial<Settings>
    if (!payload.bride_name || !payload.groom_name) {
      setSaving(false)
      return toast.error('Both names are needed')
    }
    const { error: err } = await supabase.from('wedding_settings').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', 1)
    setSaving(false)
    if (err) toast.error(`Could not save: ${err.message}`)
    else toast.success('Saved. Every invitation now shows these details.')
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-maroon">Wedding details</h1>
        <p className="mt-1 font-data text-sm text-maroon/60">Shown on every guest invitation.</p>
      </header>
      {error && <p className="rounded-xl border border-rust-red/30 bg-rust-red/10 p-4 font-data text-sm text-rust-red">{error}</p>}
      {!settings && !error && <p className="font-data text-sm text-maroon/50">Loading…</p>}
      {settings && (
        <form onSubmit={save} className="space-y-4 rounded-2xl border border-marigold/20 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map(f => (
              <div key={f.key} className={`space-y-1 ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                <Label htmlFor={f.key} className="text-xs font-semibold text-maroon">{f.label}</Label>
                {f.type === 'textarea' ? (
                  <textarea
                    id={f.key}
                    rows={4}
                    value={(settings[f.key] as string) || ''}
                    onChange={e => setSettings({ ...settings, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full rounded-md border border-marigold/50 bg-white p-2.5 font-data text-sm text-maroon"
                  />
                ) : (
                  <Input
                    id={f.key}
                    type={f.type || 'text'}
                    value={(settings[f.key] as string) || ''}
                    onChange={e => setSettings({ ...settings, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="h-10 border-marigold/50 bg-white text-sm"
                  />
                )}
                {f.hint && <p className="font-data text-[11px] text-maroon/50">{f.hint}</p>}
              </div>
            ))}
          </div>
          <Button type="submit" disabled={saving} className="w-full bg-maroon text-ivory hover:bg-maroon/90">{saving ? 'Saving…' : 'Save'}</Button>
        </form>
      )}
    </div>
  )
}
