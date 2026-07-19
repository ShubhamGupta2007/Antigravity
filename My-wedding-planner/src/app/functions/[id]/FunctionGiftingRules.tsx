'use client'

import React, { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Gift, Plus, Trash2, IndianRupee, Edit2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Rule = {
  id: string
  function_id: string
  rule_name: string
  type: 'lifafa' | 'return_gift'
  distribution: 'per_family' | 'per_person'
  amount: number
  target_side: 'groom' | 'bride' | 'both'
  target_tier: 'tier_1' | 'tier_2' | 'tier_3' | 'all'
  target_gender: 'Male' | 'Female' | 'Kids' | 'Adults' | 'Seniors' | 'All'
}

export default function FunctionGiftingRules({
  functionId,
  initialRules,
  families,
  members
}: {
  functionId: string
  initialRules: Rule[]
  families: any[] // familyCards
  members: any[] // individual members
}) {
  const [rules, setRules] = useState<Rule[]>(initialRules)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  // Calculate matching count for a rule
  const calculateRuleMatch = (rule: Rule) => {
    let matchCount = 0

    families.forEach(fc => {
      const fam = fc.families

      // Filter by Side
      if (rule.target_side !== 'both' && fam.side !== rule.target_side) return
      
      // Filter by Tier
      if (rule.target_tier !== 'all' && fam.relation_tier !== rule.target_tier) return

      if (rule.distribution === 'per_family') {
        // If it's per family and gender is specific, it doesn't make much sense, but we count the family
        matchCount += 1
      } else {
        // per_person
        const famMembers = members.filter(m => m.family_id === fc.family_id)
        if (famMembers.length === 0) {
          // If no specific members added, estimate based on expected count if rule allows 'All'
          if (rule.target_gender === 'All') {
             matchCount += (fam.expected_adults_count || 1) + (fam.expected_kids_count || 0)
          }
        } else {
          famMembers.forEach(m => {
            const mem = m.family_members
            if (rule.target_gender === 'All') {
              matchCount += 1
            } else if (rule.target_gender === 'Kids' && (mem.is_kid_for_gifting || (mem.age !== null && mem.age < 12))) {
              matchCount += 1
            } else if (rule.target_gender === 'Adults' && !mem.is_kid_for_gifting && (mem.age === null || (mem.age >= 12 && mem.age < 60))) {
              matchCount += 1
            } else if (rule.target_gender === 'Seniors' && !mem.is_kid_for_gifting && (mem.age !== null && mem.age >= 60)) {
              matchCount += 1
            } else if (rule.target_gender === 'Male' && mem.gender === 'Male') {
              matchCount += 1
            } else if (rule.target_gender === 'Female' && mem.gender === 'Female') {
              matchCount += 1
            }
          })
        }
      }
    })

    return matchCount
  }

  const handleDelete = async (id: string) => {
    setLoading(true)
    await supabase.from('function_gifting_rules').delete().eq('id', id)
    setRules(rules.filter(r => r.id !== id))
    setLoading(false)
  }

  const openAddModal = () => {
    setEditingRule(null)
    setSubmitError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (rule: Rule) => {
    setEditingRule(rule)
    setSubmitError(null)
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const newRule = {
      function_id: functionId,
      rule_name: formData.get('rule_name') as string,
      type: formData.get('type') as string,
      distribution: formData.get('distribution') as string,
      amount: Number(formData.get('amount')),
      target_side: formData.get('target_side') as string,
      target_tier: formData.get('target_tier') as string,
      target_gender: formData.get('target_gender') as string
    }

    if (editingRule) {
      // Update
      const { data, error } = await supabase.from('function_gifting_rules').update(newRule).eq('id', editingRule.id).select().single()
      if (error) {
        console.error(error)
        setSubmitError(error.message)
      } else if (data) {
        setRules(rules.map(r => r.id === editingRule.id ? data : r))
        setIsModalOpen(false)
        setSubmitError(null)
      }
    } else {
      // Insert
      const { data, error } = await supabase.from('function_gifting_rules').insert(newRule).select().single()
      if (error) {
        console.error(error)
        setSubmitError(error.message)
      } else if (data) {
        setRules([...rules, data])
        setIsModalOpen(false)
        setSubmitError(null)
      }
    }
    setLoading(false)
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6">
      <div className="flex items-center justify-between mb-4 border-b border-marigold/10 pb-3">
        <h2 className="text-xl font-display font-semibold text-maroon flex items-center">
          <Gift className="w-5 h-5 mr-2 text-maroon" /> Gifting & Lifafas
        </h2>
        {!isModalOpen && (
          <Button size="sm" onClick={openAddModal} className="bg-maroon text-ivory hover:bg-maroon/90 h-8 text-xs rounded-full">
            <Plus className="w-4 h-4 mr-1" /> Add Rule
          </Button>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-maroon/20 backdrop-blur-sm">
          <div className="bg-ivory w-full max-w-lg rounded-2xl border border-marigold/30 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-marigold/10 bg-white flex justify-between items-center">
              <h3 className="font-display font-bold text-maroon text-lg">{editingRule ? 'Edit Gifting Rule' : 'Add New Gifting Rule'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-maroon/50 hover:text-maroon">
                ✕
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {submitError && (
                <div className="p-3 bg-rust-red/10 border border-rust-red/30 text-rust-red text-xs rounded-lg font-data font-semibold">
                  Error saving rule: {submitError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Rule Name</Label>
                  <Input name="rule_name" defaultValue={editingRule?.rule_name} placeholder="e.g. Milni Gents" required className="bg-white border-marigold/50 text-sm h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Type</Label>
                  <select name="type" defaultValue={editingRule?.type || 'lifafa'} className="w-full bg-white border border-marigold/50 rounded-md h-10 px-3 text-sm">
                    <option value="lifafa">Lifafa (Cash)</option>
                    <option value="return_gift">Return Gift</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Distribution</Label>
                  <select name="distribution" defaultValue={editingRule?.distribution || 'per_person'} className="w-full bg-white border border-marigold/50 rounded-md h-10 px-3 text-sm">
                    <option value="per_person">Per Person</option>
                    <option value="per_family">Per Family</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Amount / Cost (₹)</Label>
                  <Input name="amount" type="number" defaultValue={editingRule?.amount} required placeholder="500" className="bg-white border-marigold/50 text-sm h-10" />
                </div>
                
                <div className="col-span-2 text-xs font-bold text-maroon/50 uppercase mt-4 border-b border-marigold/20 pb-1">Target Filters</div>
                
                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Side</Label>
                  <select name="target_side" defaultValue={editingRule?.target_side || 'both'} className="w-full bg-white border border-marigold/50 rounded-md h-10 px-3 text-sm">
                    <option value="both">Both Sides</option>
                    <option value="groom">Groom's Side</option>
                    <option value="bride">Bride's Side</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Tier</Label>
                  <select name="target_tier" defaultValue={editingRule?.target_tier || 'all'} className="w-full bg-white border border-marigold/50 rounded-md h-10 px-3 text-sm">
                    <option value="all">All Tiers</option>
                    <option value="tier_1">Hosts / Immediate</option>
                    <option value="tier_2">Close Circle</option>
                    <option value="tier_3">Extended</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-maroon font-semibold">Gender / Age</Label>
                  <select name="target_gender" defaultValue={editingRule?.target_gender || 'All'} className="w-full bg-white border border-marigold/50 rounded-md h-10 px-3 text-sm">
                    <option value="All">Everyone</option>
                    <option value="Male">Males Only</option>
                    <option value="Female">Females Only</option>
                    <option value="Kids">Kids</option>
                    <option value="Adults">Adults</option>
                    <option value="Seniors">Senior Citizens</option>
                  </select>
                </div>
              </div>
              
              <div className="flex justify-end gap-2 pt-6">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="border-marigold/30 text-maroon">Cancel</Button>
                <Button type="submit" disabled={loading} className="bg-maroon text-ivory min-w-[120px]">
                  {loading ? 'Saving...' : (editingRule ? 'Update Rule' : 'Save Rule')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-sm font-data text-maroon/50 italic text-center py-4">No gifting rules created yet.</p>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => {
            const count = calculateRuleMatch(rule)
            const total = count * rule.amount
            return (
              <div key={rule.id} className="flex items-center justify-between p-3 bg-white border border-marigold/30 rounded-xl">
                <div>
                  <h3 className="font-semibold text-sm text-maroon">{rule.rule_name}</h3>
                  <div className="text-[10px] text-maroon/60 font-data flex gap-2 mt-1">
                    <span className="capitalize">{rule.type.replace('_', ' ')}</span>
                    <span>•</span>
                    <span>{rule.target_side === 'both' ? 'Both Sides' : rule.target_side + ' side'}</span>
                    <span>•</span>
                    <span className="capitalize">{rule.target_tier.replace('_', ' ')}</span>
                    <span>•</span>
                    <span>{rule.target_gender}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs text-maroon/70 font-data">
                      {count} {rule.distribution === 'per_family' ? 'Families' : 'People'} × ₹{rule.amount}
                    </div>
                    <div className="text-sm font-bold text-maroon flex items-center justify-end">
                      Total: ₹{total.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => openEditModal(rule)}
                      className="text-maroon/50 hover:text-maroon hover:bg-marigold/10 h-8 w-8"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(rule.id)}
                      className="text-rust-red/50 hover:text-rust-red hover:bg-rust-red/10 h-8 w-8"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
          
          <div className="mt-4 pt-3 border-t border-marigold/20 flex justify-between items-center bg-marigold/10 p-3 rounded-lg">
            <span className="font-semibold text-maroon text-sm">Total Estimated Gifting Cost</span>
            <span className="font-display font-bold text-maroon text-lg">
              ₹{rules.reduce((acc, rule) => acc + (calculateRuleMatch(rule) * rule.amount), 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
