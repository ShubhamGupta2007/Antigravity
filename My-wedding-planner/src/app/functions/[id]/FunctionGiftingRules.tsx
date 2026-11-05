'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Gift, Plus, Trash2, Edit2, Sparkles, Wallet, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  computeGifting,
  saveGiftingPlan,
  TARGET_GROUP_LABELS,
  TIER_LABELS,
  type GiftCount,
  type GiftingRule,
  type GiftOverride,
  type PlanningAttendance,
  type PlanningFamily
} from '@/lib/functionPlanning'

type RuleInput = Omit<GiftingRule, 'id' | 'function_id'>

const PRESETS: RuleInput[] = [
  { rule_name: 'Close Circle – Adults', type: 'lifafa', distribution: 'per_person', amount: 1100, target_side: 'both', target_tier: 'tier_2', target_gender: 'Adults' },
  { rule_name: 'Extended – Adults', type: 'lifafa', distribution: 'per_person', amount: 500, target_side: 'both', target_tier: 'tier_3', target_gender: 'Adults' },
  { rule_name: 'Kids', type: 'lifafa', distribution: 'per_person', amount: 250, target_side: 'both', target_tier: 'all', target_gender: 'Kids' }
]

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const familyLabel = (name?: string | null) =>
  !name ? 'Family' : name.toLowerCase().endsWith('family') ? name : `${name} Family`

export default function FunctionGiftingRules({
  functionId,
  initialKidAge,
  canEdit,
  initialRules,
  initialOverrides,
  giftCounts = [],
  families,
  attendance,
  storedLifafaTotal,
  storedReturnGiftTotal,
  linkedCategory,
  functionBudget
}: {
  functionId: string
  initialKidAge: number
  canEdit: boolean
  initialRules: GiftingRule[]
  initialOverrides: GiftOverride[]
  giftCounts?: GiftCount[]
  families: PlanningFamily[]
  attendance: PlanningAttendance[]
  storedLifafaTotal: number
  storedReturnGiftTotal: number
  linkedCategory: { id: string; name: string } | null
  functionBudget: number
}) {
  const supabase = useMemo(() => createClient(), [])
  const [rules, setRules] = useState<GiftingRule[]>(initialRules)
  const [overrides, setOverrides] = useState<GiftOverride[]>(initialOverrides)
  const [kidAge, setKidAge] = useState(initialKidAge)
  const [kidAgeDraft, setKidAgeDraft] = useState(String(initialKidAge))
  const [ruleModal, setRuleModal] = useState<{ open: boolean; editing: GiftingRule | null }>({ open: false, editing: null })
  const [overrideModal, setOverrideModal] = useState<{ open: boolean; editing: GiftOverride | null }>({ open: false, editing: null })
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const summary = useMemo(
    () => computeGifting(rules, overrides, families, attendance, kidAge, giftCounts),
    [rules, overrides, families, attendance, kidAge, giftCounts]
  )

  // Keep the stored totals (and the budget's "Lifafas & Gifts" line) in step
  // with what this page calculates, including after guest-list changes.
  const lastSaved = useRef({ lifafa: Number(storedLifafaTotal) || 0, returnGift: Number(storedReturnGiftTotal) || 0 })
  useEffect(() => {
    const { lifafaTotal, returnGiftTotal } = summary
    if (lastSaved.current.lifafa === lifafaTotal && lastSaved.current.returnGift === returnGiftTotal) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setSyncState('saving')
      const { error } = await saveGiftingPlan(supabase, functionId, lifafaTotal, returnGiftTotal)
      if (cancelled) return
      if (error) {
        console.error(error)
        setSyncState('error')
      } else {
        lastSaved.current = { lifafa: lifafaTotal, returnGift: returnGiftTotal }
        setSyncState('saved')
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [summary, supabase, functionId])

  const invitedFamilies = families.filter(f => attendance.some(a => a.family_id === f.id))

  // ---- Rules -------------------------------------------------------------
  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('Delete this gifting rule?')) return
    setLoading(true)
    const { error } = await supabase.from('function_gifting_rules').delete().eq('id', id)
    if (error) toast.error(`Could not delete rule: ${error.message}`)
    else setRules(prev => prev.filter(r => r.id !== id))
    setLoading(false)
  }

  const handleSaveRule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const payload = {
      function_id: functionId,
      rule_name: String(formData.get('rule_name') || '').trim(),
      type: formData.get('type') as GiftingRule['type'],
      distribution: formData.get('distribution') as GiftingRule['distribution'],
      amount: Number(formData.get('amount')),
      target_side: formData.get('target_side') as GiftingRule['target_side'],
      target_tier: formData.get('target_tier') as GiftingRule['target_tier'],
      target_gender: formData.get('target_gender') as GiftingRule['target_gender']
    }
    const editing = ruleModal.editing
    const query = editing
      ? supabase.from('function_gifting_rules').update(payload).eq('id', editing.id).select().single()
      : supabase.from('function_gifting_rules').insert(payload).select().single()
    const { data, error } = await query
    if (error) {
      setSubmitError(error.message)
    } else if (data) {
      setRules(prev => (editing ? prev.map(r => (r.id === editing.id ? data : r)) : [...prev, data]))
      setRuleModal({ open: false, editing: null })
      setSubmitError(null)
    }
    setLoading(false)
  }

  const handleAddPresets = async () => {
    if (!window.confirm('Add 3 starter rules?\n\n• Close Circle adults: ₹1,100 each\n• Extended adults: ₹500 each\n• Kids: ₹250 each\n\nYou can edit the amounts afterwards.')) return
    setLoading(true)
    const { data, error } = await supabase
      .from('function_gifting_rules')
      .insert(PRESETS.map(p => ({ ...p, function_id: functionId })))
      .select()
    if (error) toast.error(`Could not add rules: ${error.message}`)
    else if (data) {
      setRules(prev => [...prev, ...data])
      toast.success('Starter lifafa rules added')
    }
    setLoading(false)
  }

  // ---- Kid age -----------------------------------------------------------
  const commitKidAge = async () => {
    const next = Number(kidAgeDraft)
    if (!Number.isInteger(next) || next < 1 || next > 25) {
      toast.error('Kid age must be a whole number between 1 and 25')
      setKidAgeDraft(String(kidAge))
      return
    }
    if (next === kidAge) return
    const { error } = await supabase.rpc('set_function_kid_age', { p_function_id: functionId, p_age: next })
    if (error) {
      toast.error(`Could not update kid age: ${error.message}`)
      setKidAgeDraft(String(kidAge))
    } else {
      setKidAge(next)
      toast.success(`Kids are now counted as under ${next}`)
    }
  }

  // ---- Overrides ---------------------------------------------------------
  const handleSaveOverride = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const payload = {
      function_id: functionId,
      family_id: String(formData.get('family_id')),
      lifafa_amount: Number(formData.get('lifafa_amount')),
      note: String(formData.get('note') || '').trim() || null
    }
    const { data, error } = await supabase
      .from('function_gift_overrides')
      .upsert(payload, { onConflict: 'function_id,family_id' })
      .select()
      .single()
    if (error) {
      setSubmitError(error.message)
    } else if (data) {
      setOverrides(prev => [...prev.filter(o => o.family_id !== data.family_id), data])
      setOverrideModal({ open: false, editing: null })
      setSubmitError(null)
    }
    setLoading(false)
  }

  const handleDeleteOverride = async (id: string) => {
    setLoading(true)
    const { error } = await supabase.from('function_gift_overrides').delete().eq('id', id)
    if (error) toast.error(`Could not remove: ${error.message}`)
    else setOverrides(prev => prev.filter(o => o.id !== id))
    setLoading(false)
  }

  const overBudget = functionBudget > 0 && summary.total > functionBudget
  const editingRule = ruleModal.editing

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-marigold/10 pb-3">
        <h2 className="text-xl font-display font-semibold text-maroon flex items-center">
          <Gift className="w-5 h-5 mr-2 text-maroon" /> Gifting & Lifafas
        </h2>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={loading} onClick={() => { setSubmitError(null); setOverrideModal({ open: true, editing: null }) }} className="border-marigold/50 text-maroon hover:bg-marigold/10 h-8 text-xs rounded-full">
              Family Exception
            </Button>
            <Button size="sm" disabled={loading} onClick={() => { setSubmitError(null); setRuleModal({ open: true, editing: null }) }} className="bg-maroon text-ivory hover:bg-maroon/90 h-8 text-xs rounded-full">
              <Plus className="w-4 h-4 mr-1" /> Add Rule
            </Button>
          </div>
        )}
      </div>

      {/* Who counts as a kid */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-data text-maroon/70 mb-4">
        <span>Kids are guests under</span>
        {canEdit ? (
          <Input
            type="number"
            min={1}
            max={25}
            value={kidAgeDraft}
            onChange={e => setKidAgeDraft(e.target.value)}
            onBlur={commitKidAge}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="w-16 h-7 text-xs bg-white border-marigold/40"
            aria-label="Kid age cut-off"
          />
        ) : (
          <span className="font-semibold text-maroon">{kidAge}</span>
        )}
        <span>years. Everyone else counts as an adult.</span>
      </div>

      {rules.length === 0 && overrides.length === 0 ? (
        <div className="text-center py-4 space-y-3">
          <p className="text-sm font-data text-maroon/50 italic">No gifting rules yet.</p>
          {canEdit && (
            <Button size="sm" variant="outline" disabled={loading} onClick={handleAddPresets} className="border-marigold/50 text-maroon hover:bg-marigold/10 text-xs rounded-full">
              <Sparkles className="w-3.5 h-3.5 mr-1 text-marigold" /> Use starter rules (₹1100 / ₹500 / ₹250 kids)
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {summary.rules.map(({ rule, count, total, customFamilies }) => (
            <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border border-marigold/30 rounded-xl">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm text-maroon">{rule.rule_name}</h3>
                <div className="text-[10px] text-maroon/60 font-data flex flex-wrap gap-x-2 mt-1">
                  <span>{rule.type === 'lifafa' ? 'Lifafa' : 'Return gift'}</span>
                  <span>•</span>
                  <span>{rule.target_side === 'both' ? 'Both sides' : rule.target_side === 'groom' ? "Groom's side" : "Bride's side"}</span>
                  <span>•</span>
                  <span>{TIER_LABELS[rule.target_tier]}</span>
                  <span>•</span>
                  <span>{rule.target_gender === 'Kids' ? `Kids (under ${kidAge})` : TARGET_GROUP_LABELS[rule.target_gender]}</span>
                </div>
                {customFamilies > 0 && (
                  <p className="text-[10px] text-mehendi font-data mt-0.5">Set quantity for {customFamilies} {customFamilies === 1 ? 'family' : 'families'}</p>
                )}
              </div>
              <div className="flex items-center gap-4 ml-auto">
                <div className="text-right">
                  <div className="text-xs text-maroon/70 font-data">
                    {count} {customFamilies > 0 ? 'in total' : rule.distribution === 'per_family' ? (count === 1 ? 'family' : 'families') : (count === 1 ? 'person' : 'people')} × {rupees(rule.amount)}
                  </div>
                  <div className="text-sm font-bold text-maroon">{rupees(total)}</div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label="Edit rule" onClick={() => { setSubmitError(null); setRuleModal({ open: true, editing: rule }) }} className="text-maroon/50 hover:text-maroon hover:bg-marigold/10 h-8 w-8">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete rule" disabled={loading} onClick={() => handleDeleteRule(rule.id)} className="text-rust-red/50 hover:text-rust-red hover:bg-rust-red/10 h-8 w-8">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {summary.overrides.length > 0 && (
            <div className="pt-2 space-y-2">
              <h4 className="text-[10px] uppercase font-bold tracking-wider text-maroon/50 font-data">Family exceptions (replace their lifafa rules)</h4>
              {summary.overrides.map(({ override, familyName, replacedAmount }) => (
                <div key={override.id} className="flex flex-wrap items-center justify-between gap-2 p-3 bg-marigold/5 border border-marigold/25 rounded-xl">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-maroon">{familyLabel(familyName)}</p>
                    <p className="text-[10px] text-maroon/60 font-data">
                      Rules would give {rupees(replacedAmount)}{override.note ? ` • ${override.note}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-auto">
                    <span className="text-sm font-bold text-maroon">{rupees(override.lifafa_amount)}</span>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" aria-label="Edit exception" onClick={() => { setSubmitError(null); setOverrideModal({ open: true, editing: override }) }} className="text-maroon/50 hover:text-maroon hover:bg-marigold/10 h-8 w-8">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Remove exception" disabled={loading} onClick={() => handleDeleteOverride(override.id)} className="text-rust-red/50 hover:text-rust-red hover:bg-rust-red/10 h-8 w-8">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Totals + budget link */}
          <div className="mt-4 pt-3 border-t border-marigold/20 bg-marigold/10 p-3 rounded-lg space-y-1.5">
            <div className="flex justify-between text-xs font-data text-maroon/80">
              <span>Lifafas</span><span className="font-semibold">{rupees(summary.lifafaTotal)}</span>
            </div>
            {summary.returnGiftTotal > 0 && (
              <div className="flex justify-between text-xs font-data text-maroon/80">
                <span>Return gifts</span><span className="font-semibold">{rupees(summary.returnGiftTotal)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1 border-t border-marigold/20">
              <span className="font-semibold text-maroon text-sm">Planned gifting</span>
              <span className="font-display font-bold text-maroon text-lg">{rupees(summary.total)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 text-[11px] font-data flex items-start gap-1.5">
        {linkedCategory ? (
          <p className="text-maroon/60">
            <Wallet className="inline w-3.5 h-3.5 mr-1 text-mehendi" />
            Planned in budget as <strong className="text-maroon">{linkedCategory.name} → Lifafas & Gifts</strong>
            {syncState === 'saving' && ' • updating…'}
            {syncState === 'saved' && ' • updated'}
            {syncState === 'error' && <span className="text-rust-red"> • couldn&apos;t update the budget, try refreshing</span>}
          </p>
        ) : (
          <p className="text-rust-red/80">
            <AlertTriangle className="inline w-3.5 h-3.5 mr-1" />
            No budget category is linked to this function yet, so this isn&apos;t in the budget.{' '}
            <Link href="/budget/setup" className="underline font-semibold">Link one in Budget Setup</Link>.
          </p>
        )}
      </div>
      {overBudget && (
        <p className="mt-1 text-[11px] font-data text-rust-red">
          ⚠️ Gifting alone ({rupees(summary.total)}) is more than this function&apos;s budget ({rupees(functionBudget)}).
        </p>
      )}

      {/* Rule modal */}
      {ruleModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-maroon/20 backdrop-blur-sm">
          <div className="bg-ivory w-full max-w-lg rounded-2xl border border-marigold/30 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-marigold/10 bg-white flex justify-between items-center">
              <h3 className="font-display font-bold text-maroon text-lg">{editingRule ? 'Edit Gifting Rule' : 'Add Gifting Rule'}</h3>
              <button onClick={() => setRuleModal({ open: false, editing: null })} className="text-maroon/50 hover:text-maroon" aria-label="Close">✕</button>
            </div>
            <form onSubmit={handleSaveRule} className="p-5 space-y-4">
              {submitError && (
                <div className="p-3 bg-rust-red/10 border border-rust-red/30 text-rust-red text-xs rounded-lg font-data font-semibold">Error saving rule: {submitError}</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Rule Name</Label>
                  <Input name="rule_name" defaultValue={editingRule?.rule_name} placeholder="e.g. Close Circle Shagun" required className="bg-white border-marigold/50 text-sm h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Type</Label>
                  <select name="type" defaultValue={editingRule?.type || 'lifafa'} className="w-full bg-white border border-marigold/50 rounded-md h-10 px-3 text-sm">
                    <option value="lifafa">Lifafa (Cash)</option>
                    <option value="return_gift">Return Gift</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Given</Label>
                  <select name="distribution" defaultValue={editingRule?.distribution || 'per_person'} className="w-full bg-white border border-marigold/50 rounded-md h-10 px-3 text-sm">
                    <option value="per_person">Per person</option>
                    <option value="per_family">Per family</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Amount (₹)</Label>
                  <Input name="amount" type="number" min={0} defaultValue={editingRule?.amount} required placeholder="1100" className="bg-white border-marigold/50 text-sm h-10" />
                </div>

                <div className="sm:col-span-2 text-xs font-bold text-maroon/50 uppercase mt-2 border-b border-marigold/20 pb-1">Who gets it</div>

                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Side</Label>
                  <select name="target_side" defaultValue={editingRule?.target_side || 'both'} className="w-full bg-white border border-marigold/50 rounded-md h-10 px-3 text-sm">
                    <option value="both">Both sides</option>
                    <option value="groom">Groom&apos;s side</option>
                    <option value="bride">Bride&apos;s side</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Circle</Label>
                  <select name="target_tier" defaultValue={editingRule?.target_tier || 'all'} className="w-full bg-white border border-marigold/50 rounded-md h-10 px-3 text-sm">
                    <option value="all">All circles</option>
                    <option value="tier_1">Hosts / Immediate</option>
                    <option value="tier_2">Close Circle</option>
                    <option value="tier_3">Extended</option>
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-maroon font-semibold">Age / Gender (per-person rules)</Label>
                  <select name="target_gender" defaultValue={editingRule?.target_gender || 'All'} className="w-full bg-white border border-marigold/50 rounded-md h-10 px-3 text-sm">
                    <option value="All">Everyone</option>
                    <option value="Adults">Adults ({kidAge}+, incl. seniors)</option>
                    <option value="Kids">Kids (under {kidAge})</option>
                    <option value="Seniors">Seniors (60+)</option>
                    <option value="Male">Gents only</option>
                    <option value="Female">Ladies only</option>
                  </select>
                  <p className="text-[10px] text-maroon/50 font-data">Gents / Ladies / Seniors only count members whose gender or age is filled in.</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setRuleModal({ open: false, editing: null })} className="border-marigold/30 text-maroon">Cancel</Button>
                <Button type="submit" disabled={loading} className="bg-maroon text-ivory min-w-[120px]">{loading ? 'Saving...' : editingRule ? 'Update Rule' : 'Save Rule'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Family exception modal */}
      {overrideModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-maroon/20 backdrop-blur-sm">
          <div className="bg-ivory w-full max-w-md rounded-2xl border border-marigold/30 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-marigold/10 bg-white flex justify-between items-center">
              <h3 className="font-display font-bold text-maroon text-lg">Family Lifafa Exception</h3>
              <button onClick={() => setOverrideModal({ open: false, editing: null })} className="text-maroon/50 hover:text-maroon" aria-label="Close">✕</button>
            </div>
            <form onSubmit={handleSaveOverride} className="p-5 space-y-4">
              <p className="text-xs font-data text-maroon/60">This family gets this fixed lifafa amount for this function instead of whatever the lifafa rules would give them.</p>
              {submitError && (
                <div className="p-3 bg-rust-red/10 border border-rust-red/30 text-rust-red text-xs rounded-lg font-data font-semibold">Error saving: {submitError}</div>
              )}
              {invitedFamilies.length === 0 ? (
                <p className="text-sm text-maroon/60 italic">Invite families to this function first.</p>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs text-maroon font-semibold">Family</Label>
                    <select name="family_id" defaultValue={overrideModal.editing?.family_id} required disabled={!!overrideModal.editing} className="w-full bg-white border border-marigold/50 rounded-md h-10 px-3 text-sm disabled:opacity-70">
                      {invitedFamilies.map(f => (
                        <option key={f.id} value={f.id}>{familyLabel(f.family_name)}</option>
                      ))}
                    </select>
                    {overrideModal.editing && <input type="hidden" name="family_id" value={overrideModal.editing.family_id} />}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-maroon font-semibold">Total lifafa for this family (₹)</Label>
                    <Input name="lifafa_amount" type="number" min={0} required defaultValue={overrideModal.editing?.lifafa_amount} placeholder="2100" className="bg-white border-marigold/50 text-sm h-10" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-maroon font-semibold">Note (optional)</Label>
                    <Input name="note" defaultValue={overrideModal.editing?.note || ''} placeholder="e.g. Mama ji – extra shagun" className="bg-white border-marigold/50 text-sm h-10" />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOverrideModal({ open: false, editing: null })} className="border-marigold/30 text-maroon">Cancel</Button>
                <Button type="submit" disabled={loading || invitedFamilies.length === 0} className="bg-maroon text-ivory min-w-[120px]">{loading ? 'Saving...' : 'Save'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
