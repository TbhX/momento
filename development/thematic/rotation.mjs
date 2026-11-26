// Development adapter only. db must be an isolated, trusted scheduling connection.
import {planRoomRound} from '../../src/domain/room-rotation.mjs';

const themes=new Set(['music','nearby','culture','travel','astrology','sport','profession','random']);
export function themeWindow(theme, now) {
 if(!themes.has(theme)||!Number.isSafeInteger(now)||now<0)throw new TypeError('invalid_thematic_window');
 const opensAt=now-now%3600000,closesAt=opensAt+3600000;
 if(!Number.isSafeInteger(closesAt))throw new TypeError('invalid_thematic_window');
 return {theme,opensAt,closesAt,key:theme+':'+opensAt};
}

// Caller records an independently verified start, never a proposal, join, or client click.
// Run in the same transaction as the trusted start acknowledgement; a rejected claim
// must not start a second call. No production transport currently supplies this event.
export async function recordVerifiedStart(db, encounterId) {
 const {rows}=await db.query(`insert into private.introduced_pairs(user_a,user_b,first_encounter)
 select user_a,user_b,id from public.encounters where id=$1 and status='live'
 and starts_at<=clock_timestamp() and ends_at>clock_timestamp()
 on conflict(user_a,user_b) do nothing returning first_encounter`,[encounterId]);
 if(rows.length)return 'recorded';
 const retry=await db.query('select 1 from private.introduced_pairs where first_encounter=$1',[encounterId]);
 return retry.rows.length?'already_recorded':'refused';
}

export async function planWithIntroductionHistory(db,snapshot){
 const participants=snapshot.participants;
 if(!Array.isArray(participants)||participants.length>100)throw new TypeError('invalid_participant_snapshot');
 const ids=participants.map(p=>p.id);
 const {rows}=await db.query('select user_a,user_b from private.introduced_pairs where user_a=any($1::uuid[]) and user_b=any($1::uuid[])',[ids]);
 // Merge event reservations and global introductions without exceeding the kernel's
 // maximum of 4,950 distinct, in-roster unordered pairs for 100 participants.
 if(!Array.isArray(snapshot.seenPairs)||snapshot.seenPairs.length>4950)throw new TypeError('invalid_pair_history');
 const pairs=new Map();
 for(const p of [...snapshot.seenPairs,...rows.map(r=>[r.user_a,r.user_b])]){
  if(!Array.isArray(p)||p.length!==2||p.some(id=>typeof id!=='string')||p[0]===p[1])throw new TypeError('invalid_pair_history');
  pairs.set(JSON.stringify([...p].sort()),p);
 }
 return planRoomRound({...snapshot,seenPairs:[...pairs.values()]});
}
