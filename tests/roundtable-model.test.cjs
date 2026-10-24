const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/client/conversation-model.js'),S=require('../src/client/salon-model.js');
test('roundtable pools use explicit fictional genders and never revisit or escape the chosen pool',()=>{
 const pool=S.people.filter(p=>p.gender==='woman').map(p=>p.id),s=C.create();s.blocked=[pool[1]];
 assert.equal(C.configureParticipants(s,[...pool,pool[0],'forged']),true);assert.equal(s.participants.length,pool.length-1);C.start(s,0);
 const seen=[s.personId];assert.equal(C.next(s,1,'demo-1'),false);assert.equal(C.next(s,1,s.personId),false);
 while(C.next(s,1000*seen.length)){assert.ok(pool.includes(s.personId));assert.equal(seen.includes(s.personId),false);seen.push(s.personId)}
 assert.equal(s.phase,'ended');assert.equal(seen.length,pool.length-1);assert.equal(C.next(s,999999),false);assert.equal(C.clean(s).participants,undefined);
});
test('roundtable caps a rotation at ten, ends pending choices and preserves a fresh five-minute turn',()=>{
 const s=C.create();assert.equal(C.configureParticipants(s,[]),false);assert.equal(s.participants,undefined);C.configureParticipants(s,S.people.map(p=>p.id),100);assert.equal(s.roundLimit,10);C.start(s,0);
 for(let n=1;n<10;n++){assert.equal(C.next(s,n*1000),true);assert.equal(s.endsAt,n*1000+C.ROUND)}
 C.record(s).requests.friend={status:'pending',token:1};C.tick(s,s.decideUntil);assert.equal(s.phase,'ended');assert.equal(C.record(s).requests.friend.status,'cancelled');assert.equal(s.seen.length,10);
});
