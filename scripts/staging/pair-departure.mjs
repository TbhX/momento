// Synthetic subjects, in-memory database; no connection string or external input.
import assert from 'node:assert/strict';
import {createSupabaseFixture} from '../../tests/helpers/supabase-fixture.mjs';
import {A,B,CALL,fixture,actor,action,state,own,rpc} from '../../tests/helpers/readiness-pair.mjs';

const scenario = process.argv[2] ?? 'leave';
assert.ok(['leave', 'block', 'expiry'].includes(scenario));
const db = await createSupabaseFixture();
try {
  await fixture(db);
  await action(db, 'prepare', 'audio');
  await actor(db, B);
  assert.equal((await action(db, 'prepare', 'audio')).state, 'ready');
  await actor(db, A);
  if (scenario === 'leave') {
    assert.equal((await action(db, 'leave')).state, 'closed');
  } else if (scenario === 'block') {
    await rpc(db, 'block_peer', [B, null]);
  } else {
    // Shorten the local test round, then let the database clock cross its end.
    await own(db);
    await db.query("update public.encounters set ends_at=clock_timestamp()+interval '1 second' where id=$1", [CALL]);
    await actor(db, A);
    assert.equal((await state(db)).state, 'ready');
    await db.exec('select pg_sleep(1.1)');
  }
  await actor(db, B);
  const peer = await state(db);
  assert.equal(peer.state, scenario === 'block' ? 'unavailable' : 'ended');
  assert.equal(peer.mediaEnabled, false);
  for (const member of [A, B]) {
    await actor(db, member);
    assert.deepEqual(await action(db, 'prepare', 'audio'), peer);
    assert.deepEqual(await action(db, 'heartbeat'), peer);
  }
  console.log(JSON.stringify({encounterId: CALL, ...peer}));
} finally {
  await db.close();
}
