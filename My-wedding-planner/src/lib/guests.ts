import { DEFAULT_KID_AGE, familyHeadcount, type PlanningFamily } from './functionPlanning'

/** Expected guests for a family on the guest list: named members, padded up to its expected counts. */
export function familyCount(f: PlanningFamily & { family_members?: PlanningFamily['family_members'] }) {
  const hc = familyHeadcount({ ...f, family_members: f.family_members || [] }, [{ family_id: f.id, member_id: null }], DEFAULT_KID_AGE)
  return { adults: hc.adults - hc.seniors, seniors: hc.seniors, kids: hc.kids, total: hc.total }
}
