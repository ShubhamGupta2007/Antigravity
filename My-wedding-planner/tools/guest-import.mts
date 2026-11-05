// Guest list import helper for the `guest-photo-import` skill.
//
// Run from My-wedding-planner/:
//   node --experimental-strip-types tools/guest-import.mts <command> [options]
//
// Commands
//   functions                         List functions (id, date, name, side).
//   snapshot --function <id>          Everything the import must check against: all families
//                                     (+members), this function's invites, lifafa exceptions, rules.
//   match --function <id> --file <labels.json>
//                                     For each notebook label, suggest existing families.
//   apply --plan <plan.json> --as <email> [--commit]
//                                     Validate a plan and show exactly what would change.
//                                     Nothing is written without --commit. With --commit it writes,
//                                     re-syncs planned gifting into the budget, and re-reads the
//                                     database to verify every row.
//
// Connection: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY, read from the
// environment or .env.local. If no secret key is set, the request is sent with a placeholder
// `apikey` header for a network proxy to fill in (Claude cloud sessions), and no Authorization
// header.

import { readFileSync, existsSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  computeGifting,
  functionHeadcount,
  recalcFunctionGifting,
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

  // Proxy mode: the network proxy injects the real key into the apikey header.
  const proxyFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers)
    headers.delete('Authorization')
    headers.set('apikey', 'sb_secret_placeholder')
    return fetch(input, { ...init, headers })
  }
  return createClient(url, 'sb_secret_placeholder', { auth: { persistSession: false }, global: { fetch: proxyFetch } })
}

const out = (value: unknown) => console.log(JSON.stringify(value, null, 2))

// Name normalisation for duplicate detection (the app treats family names as unique, case-insensitive)
const HONORIFICS = new Set(['ji', 'di', 'didi', 'bhaiya', 'bhai', 'bhabhi', 'family', 'and', 'the', 'mr', 'mrs', 'smt', 'shri'])
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const tokens = (s: string) => normalize(s).split(' ').filter(t => t.length > 1 && !HONORIFICS.has(t))

const FAMILY_SELECT =
  'id, family_name, side, relation_tier, relationship, city, is_local, expected_adults_count, expected_kids_count, family_members (id, name, age, gender, is_kid_for_gifting)'

async function loadFunction(supabase: SupabaseClient, functionId: string) {
  const [fn, families, attendance, overrides, rules] = await Promise.all([
    supabase.from('functions').select('id, name, event_date, hosting_side, kid_age_threshold, planned_lifafa_total, planned_return_gift_total').eq('id', functionId).maybeSingle(),
    supabase.from('families').select(FAMILY_SELECT).order('family_name'),
    supabase.from('function_attendance').select('id, family_id, member_id, adults_count, kids_count').eq('function_id', functionId),
    supabase.from('function_gift_overrides').select('*').eq('function_id', functionId),
    supabase.from('function_gifting_rules').select('*').eq('function_id', functionId)
  ])
  const error = fn.error || families.error || attendance.error || overrides.error || rules.error
  if (error) fail(`${error.message}${error.code === '42P01' || error.code === '42703' ? ' (has supabase/07_function_planning.sql been run?)' : ''}`)
  if (!fn.data) fail(`No function with id ${functionId}. Run "functions" to list them.`)
  return {
    func: fn.data,
    families: (families.data || []) as unknown as Array<PlanningFamily & { relationship: string | null; city: string | null }>,
    attendance: (attendance.data || []) as Array<PlanningAttendance & { id: string }>,
    overrides: (overrides.data || []) as GiftOverride[],
    rules: (rules.data || []) as GiftingRule[]
  }
}

function totals(state: Awaited<ReturnType<typeof loadFunction>>) {
  const invited = state.families.filter(f => state.attendance.some(a => a.family_id === f.id))
  const kidAge = state.func.kid_age_threshold || 12
  const hc = functionHeadcount(invited, state.attendance, kidAge)
  const g = computeGifting(state.rules, state.overrides, invited, state.attendance, kidAge)
  return { families: hc.families, adults: hc.adults, kids: hc.kids, total: hc.total, lifafa: g.lifafaTotal, return_gifts: g.returnGiftTotal }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdFunctions() {
  const { data, error } = await db().from('functions').select('id, name, event_date, start_time, hosting_side').order('event_date')
  if (error) fail(error.message)
  out(data)
}

async function cmdSnapshot() {
  const functionId = opt('function') || fail('--function <id> is required')
  const state = await loadFunction(db(), functionId)
  out({
    function: state.func,
    current_totals: totals(state),
    invites: state.families
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
          lifafa_override: ov ? { amount: Number(ov.lifafa_amount), note: ov.note } : null
        }
      }),
    gifting_rules: state.rules.map(r => ({ name: r.rule_name, type: r.type, amount: Number(r.amount), per: r.distribution, side: r.target_side, tier: r.target_tier, group: r.target_gender })),
    all_families: state.families.map(f => ({
      id: f.id,
      family_name: f.family_name,
      side: f.side,
      tier: f.relation_tier,
      relationship: f.relationship,
      city: f.city,
      expected: `${f.expected_adults_count ?? 1}+${f.expected_kids_count ?? 0}`,
      members: (f.family_members || []).map(m => m.name)
    }))
  })
}

async function cmdMatch() {
  const functionId = opt('function') || fail('--function <id> is required')
  const file = opt('file') || fail('--file <labels.json> (a JSON array of notebook labels) is required')
  const labels = JSON.parse(readFileSync(file, 'utf8')) as string[]
  const state = await loadFunction(db(), functionId)
  out(labels.map(label => {
    const lt = new Set(tokens(label))
    const candidates = state.families
      .map(f => {
        const ft = new Set([...tokens(f.family_name || ''), ...(f.family_members || []).flatMap(m => tokens(m.name || '')), ...tokens(f.city || '')])
        const shared = [...lt].filter(t => ft.has(t))
        const exact = normalize(f.family_name || '') === normalize(label)
        return { family_id: f.id, family_name: f.family_name, side: f.side, city: f.city, score: exact ? 1 : shared.length / Math.max(lt.size, 1), shared }
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
    return { label, candidates }
  }))
}

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
    expected_adults_count: number
    expected_kids_count: number
  }
  adults: number
  kids: number
  lifafa_amount: number | null
  note?: string | null
}
type Plan = { function_id: string; source?: string; rows: PlanRow[] }

async function cmdApply() {
  const planPath = opt('plan') || fail('--plan <plan.json> is required')
  const asEmail = opt('as') || fail('--as <email of the app user doing the import> is required (used as created_by for new families)')
  const commit = flag('commit')
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as Plan
  const supabase = db()
  const state = await loadFunction(supabase, plan.function_id)

  const { data: importer, error: userErr } = await supabase.from('users').select('id, name, role').eq('email', asEmail).maybeSingle()
  if (userErr) fail(userErr.message)
  if (!importer) fail(`No app user with email ${asEmail}`)

  // ---- Validate ------------------------------------------------------------
  const problems: string[] = []
  const byName = new Map(state.families.map(f => [normalize(f.family_name || ''), f]))
  const targets = new Map<string, string>()
  const isCount = (n: unknown) => Number.isInteger(n) && (n as number) >= 0

  plan.rows.forEach((r, i) => {
    const where = `row ${i + 1} "${r.label}"`
    if (!!r.family_id === !!r.new_family) problems.push(`${where}: give exactly one of family_id or new_family`)
    if (!isCount(r.adults) || !isCount(r.kids)) problems.push(`${where}: adults/kids must be whole numbers ≥ 0`)
    if (r.adults + r.kids === 0) problems.push(`${where}: headcount is 0`)
    if (r.lifafa_amount !== null && !(typeof r.lifafa_amount === 'number' && r.lifafa_amount >= 0)) problems.push(`${where}: lifafa_amount must be a number ≥ 0 or null`)
    let key = r.family_id || ''
    if (r.family_id && !state.families.some(f => f.id === r.family_id)) problems.push(`${where}: family_id ${r.family_id} does not exist`)
    if (r.new_family) {
      const nf = r.new_family
      key = `new:${normalize(nf.family_name)}`
      const existing = byName.get(normalize(nf.family_name))
      if (existing) problems.push(`${where}: a family named "${existing.family_name}" already exists (id ${existing.id}); use family_id instead of new_family`)
      if (!['groom', 'bride'].includes(nf.side)) problems.push(`${where}: new_family.side must be groom or bride`)
      if (!['tier_1', 'tier_2', 'tier_3'].includes(nf.relation_tier)) problems.push(`${where}: new_family.relation_tier must be tier_1/tier_2/tier_3`)
      if (!isCount(nf.expected_adults_count) || !isCount(nf.expected_kids_count)) problems.push(`${where}: new_family expected counts must be whole numbers ≥ 0`)
    }
    if (key && targets.has(key)) problems.push(`${where}: same family as "${targets.get(key)}" — merge these rows`)
    if (key) targets.set(key, r.label)
  })
  if (problems.length) {
    console.log('PLAN REJECTED — nothing was written:\n- ' + problems.join('\n- '))
    process.exit(2)
  }

  // ---- Diff ----------------------------------------------------------------
  type Change = { label: string; family: string; actions: string[]; warnings: string[] }
  const changes: Change[] = plan.rows.map(r => {
    const fam = r.family_id ? state.families.find(f => f.id === r.family_id)! : null
    const name = fam?.family_name || r.new_family!.family_name
    const actions: string[] = []
    const warnings: string[] = []
    if (!fam) actions.push(`CREATE family "${name}" (${r.new_family!.side}, ${r.new_family!.relation_tier}${r.new_family!.city ? `, ${r.new_family!.city}` : ''})`)
    const rows = fam ? state.attendance.filter(a => a.family_id === fam.id) : []
    const famRow = rows.find(a => a.member_id === null)
    if (!famRow) {
      actions.push(`INVITE whole family with ${r.adults} adults + ${r.kids} kids`)
      if (rows.length) warnings.push(`was partly invited (${rows.length} named members); becomes a whole-family invite`)
    } else if ((famRow.adults_count ?? null) !== r.adults || (famRow.kids_count ?? null) !== r.kids) {
      actions.push(`UPDATE headcount ${famRow.adults_count ?? 'auto'}+${famRow.kids_count ?? 'auto'} → ${r.adults}+${r.kids}`)
    }
    const ov = fam ? state.overrides.find(o => o.family_id === fam.id) : undefined
    const note = r.note?.trim() || null
    if (r.lifafa_amount !== null) {
      if (!ov) actions.push(`SET lifafa ₹${r.lifafa_amount}${note ? ` (${note})` : ''}`)
      else if (Number(ov.lifafa_amount) !== r.lifafa_amount || (ov.note || null) !== note) {
        actions.push(`UPDATE lifafa ₹${Number(ov.lifafa_amount)} → ₹${r.lifafa_amount}${note !== (ov.note || null) ? `, note "${ov.note || ''}" → "${note || ''}"` : ''}`)
        if (Number(ov.lifafa_amount) !== r.lifafa_amount) warnings.push('changes an existing lifafa amount')
      }
    }
    if (fam && fam.side && r.new_family === undefined && state.func.hosting_side !== 'joint' && fam.side !== state.func.hosting_side) {
      warnings.push(`family is on the ${fam.side} side but the function is hosted by the ${state.func.hosting_side} side`)
    }
    return { label: r.label, family: name, actions, warnings }
  })

  const before = totals(state)
  console.log(`Function: ${state.func.name} (${state.func.event_date}) — ${commit ? 'COMMITTING' : 'DRY RUN, nothing written'}`)
  console.log(`Before: ${before.families} families, ${before.total} guests, lifafas ₹${before.lifafa}`)
  for (const c of changes) {
    const status = c.actions.length ? c.actions.join('; ') : 'no change'
    console.log(`- ${c.label} → ${c.family}: ${status}${c.warnings.length ? `  ⚠ ${c.warnings.join('; ')}` : ''}`)
  }
  const changed = changes.filter(c => c.actions.length).length
  console.log(`${changed} of ${changes.length} rows change.`)
  if (!commit) {
    console.log('Re-run with --commit to write these changes.')
    return
  }

  // ---- Write ---------------------------------------------------------------
  const familyIds: string[] = []
  for (const r of plan.rows) {
    let familyId = r.family_id || null
    if (!familyId) {
      const nf = r.new_family!
      const { data, error } = await supabase
        .from('families')
        .insert({ ...nf, family_name: nf.family_name.trim(), is_local: nf.is_local ?? true, created_by: importer.id })
        .select('id')
        .single()
      if (error) fail(`creating "${nf.family_name}": ${error.message}. Rows before this one were written; re-run apply (it is safe to repeat).`)
      familyId = data.id as string
    }
    familyIds.push(familyId)

    const famRow = state.attendance.find(a => a.family_id === familyId && a.member_id === null)
    const att = famRow
      ? await supabase.from('function_attendance').update({ adults_count: r.adults, kids_count: r.kids, is_attending: true }).eq('id', famRow.id)
      : await supabase.from('function_attendance').insert({ function_id: plan.function_id, family_id: familyId, member_id: null, is_attending: true, adults_count: r.adults, kids_count: r.kids })
    if (att.error) fail(`inviting "${r.label}": ${att.error.message}`)

    if (r.lifafa_amount !== null) {
      const { error } = await supabase
        .from('function_gift_overrides')
        .upsert({ function_id: plan.function_id, family_id: familyId, lifafa_amount: r.lifafa_amount, note: r.note?.trim() || null }, { onConflict: 'function_id,family_id' })
      if (error) fail(`lifafa for "${r.label}": ${error.message}`)
    }
  }

  const sync = await recalcFunctionGifting(supabase, plan.function_id)
  if (sync.error) console.log(`⚠ Could not update the budget's "Lifafas & Gifts" line: ${sync.error.message}`)

  // ---- Verify --------------------------------------------------------------
  const after = await loadFunction(supabase, plan.function_id)
  const mismatches: string[] = []
  plan.rows.forEach((r, i) => {
    const id = familyIds[i]
    const famRow = after.attendance.find(a => a.family_id === id && a.member_id === null)
    if (!famRow || famRow.adults_count !== r.adults || famRow.kids_count !== r.kids) mismatches.push(`${r.label}: headcount not saved`)
    if (r.lifafa_amount !== null) {
      const ov = after.overrides.find(o => o.family_id === id)
      if (!ov || Number(ov.lifafa_amount) !== r.lifafa_amount) mismatches.push(`${r.label}: lifafa not saved`)
    }
  })
  const t = totals(after)
  console.log(`After: ${t.families} families, ${t.total} guests (${t.adults} adults, ${t.kids} kids), lifafas ₹${t.lifafa}, return gifts ₹${t.return_gifts}`)
  console.log(sync.error ? 'Budget sync: FAILED' : sync.categoryId ? 'Budget sync: updated "Lifafas & Gifts"' : 'Budget sync: totals saved, but no budget category is linked to this function')
  console.log(mismatches.length ? `VERIFY FAILED:\n- ${mismatches.join('\n- ')}` : `Verified: all ${plan.rows.length} rows match the database.`)
  if (mismatches.length) process.exit(3)
}

const commands: Record<string, () => Promise<void>> = { functions: cmdFunctions, snapshot: cmdSnapshot, match: cmdMatch, apply: cmdApply }
if (!commands[command]) {
  console.log('Usage: node --experimental-strip-types tools/guest-import.mts <functions|snapshot|match|apply> [options]')
  process.exit(command ? 1 : 0)
}
await commands[command]()
