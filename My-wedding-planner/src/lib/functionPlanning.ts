// Shared headcount + gifting maths for functions.
// Used by the functions list, function detail, Manage Invites and the
// per-family "Manage Functions" page so every screen shows the same numbers.

import type { SupabaseClient } from '@supabase/supabase-js'

export const DEFAULT_KID_AGE = 12
export const SENIOR_AGE = 60

export type PlanningMember = {
  id: string
  name?: string | null
  age?: number | null
  gender?: string | null
  is_kid_for_gifting?: boolean | null
}

export type PlanningFamily = {
  id: string
  family_name?: string | null
  side?: 'groom' | 'bride' | string | null
  relation_tier?: 'tier_1' | 'tier_2' | 'tier_3' | string | null
  expected_adults_count?: number | null
  expected_kids_count?: number | null
  is_local?: boolean | null
  family_members?: PlanningMember[] | null
}

export type PlanningAttendance = {
  family_id: string
  member_id: string | null
  adults_count?: number | null
  kids_count?: number | null
}

export type Headcount = {
  adults: number // 12+ (or the function's kid age), including seniors
  seniors: number // subset of adults, 60+
  kids: number
  males: number
  females: number
  total: number
  /** What the count would be without a manual per-function override. */
  autoAdults: number
  autoKids: number
  isOverride: boolean
  isFamilyInvited: boolean
}

export type AgeGroup = 'kid' | 'adult' | 'senior'

export function classifyMember(member: PlanningMember, kidAge = DEFAULT_KID_AGE): AgeGroup {
  if (member.is_kid_for_gifting) return 'kid'
  if (member.age === null || member.age === undefined) return 'adult'
  if (member.age < kidAge) return 'kid'
  if (member.age >= SENIOR_AGE) return 'senior'
  return 'adult'
}

const EMPTY: Headcount = {
  adults: 0, seniors: 0, kids: 0, males: 0, females: 0, total: 0,
  autoAdults: 0, autoKids: 0, isOverride: false, isFamilyInvited: false
}

/**
 * Headcount for one family at one function.
 * - Family-level invite: every named member, padded up to the family's expected
 *   adult/kid counts; a per-function adults_count / kids_count replaces that.
 * - Only some members ticked: just those members.
 */
export function familyHeadcount(
  family: PlanningFamily,
  rows: PlanningAttendance[],
  kidAge = DEFAULT_KID_AGE
): Headcount {
  const familyRows = rows.filter(r => r.family_id === family.id)
  if (familyRows.length === 0) return { ...EMPTY }

  const familyRow = familyRows.find(r => r.member_id === null)
  const members = family.family_members || []
  const invitedMembers = familyRow
    ? members
    : members.filter(m => familyRows.some(r => r.member_id === m.id))

  let namedAdults = 0
  let namedSeniors = 0
  let namedKids = 0
  let males = 0
  let females = 0
  invitedMembers.forEach(m => {
    const group = classifyMember(m, kidAge)
    if (group === 'kid') namedKids++
    else if (group === 'senior') namedSeniors++
    else namedAdults++
    if (m.gender === 'Male') males++
    else if (m.gender === 'Female') females++
  })

  let adults = namedAdults + namedSeniors
  let kids = namedKids
  if (familyRow) {
    const expectedAdults = family.expected_adults_count || 1
    const expectedKids = family.expected_kids_count || 0
    adults = Math.max(adults, expectedAdults)
    kids = Math.max(kids, expectedKids)
  }
  const autoAdults = adults
  const autoKids = kids

  const hasAdultOverride = familyRow?.adults_count !== null && familyRow?.adults_count !== undefined
  const hasKidOverride = familyRow?.kids_count !== null && familyRow?.kids_count !== undefined
  if (hasAdultOverride) adults = Math.max(0, Number(familyRow!.adults_count))
  if (hasKidOverride) kids = Math.max(0, Number(familyRow!.kids_count))

  const seniors = Math.min(namedSeniors, adults)
  const total = adults + kids
  return {
    adults,
    seniors,
    kids,
    males: Math.min(males, total),
    females: Math.min(females, total),
    total,
    autoAdults,
    autoKids,
    isOverride: hasAdultOverride || hasKidOverride,
    isFamilyInvited: !!familyRow
  }
}

export type FunctionHeadcount = Headcount & {
  families: number
  outstation: number
  byFamily: Record<string, Headcount>
}

export function functionHeadcount(
  families: PlanningFamily[],
  rows: PlanningAttendance[],
  kidAge = DEFAULT_KID_AGE
): FunctionHeadcount {
  const result: FunctionHeadcount = { ...EMPTY, families: 0, outstation: 0, byFamily: {} }
  families.forEach(f => {
    const hc = familyHeadcount(f, rows, kidAge)
    if (hc.total === 0 && !rows.some(r => r.family_id === f.id)) return
    result.byFamily[f.id] = hc
    result.families++
    result.adults += hc.adults
    result.seniors += hc.seniors
    result.kids += hc.kids
    result.males += hc.males
    result.females += hc.females
    result.total += hc.total
    if (f.is_local === false) result.outstation += hc.total
  })
  return result
}

/** Collect unique families from attendance rows that embed `families(...)`. */
export function familiesFromAttendance(
  rows: Array<PlanningAttendance & { families?: PlanningFamily | PlanningFamily[] | null }>
): PlanningFamily[] {
  const map = new Map<string, PlanningFamily>()
  rows.forEach(r => {
    const fam = Array.isArray(r.families) ? r.families[0] : r.families
    if (fam && !map.has(fam.id)) map.set(fam.id, fam)
  })
  return Array.from(map.values())
}

// ---------------------------------------------------------------------------
// Gifting
// ---------------------------------------------------------------------------

export type GiftingRule = {
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

export type GiftOverride = {
  id: string
  function_id: string
  family_id: string
  lifafa_amount: number
  note: string | null
}

/** Explicit quantity of a rule's gift for one family (e.g. 2 bhaji boxes); replaces the automatic count. */
export type GiftCount = {
  id?: string
  function_id?: string
  rule_id: string
  family_id: string
  quantity: number
}

export const TARGET_GROUP_LABELS: Record<GiftingRule['target_gender'], string> = {
  All: 'Everyone',
  Adults: 'Adults',
  Kids: 'Kids',
  Seniors: 'Seniors (60+)',
  Male: 'Gents',
  Female: 'Ladies'
}

export const TIER_LABELS: Record<GiftingRule['target_tier'], string> = {
  all: 'All circles',
  tier_1: 'Hosts / Immediate',
  tier_2: 'Close Circle',
  tier_3: 'Extended'
}

function ruleAppliesToFamily(rule: GiftingRule, family: PlanningFamily) {
  if (rule.target_side !== 'both' && family.side !== rule.target_side) return false
  if (rule.target_tier !== 'all' && family.relation_tier !== rule.target_tier) return false
  return true
}

function recipientsInFamily(rule: GiftingRule, hc: Headcount) {
  if (hc.total === 0) return 0
  if (rule.distribution === 'per_family') return 1
  switch (rule.target_gender) {
    case 'All': return hc.total
    case 'Adults': return hc.adults
    case 'Kids': return hc.kids
    case 'Seniors': return hc.seniors
    case 'Male': return hc.males
    case 'Female': return hc.females
    default: return 0
  }
}

export type RuleResult = { rule: GiftingRule; count: number; total: number; customFamilies: number }

export type GiftingSummary = {
  rules: RuleResult[]
  overrides: Array<{ override: GiftOverride; familyName: string; replacedAmount: number }>
  lifafaTotal: number
  returnGiftTotal: number
  total: number
}

/**
 * Planned gifting for a function. A family with a lifafa override gets that
 * fixed amount instead of what the lifafa rules would give them; return-gift
 * rules still apply to them. A per-family gift count (e.g. 2 bhaji boxes)
 * replaces the rule's automatic count for that family.
 */
export function computeGifting(
  rules: GiftingRule[],
  overrides: GiftOverride[],
  families: PlanningFamily[],
  rows: PlanningAttendance[],
  kidAge = DEFAULT_KID_AGE,
  giftCounts: GiftCount[] = []
): GiftingSummary {
  const headcounts = families.map(f => ({ family: f, hc: familyHeadcount(f, rows, kidAge) }))
  const overrideByFamily = new Map(overrides.map(o => [o.family_id, o]))
  const countKey = (ruleId: string, familyId: string) => `${ruleId}:${familyId}`
  const explicit = new Map(giftCounts.map(c => [countKey(c.rule_id, c.family_id), Number(c.quantity) || 0]))

  const ruleResults: RuleResult[] = rules.map(rule => {
    let count = 0
    let customFamilies = 0
    headcounts.forEach(({ family, hc }) => {
      if (hc.total === 0) return
      if (rule.type === 'lifafa' && overrideByFamily.has(family.id)) return
      const set = explicit.get(countKey(rule.id, family.id))
      if (set !== undefined) {
        count += set
        customFamilies++
        return
      }
      if (!ruleAppliesToFamily(rule, family)) return
      count += recipientsInFamily(rule, hc)
    })
    return { rule, count, total: count * Number(rule.amount || 0), customFamilies }
  })

  const overrideResults = overrides
    .map(o => {
      const entry = headcounts.find(h => h.family.id === o.family_id)
      if (!entry || entry.hc.total === 0) return null
      const replacedAmount = rules
        .filter(r => r.type === 'lifafa' && ruleAppliesToFamily(r, entry.family))
        .reduce((sum, r) => sum + recipientsInFamily(r, entry.hc) * Number(r.amount || 0), 0)
      return { override: o, familyName: entry.family.family_name || 'Family', replacedAmount }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const lifafaTotal =
    ruleResults.filter(r => r.rule.type === 'lifafa').reduce((s, r) => s + r.total, 0) +
    overrideResults.reduce((s, o) => s + Number(o.override.lifafa_amount || 0), 0)
  const returnGiftTotal = ruleResults
    .filter(r => r.rule.type === 'return_gift')
    .reduce((s, r) => s + r.total, 0)

  return {
    rules: ruleResults,
    overrides: overrideResults,
    lifafaTotal,
    returnGiftTotal,
    total: lifafaTotal + returnGiftTotal
  }
}

// ---------------------------------------------------------------------------
// Data loading + budget sync (works with browser or server Supabase clients)
// ---------------------------------------------------------------------------

export const PLANNING_FAMILY_SELECT =
  'id, family_name, side, relation_tier, expected_adults_count, expected_kids_count, is_local, family_members (id, name, age, gender, is_kid_for_gifting)'

/**
 * Recomputes a function's planned lifafa / return-gift totals from the database
 * and saves them (which also updates the "Lifafas & Gifts" budget line).
 */
export async function recalcFunctionGifting(supabase: SupabaseClient, functionId: string) {
  const [funcRes, attRes, rulesRes, overridesRes, countsRes] = await Promise.all([
    supabase.from('functions').select('id, kid_age_threshold').eq('id', functionId).single(),
    supabase
      .from('function_attendance')
      .select(`family_id, member_id, adults_count, kids_count, families (${PLANNING_FAMILY_SELECT})`)
      .eq('function_id', functionId),
    supabase.from('function_gifting_rules').select('*').eq('function_id', functionId),
    supabase.from('function_gift_overrides').select('*').eq('function_id', functionId),
    supabase.from('function_gift_counts').select('rule_id, family_id, quantity').eq('function_id', functionId)
  ])

  const error = funcRes.error || attRes.error || rulesRes.error || overridesRes.error || countsRes.error
  if (error) return { error, categoryId: null as string | null }

  const rows = (attRes.data || []) as unknown as Array<PlanningAttendance & { families: PlanningFamily }>
  const summary = computeGifting(
    (rulesRes.data || []) as GiftingRule[],
    (overridesRes.data || []) as GiftOverride[],
    familiesFromAttendance(rows),
    rows,
    funcRes.data?.kid_age_threshold || DEFAULT_KID_AGE,
    (countsRes.data || []) as GiftCount[]
  )
  return saveGiftingPlan(supabase, functionId, summary.lifafaTotal, summary.returnGiftTotal)
}

export async function saveGiftingPlan(
  supabase: SupabaseClient,
  functionId: string,
  lifafaTotal: number,
  returnGiftTotal: number
) {
  const { data, error } = await supabase.rpc('set_function_gifting_plan', {
    p_function_id: functionId,
    p_lifafa: lifafaTotal,
    p_return_gift: returnGiftTotal
  })
  return { error, categoryId: (data as string | null) ?? null }
}

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

export type FunctionSegment = {
  id: string
  function_id: string
  name: string
  start_time: string | null
  end_time: string | null
  location: string | null
  notes: string | null
  sort_order: number
}

/** "19:30:00" -> "7:30 PM" */
export function formatTime(time: string | null | undefined) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return time
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m || 0).padStart(2, '0')} ${suffix}`
}

export function timeToMinutes(time: string | null | undefined) {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return null
  return h * 60 + (m || 0)
}

export function sortSegments<T extends { start_time: string | null; sort_order?: number }>(segments: T[]) {
  return [...segments].sort((a, b) => {
    const am = timeToMinutes(a.start_time)
    const bm = timeToMinutes(b.start_time)
    if (am !== null && bm !== null && am !== bm) return am - bm
    if (am === null && bm !== null) return 1
    if (am !== null && bm === null) return -1
    return (a.sort_order || 0) - (b.sort_order || 0)
  })
}

/** Parse a date-only string ("2027-01-18") as a local date, not UTC midnight. */
export function parseEventDate(date: string) {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
