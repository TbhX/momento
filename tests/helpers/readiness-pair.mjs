import assert from 'node:assert/strict';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),A=id(1),B=id(2),C=id(3),ROOM=id(10),CALL=id(20);
const scalar=async(db,sql,args=[])=>Object.values((await db.query(sql,args)).rows[0]??{})[0];
const rpc=(db,fn,args=[])=>scalar(db,'select public.'+fn+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args);
async function actor(db,user=A,aal='aal1',session=user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,session_id:session,aal,user_metadata:{admin:true,premium:true}})]);await db.exec('set local role authenticated');}
const own=db=>db.exec('reset role');const state=db=>rpc(db,'call_readiness_state',[CALL]);const action=(db,type='prepare',mode=type==='prepare'?'video':null)=>rpc(db,'call_readiness_action',[CALL,type,mode]);
async function denied(db,fn,pattern){await db.exec('savepoint denied');try{await assert.rejects(fn,pattern)}finally{await db.exec('rollback to savepoint denied;release savepoint denied')}}
async function fixture(db){await db.exec('begin');await db.exec(`insert into auth.users(id) values('${A}'),('${B}'),('${C}');insert into auth.sessions(id,user_id) select id,id from auth.users;
insert into public.profiles(id,display_name,age,city,terms_version,privacy_version) select id,'Fixture',28,'Paris','test','test' from auth.users;
update private.runtime_settings set admissions_enabled=true;update private.call_readiness_settings set enabled=true;
insert into public.rooms(id,title,opens_at,closes_at,status) values('${ROOM}','Local',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour','live');
insert into public.room_entries(id,user_id,room_id,request_id,quota_day,admission_type,media_mode) select id,id,'${ROOM}',id,current_date,'free','video' from auth.users where id in ('${A}','${B}');
insert into public.room_presence(user_id,room_id,entry_id,expires_at) select id,'${ROOM}',id,clock_timestamp()+interval '2 minutes' from auth.users where id in ('${A}','${B}');
insert into public.encounters(id,room_id,round_number,user_a,user_b,starts_at,ends_at,status) values('${CALL}','${ROOM}',0,'${A}','${B}',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '4 minutes','live');`);await actor(db);}
export {id, A, B, C, ROOM, CALL, scalar, rpc, actor, own, state, action, denied, fixture};
