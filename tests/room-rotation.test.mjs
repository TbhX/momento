import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planRoomRound, ROUND_MS, CHOICE_MS, PRESENCE_TTL_MS} from '../src/domain/room-rotation.mjs';

const start = 1_800_000_000_000, slot = ROUND_MS + CHOICE_MS;
const person = (id, gender, patch = {}) => ({id, gender, age: 30, active: true, confirmed: true,
  sessionActive: true, preferencesConfirmed: true, checkedInAt: start, unavailableUntil: 0,
  lastMatchedRound: -1, preferences: {genders: [gender === 'woman' ? 'man' : 'woman'],
    minAge: 18, maxAge: 100, intentions: ['friendship', 'love'], modes: ['audio', 'video']}, ...patch});
const snapshot = (patch = {}) => ({eventId: 'event1', opensAt: start, closesAt: start + 10 * slot,
  capacity: 20, roundIndex: 0, now: start, participants: [person('a', 'woman'), person('b', 'man')],
  seenPairs: [], blockedPairs: [], ...patch});
const key = pair => [...pair].sort().join(':');

test('rounds keep the fixed event clock and never start early, late or partially at event end', () => {
  assert.equal(planRoomRound(snapshot({now: start - 1})).status, 'not_started');
  assert.equal(planRoomRound(snapshot({now: start + 10_000})).status, 'boundary_missed');
  assert.equal(planRoomRound(snapshot({closesAt: start + slot - 1})).status, 'event_finished');
  const p = planRoomRound(snapshot({now: start + 9999}));
  assert.equal(p.startsAt, start); assert.equal(p.endsAt, start + ROUND_MS);
  assert.equal(p.choicesEndAt, start + slot); assert.equal(p.pairs.length, 1);
  assert.deepEqual(planRoomRound(snapshot()), planRoomRound(snapshot()));
});

test('incomplete preferences, absence, revoked sessions, suspension and private calls exclude participants', () => {
  for (const patch of [{active: false}, {confirmed: false}, {sessionActive: false}, {preferencesConfirmed: false},
    {checkedInAt: start - PRESENCE_TTL_MS - 1}, {checkedInAt: start + 1}, {unavailableUntil: start + 1},
    {gender: 'nonbinary'}, {age: 17}, {preferences: null}, {preferences: {}}]) {
    const p = planRoomRound(snapshot({participants: [person('a', 'woman', patch), person('b', 'man')]}));
    assert.equal(p.pairs.length, 0, JSON.stringify(patch)); assert.deepEqual(p.excluded, ['a']);
  }
  assert.equal(planRoomRound(snapshot({participants: [person('a', 'woman', {checkedInAt: start - PRESENCE_TTL_MS}), person('b', 'man')]})).pairs.length, 1);
});

test('gender, age, intention and media choices must be compatible in both directions', () => {
  const a = person('a', 'woman'), b = person('b', 'man');
  for (const change of [{genders: ['man']}, {minAge: 31}, {maxAge: 29}, {intentions: ['love'], modes: ['audio']}]) {
    const aa = structuredClone(a), bb = structuredClone(b);
    if (change.intentions) { aa.preferences.intentions = ['friendship']; aa.preferences.modes = ['video']; }
    Object.assign(bb.preferences, change);
    assert.equal(planRoomRound(snapshot({participants: [aa, bb]})).pairs.length, 0);
  }
  b.preferences.modes = ['audio'];
  assert.equal(planRoomRound(snapshot({participants: [a, b]})).pairs[0].mode, 'audio');
});

test('blocks and encounter history are symmetric; changing preferences does not erase history', () => {
  for (const field of ['seenPairs', 'blockedPairs']) for (const pair of [['a', 'b'], ['b', 'a']]) {
    const p = planRoomRound(snapshot({[field]: [pair]})); assert.equal(p.pairs.length, 0);
    assert.equal(p.waiting[0].reason, field === 'seenPairs' ? 'all_met' : 'no_compatible_presence');
  }
});

test('maximum matching handles the case where greedy assignment would lose a meeting', () => {
  const p = planRoomRound(snapshot({participants: [person('a', 'woman'), person('b', 'woman'), person('c', 'man'), person('d', 'man')], blockedPairs: [['b', 'd']]}));
  assert.deepEqual(p.pairs.map(x => key(x.members)).sort(), ['a:d', 'b:c']);
});

test('all 512 three-by-three graphs agree with an independent exhaustive matching oracle', () => {
  function oracle(edges, i = 0, used = new Set()) {
    if (i === 3) return 0;
    let best = oracle(edges, i + 1, used);
    for (let j = 0; j < 3; j++) if (edges[i][j] && !used.has(j)) {
      best = Math.max(best, 1 + oracle(edges, i + 1, new Set([...used, j])));
    }
    return best;
  }
  const participants = [0, 1, 2].flatMap(i => [person('w' + i, 'woman'), person('m' + i, 'man')]);
  for (let mask = 0; mask < 512; mask++) {
    const edges = Array.from({length: 3}, (_, i) => Array.from({length: 3}, (_, j) => Boolean(mask & (1 << (3 * i + j)))));
    const blockedPairs = edges.flatMap((row, i) => row.flatMap((allowed, j) => allowed ? [] : [['w' + i, 'm' + j]]));
    const result = planRoomRound(snapshot({participants, blockedPairs}));
    assert.equal(result.pairs.length, oracle(edges), 'graph ' + mask);
    assert.equal(new Set(result.pairs.flatMap(p => p.members)).size, result.pairs.length * 2);
    for (const p of result.pairs) assert.ok(!blockedPairs.some(b => key(b) === key(p.members)));
  }
});

for (const capacity of [20, 50, 100]) test(capacity + ' participants rotate ten times without repeats or double assignment', () => {
  const participants = Array.from({length: capacity}, (_, i) => person('p' + String(i).padStart(3, '0'), i < capacity / 2 ? 'woman' : 'man'));
  const history = [], seen = new Set();
  for (let roundIndex = 0; roundIndex < 10; roundIndex++) {
    const now = start + roundIndex * slot;
    participants.forEach(p => p.checkedInAt = now);
    const input = snapshot({capacity, participants, roundIndex, now, seenPairs: history});
    const before = structuredClone(input), result = planRoomRound(input);
    assert.deepEqual(input, before, 'no mutation of authoritative snapshot');
    assert.equal(result.pairs.length, capacity / 2);
    assert.equal(new Set(result.pairs.flatMap(p => p.members)).size, capacity);
    assert.deepEqual(result, planRoomRound({...input, participants: [...participants].reverse(), seenPairs: [...history].reverse()}));
    for (const p of result.pairs) {
      assert.ok(!seen.has(key(p.members))); seen.add(key(p.members)); history.push(p.members);
    }
    participants.forEach(p => p.lastMatchedRound = roundIndex);
  }
});

test('a departure and a return preserve the pair history and the event end', () => {
  const participants = [person('a', 'woman'), person('b', 'man'), person('c', 'man')];
  const first = planRoomRound(snapshot({participants}));
  const partner = first.pairs[0].members.find(id => id !== 'a');
  participants.find(p => p.id === partner).active = false;
  let now = start + slot;
  participants.forEach(p => p.checkedInAt = now);
  const second = planRoomRound(snapshot({participants, roundIndex: 1, now, seenPairs: first.pairs.map(p => p.members)}));
  assert.equal(second.pairs.length, 1); assert.ok(!second.pairs[0].members.includes(partner));
  participants.find(p => p.id === partner).active = true;
  now += slot; participants.forEach(p => p.checkedInAt = now);
  const third = planRoomRound(snapshot({participants, roundIndex: 2, now, seenPairs: [...first.pairs, ...second.pairs].map(p => p.members)}));
  assert.equal(third.pairs.length, 0); assert.equal(third.waiting.find(p => p.id === 'a').reason, 'all_met');
});

test('waiting priority is deterministic with unequal attendance and reports waiting separately from exhaustion', () => {
  const participants = [person('old', 'woman', {lastMatchedRound: -1}), person('recent', 'woman', {lastMatchedRound: 0}), person('m', 'man')];
  const now = start + slot; participants.forEach(p => p.checkedInAt = now);
  const result = planRoomRound(snapshot({roundIndex: 1, now, participants}));
  assert.deepEqual(result.pairs[0].members, ['m', 'old']);
  assert.deepEqual(result.waiting, [{id: 'recent', reason: 'waiting_for_pair'}]);
});

test('invalid, duplicate, oversize or ambiguous snapshots fail closed', () => {
  for (const patch of [{capacity: 21}, {roundIndex: 10}, {roundIndex: -1}, {now: NaN}, {opensAt: Number.MAX_SAFE_INTEGER},
    {participants: Array.from({length: 21}, (_, i) => person('p' + i, 'woman'))},
    {participants: [person('a', 'woman'), person('a', 'man')]}, {seenPairs: [['a', 'a']]},
    {blockedPairs: [['a']]}, {seenPairs: null}, {participants: [person('a', 'woman', {lastMatchedRound: 0})]}]) {
    assert.throws(() => planRoomRound(snapshot(patch)), TypeError, JSON.stringify(patch));
  }
});

test('proposals contain no profile, session, wallet or media authority', () => {
  const result = planRoomRound(snapshot());
  assert.deepEqual(Object.keys(result.pairs[0]).sort(), ['members', 'mode']);
  assert.ok(!JSON.stringify(result).match(/session|credit|premium|token|preferences/));
});
