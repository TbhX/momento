// Synthetic subjects, in-memory database; no connection string or external input.
import assert from 'node:assert/strict';
import {createSupabaseFixture} from '../../tests/helpers/supabase-fixture.mjs';
import {A,B,fixture,actor,action,state} from '../../tests/helpers/readiness-pair.mjs';

const db = await createSupabaseFixture();
try {
  await fixture(db);
  await action(db, 'prepare', 'audio');
  await actor(db, B);
  assert.equal((await action(db, 'prepare', 'audio')).state, 'ready');
  await actor(db, A);
  assert.equal((await action(db, 'leave')).state, 'closed');
  await actor(db, B);
  const peer = await state(db);
  assert.equal(peer.state, 'ended');
  assert.equal(peer.mediaEnabled, false);
  for (const member of [A, B]) {
    await actor(db, member);
    assert.deepEqual(await action(db, 'prepare', 'audio'), peer);
    assert.deepEqual(await action(db, 'heartbeat'), peer);
  }
  console.log(JSON.stringify(peer));
} finally {
  await db.close();
}
