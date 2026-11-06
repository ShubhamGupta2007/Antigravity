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

export type RsvpStatus = 'invited' | 'confirmed' | 'declined'

export type PlanningAttendance = {
  family_id: string
  member_id: string | null
  adults_count?: number | null
  kids_count?: number | null
  /** On the whole-family row; 'declined' families are not counted. */
  rsvp_status?: RsvpStatus | null
}

export const RSVP_LABELS: Record<RsvpStatus, string> = {
  invited: 'Invited',
  confirmed: 'Confirmed',
  declined: 'Declined'
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
  rsvp: RsvpStatus
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
  autoAdults: 0, autoKids: 0, isOverride: false, isFamilyInvited: false, rsvp: 'invited'
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
  const rsvp: RsvpStatus = familyRow?.rsvp_status || 'invited'
  if (rsvp === 'declined') return { ...EMPTY, isFamilyInvited: !!familyRow, rsvp }
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
    isFamilyInvited: !!familyRow,
    rsvp
  }
}

export type FunctionHeadcount = Headcount & {
  /** Families counted (invited or confirmed; declined excluded). */
  families: number
  outstation: number
  /** Guests in families that have confirmed. */
  confirmedTotal: number
  confirmedFamilies: number
  declinedFamilies: number
  byFamily: Record<string, Headcount>
}

export function functionHeadcount(
  families: PlanningFamily[],
  rows: PlanningAttendance[],
  kidAge = DEFAULT_KID_AGE
): FunctionHeadcount {
  const result: FunctionHeadcount = {
    ...EMPTY, families: 0, outstation: 0, confirmedTotal: 0, confirmedFamilies: 0, declinedFamilies: 0, byFamily: {}
  }
  families.forEach(f => {
    const hc = familyHeadcount(f, rows, kidAge)
    if (hc.total === 0 && !rows.some(r => r.family_id === f.id)) return
    result.byFamily[f.id] = hc
    if (hc.rsvp === 'declined') {
      result.declinedFamilies++
      return
    }
    if (hc.rsvp === 'confirmed') {
      result.confirmedFamilies++
      result.confirmedTotal += hc.total
    }
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

export type GiftKind = 'lifafa' | 'bhaji' | 'gift' | 'return_gift'
export type Tier = 'tier_1' | 'tier_2' | 'tier_3'

export const GIFT_KINDS: Record<GiftKind, { label: string; icon: string; hint: string }> = {
  lifafa: { label: 'Lifafa', icon: '💵', hint: 'Cash in an envelope' },
  bhaji: { label: 'Bhaji / Mithai', icon: '🍬', hint: 'Bhaji box, mithai, dry fruits' },
  gift: { label: 'Gift item', icon: '🎁', hint: 'Shawl, suit, saree, silver coin…' },
  return_gift: { label: 'Return gift', icon: '🛍️', hint: 'What guests take home' }
}

export type GiftingRule = {
  id: string
  function_id: string
  rule_name: string
  type: GiftKind
  distribution: 'per_family' | 'per_person'
  amount: number
  target_side: 'groom' | 'bride' | 'both'
  target_tier: Tier | 'all'
  target_gender: 'Male' | 'Female' | 'Kids' | 'Adults' | 'Seniors' | 'All'
  /** A different price per circle; a circle left out uses `amount`. Needs 16_gifts.sql. */
  tier_amounts?: Partial<Record<Tier, number>> | null
  /** Only these people get it (side / circle / age are ignored). Needs 16_gifts.sql. */
  target_member_ids?: string[] | null
}

export type GiftOverride = {
  id: string
  function_id: string
  family_id: string
  lifafa_amount: number
  note: string | null
  /** Changed amounts by member id, 'family' or 'others' (needs 17_lifafa_per_person.sql) */
  breakdown?: Record<string, number> | null
}

/**
 * One family's change to a gift: a set quantity (e.g. 2 bhaji boxes; replaces the
 * automatic count) and/or its own price (Dadi ji's box is the ₹1,500 one).
 */
export type GiftCount = {
  id?: string
  function_id?: string
  rule_id: string
  family_id: string
  quantity: number | null
  unit_amount?: number | null
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

const hasChosenPeople = (rule: GiftingRule) => (rule.target_member_ids?.length || 0) > 0

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

/** Named members of a family who are invited to the function (none if the family declined). */
export function invitedMembers(family: PlanningFamily, rows: PlanningAttendance[]): PlanningMember[] {
  const familyRows = rows.filter(r => r.family_id === family.id)
  const familyRow = familyRows.find(r => r.member_id === null)
  if (familyRow?.rsvp_status === 'declined') return []
  const members = family.family_members || []
  return familyRow ? members : members.filter(m => familyRows.some(r => r.member_id === m.id))
}

/** The price of a rule's item for one family: its own price, else its circle's, else the rule's. */
export function giftUnitPrice(rule: GiftingRule, family: PlanningFamily, count?: GiftCount) {
  if (count?.unit_amount !== null && count?.unit_amount !== undefined) return Number(count.unit_amount)
  const tier = family.relation_tier as Tier | undefined
  const byTier = tier ? rule.tier_amounts?.[tier] : undefined
  return Number(byTier ?? rule.amount ?? 0)
}

function memberInGroup(group: GiftingRule['target_gender'], m: PlanningMember, kidAge: number) {
  const age = classifyMember(m, kidAge)
  switch (group) {
    case 'All': return true
    case 'Adults': return age !== 'kid'
    case 'Kids': return age === 'kid'
    case 'Seniors': return age === 'senior'
    case 'Male': return m.gender === 'Male'
    case 'Female': return m.gender === 'Female'
    default: return false
  }
}

/** One row of a family's lifafa, person by person: "Dadi ji · Senior · ₹1,100". */
export type LifafaPart = { key: string; label: string; detail: string; usual: number; amount: number; changed: boolean }

export const LIFAFA_FAMILY_KEY = 'family'
export const LIFAFA_OTHERS_KEY = 'others'

/**
 * What the lifafa rules give a family, split per invited member, one lifafa "for the family"
 * (per-family rules) and "others" (guests counted but not named). `changes` replaces any part.
 */
export function lifafaBreakdown(
  rules: GiftingRule[],
  family: PlanningFamily,
  rows: PlanningAttendance[],
  kidAge = DEFAULT_KID_AGE,
  changes: Record<string, number> | null = null
): { parts: LifafaPart[]; usualTotal: number; total: number } {
  const hc = familyHeadcount(family, rows, kidAge)
  if (hc.total === 0) return { parts: [], usualTotal: 0, total: 0 }
  const lifafaRules = rules.filter(r => r.type === 'lifafa')
  const members = invitedMembers(family, rows)
  const AGE_LABEL = { kid: 'Kid', adult: 'Adult', senior: 'Senior' } as const

  const memberParts = members.map(m => {
    const usual = lifafaRules
      .filter(r => r.distribution === 'per_person')
      .filter(r => (hasChosenPeople(r) ? r.target_member_ids!.includes(m.id) : ruleAppliesToFamily(r, family) && memberInGroup(r.target_gender, m, kidAge)))
      .reduce((s, r) => s + giftUnitPrice(r, family), 0)
    return { key: m.id, label: m.name || 'Guest', detail: AGE_LABEL[classifyMember(m, kidAge)], usual }
  })
  const familyUsual = lifafaRules
    .filter(r => r.distribution === 'per_family')
    .filter(r => (hasChosenPeople(r) ? members.some(m => r.target_member_ids!.includes(m.id)) : ruleAppliesToFamily(r, family)))
    .reduce((s, r) => s + giftUnitPrice(r, family), 0)
  // Whatever the rules give beyond named people (expected guests without names)
  const usualTotal = giftLines(lifafaRules, [], [family], rows, kidAge).reduce((s, l) => s + l.total, 0)
  const othersUsual = Math.max(0, usualTotal - familyUsual - memberParts.reduce((s, p) => s + p.usual, 0))
  const unnamed = Math.max(0, hc.total - members.length)

  const base = [
    ...memberParts,
    { key: LIFAFA_FAMILY_KEY, label: 'For the family', detail: 'One lifafa', usual: familyUsual },
    ...(othersUsual > 0 || unnamed > 0 ? [{ key: LIFAFA_OTHERS_KEY, label: 'Others not named', detail: `${unnamed} guest${unnamed === 1 ? '' : 's'}`, usual: othersUsual }] : [])
  ]
  const parts: LifafaPart[] = base.map(p => {
    const c = changes?.[p.key]
    const changed = c !== undefined && c !== null
    return { ...p, amount: changed ? Number(c) : p.usual, changed }
  })
  return { parts, usualTotal, total: parts.reduce((s, p) => s + p.amount, 0) }
}

/**
 * A family exception's total. Person-by-person exceptions are worked out afresh (usual amounts
 * from today's rules plus the changed ones), so a later rule change still reaches everyone not
 * changed; older exceptions saved as one fixed amount use that amount.
 */
export function exceptionAmount(
  override: GiftOverride,
  rules: GiftingRule[],
  family: PlanningFamily,
  rows: PlanningAttendance[],
  kidAge = DEFAULT_KID_AGE
) {
  if (override.breakdown && Object.keys(override.breakdown).length > 0) {
    return lifafaBreakdown(rules, family, rows, kidAge, override.breakdown).total
  }
  return Number(override.lifafa_amount) || 0
}

/** One thing a family is due at a function: "Milni lifafa · 3 × ₹1,100". */
export type GiftLine = {
  /** Rule id, or LIFAFA_EXCEPTION_KEY for a family's fixed lifafa */
  key: string
  familyId: string
  ruleId: string | null
  kind: GiftKind
  label: string
  qty: number
  unit: number
  total: number
  /** Quantity or price was changed for this family */
  custom: boolean
  /** Who it is for, when the rule names people */
  people: string[]
}

export const LIFAFA_EXCEPTION_KEY = 'lifafa-exception'

/** Every gift line for every invited family, using the same maths as the plan totals. */
export function giftLines(
  rules: GiftingRule[],
  overrides: GiftOverride[],
  families: PlanningFamily[],
  rows: PlanningAttendance[],
  kidAge = DEFAULT_KID_AGE,
  giftCounts: GiftCount[] = []
): GiftLine[] {
  const overrideByFamily = new Map(overrides.map(o => [o.family_id, o]))
  const countKey = (ruleId: string, familyId: string) => `${ruleId}:${familyId}`
  const counts = new Map(giftCounts.map(c => [countKey(c.rule_id, c.family_id), c]))
  const lines: GiftLine[] = []

  families.forEach(family => {
    const hc = familyHeadcount(family, rows, kidAge)
    if (hc.total === 0) return
    const override = overrideByFamily.get(family.id)
    if (override) {
      // Replaces this family's lifafa rules (they are skipped below), so nothing is counted twice
      const amount = exceptionAmount(override, rules, family, rows, kidAge)
      const people = override.breakdown
        ? lifafaBreakdown(rules, family, rows, kidAge, override.breakdown).parts
            .filter(p => p.amount > 0)
            .map(p => `${p.label} ₹${Math.round(p.amount).toLocaleString('en-IN')}`)
        : []
      lines.push({
        key: LIFAFA_EXCEPTION_KEY, familyId: family.id, ruleId: null, kind: 'lifafa',
        label: override.note ? `Lifafa · ${override.note}` : 'Lifafa (family amount)',
        qty: 1, unit: amount, total: amount, custom: true, people
      })
    }
    rules.forEach(rule => {
      if (rule.type === 'lifafa' && override) return
      const count = counts.get(countKey(rule.id, family.id))
      let autoQty = 0
      let people: string[] = []
      if (hasChosenPeople(rule)) {
        const chosen = invitedMembers(family, rows).filter(m => rule.target_member_ids!.includes(m.id))
        people = chosen.map(m => m.name || 'Guest')
        autoQty = chosen.length === 0 ? 0 : rule.distribution === 'per_family' ? 1 : chosen.length
      } else if (ruleAppliesToFamily(rule, family)) {
        autoQty = recipientsInFamily(rule, hc)
      }
      const qty = count?.quantity !== null && count?.quantity !== undefined ? Number(count.quantity) : autoQty
      if (qty <= 0) return
      const unit = giftUnitPrice(rule, family, count)
      lines.push({
        key: rule.id, familyId: family.id, ruleId: rule.id, kind: rule.type, label: rule.rule_name,
        qty, unit, total: qty * unit, custom: !!count, people
      })
    })
  })
  return lines
}

export type RuleResult = {
  rule: GiftingRule
  count: number
  total: number
  customFamilies: number
  /** Lifafa rules: people (or families) left out because their family has an exception */
  excludedCount: number
  excludedFamilies: string[]
}

export type GiftingSummary = {
  rules: RuleResult[]
  overrides: Array<{ override: GiftOverride; familyName: string; replacedAmount: number; amount: number }>
  /** Exceptions minus what the rules would have given those families (negative = saving) */
  exceptionsDifference: number
  lines: GiftLine[]
  byKind: Record<GiftKind, number>
  lifafaTotal: number
  /** Everything that isn't cash: bhaji, gift items and return gifts */
  returnGiftTotal: number
  total: number
}

/**
 * Planned gifting for a function. A family with a lifafa override gets that
 * fixed amount instead of what the lifafa rules would give them; other gifts
 * still apply to them. A family's set quantity or price replaces the automatic one.
 */
export function computeGifting(
  rules: GiftingRule[],
  overrides: GiftOverride[],
  families: PlanningFamily[],
  rows: PlanningAttendance[],
  kidAge = DEFAULT_KID_AGE,
  giftCounts: GiftCount[] = []
): GiftingSummary {
  const lines = giftLines(rules, overrides, families, rows, kidAge, giftCounts)
  // What the rules would give families that have a lifafa exception (to show what was left out)
  const exceptionFamilies = new Set(overrides.map(o => o.family_id))
  const withoutExceptions = overrides.length
    ? giftLines(rules.filter(r => r.type === 'lifafa'), [], families.filter(f => exceptionFamilies.has(f.id)), rows, kidAge, giftCounts)
    : []

  const ruleResults: RuleResult[] = rules.map(rule => {
    const mine = lines.filter(l => l.ruleId === rule.id)
    const left = withoutExceptions.filter(l => l.ruleId === rule.id)
    return {
      rule,
      count: mine.reduce((s, l) => s + l.qty, 0),
      total: mine.reduce((s, l) => s + l.total, 0),
      customFamilies: mine.filter(l => l.custom).length,
      excludedCount: left.reduce((s, l) => s + l.qty, 0),
      excludedFamilies: left.map(l => families.find(f => f.id === l.familyId)?.family_name || 'Family')
    }
  })

  const overrideResults = overrides
    .map(o => {
      const family = families.find(f => f.id === o.family_id)
      if (!family) return null
      const hc = familyHeadcount(family, rows, kidAge)
      if (hc.total === 0) return null
      const replacedAmount = withoutExceptions.filter(l => l.familyId === family.id).reduce((sum, l) => sum + l.total, 0)
      const amount = exceptionAmount(o, rules, family, rows, kidAge)
      return { override: o, familyName: family.family_name || 'Family', replacedAmount, amount }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const byKind: Record<GiftKind, number> = { lifafa: 0, bhaji: 0, gift: 0, return_gift: 0 }
  lines.forEach(l => { byKind[l.kind] = (byKind[l.kind] || 0) + l.total })
  const lifafaTotal = byKind.lifafa
  const returnGiftTotal = byKind.bhaji + byKind.gift + byKind.return_gift

  return {
    rules: ruleResults,
    overrides: overrideResults,
    lines,
    byKind,
    exceptionsDifference: overrideResults.reduce((s, o) => s + o.amount - o.replacedAmount, 0),
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
      .select(`family_id, member_id, adults_count, kids_count, rsvp_status, families (${PLANNING_FAMILY_SELECT})`)
      .eq('function_id', functionId),
    supabase.from('function_gifting_rules').select('*').eq('function_id', functionId),
    supabase.from('function_gift_overrides').select('*').eq('function_id', functionId),
    supabase.from('function_gift_counts').select('*').eq('function_id', functionId)
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
