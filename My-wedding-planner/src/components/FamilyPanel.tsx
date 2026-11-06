'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarDays, Check, Minus, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/client'
import { ageGroup, DEFAULT_KID_AGE } from '@/lib/functionPlanning'
import KidToggle from './KidToggle'
import PendingMemberActions from './PendingMemberActions'
import ShagunHistory, { type FamilyShagun } from './ShagunHistory'
import InviteShare from './InviteShare'

export type Couple = { bride_name?: string | null; groom_name?: string | null }

export type GuestMember = {
  id: string
  name: string
  age: number | null
  relation_to_head: string | null
  gender: string
  is_kid_for_gifting: boolean
  pending_approval?: boolean | null
}

export type GuestFamily = {
  id: string
  family_name: string
  side: string
  relation_tier: string
  expected_adults_count: number | null
  expected_kids_count: number | null
  is_local: boolean
  city: string | null
  contact_person: string | null
  contact_phone: string | null
  relationship: string | null
  invite_code?: string | null
  family_members: GuestMember[]
  function_attendance?: { function_id: string; functions?: { name: string } | null }[]
}

const RELATIONS = ['Self', 'Wife', 'Husband', 'Son', 'Daughter', 'Mother', 'Father', 'Daughter-in-law', 'Grandchild']
const GENDERS = [
  { value: 'Male', label: '👨 Male' },
  { value: 'Female', label: '👩 Female' },
  { value: 'Unknown', label: 'Not set' }
]
const AGE_ICON = { kid: '🧸', adult: '🧑', senior: '👵' } as const

type Draft = { name: string; relation: string; age: string; gender: string }
const emptyDraft: Draft = { name: '', relation: '', age: '', gender: 'Unknown' }

/** Name, relation, age and gender for one member: used to add and to edit. */
function MemberForm({
  initial,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete
}: {
  initial: Draft
  saving: boolean
  submitLabel: string
  onSubmit: (d: Draft) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [d, setD] = useState<Draft>(initial)
  const set = (patch: Partial<Draft>) => setD(prev => ({ ...prev, ...patch }))
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (d.name.trim()) onSubmit(d) }}
      className="space-y-2.5 rounded-xl border border-marigold/30 bg-white p-3"
    >
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <input autoFocus value={d.name} onChange={e => set({ name: e.target.value })} placeholder="Name" aria-label="Name" required
          className="h-10 rounded-lg border border-marigold/40 bg-white px-3 text-sm text-maroon outline-none focus:border-maroon" />
        <input value={d.age} onChange={e => set({ age: e.target.value })} type="number" min={0} max={120} inputMode="numeric" placeholder="Age" aria-label="Age"
          className="h-10 rounded-lg border border-marigold/40 bg-white px-3 text-sm text-maroon outline-none focus:border-maroon" />
      </div>
      <div>
        <input value={d.relation} onChange={e => set({ relation: e.target.value })} placeholder="Relation (e.g. Son, Bhabhi)" aria-label="Relation to family head"
          className="h-9 w-full rounded-lg border border-marigold/40 bg-white px-3 text-xs text-maroon outline-none focus:border-maroon" />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {RELATIONS.map(r => (
            <button key={r} type="button" onClick={() => set({ relation: r })}
              className={`rounded-full border px-2 py-0.5 font-data text-[11px] ${d.relation === r ? 'border-maroon bg-maroon text-ivory' : 'border-marigold/30 bg-ivory text-maroon/80 hover:bg-marigold/10'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Gender">
        {GENDERS.map(g => (
          <button key={g.value} type="button" role="radio" aria-checked={d.gender === g.value} onClick={() => set({ gender: g.value })}
            className={`rounded-full border px-3 py-1 font-data text-xs font-semibold ${d.gender === g.value ? 'border-maroon bg-maroon text-ivory' : 'border-marigold/30 bg-white text-maroon hover:bg-marigold/10'}`}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        {onDelete && (
          <button type="button" onClick={onDelete} disabled={saving} className="mr-auto inline-flex items-center gap-1 rounded-full px-2 py-1 font-data text-xs font-semibold text-rust-red hover:bg-rust-red/10">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
        <button type="button" onClick={onCancel} className="ml-auto rounded-full border border-marigold/40 px-3 py-1.5 font-data text-xs font-semibold text-maroon">Cancel</button>
        <button type="submit" disabled={saving || !d.name.trim()} className="rounded-full bg-maroon px-4 py-1.5 font-data text-xs font-semibold text-ivory disabled:opacity-50">
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

/**
 * Everything about one family on the guest list, editable in place: contact, how many
 * are coming, members (add, edit, remove, kid or adult), functions and shagun.
 */
export default function FamilyPanel({
  family,
  canEdit,
  shagun,
  couple
}: {
  family: GuestFamily
  canEdit: boolean
  shagun: FamilyShagun[]
  couple: Couple
}) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const supabase = createClient()
  const refresh = () => startRefresh(() => router.refresh())

  const members = family.family_members || []
  const groups = members.map(m => ageGroup(m, DEFAULT_KID_AGE))
  const namedAdults = groups.filter(g => g !== 'kid').length
  const namedKids = groups.filter(g => g === 'kid').length
  const expectedAdults = family.expected_adults_count ?? 1
  const expectedKids = family.expected_kids_count ?? 0
  const functions = Array.from(new Set((family.function_attendance || []).map(a => a.functions?.name).filter(Boolean))) as string[]
  const phoneDigits = (family.contact_phone || '').replace(/[^\d+]/g, '')

  const toRow = (d: Draft) => ({
    name: d.name.trim(),
    relation_to_head: d.relation.trim() || null,
    age: d.age.trim() === '' ? null : Math.max(0, parseInt(d.age, 10)),
    gender: d.gender || 'Unknown'
  })

  const addMember = async (d: Draft) => {
    setSaving(true)
    const { error } = await supabase.from('family_members').insert({ family_id: family.id, is_kid_for_gifting: false, ...toRow(d) })
    setSaving(false)
    if (error) return toast.error(`Could not add: ${error.message}`)
    toast.success(`${d.name.trim()} added`)
    setAdding(false)
    // Keep the family's expected count at least as big as the names listed
    const kid = d.age.trim() !== '' && parseInt(d.age, 10) < DEFAULT_KID_AGE
    if (kid && namedKids + 1 > expectedKids) await supabase.from('families').update({ expected_kids_count: namedKids + 1 }).eq('id', family.id)
    if (!kid && namedAdults + 1 > expectedAdults) await supabase.from('families').update({ expected_adults_count: namedAdults + 1 }).eq('id', family.id)
    refresh()
  }

  const saveMember = async (id: string, d: Draft) => {
    setSaving(true)
    const { error } = await supabase.from('family_members').update(toRow(d)).eq('id', id)
    setSaving(false)
    if (error) return toast.error(`Could not save: ${error.message}`)
    setEditingId(null)
    refresh()
  }

  const removeMember = async (m: GuestMember) => {
    if (!window.confirm(`Remove ${m.name} from ${family.family_name}? They will also be taken off every function.`)) return
    setSaving(true)
    const { error } = await supabase.from('family_members').delete().eq('id', m.id)
    setSaving(false)
    if (error) return toast.error(`Could not remove: ${error.message}`)
    setEditingId(null)
    refresh()
  }

  const setExpected = async (field: 'expected_adults_count' | 'expected_kids_count', value: number) => {
    const { error } = await supabase.from('families').update({ [field]: Math.max(field === 'expected_adults_count' ? 1 : 0, value) }).eq('id', family.id)
    if (error) return toast.error(`Could not update: ${error.message}`)
    refresh()
  }

  const stepper = (label: string, field: 'expected_adults_count' | 'expected_kids_count', value: number, named: number, min: number) => (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-marigold/20">
      <div>
        <p className="font-data text-xs font-semibold text-maroon">{label}</p>
        <p className="font-data text-[10px] text-maroon/50">{named} named</p>
      </div>
      {canEdit ? (
        <div className="flex items-center rounded-full border border-marigold/40">
          <button type="button" disabled={refreshing || value <= min} onClick={() => setExpected(field, value - 1)} aria-label={`One fewer ${label.toLowerCase()}`} className="grid h-8 w-8 place-items-center text-maroon disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>
          <span className="w-7 text-center font-data text-sm font-bold text-maroon">{value}</span>
          <button type="button" disabled={refreshing} onClick={() => setExpected(field, value + 1)} aria-label={`One more ${label.toLowerCase()}`} className="grid h-8 w-8 place-items-center text-maroon disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <span className="font-data text-sm font-bold text-maroon">{value}</span>
      )}
    </div>
  )

  return (
    <div className={`space-y-4 border-t border-marigold/15 bg-ivory/50 p-4 ${refreshing ? 'opacity-80' : ''}`}>
      {/* Contact and quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        {family.contact_person && (
          <span className="mr-1 font-data text-xs text-maroon/70">👤 <b className="text-maroon">{family.contact_person}</b>{family.contact_phone ? ` · ${family.contact_phone}` : ''}</span>
        )}
        {phoneDigits && (
          <a href={`tel:${phoneDigits}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-marigold/40 bg-white px-3 font-data text-xs font-semibold text-maroon hover:bg-marigold/10">
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        )}
        <InviteShare variant="buttons" code={family.invite_code} familyName={family.family_name} phone={family.contact_phone} couple={couple} />
      </div>

      {/* How many are coming */}
      <div className="grid grid-cols-2 gap-2">
        {stepper('Adults', 'expected_adults_count', expectedAdults, namedAdults, Math.max(1, namedAdults))}
        {stepper('Kids', 'expected_kids_count', expectedKids, namedKids, namedKids)}
      </div>

      {/* Members */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-data text-[10px] font-bold uppercase tracking-widest text-maroon/50">
            People · {members.length} of {expectedAdults + expectedKids} named
          </h4>
          {canEdit && !adding && (
            <button type="button" onClick={() => { setAdding(true); setEditingId(null) }} className="inline-flex items-center gap-1 rounded-full bg-maroon px-3 py-1 font-data text-xs font-semibold text-ivory">
              <Plus className="h-3.5 w-3.5" /> Add person
            </button>
          )}
        </div>

        <ul className="space-y-1.5">
          {members.length === 0 && !adding && (
            <li className="rounded-xl border border-dashed border-marigold/40 p-4 text-center font-data text-xs text-maroon/50">
              No names yet. {canEdit ? 'Tap “Add person” to list who’s in this family.' : ''}
            </li>
          )}
          {members.map((m, i) => {
            if (editingId === m.id) {
              return (
                <li key={m.id}>
                  <MemberForm
                    initial={{ name: m.name, relation: m.relation_to_head || '', age: m.age === null ? '' : String(m.age), gender: m.gender || 'Unknown' }}
                    saving={saving}
                    submitLabel="Save"
                    onSubmit={d => saveMember(m.id, d)}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => removeMember(m)}
                  />
                </li>
              )
            }
            const group = groups[i]
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-white px-3 py-2 ring-1 ring-marigold/15">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm ${group === 'kid' ? 'bg-rani-pink/10' : group === 'senior' ? 'bg-marigold/20' : 'bg-maroon/5'}`} aria-hidden="true">
                  {AGE_ICON[group]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-data text-sm font-semibold text-maroon">{m.name}</span>
                  <span className="block truncate font-data text-[11px] text-maroon/55">
                    {[m.relation_to_head, m.age !== null ? `${m.age} yrs` : null, m.gender && m.gender !== 'Unknown' ? m.gender : null].filter(Boolean).join(' · ') || 'Tap ✏️ to add details'}
                  </span>
                </span>
                <KidToggle memberId={m.id} age={m.age} initialIsKid={m.is_kid_for_gifting} canEdit={canEdit} />
                {canEdit && (
                  <button type="button" onClick={() => { setEditingId(m.id); setAdding(false) }} aria-label={`Edit ${m.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-maroon/40 hover:bg-marigold/10 hover:text-maroon">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {m.pending_approval && canEdit && (
                  <div className="w-full border-t border-marigold/15 pt-2 pl-10">
                    <PendingMemberActions memberId={m.id} name={m.name} />
                  </div>
                )}
              </li>
            )
          })}
          {adding && (
            <li>
              <MemberForm initial={emptyDraft} saving={saving} submitLabel="Add" onSubmit={addMember} onCancel={() => setAdding(false)} />
            </li>
          )}
        </ul>
      </div>

      {/* Functions and shagun */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-data text-[10px] font-bold uppercase tracking-widest text-maroon/50">Invited to</h4>
          {canEdit && (
            <Link href={`/guests/${family.id}/functions`} className="inline-flex items-center gap-1 font-data text-xs font-semibold text-maroon hover:underline">
              <CalendarDays className="h-3.5 w-3.5" /> Change
            </Link>
          )}
        </div>
        {functions.length === 0 ? (
          <p className="font-data text-xs italic text-maroon/50">Not invited to any function yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {functions.map(fn => (
              <span key={fn} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-data text-[11px] font-semibold text-maroon ring-1 ring-marigold/30">
                <Check className="h-3 w-3 text-mehendi" /> {fn}
              </span>
            ))}
          </div>
        )}
      </div>

      {shagun.length > 0 && <ShagunHistory entries={shagun} />}

      {canEdit && (
        <div className="flex flex-wrap justify-end gap-3 border-t border-marigold/15 pt-3">
          <Link href={`/guests/${family.id}/edit`} className="inline-flex items-center gap-1 font-data text-xs font-semibold text-maroon/70 hover:text-maroon">
            <Pencil className="h-3.5 w-3.5" /> Edit family details
          </Link>
        </div>
      )}
    </div>
  )
}
