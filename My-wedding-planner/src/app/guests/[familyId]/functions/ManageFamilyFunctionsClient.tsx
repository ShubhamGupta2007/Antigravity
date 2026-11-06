'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { DEFAULT_KID_AGE, familyHeadcount, recalcFunctionGifting } from '@/lib/functionPlanning'

type HeadcountDraft = { adults: string; kids: string }

const parseCount = (v: string | undefined) => {
  if (v === undefined || v.trim() === '') return null
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 0 ? n : null
}

type ManageFamilyFunctionsClientProps = {
  family: any
  functions: any[]
  initialAttendance: any[]
}

export default function ManageFamilyFunctionsClient({
  family,
  functions,
  initialAttendance
}: ManageFamilyFunctionsClientProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Map of attending items: key is `${function_id}-${member_id || 'family'}`
  const [attendanceMap, setAttendanceMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    initialAttendance.forEach(a => {
      const key = `${a.function_id}-${a.member_id || 'family'}`
      map[key] = true
    })
    return map
  })

  // Per-function headcount for this family ('' = use the family's usual counts)
  const [headcounts, setHeadcounts] = useState<Record<string, HeadcountDraft>>(() => {
    const map: Record<string, HeadcountDraft> = {}
    initialAttendance.forEach(a => {
      if (a.member_id === null) {
        map[a.function_id] = {
          adults: a.adults_count === null || a.adults_count === undefined ? '' : String(a.adults_count),
          kids: a.kids_count === null || a.kids_count === undefined ? '' : String(a.kids_count)
        }
      }
    })
    return map
  })

  const handleHeadcountChange = (functionId: string, field: keyof HeadcountDraft, value: string) => {
    setHeadcounts(prev => ({
      ...prev,
      [functionId]: { adults: prev[functionId]?.adults ?? '', kids: prev[functionId]?.kids ?? '', [field]: value }
    }))
    setHasUnsavedChanges(true)
  }

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  const handleMemberToggle = (functionId: string, memberId: string | null, checked: boolean) => {
    const key = `${functionId}-${memberId || 'family'}`
    setAttendanceMap(prev => ({ ...prev, [key]: checked }))
    setHasUnsavedChanges(true)
  }

  const handleFunctionToggle = (functionId: string, checked: boolean) => {
    const updatedMap = { ...attendanceMap }
    updatedMap[`${functionId}-family`] = checked
    family.family_members.forEach((m: any) => {
      updatedMap[`${functionId}-${m.id}`] = checked
    })
    setAttendanceMap(updatedMap)
    setHasUnsavedChanges(true)
  }

  const handleSaveChanges = async () => {
    setSaving(true)
    try {
      const upserts: any[] = []
      const toDelete: { function_id: string, member_id: string | null }[] = []
      const headcountUpdates: { function_id: string, adults_count: number | null, kids_count: number | null }[] = []
      const changedFunctionIds = new Set<string>()

      functions.forEach(func => {
        const familyKey = `${func.id}-family`
        const initialFamRow = initialAttendance.find(a => a.function_id === func.id && a.member_id === null)
        const initiallyAttendingFam = !!initialFamRow
        const adultsCount = parseCount(headcounts[func.id]?.adults)
        const kidsCount = parseCount(headcounts[func.id]?.kids)

        if (attendanceMap[familyKey] && !initiallyAttendingFam) {
          upserts.push({ function_id: func.id, family_id: family.id, member_id: null, is_attending: true, adults_count: adultsCount, kids_count: kidsCount })
          changedFunctionIds.add(func.id)
        } else if (!attendanceMap[familyKey] && initiallyAttendingFam) {
          toDelete.push({ function_id: func.id, member_id: null })
          changedFunctionIds.add(func.id)
        } else if (
          attendanceMap[familyKey] && initialFamRow &&
          ((initialFamRow.adults_count ?? null) !== adultsCount || (initialFamRow.kids_count ?? null) !== kidsCount)
        ) {
          headcountUpdates.push({ function_id: func.id, adults_count: adultsCount, kids_count: kidsCount })
          changedFunctionIds.add(func.id)
        }

        family.family_members.forEach((m: any) => {
          const memberKey = `${func.id}-${m.id}`
          const initiallyAttendingMem = initialAttendance.some(a => a.function_id === func.id && a.member_id === m.id)
          
          if (attendanceMap[memberKey] && !initiallyAttendingMem) {
            upserts.push({ function_id: func.id, family_id: family.id, member_id: m.id, is_attending: true })
            changedFunctionIds.add(func.id)
          } else if (!attendanceMap[memberKey] && initiallyAttendingMem) {
            toDelete.push({ function_id: func.id, member_id: m.id })
            changedFunctionIds.add(func.id)
          }
        })
      })

      if (upserts.length > 0) {
        const { error } = await supabase.from('function_attendance').upsert(upserts, { onConflict: 'function_id,family_id,member_id', defaultToNull: false })
        if (error) throw error
      }

      for (const hc of headcountUpdates) {
        const { error } = await supabase
          .from('function_attendance')
          .update({ adults_count: hc.adults_count, kids_count: hc.kids_count })
          .eq('function_id', hc.function_id)
          .eq('family_id', family.id)
          .is('member_id', null)
        if (error) throw error
      }

      for (const del of toDelete) {
        let q = supabase.from('function_attendance')
          .delete()
          .eq('function_id', del.function_id)
          .eq('family_id', family.id)
          
        if (del.member_id) {
          q = q.eq('member_id', del.member_id)
        } else {
          q = q.is('member_id', null)
        }
        await q
      }

      // Planned lifafas depend on who is coming, so refresh them for changed functions
      for (const functionId of changedFunctionIds) {
        const { error } = await recalcFunctionGifting(supabase, functionId)
        if (error) console.error('Could not update planned gifting:', error)
      }

      setHasUnsavedChanges(false)
      router.push('/guests')
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(`Could not save invites: ${(err as { message?: string })?.message || 'unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {functions.length === 0 ? (
        <p className="text-sm text-maroon/50 italic text-center py-8 bg-white rounded-xl border border-marigold/30">
          No functions created yet.
        </p>
      ) : (
        functions.map(func => {
          const functionKey = `${func.id}-family`
          const isFunctionChecked = attendanceMap[functionKey] || false
          
          const allMembersChecked = family.family_members.length > 0 && 
            family.family_members.every((m: any) => attendanceMap[`${func.id}-${m.id}`])

          return (
            <div key={func.id} className="bg-white p-4 rounded-xl border border-marigold/20 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-marigold/10 pb-2">
                <div className="flex items-start space-x-3">
                  <input 
                    type="checkbox"
                    id={func.id}
                    checked={isFunctionChecked || allMembersChecked}
                    onChange={(e) => handleFunctionToggle(func.id, e.target.checked)}
                    className="h-4 w-4 rounded border-marigold/50 text-maroon focus:ring-maroon mt-1 cursor-pointer accent-maroon"
                  />
                  <div>
                    <label htmlFor={func.id} className="font-display font-semibold text-maroon text-base cursor-pointer hover:text-maroon/80 flex items-center gap-2">
                      {func.name}
                    </label>
                    <div className="text-[10px] font-data text-maroon/60 flex flex-wrap gap-x-2 gap-y-1 mt-1">
                      {func.event_date && (
                        <span>📅 {new Date(func.event_date).toLocaleDateString()}</span>
                      )}
                      <span>•</span>
                      <span className="capitalize">{func.hosting_side} Side</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Headcount for this function */}
              {isFunctionChecked && (() => {
                const auto = familyHeadcount(family, [{ family_id: family.id, member_id: null }], func.kid_age_threshold || DEFAULT_KID_AGE)
                return (
                  <div className="flex flex-wrap items-end gap-3 pl-7">
                    <div className="text-[11px] font-data text-maroon/60 mr-auto">
                      How many are coming?
                      <span className="block text-[10px] text-maroon/40">Blank = usual {auto.autoAdults} adults / {auto.autoKids} kids</span>
                    </div>
                    <div className="space-y-1 w-20">
                      <label className="text-[10px] uppercase font-bold text-maroon/60" htmlFor={`${func.id}-adults`}>Adults</label>
                      <Input id={`${func.id}-adults`} type="number" min={0} placeholder={String(auto.autoAdults)} value={headcounts[func.id]?.adults ?? ''} onChange={(e) => handleHeadcountChange(func.id, 'adults', e.target.value)} className="h-7 text-xs bg-white border-marigold/30" />
                    </div>
                    <div className="space-y-1 w-20">
                      <label className="text-[10px] uppercase font-bold text-maroon/60" htmlFor={`${func.id}-kids`}>Kids</label>
                      <Input id={`${func.id}-kids`} type="number" min={0} placeholder={String(auto.autoKids)} value={headcounts[func.id]?.kids ?? ''} onChange={(e) => handleHeadcountChange(func.id, 'kids', e.target.value)} className="h-7 text-xs bg-white border-marigold/30" />
                    </div>
                  </div>
                )
              })()}

              {/* Family Members Checklist */}
              {family.family_members.length === 0 ? (
                <p className="text-xs text-maroon/40 italic pl-7">No members added to this family yet.</p>
              ) : (
                <div className="space-y-2 pl-7 pt-1">
                  {family.family_members.map((member: any) => {
                    const memberKey = `${func.id}-${member.id}`
                    const isMemberChecked = attendanceMap[memberKey] || false

                    return (
                      <div key={member.id} className="flex items-center space-x-2">
                        <input 
                          type="checkbox"
                          id={`${func.id}-${member.id}`}
                          checked={isMemberChecked}
                          onChange={(e) => handleMemberToggle(func.id, member.id, e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-marigold/50 text-maroon focus:ring-maroon cursor-pointer accent-maroon"
                        />
                        <label htmlFor={`${func.id}-${member.id}`} className="text-xs font-data text-maroon/80 cursor-pointer">
                          {member.name} <span className="text-[10px] text-maroon/40">({member.relation_to_head || 'Member'})</span>
                        </label>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}

      {/* Save Button */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-maroon text-ivory px-6 py-3 rounded-full shadow-[0_4px_20px_rgba(110,24,24,0.4)] flex items-center gap-4 z-50 animate-in slide-in-from-bottom-5 font-bold border border-marigold/30">
          <span className="text-sm whitespace-nowrap">⚠️ You have unsaved changes!</span>
          <Button 
            size="sm" 
            onClick={handleSaveChanges} 
            disabled={saving}
            className="bg-marigold text-maroon hover:bg-marigold/90 h-8 font-semibold rounded-full px-6 transition-transform active:scale-95"
          >
            {saving ? 'Saving...' : 'Save Invites'}
          </Button>
        </div>
      )}
    </div>
  )
}
