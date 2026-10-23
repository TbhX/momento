/* Guided rehearsal only. Real consent, clocks and entitlements must be enforced by the server. */
(function(root){
 const ids=Array.from({length:19},(_,i)=>'demo-'+i),actions=['continue','friend','date'];
 const MINUTE=60000,ROUND=5*MINUTE,DECISION=30000,EXTRA=3*MINUTE,PRIVATE=15*MINUTE;
 const valid=id=>ids.includes(id);
 function create(){return{version:1,personId:ids[0],phase:'preview',round:1,endsAt:0,decideUntil:0,sequence:0,records:{},blocked:[]}}
 function record(s,id=s.personId){return s.records[id]||(s.records[id]={mine:null,theirs:null,unlocked:false,friend:false,extended:false,requests:{}})}
 function matched(s,id=s.personId){const r=s.records[id];return valid(id)&&!s.blocked.includes(id)&&r?.mine===true&&r?.theirs===true}
 function clean(raw){const s=create();if(raw?.version!==1)return s;s.personId=valid(raw.personId)?raw.personId:ids[0];s.sequence=Number.isSafeInteger(raw.sequence)&&raw.sequence>=0?raw.sequence:0;s.blocked=[...new Set((Array.isArray(raw.blocked)?raw.blocked:[]).filter(valid))];
  for(const id of ids){const r=raw.records?.[id];if(!r||s.blocked.includes(id))continue;const out=record(s,id);out.mine=typeof r.mine==='boolean'?r.mine:null;out.theirs=typeof r.theirs==='boolean'?r.theirs:null;out.unlocked=r.unlocked===true;out.friend=out.unlocked&&r.friend===true;out.extended=out.unlocked&&r.extended===true;
   for(const action of actions){const q=r.requests?.[action];if(q&&Number.isSafeInteger(q.token)&&q.token>0&&['pending','accepted','declined','cancelled','done'].includes(q.status)){out.requests[action]={token:q.token,status:['pending','accepted'].includes(q.status)?'cancelled':q.status};s.sequence=Math.max(s.sequence,q.token)}}
  }return s;
 }
 function start(s,now){if(s.phase!=='preview'||s.blocked.includes(s.personId))return false;s.phase='date';s.endsAt=now+ROUND;s.decideUntil=s.endsAt+DECISION;record(s);return true}
 function cancelRequests(s){const r=s.records[s.personId];if(!r)return;for(const q of Object.values(r.requests))if(['pending','accepted'].includes(q.status))q.status='cancelled'}
 function next(s,now){cancelRequests(s);const i=ids.indexOf(s.personId),nextId=Array.from({length:ids.length},(_,j)=>ids[(i+j+1)%ids.length]).find(id=>!s.blocked.includes(id));if(!nextId){s.phase='ended';return false}s.personId=nextId;s.round++;s.phase='date';s.endsAt=now+ROUND;s.decideUntil=s.endsAt+DECISION;record(s);return true}
 function tick(s,now){if(s.phase==='date'&&now>=s.endsAt)s.phase='vote';if(s.phase==='vote'&&now>=s.decideUntil)next(s,now);else if(['private','continued'].includes(s.phase)&&now>=s.endsAt){cancelRequests(s);s.phase='ended'}return s.phase}
 function timing(s,now){const active=['date','vote','private','continued'].includes(s.phase),deadline=s.phase==='vote'?s.decideUntil:s.endsAt,duration=s.phase==='vote'?DECISION:s.phase==='private'?PRIVATE:s.phase==='continued'?EXTRA:ROUND,remaining=active?Math.max(0,Math.ceil((deadline-now)/1000)):0,stage=s.phase==='preview'?'preview':s.phase==='ended'?'ended':s.phase==='vote'?'choice':remaining<=30?'last':remaining<=60?'soon':'calm';return{remaining,stage,progress:active?Math.max(0,Math.min(1,(deadline-now)/duration)):0,cycle:s.personId+':'+s.round+':'+(['private','continued'].includes(s.phase)?s.phase:s.phase==='ended'?'ended':'round')}}
 function like(s,value,now){if(!['date','vote','private','continued'].includes(s.phase)||now>=s.decideUntil&&!['private','continued'].includes(s.phase)||s.blocked.includes(s.personId))return false;const r=record(s);r.mine=value===true;if(!matched(s))cancelRequests(s);return true}
 function peerLike(s,value,now){if(!['date','vote','private','continued'].includes(s.phase)||now>=s.decideUntil&&!['private','continued'].includes(s.phase)||s.blocked.includes(s.personId))return false;record(s).theirs=value===true;if(!matched(s))cancelRequests(s);return true}
 function request(s,action,now){if(!actions.includes(action)||!matched(s))return{error:'Un match réciproque est nécessaire.'};const r=record(s);
  if(action==='continue'&&(r.extended||!['date','vote'].includes(s.phase)||now>=s.decideUntil))return{error:'Cette prolongation n’est plus disponible.'};
  if(action==='date'&&!r.friend)return{error:'Ajoutez-vous en amis après accord réciproque.'};
  if(action==='friend'&&r.friend)return{ok:true,done:true};
  const previous=r.requests[action];if(previous&&(['pending','accepted'].includes(previous.status)||previous.status==='done'&&(action!=='date'||s.phase==='private')))return{ok:true,request:previous};
  const q={token:++s.sequence,status:'pending'};r.requests[action]=q;return{ok:true,request:q};
 }
 function reply(s,action,token,accepted){const q=record(s).requests[action];if(!matched(s)||!q||q.token!==token||q.status!=='pending')return false;q.status=accepted?'accepted':'declined';return true}
 function cancel(s,action,token){const q=record(s).requests[action];if(!q||q.token!==token||!['pending','accepted'].includes(q.status))return false;q.status='cancelled';return true}
 function cost(s,action,premium=false){return premium||action!=='date'&&record(s).unlocked?0:1}
 function commit(s,action,token,wallet,{premium=false,bothPresent=false,confirmed=false,now=Date.now()}={}){
  if(!actions.includes(action))return{error:'Action indisponible.'};const r=record(s),q=r.requests[action];if(!matched(s)||!q||q.token!==token)return{error:'Cette demande n’est plus disponible.'};if(q.status==='done')return{ok:true,duplicate:true};if(q.status!=='accepted')return{error:'L’accord de l’autre personne est nécessaire.'};if(!confirmed)return{error:'Confirmez le coût et votre accord avant de continuer.'};
  if(action==='continue'&&(r.extended||!['date','vote'].includes(s.phase)||now>=s.decideUntil))return{error:'Cette prolongation n’est plus disponible.'};
  if(action==='date'&&!r.friend)return{error:'Le lien ami doit être confirmé avant ce rendez-vous.'};
  if(action!=='friend'&&!bothPresent)return{error:'Les deux personnes doivent être présentes et d’accord.'};
  const needed=cost(s,action,premium);if(needed&&(!Number.isSafeInteger(wallet?.videoCredits)||wallet.videoCredits<1))return{creditRequired:true};
  if(needed)wallet.videoCredits--;q.status='done';if(action!=='date')r.unlocked=true;
  if(action==='friend')r.friend=true;
  if(action==='continue'){r.extended=true;s.endsAt=now+EXTRA;s.decideUntil=s.endsAt;s.phase='continued'}
  if(action==='date'){s.phase='private';s.endsAt=now+PRIVATE;s.decideUntil=s.endsAt}
  return{ok:true,consumed:needed};
 }
 function swipe(s,direction,now){if(!['date','vote','private','continued'].includes(s.phase)||!['like','pass'].includes(direction))return false;if(direction==='like')like(s,true,now);return next(s,now)}
 function block(s,id,now){if(!valid(id))return false;if(!s.blocked.includes(id))s.blocked.push(id);delete s.records[id];if(s.personId===id)next(s,now);return true}
 const api={ROUND,DECISION,EXTRA,PRIVATE,create,clean,record,matched,start,next,tick,timing,like,peerLike,request,reply,cancel,cost,commit,swipe,block};if(typeof module!=='undefined')module.exports=api;else root.MomentoConversation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
