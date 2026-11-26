// Synthetic subjects, in-memory database; no connection string or external input.
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {recordVerifiedStart} from '../../development/thematic/rotation.mjs';
import {readThematicVisit} from '../../development/thematic/visit.mjs';
import assert from 'node:assert/strict';
import {createSupabaseFixture} from '../../tests/helpers/supabase-fixture.mjs';
import {A,B,ROOM,CALL,fixture,actor,action,state,own,rpc} from '../../tests/helpers/readiness-pair.mjs';

const scenario = process.argv[2] ?? 'leave';
assert.ok(['leave', 'block', 'expiry', 'presence'].includes(scenario));
const db = await createSupabaseFixture();
try {
  await fixture(db);
  await action(db, 'prepare', 'audio');
  await actor(db, B);
  assert.equal((await action(db, 'prepare', 'audio')).state, 'ready');
  if (scenario === 'presence') {
    await own(db);
    await db.exec(await readFile(new URL('../../development/thematic/introduced-pairs.sql', import.meta.url), 'utf8'));
    await db.query("update public.rooms set theme_slug='music' where id=$1", [ROOM]);
    await db.query("update public.room_entries set created_at=clock_timestamp()-interval '2 minutes' where room_id=$1", [ROOM]);
    assert.equal(await recordVerifiedStart(db, CALL), 'recorded');
  }
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
        else if (scenario === 'presence') {
          await own(db);
          await db.query('update public.room_presence set expires_at=clock_timestamp() where user_id=$1', [A]);
        } else {
          await own(db);
          await db.query("update public.encounters set ends_at=clock_timestamp()+interval '1 second' where id=$1", [CALL]);
        }
        continue;
      }
      assert.equal(command, 'read');
      await actor(db, B);
      const peer = await state(db);
      if (scenario === 'presence') {
        await own(db);
        const visit = await readThematicVisit(db, {entryId:B, roomId:ROOM, now:Date.now()});
        assert.ok(visit, 'the remaining participant keeps their visit');
        if (!visit.encounterId) {
          assert.ok(sampledReady);
          assert.equal(visit.queuePosition, 1);
          console.log(JSON.stringify({encounterId: CALL, state: 'queued', bothReady: false}));
          break;
        }
        assert.equal(visit.encounterId, CALL);
      }
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
