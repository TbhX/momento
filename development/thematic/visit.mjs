// Isolated scheduler read model. Never expose this trusted lookup as a member API.
// One backing room spans multiple hours. The hourly label does not own the visit.
import {themeWindow} from './rotation.mjs';

export async function readThematicVisit(db,{entryId,roomId,now}) {
 if(!Number.isSafeInteger(now)||now<0||now>8640000000000000)throw new TypeError('invalid_visit_clock');
 const at=new Date(now);
 const {rows}=await db.query(`with present as (
   select n.id,n.user_id,n.created_at,r.theme_slug from public.rooms r
   join public.room_presence p on p.room_id=r.id and p.active and p.expires_at>$3
   join public.room_entries n on (n.id,n.user_id,n.room_id)=(p.entry_id,p.user_id,p.room_id)
   join public.profiles u on u.id=n.user_id and u.status='active'
   where r.id=$2 and r.status in ('published','live') and r.opens_at<=$3 and r.closes_at>$3
   and n.created_at<=$3 and not exists (select 1 from private.hosted_rooms h where h.room_id=r.id)
 ), visits as (
   select p.*,e.id as encounter,e.ends_at from present p left join lateral (
     select e.id,e.ends_at from public.encounters e
     join private.introduced_pairs i on i.first_encounter=e.id
     where e.room_id=$2 and p.user_id in(e.user_a,e.user_b) and e.status='live'
     and e.starts_at>=p.created_at and e.starts_at<=$3 and e.ends_at>$3
     order by e.starts_at desc,e.id limit 1
   ) e on true
 ), queued as (
   select id,row_number() over(order by created_at,id) as position from visits where encounter is null
 )
 select v.id,v.theme_slug,v.encounter,v.ends_at,q.position from visits v left join queued q using(id) where v.id=$1`,
 [entryId,roomId,at]);
 const v=rows[0];if(!v)return null;
 return {entryId:v.id,window:themeWindow(v.theme_slug,now),encounterId:v.encounter,
  endsAt:v.ends_at?new Date(v.ends_at).getTime():null,queuePosition:v.position===null?null:Number(v.position)};
}
