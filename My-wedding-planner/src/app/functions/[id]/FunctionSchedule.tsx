'use client'

import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Clock, Plus, Edit2, Trash2, MapPin } from 'lucide-react'
import { createClient } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatTime, sortSegments, timeToMinutes, type FunctionSegment } from '@/lib/functionPlanning'

export default function FunctionSchedule({
  functionId,
  functionStart,
  functionEnd,
  initialSegments,
  canEdit
}: {
  functionId: string
  functionStart: string | null
  functionEnd: string | null
  initialSegments: FunctionSegment[]
  canEdit: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [segments, setSegments] = useState<FunctionSegment[]>(initialSegments)
  const [editing, setEditing] = useState<FunctionSegment | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sorted = sortSegments(segments)
  const fnStart = timeToMinutes(functionStart)
  const fnEnd = timeToMinutes(functionEnd)

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const payload = {
      function_id: functionId,
      name: String(formData.get('name') || '').trim(),
      start_time: String(formData.get('start_time') || '') || null,
      end_time: String(formData.get('end_time') || '') || null,
      location: String(formData.get('location') || '').trim() || null,
      notes: String(formData.get('notes') || '').trim() || null
    }
    const s = timeToMinutes(payload.start_time)
    const en = timeToMinutes(payload.end_time)
    if (s !== null && en !== null && en < s) {
      // Allowed (runs past midnight), but make sure it's intentional.
      if (!window.confirm('End time is earlier than start time. Does this part run past midnight?')) return
    }
    setSaving(true)
    const query = editing && editing !== 'new'
      ? supabase.from('function_segments').update(payload).eq('id', editing.id).select().single()
      : supabase.from('function_segments').insert({ ...payload, sort_order: segments.length }).select().single()
    const { data, error: saveError } = await query
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    if (data) {
      setSegments(prev => (editing && editing !== 'new' ? prev.map(x => (x.id === data.id ? data : x)) : [...prev, data]))
      setEditing(null)
      setError(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this part of the schedule?')) return
    const { error: delError } = await supabase.from('function_segments').delete().eq('id', id)
    if (delError) toast.error(`Could not remove: ${delError.message}`)
    else setSegments(prev => prev.filter(x => x.id !== id))
  }

  const current = editing && editing !== 'new' ? editing : null

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-marigold/20 p-6">
      <div className="flex items-center justify-between mb-4 border-b border-marigold/10 pb-3">
        <h2 className="text-xl font-display font-semibold text-maroon flex items-center">
          <Clock className="w-5 h-5 mr-2 text-maroon" /> Schedule
        </h2>
        {canEdit && !editing && (
          <Button size="sm" onClick={() => { setError(null); setEditing('new') }} className="bg-maroon text-ivory hover:bg-maroon/90 h-8 text-xs rounded-full">
            <Plus className="w-4 h-4 mr-1" /> Add Part
          </Button>
        )}
      </div>

      {sorted.length === 0 && !editing && (
        <p className="text-sm font-data text-maroon/50 italic text-center py-3">
          No timed parts yet. {canEdit && 'Add parts like Baraat, Milni, Varmala or Pheras with their own timings.'}
        </p>
      )}

      {sorted.length > 0 && (
        <ol className="relative border-l-2 border-marigold/30 ml-2 space-y-4">
          {sorted.map(seg => {
            const s = timeToMinutes(seg.start_time)
            const outside = s !== null && ((fnStart !== null && s < fnStart) || (fnEnd !== null && fnEnd > (fnStart ?? 0) && s > fnEnd))
            return (
              <li key={seg.id} className="ml-4">
                <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-marigold border-2 border-white" />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-data font-bold text-maroon/70">
                      {seg.start_time ? formatTime(seg.start_time) : 'Time TBD'}
                      {seg.end_time ? ` – ${formatTime(seg.end_time)}` : ''}
                    </p>
                    <p className="text-sm font-semibold text-maroon">{seg.name}</p>
                    {seg.location && (
                      <p className="text-[11px] font-data text-maroon/60 flex items-center"><MapPin className="w-3 h-3 mr-1" />{seg.location}</p>
                    )}
                    {seg.notes && <p className="text-[11px] font-data text-maroon/60 mt-0.5">{seg.notes}</p>}
                    {outside && <p className="text-[10px] font-data text-rust-red mt-0.5">Outside the function&apos;s main timing</p>}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" aria-label="Edit part" onClick={() => { setError(null); setEditing(seg) }} className="text-maroon/50 hover:text-maroon hover:bg-marigold/10 h-8 w-8">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Remove part" onClick={() => handleDelete(seg.id)} className="text-rust-red/50 hover:text-rust-red hover:bg-rust-red/10 h-8 w-8">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {editing && (
        <form key={current?.id || 'new'} onSubmit={handleSave} className="mt-4 p-4 bg-ivory/60 rounded-xl border border-marigold/25 space-y-3">
          {error && <div className="p-2 bg-rust-red/10 border border-rust-red/30 text-rust-red text-xs rounded font-data">{error}</div>}
          <div className="space-y-1">
            <Label className="text-xs text-maroon font-semibold">Name</Label>
            <Input name="name" required defaultValue={current?.name} placeholder="e.g. Milni" className="bg-white border-marigold/50 h-9 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-maroon font-semibold">Starts</Label>
              <Input name="start_time" type="time" defaultValue={current?.start_time?.slice(0, 5) || ''} className="bg-white border-marigold/50 h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-maroon font-semibold">Ends</Label>
              <Input name="end_time" type="time" defaultValue={current?.end_time?.slice(0, 5) || ''} className="bg-white border-marigold/50 h-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-maroon font-semibold">Place (if different)</Label>
            <Input name="location" defaultValue={current?.location || ''} placeholder="e.g. Lawn entrance" className="bg-white border-marigold/50 h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-maroon font-semibold">Notes</Label>
            <Input name="notes" defaultValue={current?.notes || ''} placeholder="e.g. Close family only" className="bg-white border-marigold/50 h-9 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)} className="border-marigold/30 text-maroon h-8 text-xs">Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-maroon text-ivory h-8 text-xs min-w-[90px]">{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      )}
    </section>
  )
}
