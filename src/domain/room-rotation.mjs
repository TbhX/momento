import RoomFormat from '../client/room-format.js';
// Pure, server-only planning kernel. A proposal is NOT an admission or media grant.
// See ROTATION_ENGINE.md for the transactional integration still required.
export const ROUND_MS = 300_000;
export const CHOICE_MS = 30_000;
export const PRESENCE_TTL_MS = 45_000;
const SLOT_MS = ROUND_MS + CHOICE_MS;
const idOK = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const pairKey = (a, b) => JSON.stringify(a < b ? [a, b] : [b, a]);
const validList = (list, values) => Array.isArray(list) && list.length > 0 &&
  list.length <= values.length && new Set(list).size === list.length && list.every(x => values.includes(x));

function preferencesValid(p) {
  const q = p.preferences;
  return q && validList(q.genders, ['woman', 'man', 'nonbinary', 'other', 'unspecified']) &&
    integer(q.minAge) && integer(q.maxAge) && q.minAge >= 18 && q.maxAge <= 100 && q.minAge <= q.maxAge &&
    validList(q.intentions, ['friendship', 'love']) && validList(q.modes, ['audio', 'video']);
}

function compatible(a, b) {
  const x = a.preferences, y = b.preferences;
  return x.genders.includes(b.gender) && y.genders.includes(a.gender) &&
    b.age >= x.minAge && b.age <= x.maxAge && a.age >= y.minAge && a.age <= y.maxAge &&
    x.intentions.some(i => y.intentions.includes(i)) && x.modes.some(m => y.modes.includes(m));
}

function edgeSet(pairs) {
  if (!Array.isArray(pairs) || pairs.length > 4950) throw new TypeError('invalid_pair_history');
  const edges = new Set();
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(idOK) || pair[0] === pair[1]) {
      throw new TypeError('invalid_pair_history');
    }
    edges.add(pairKey(...pair));
  }
  return edges;
}

/**
 * Plan one fixed event round from a bounded, authoritative server snapshot.
 * Intentionally supports only the currently specified woman/man balanced format.
 * Preferences, confirmations, sessions, history and time must never come from a request body.
 * A caller must atomically reserve pairs and revalidate presence/rights before using this proposal.
 */
export function planRoomRound(snapshot) {
  const {eventId, opensAt, closesAt, capacity, roundIndex, now, participants, seenPairs, blockedPairs} = snapshot;
  if (!idOK(eventId) || ![20, 50, 100].includes(capacity) || !integer(opensAt) || !integer(closesAt) ||
      closesAt <= opensAt || !integer(now) || !integer(roundIndex) || roundIndex >= (snapshot.formatVersion===2?capacity/2:10) ||
      !Array.isArray(participants) || participants.length > capacity) throw new TypeError('invalid_round_snapshot');
  const seen = edgeSet(seenPairs), blocked = edgeSet(blockedPairs), ids = new Set();
  for (const p of participants) {
    if (!p || !idOK(p.id) || ids.has(p.id) || !Number.isInteger(p.lastMatchedRound) ||
        p.lastMatchedRound < -1 || p.lastMatchedRound >= roundIndex) throw new TypeError('invalid_participant_snapshot');
    ids.add(p.id);
  }
  const duration=snapshot.formatVersion===2?RoomFormat.get(capacity).roundSeconds*1000:ROUND_MS;
  const startsAt = opensAt + roundIndex * (duration+CHOICE_MS);
  const endsAt = startsAt + duration, choicesEndAt = endsAt + CHOICE_MS;
  if (![startsAt, endsAt, choicesEndAt].every(integer)) throw new TypeError('invalid_round_snapshot');
  const base = {eventId, roundIndex, startsAt, endsAt, choicesEndAt, pairs: [], waiting: [], excluded: []};
  // No partial final round, late catch-up round, or retry extending the original clock.
  if (choicesEndAt > closesAt) return {...base, status: 'event_finished'};
  if (now < startsAt) return {...base, status: 'not_started'};
  if (now >= startsAt + 10_000) return {...base, status: 'boundary_missed'};
  const eligible = [];
  for (const p of participants) {
    const ready = p.active === true && p.confirmed === true && p.sessionActive === true &&
      p.preferencesConfirmed === true && ['woman', 'man'].includes(p.gender) &&
      integer(p.age) && p.age >= 18 && p.age <= 100 && preferencesValid(p) &&
      integer(p.checkedInAt) && p.checkedInAt <= now && now - p.checkedInAt <= PRESENCE_TTL_MS &&
      integer(p.unavailableUntil) && p.unavailableUntil <= now;
    (ready ? eligible : base.excluded).push(ready ? p : p.id);
  }
  // Stable ordering, oldest previous round first. This is a tie-break, not a fairness guarantee.
  const priority = (a, b) => a.lastMatchedRound - b.lastMatchedRound || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const left = eligible.filter(p => p.gender === 'woman').sort(priority);
  const right = eligible.filter(p => p.gender === 'man').sort(priority);
  const allowed = (a, b) => compatible(a, b) && !blocked.has(pairKey(a.id, b.id)) && !seen.has(pairKey(a.id, b.id));
  const graph = left.map(a => right.flatMap((b, i) => allowed(a, b) ? [i] : []));
  const owner = new Map();
  // Augmenting paths give maximum cardinality; greedy first-fit can strand a compatible pair.
  function augment(i, visited) {
    for (const j of graph[i]) {
      if (visited.has(j)) continue;
      visited.add(j);
      if (!owner.has(j) || augment(owner.get(j), visited)) { owner.set(j, i); return true; }
    }
    return false;
  }
  left.forEach((_, i) => augment(i, new Set()));
  const matched = new Set();
  for (const [j, i] of [...owner].sort((a, b) => a[1] - b[1])) {
    const a = left[i], b = right[j];
    matched.add(a.id); matched.add(b.id);
    base.pairs.push({members: [a.id, b.id].sort(), mode: a.preferences.modes.includes('video') && b.preferences.modes.includes('video') ? 'video' : 'audio'});
  }
  for (const p of eligible.sort(priority)) {
    if (matched.has(p.id)) continue;
    const peers = eligible.filter(q => q.gender !== p.gender && compatible(p, q) && !blocked.has(pairKey(p.id, q.id)));
    const reason = peers.length === 0 ? 'no_compatible_presence' : peers.every(q => seen.has(pairKey(p.id, q.id))) ? 'all_met' : 'waiting_for_pair';
    base.waiting.push({id: p.id, reason});
  }
  base.excluded.sort();
  return {...base, status: 'proposed'};
}
