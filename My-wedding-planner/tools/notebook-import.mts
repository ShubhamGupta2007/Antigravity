// Import helper for the `notebook-photo-import` skill: applies what was read from photographed
// notebook pages (guest lists, function headcounts, lifafa amounts, bhaji boxes / other gift items)
// to the wedding planner's Supabase database, safely.
//
// Run from My-wedding-planner/:
//   node --experimental-strip-types tools/notebook-import.mts <command> [options]
//
// Commands
//   functions                         List functions (id, date, name, side).
//   snapshot [--function <id>]        All families (+members). With --function: also that function's
//                                     invites, headcounts, lifafa exceptions, gifting rules, gift counts.
//   match --file <labels.json>        For each notebook label (JSON array of strings), suggest
//                                     existing families (by family name, member names and city).
//   apply --plan <plan.json> --as <email> [--commit]
//                                     Validate a plan and print exactly what would change. Nothing is
//                                     written without --commit. With --commit: writes, re-syncs planned
//                                     gifting into the budget, re-reads the database and verifies.
//
// Plan format: see .claude/skills/notebook-photo-import/SKILL.md
//
// Connection: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY, from the
// environment or .env.local; or --url. Without a secret key the requests carry a placeholder
// `apikey` header for a network proxy to fill in (Claude cloud sessions) and no Authorization header.

import { readFileSync, existsSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  computeGifting,
  functionHeadcount,
  recalcFunctionGifting,
  type GiftCount,
  type GiftOverride,
  type GiftingRule,
  type PlanningAttendance,
  type PlanningFamily
} from '../src/lib/functionPlanning.ts'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function loadEnvFile(path: string) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
loadEnvFile('.env.local')

const args = process.argv.slice(2)
const command = args[0]
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const flag = (name: string) => args.includes(`--${name}`)

function fail(message: string): never {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function db(): SupabaseClient {
  const url = opt('url') || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) fail('Set SUPABASE_URL (e.g. https://abcd.supabase.co) or pass --url')
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (secret) return createClient(url, secret, { auth: { persistSession: false } })

  // Proxy mode: the network proxy puts the real key into the apikey header.
  const proxyFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers)
    headers.delete('Authorization')
    headers.set('apikey', 'sb_secret_placeholder')
    return fetch(input, { ...init, headers })
  }
  return createClient(url, 'sb_secret_placeholder', { auth: { persistSession: false }, global: { fetch: proxyFetch } })
}

const out = (value: unknown) => console.log(JSON.stringify(value, null, 2))
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

// Name normalisation (the app treats family names as unique, case-insensitive)
const HONORIFICS = new Set(['ji', 'di', 'didi', 'bhaiya', 'bhai', 'bhabhi', 'family', 'and', 'the', 'mr', 'mrs', 'smt', 'shri'])
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const tokens = (s: string) => normalize(s).split(' ').filter(t => t.length > 1 && !HONORIFICS.has(t))

const FAMILY_SELECT =
  'id, family_name, side, relation_tier, relationship, city, is_local, expected_adults_count, expected_kids_count, family_members (id, name, age, gender, is_kid_for_gifting)'

type Family = PlanningFamily & { relationship: string | null; city: string | null }

async function loadFamilies(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('families').select(FAMILY_SELECT).order('family_name')
  if (error) fail(error.message)
  return (data || []) as unknown as Family[]
}

async function loadFunction(supabase: SupabaseClient, functionId: string) {
  const [fn, attendance, overrides, rules, counts] = await Promise.all([
    supabase.from('functions').select('id, name, event_date, hosting_side, kid_age_threshold, planned_lifafa_total, planned_return_gift_total').eq('id', functionId).maybeSingle(),
    supabase.from('function_attendance').select('id, family_id, member_id, adults_count, kids_count').eq('function_id', functionId),
    supabase.from('function_gift_overrides').select('*').eq('function_id', functionId),
    supabase.from('function_gifting_rules').select('*').eq('function_id', functionId),
    supabase.from('function_gift_counts').select('id, rule_id, family_id, quantity').eq('function_id', functionId)
  ])
  const error = fn.error || attendance.error || overrides.error || rules.error || counts.error
  if (error) fail(`${error.message}${['42P01', '42703', 'PGRST205', 'PGRST204'].includes(error.code || '') ? ' (has supabase/07_function_planning.sql been run?)' : ''}`)
  if (!fn.data) fail(`No function with id ${functionId}. Run "functions" to list them.`)
  return {
    func: fn.data,
    attendance: (attendance.data || []) as Array<PlanningAttendance & { id: string }>,
    overrides: (overrides.data || []) as GiftOverride[],
    rules: (rules.data || []) as GiftingRule[],
    counts: (counts.data || []) as Array<GiftCount & { id: string }>
  }
}

type FnState = Awaited<ReturnType<typeof loadFunction>>

function totals(families: Family[], state: FnState) {
  const invited = families.filter(f => state.attendance.some(a => a.family_id === f.id))
  const kidAge = state.func.kid_age_threshold || 12
  const hc = functionHeadcount(invited, state.attendance, kidAge)
  const g = computeGifting(state.rules, state.overrides, invited, state.attendance, kidAge, state.counts)
  return {
    families: hc.families,
    adults: hc.adults,
    kids: hc.kids,
    total: hc.total,
    lifafa: g.lifafaTotal,
    return_gifts: g.returnGiftTotal,
    items: g.rules.filter(r => r.rule.type === 'return_gift').map(r => `${r.rule.rule_name}: ${r.count} × ${rupees(Number(r.rule.amount))}`)
  }
}

// ---------------------------------------------------------------------------
// Read-only commands
// ---------------------------------------------------------------------------

async function cmdFunctions() {
  const { data, error } = await db().from('functions').select('id, name, event_date, start_time, hosting_side').order('event_date')
  if (error) fail(error.message)
  out(data)
}

async function cmdSnapshot() {
  const supabase = db()
  const families = await loadFamilies(supabase)
  const functionId = opt('function')
  const fnPart = functionId ? await (async () => {
    const state = await loadFunction(supabase, functionId)
    return {
      function: state.func,
      current_totals: totals(families, state),
      gifting_rules: state.rules.map(r => ({ id: r.id, name: r.rule_name, type: r.type, amount: Number(r.amount), per: r.distribution, side: r.target_side, tier: r.target_tier, group: r.target_gender })),
      invites: families
        .filter(f => state.attendance.some(a => a.family_id === f.id))
        .map(f => {
          const rows = state.attendance.filter(a => a.family_id === f.id)
          const famRow = rows.find(r => r.member_id === null)
          const ov = state.overrides.find(o => o.family_id === f.id)
          return {
            family_id: f.id,
            family_name: f.family_name,
            whole_family_invited: !!famRow,
            named_members_invited: rows.filter(r => r.member_id).length,
            adults_count: famRow?.adults_count ?? null,
            kids_count: famRow?.kids_count ?? null,
            lifafa_override: ov ? { amount: Number(ov.lifafa_amount), note: ov.note } : null,
            gift_counts: Object.fromEntries(state.counts.filter(c => c.family_id === f.id).map(c => [state.rules.find(r => r.id === c.rule_id)?.rule_name || c.rule_id, c.quantity]))
          }
        })
    }
  })() : {}
  out({
    ...fnPart,
    all_families: families.map(f => ({
      id: f.id,
      family_name: f.family_name,
      side: f.side,
      tier: f.relation_tier,
      relationship: f.relationship,
      city: f.city,
      expected: `${f.expected_adults_count ?? 1}+${f.expected_kids_count ?? 0}`,
      members: (f.family_members || []).map(m => `${m.name}${m.is_kid_for_gifting || (m.age != null && m.age < 12) ? ' (kid)' : ''}`)
    }))
  })
}

async function cmdMatch() {
  const file = opt('file') || fail('--file <labels.json> (a JSON array of notebook labels) is required')
  const labels = JSON.parse(readFileSync(file, 'utf8')) as string[]
  const families = await loadFamilies(db())
  out(labels.map(label => {
    const lt = new Set(tokens(label))
    const candidates = families
      .map(f => {
        const ft = new Set([...tokens(f.family_name || ''), ...(f.family_members || []).flatMap(m => tokens(m.name || '')), ...tokens(f.city || '')])
        const shared = [...lt].filter(t => ft.has(t))
        const exact = normalize(f.family_name || '') === normalize(label)
        return { family_id: f.id, family_name: f.family_name, side: f.side, city: f.city, members: (f.family_members || []).map(m => m.name), score: exact ? 1 : Number((shared.length / Math.max(lt.size, 1)).toFixed(2)), shared }
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
    return { label, candidates }
  }))
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

type MemberInput = string | { name: string; kid?: boolean }
type PlanRow = {
  label: string
  family_id?: string | null
  new_family?: {
    family_name: string
    side: 'groom' | 'bride'
    relation_tier: 'tier_1' | 'tier_2' | 'tier_3'
    relationship?: string | null
    city?: string | null
    is_local?: boolean | null
    expected_adults_count?: number
    expected_kids_count?: number
  }
  /** Named people in this household; any not already in the app are added (adults unless kid: true). */
  members?: MemberInput[]
  /** Headcount at the function (required when the plan has a function). */
  adults?: number
  kids?: number
  /** Lifafa amount for this family at the function; null/omitted leaves any existing amount alone. */
  lifafa_amount?: number | null
  /** Quantity per gift item name, e.g. { "Bhaji box": 1 }. 0 = this family gets none. */
  gifts?: Record<string, number>
  note?: string | null
}
type GiftItem = { name: string; type?: 'return_gift' | 'lifafa'; unit_price?: number }
type Plan = { source?: string; function_id?: string | null; gift_items?: GiftItem[]; rows: PlanRow[] }

const memberName = (m: MemberInput) => (typeof m === 'string' ? m : m.name).trim()
const memberIsKid = (m: MemberInput) => typeof m !== 'string' && !!m.kid

async function cmdApply() {
  const planPath = opt('plan') || fail('--plan <plan.json> is required')
  const asEmail = opt('as') || fail('--as <email of the app user doing the import> is required (recorded as created_by)')
  const commit = flag('commit')
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as Plan
  const supabase = db()
  const families = await loadFamilies(supabase)
  const fnId = plan.function_id || null
  const state = fnId ? await loadFunction(supabase, fnId) : null

  const { data: importer, error: userErr } = await supabase.from('users').select('id, name, role').eq('email', asEmail).maybeSingle()
  if (userErr) fail(userErr.message)
  if (!importer) fail(`No app user with email ${asEmail}`)

  // ---- Validate ------------------------------------------------------------
  const problems: string[] = []
  const isCount = (n: unknown) => Number.isInteger(n) && (n as number) >= 0
  const byName = new Map(families.map(f => [normalize(f.family_name || ''), f]))
  const targets = new Map<string, string>()

  // Gift items: plan.gift_items (create/update) or existing rules on the function, matched by name
  const giftItems = new Map<string, { name: string; type: 'return_gift' | 'lifafa'; price?: number; rule?: GiftingRule }>()
  for (const gi of plan.gift_items || []) {
    if (!fnId) { problems.push(`gift item "${gi.name}": gift items need a function_id`); continue }
    if (gi.unit_price !== undefined && !(typeof gi.unit_price === 'number' && gi.unit_price >= 0)) problems.push(`gift item "${gi.name}": unit_price must be a number ≥ 0`)
    const rule = state!.rules.find(r => normalize(r.rule_name) === normalize(gi.name))
    if (!rule && gi.unit_price === undefined) problems.push(`gift item "${gi.name}": not on this function yet, so unit_price is required`)
    giftItems.set(normalize(gi.name), { name: gi.name.trim(), type: gi.type || rule?.type || 'return_gift', price: gi.unit_price, rule })
  }

  // A new_family whose name is already in the app (names are unique there) is that family:
  // this makes re-running a plan after a partial failure safe.
  const notices: string[] = []
  plan.rows.forEach(r => {
    if (r.new_family && !r.family_id) {
      const existing = byName.get(normalize(r.new_family.family_name))
      if (existing) {
        notices.push(`"${r.label}": "${existing.family_name}" is already in the app, so this row updates it instead of creating a new family`)
        r.family_id = existing.id
        delete r.new_family
      }
    }
  })

  plan.rows.forEach((r, i) => {
    const where = `row ${i + 1} "${r.label}"`
    if (!!r.family_id === !!r.new_family) problems.push(`${where}: give exactly one of family_id or new_family`)
    let key = r.family_id || ''
    const fam = r.family_id ? families.find(f => f.id === r.family_id) : undefined
    if (r.family_id && !fam) problems.push(`${where}: family_id ${r.family_id} does not exist`)
    if (r.new_family) {
      const nf = r.new_family
      key = `new:${normalize(nf.family_name)}`
      if (!['groom', 'bride'].includes(nf.side)) problems.push(`${where}: new_family.side must be groom or bride`)
      if (!['tier_1', 'tier_2', 'tier_3'].includes(nf.relation_tier)) problems.push(`${where}: new_family.relation_tier must be tier_1/tier_2/tier_3`)
      for (const k of ['expected_adults_count', 'expected_kids_count'] as const) {
        if (nf[k] !== undefined && !isCount(nf[k])) problems.push(`${where}: new_family.${k} must be a whole number ≥ 0`)
      }
    }
    if (key && targets.has(key)) problems.push(`${where}: same family as "${targets.get(key)}" — merge these rows`)
    if (key) targets.set(key, r.label)

    const names = (r.members || []).map(memberName)
    if (names.some(n => !n)) problems.push(`${where}: empty member name`)
    if (new Set(names.map(normalize)).size !== names.length) problems.push(`${where}: a member is listed twice`)

    if (fnId) {
      if (!isCount(r.adults) || !isCount(r.kids)) problems.push(`${where}: adults and kids are required whole numbers ≥ 0 for a function import`)
      else if ((r.adults as number) + (r.kids as number) === 0) problems.push(`${where}: headcount is 0`)
      if (r.lifafa_amount != null && !(typeof r.lifafa_amount === 'number' && r.lifafa_amount >= 0)) problems.push(`${where}: lifafa_amount must be a number ≥ 0 or null`)
      for (const [name, qty] of Object.entries(r.gifts || {})) {
        if (!isCount(qty)) problems.push(`${where}: gift "${name}" quantity must be a whole number ≥ 0`)
        if (!giftItems.has(normalize(name)) && !state!.rules.some(x => normalize(x.rule_name) === normalize(name))) {
          problems.push(`${where}: gift "${name}" is not in gift_items and not a rule on this function`)
        }
      }
    } else if (r.adults !== undefined || r.kids !== undefined || r.lifafa_amount != null || r.gifts) {
      problems.push(`${where}: headcount, lifafa and gifts need a function_id in the plan`)
    }
  })
  if (problems.length) {
    console.log('PLAN REJECTED — nothing was written:\n- ' + problems.join('\n- '))
    process.exit(2)
  }

  // Resolve gift names used by rows that refer to existing rules only
  for (const r of plan.rows) for (const name of Object.keys(r.gifts || {})) {
    if (!giftItems.has(normalize(name))) {
      const rule = state!.rules.find(x => normalize(x.rule_name) === normalize(name))!
      giftItems.set(normalize(name), { name: rule.rule_name, type: rule.type, rule })
    }
  }

  // ---- Diff ----------------------------------------------------------------
  const lines: string[] = []
  const warnings: string[] = []
  for (const gi of giftItems.values()) {
    if (!gi.rule) lines.push(`CREATE gift item "${gi.name}" at ${rupees(gi.price!)} each (${gi.type === 'lifafa' ? 'lifafa' : 'return gift'})`)
    else if (gi.price !== undefined && Number(gi.rule.amount) !== gi.price) {
      lines.push(`UPDATE gift item "${gi.name}" price ${rupees(Number(gi.rule.amount))} → ${rupees(gi.price)}`)
      warnings.push(`"${gi.name}" price changes for every family at this function`)
    }
  }
  if (state) {
    // Families invited to the function but not in this list fall back to the rule's automatic count
    const listed = new Set(plan.rows.map(r => r.family_id).filter(Boolean))
    for (const gi of giftItems.values()) {
      const others = state.attendance.filter(a => a.member_id === null && !listed.has(a.family_id))
      const othersWithoutCount = new Set(others.map(a => a.family_id).filter(id => !state.counts.some(c => c.family_id === id && c.rule_id === gi.rule?.id)))
      if (othersWithoutCount.size) warnings.push(`${othersWithoutCount.size} other families invited to this function are not in this list; they get "${gi.name}" by the rule's automatic count (1 per family) unless a quantity is set for them`)
    }
  }

  const rowSummaries = plan.rows.map(r => {
    const fam = r.family_id ? families.find(f => f.id === r.family_id)! : null
    const name = fam?.family_name || r.new_family!.family_name
    const acts: string[] = []
    const warn: string[] = []
    if (!fam) acts.push(`CREATE family "${name}" (${r.new_family!.side}, ${r.new_family!.relation_tier}${r.new_family!.city ? `, ${r.new_family!.city}` : ''})`)

    const existingMembers = new Set((fam?.family_members || []).map(m => normalize(m.name || '')))
    const newMembers = (r.members || []).filter(m => !existingMembers.has(normalize(memberName(m))))
    if (newMembers.length) acts.push(`ADD members ${newMembers.map(m => `${memberName(m)}${memberIsKid(m) ? ' (kid)' : ''}`).join(', ')}`)

    if (state) {
      const rows = fam ? state.attendance.filter(a => a.family_id === fam.id) : []
      const famRow = rows.find(a => a.member_id === null)
      if (!famRow) {
        acts.push(`INVITE with ${r.adults} adult${r.adults === 1 ? "" : "s"} + ${r.kids} kid${r.kids === 1 ? "" : "s"}`)
        if (rows.length) warn.push(`was partly invited (${rows.length} named members); becomes a whole-family invite`)
      } else if ((famRow.adults_count ?? null) !== r.adults || (famRow.kids_count ?? null) !== r.kids) {
        acts.push(`UPDATE headcount ${famRow.adults_count ?? 'auto'}+${famRow.kids_count ?? 'auto'} → ${r.adults}+${r.kids}`)
      }
      const ov = fam ? state.overrides.find(o => o.family_id === fam.id) : undefined
      const note = r.note?.trim() || null
      if (r.lifafa_amount != null) {
        if (!ov) acts.push(`SET lifafa ${rupees(r.lifafa_amount)}${note ? ` (${note})` : ''}`)
        else if (Number(ov.lifafa_amount) !== r.lifafa_amount || (ov.note || null) !== note) {
          acts.push(`UPDATE lifafa ${rupees(Number(ov.lifafa_amount))} → ${rupees(r.lifafa_amount)}`)
          if (Number(ov.lifafa_amount) !== r.lifafa_amount) warn.push('changes an existing lifafa amount')
        }
      }
      for (const [gname, qty] of Object.entries(r.gifts || {})) {
        const gi = giftItems.get(normalize(gname))!
        const existing = fam && gi.rule ? state.counts.find(c => c.family_id === fam.id && c.rule_id === gi.rule!.id) : undefined
        if (!existing) acts.push(`SET ${gi.name} × ${qty}`)
        else if (existing.quantity !== qty) acts.push(`UPDATE ${gi.name} × ${existing.quantity} → × ${qty}`)
      }
      if (fam?.side && state.func.hosting_side !== 'joint' && fam.side !== state.func.hosting_side) {
        warn.push(`family is on the ${fam.side} side; function is hosted by the ${state.func.hosting_side} side`)
      }
    }
    const kidsListed = (r.members || []).filter(memberIsKid).length + (fam?.family_members || []).filter(m => m.is_kid_for_gifting).length
    if (state && r.kids !== undefined && kidsListed > r.kids) warn.push(`${kidsListed} members are marked as kids but kids = ${r.kids}`)
    return `- ${r.label} → ${name}: ${acts.length ? acts.join('; ') : 'no change'}${warn.length ? `  ⚠ ${warn.join('; ')}` : ''}`
  })

  console.log(`${commit ? 'COMMITTING' : 'DRY RUN, nothing written'}${plan.source ? ` — ${plan.source}` : ''}`)
  if (state) {
    const before = totals(families, state)
    console.log(`Function: ${state.func.name} (${state.func.event_date})`)
    console.log(`Before: ${before.families} families, ${before.total} guests, lifafas ${rupees(before.lifafa)}, return gifts ${rupees(before.return_gifts)}`)
  } else {
    console.log('No function: families and members only.')
  }
  notices.forEach(n => console.log(`ℹ ${n}`))
  lines.forEach(l => console.log(`- ${l}`))
  rowSummaries.forEach(l => console.log(l))
  warnings.forEach(w => console.log(`⚠ ${w}`))
  const changed = rowSummaries.filter(l => !l.includes(': no change')).length
  console.log(`${changed} of ${plan.rows.length} rows change.`)
  if (!commit) {
    console.log('Re-run with --commit to write these changes.')
    return
  }

  // ---- Write ---------------------------------------------------------------
  const stop = (what: string, message: string): never =>
    fail(`${what}: ${message}. Earlier steps were written; fix and re-run the same plan (repeats are safe).`)

  // Gift items (rules)
  for (const gi of giftItems.values()) {
    if (!gi.rule) {
      const { data, error } = await supabase
        .from('function_gifting_rules')
        .insert({ function_id: fnId, rule_name: gi.name, type: gi.type, distribution: 'per_family', amount: gi.price, target_side: 'both', target_tier: 'all', target_gender: 'All' })
        .select()
        .single()
      if (error) stop(`creating gift item "${gi.name}"`, error.message)
      gi.rule = data as GiftingRule
    } else if (gi.price !== undefined && Number(gi.rule.amount) !== gi.price) {
      const { error } = await supabase.from('function_gifting_rules').update({ amount: gi.price }).eq('id', gi.rule.id)
      if (error) stop(`updating price of "${gi.name}"`, error.message)
    }
  }

  const familyIds: string[] = []
  for (const r of plan.rows) {
    let familyId = r.family_id || null
    let existingMembers: string[] = []
    if (!familyId) {
      const nf = r.new_family!
      const memberCount = (r.members || []).length
      const kidMembers = (r.members || []).filter(memberIsKid).length
      const { data, error } = await supabase
        .from('families')
        .insert({
          family_name: nf.family_name.trim(),
          side: nf.side,
          relation_tier: nf.relation_tier,
          relationship: nf.relationship ?? null,
          city: nf.city ?? null,
          is_local: nf.is_local ?? true,
          expected_adults_count: nf.expected_adults_count ?? r.adults ?? Math.max(1, memberCount - kidMembers),
          expected_kids_count: nf.expected_kids_count ?? r.kids ?? kidMembers,
          created_by: importer.id
        })
        .select('id')
        .single()
      if (error) stop(`creating family "${nf.family_name}"`, error.message)
      familyId = data.id as string
    } else {
      existingMembers = (families.find(f => f.id === familyId)?.family_members || []).map(m => normalize(m.name || ''))
    }
    familyIds.push(familyId)

    const toAdd = (r.members || []).filter(m => !existingMembers.includes(normalize(memberName(m))))
    if (toAdd.length) {
      const { error } = await supabase.from('family_members').insert(toAdd.map(m => ({
        family_id: familyId,
        name: memberName(m),
        age: null,
        relation_to_head: null,
        gender: 'Unknown',
        is_kid_for_gifting: memberIsKid(m)
      })))
      if (error) stop(`adding members to "${r.label}"`, error.message)
    }

    if (!state) continue

    const famRow = state.attendance.find(a => a.family_id === familyId && a.member_id === null)
    const att = famRow
      ? await supabase.from('function_attendance').update({ adults_count: r.adults, kids_count: r.kids, is_attending: true }).eq('id', famRow.id)
      : await supabase.from('function_attendance').insert({ function_id: fnId, family_id: familyId, member_id: null, is_attending: true, adults_count: r.adults, kids_count: r.kids })
    if (att.error) stop(`inviting "${r.label}"`, att.error.message)

    if (r.lifafa_amount != null) {
      const { error } = await supabase
        .from('function_gift_overrides')
        .upsert({ function_id: fnId, family_id: familyId, lifafa_amount: r.lifafa_amount, note: r.note?.trim() || null }, { onConflict: 'function_id,family_id' })
      if (error) stop(`lifafa for "${r.label}"`, error.message)
    }

    for (const [gname, qty] of Object.entries(r.gifts || {})) {
      const gi = giftItems.get(normalize(gname))!
      const { error } = await supabase
        .from('function_gift_counts')
        .upsert({ function_id: fnId, rule_id: gi.rule!.id, family_id: familyId, quantity: qty }, { onConflict: 'rule_id,family_id' })
      if (error) stop(`${gi.name} for "${r.label}"`, error.message)
    }
  }

  let syncMessage = ''
  if (fnId) {
    const sync = await recalcFunctionGifting(supabase, fnId)
    syncMessage = sync.error
      ? `Budget sync: FAILED (${sync.error.message})`
      : sync.categoryId ? 'Budget sync: updated "Lifafas & Gifts"' : 'Budget sync: totals saved, but no budget category is linked to this function'
  }

  // ---- Verify --------------------------------------------------------------
  const famAfter = await loadFamilies(supabase)
  const after = fnId ? await loadFunction(supabase, fnId) : null
  const mismatches: string[] = []
  plan.rows.forEach((r, i) => {
    const id = familyIds[i]
    const fam = famAfter.find(f => f.id === id)
    if (!fam) return mismatches.push(`${r.label}: family not found`)
    const have = new Set((fam.family_members || []).map(m => normalize(m.name || '')))
    const missing = (r.members || []).map(memberName).filter(n => !have.has(normalize(n)))
    if (missing.length) mismatches.push(`${r.label}: members missing: ${missing.join(', ')}`)
    if (!after) return
    const famRow = after.attendance.find(a => a.family_id === id && a.member_id === null)
    if (!famRow || famRow.adults_count !== r.adults || famRow.kids_count !== r.kids) mismatches.push(`${r.label}: headcount not saved`)
    if (r.lifafa_amount != null) {
      const ov = after.overrides.find(o => o.family_id === id)
      if (!ov || Number(ov.lifafa_amount) !== r.lifafa_amount) mismatches.push(`${r.label}: lifafa not saved`)
    }
    for (const [gname, qty] of Object.entries(r.gifts || {})) {
      const rule = giftItems.get(normalize(gname))!.rule!
      const c = after.counts.find(x => x.family_id === id && x.rule_id === rule.id)
      if (!c || c.quantity !== qty) mismatches.push(`${r.label}: ${rule.rule_name} quantity not saved`)
    }
  })
  if (after) {
    const t = totals(famAfter, after)
    console.log(`After: ${t.families} families, ${t.total} guests (${t.adults} adults, ${t.kids} kids), lifafas ${rupees(t.lifafa)}, return gifts ${rupees(t.return_gifts)}`)
    t.items.forEach(x => console.log(`  ${x}`))
    console.log(syncMessage)
  }
  console.log(mismatches.length ? `VERIFY FAILED:\n- ${mismatches.join('\n- ')}` : `Verified: all ${plan.rows.length} rows match the database.`)
  if (mismatches.length) process.exit(3)
}

const commands: Record<string, () => Promise<void>> = { functions: cmdFunctions, snapshot: cmdSnapshot, match: cmdMatch, apply: cmdApply }
if (!commands[command]) {
  console.log('Usage: node --experimental-strip-types tools/notebook-import.mts <functions|snapshot|match|apply> [options]')
  process.exit(command ? 1 : 0)
}
await commands[command]()
