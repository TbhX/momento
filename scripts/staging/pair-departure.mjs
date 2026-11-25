// Synthetic subjects, in-memory database; no connection string or external input.
import {createInterface} from 'node:readline';
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
  const commands = createInterface({input: process.stdin});
  console.log('initialized');
  let sampledReady = false;
  try {
    for await (const command of commands) {
      if (command === 'trigger') {
        assert.ok(sampledReady);
        await actor(db, A);
        if (scenario === 'leave') await action(db, 'leave');
        else if (scenario === 'block') await rpc(db, 'block_peer', [B, null]);
        else {
          await own(db);
          await db.query("update public.encounters set ends_at=clock_timestamp()+interval '1 second' where id=$1", [CALL]);
        }
        continue;
      }
      assert.equal(command, 'read');
      await actor(db, B);
      const peer = await state(db);
      console.log(JSON.stringify({encounterId: CALL, ...peer}));
      if (peer.state === 'ready') {
        sampledReady = true;
        continue;
      }
      assert.ok(sampledReady);
      assert.equal(peer.state, scenario === 'block' ? 'unavailable' : 'ended');
      assert.equal(peer.mediaEnabled, false);
      for (const member of [A, B]) {
        await actor(db, member);
        assert.deepEqual(await action(db, 'prepare', 'audio'), peer);
        assert.deepEqual(await action(db, 'heartbeat'), peer);
      }
      break;
    }
  } finally { commands.close(); process.stdin.destroy(); }
} finally {
  await db.close();
}
