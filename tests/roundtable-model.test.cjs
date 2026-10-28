const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/client/conversation-model.js'),S=require('../src/client/salon-model.js');
test('roundtable pools use explicit fictional genders and never revisit or escape the chosen pool',()=>{
 const pool=S.people.filter(p=>p.gender==='woman').map(p=>p.id),s=C.create();s.blocked=[pool[1]];
 assert.equal(C.configureParticipants(s,[...pool,pool[0],'forged'],50),true);assert.equal(s.participants.length,pool.length-1);C.start(s,0);
 const seen=[s.personId];assert.equal(C.next(s,1,'demo-1'),false);assert.equal(C.next(s,1,s.personId),false);
 while(C.next(s,1000*seen.length)){assert.ok(pool.includes(s.personId));assert.equal(seen.includes(s.personId),false);seen.push(s.personId)}
 assert.equal(s.phase,'ended');assert.equal(seen.length,pool.length-1);assert.equal(C.next(s,999999),false);assert.equal(C.clean(s).participants,undefined);
});
test('roundtable caps a rotation at ten, ends pending choices and preserves a fresh five-minute turn',()=>{
 const s=C.create();assert.equal(C.configureParticipants(s,[]),false);assert.equal(s.participants,undefined);C.configureParticipants(s,S.people.map(p=>p.id),10);assert.equal(s.roundLimit,10);C.start(s,0);
 for(let n=1;n<10;n++){assert.equal(C.next(s,n*1000),true);assert.equal(s.endsAt,n*1000+C.ROUND)}
 C.record(s).requests.friend={status:'pending',token:1};C.tick(s,s.decideUntil);assert.equal(s.phase,'ended');assert.equal(C.record(s).requests.friend.status,'cancelled');assert.equal(s.seen.length,10);
});
test('event schedules and encountered IDs survive cleaning; new events have separate history',()=>{
 const s=S.create(),now=Date.parse('2026-10-24T19:02:00Z'),event=S.tableEvent(s,'demo:music:2026-10-24',now);assert.equal(event.opensAt,Date.parse('2026-10-24T19:15:00Z'));assert.equal(event.closesAt,event.opensAt+60*60000);assert.equal(S.markTableMet(s,'demo:music:2026-10-24','demo-0'),true);assert.equal(S.markTableMet(s,'demo:music:2026-10-24','demo-0'),false);assert.equal(S.markTableMet(s,'demo:music:2026-10-24','forged'),false);
 const restored=S.clean(JSON.parse(JSON.stringify(s)));assert.equal(S.tableEvent(restored,'demo:music:2026-10-24',now+500000).opensAt,event.opensAt);assert.deepEqual(restored.tableEvents['demo:music:2026-10-24'].met,['demo-0']);assert.deepEqual(S.tableEvent(restored,'demo:other:2026-10-24',now).met,[]);assert.deepEqual(S.cleanTableEvents({bad:{opensAt:0,closesAt:Infinity,met:['forged']}}),{});
});

test('a scheduled table never creates a partial five-minute meeting at the event boundary',()=>{const s=C.create();C.configureParticipants(s,['demo-0','demo-1']);s.windowEndsAt=400000;C.start(s,0);C.record(s).requests.friend={token:1,status:'pending'};assert.equal(C.next(s,100000),false);assert.equal(s.phase,'ended');assert.equal(s.personId,'demo-0');assert.equal(C.record(s).requests.friend.status,'cancelled')});

test('larger explicit round limits remain bounded by available fictional people',()=>{const s=C.create();C.configureParticipants(s,S.people.map(p=>p.id),100);assert.equal(s.roundLimit,Math.min(50,S.people.length));assert.equal(C.configureParticipants(C.create(),S.people.map(p=>p.id)),true)});
