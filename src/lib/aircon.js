/**
 * Aircon (Daikin) energy helpers.
 *
 * Daikin reports energy per indoor unit, but on a multi-split every indoor unit
 * on one outdoor unit (condenser) reports that condenser's *total*. The home's
 * layout lives on its Daikin connection as `scope.outdoor_units`: a list of
 * groups of indoor-unit ids (`source_entity_id`) sharing a condenser. Any unit
 * not listed has its own. Never sum indoor units across a group.
 */

/** The home's Daikin connection's outdoor-unit groups, or []. */
export function outdoorUnits(connections) {
  const daikin = (connections ?? []).find((c) => c.provider === 'daikin');
  const groups = daikin?.scope?.outdoor_units;
  return Array.isArray(groups) ? groups.filter((g) => Array.isArray(g) && g.length > 0) : [];
}

/**
 * One entry per condenser: `{key, label, members, shared}`, in a stable order
 * (by first member's name) so a system keeps its colour across windows.
 * `units` is [{id, name}] for every Daikin indoor unit in the home.
 */
export function airconSystems(units, groups) {
  const name = Object.fromEntries(units.map((u) => [u.id, u.name || u.id]));
  const grouped = new Set(groups.flat());
  const systems = [
    ...groups.map((members) => ({ members, shared: members.length > 1 })),
    ...units.filter((u) => !grouped.has(u.id)).map((u) => ({ members: [u.id], shared: false })),
  ].map((s) => {
    const members = [...s.members].sort((a, b) => (name[a] ?? a).localeCompare(name[b] ?? b));
    return { ...s, members, key: members.join('+'), label: members.map((m) => name[m] ?? m).join(' + ') };
  });
  return systems.sort((a, b) => a.label.localeCompare(b.label));
}

/** Names of the other indoor units sharing `entityId`'s condenser ([] if none). */
export function sharedWith(entityId, groups, nameOf) {
  const group = groups.find((g) => g.includes(entityId));
  return group ? group.filter((m) => m !== entityId).map(nameOf) : [];
}

/**
 * A condenser's energy for one day from its members' reported values: they all
 * report the same total (within ~3%), so take the largest rather than summing.
 */
export function systemWh(members, whByEntity) {
  const vals = members.map((m) => whByEntity[m]).filter((v) => typeof v === 'number');
  return vals.length ? Math.max(...vals) : null;
}
