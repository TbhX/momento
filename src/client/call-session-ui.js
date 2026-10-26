/* Local rehearsal only. No peer-only votes, persisted recap or server rights. */
function callSessionShouldReview(){const f=callDemoFlow;return !!(f&&callDemoAlive(f)&&!f.exitApproved&&f.summarySeen?.size)}
function callSessionTransition(f){
 if(!callDemoAlive(f))return;callSessionClearTransition(f);
 if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const stage=document.querySelector('#callDemoStage');if(!stage)return;
 const badge=document.createElement('div');badge.className='call-swipe-momento';badge.setAttribute('aria-hidden','true');
 const logo=document.createElement('img');logo.src='/momento-logo.png';logo.alt='';logo.width=2172;logo.height=724;badge.append(logo);stage.append(badge);f.swipeBadge=badge;
 // Visual only: the next person and clock are already updated synchronously.
 f.swipeTimer=setTimeout(()=>callSessionClearTransition(f),340);
}
function callSessionClearTransition(f){if(!f)return;clearTimeout(f.swipeTimer);f.swipeBadge?.remove();f.swipeBadge=null}
function callSessionClear(f){callSessionClearTransition(f);if(f)f.reviewRefresh=null;if(document.querySelector('#modal [data-call-review]')){const dialog=document.querySelector('#modal');dialog.onclose=null;dialog.close();dialog.replaceChildren()}}
function callSessionReview(destination='salon'){
 const f=callDemoFlow;if(!callSessionShouldReview())return;
 callDemoPulse(f,false);callDemoSave(f);callSessionClearTransition(f);
 const returnFocus=document.activeElement;
 modal('<section class="call-review" data-call-review><span class="home-eyebrow">VOTRE MOMENT · ESSAI LOCAL</span><h2 id="callReviewTitle">Avant de se quitter…</h2><p>Un petit retour sur vos échanges. Vos choix restent privés.</p><dl class="call-review-stats"></dl><ul class="call-review-people" aria-label="Vos choix de rencontre"></ul><p class="call-review-credit micro"></p><p class="call-review-empty" hidden>Aucun like pour le moment. Chaque bonjour compte.</p><p class="micro">Les profils et accords de cet essai sont fictifs. Quitter arrête vos appareils et annule les demandes en attente. Une entrée déjà utilisée n’est pas restituée.</p><div class="call-review-actions"><button type="button" class="secondary" data-review-stay>Revenir à l’échange</button><button type="button" class="primary" data-review-leave>Quitter le salon</button></div></section>');
 const dialog=document.querySelector('#modal');dialog.setAttribute('aria-labelledby','callReviewTitle');
 const container=dialog.querySelector('[data-call-review]');let lastSummary='';
 function render(){
  if(!callDemoAlive(f)||!container.isConnected)return;
  const people=MomentoSalon.people.filter(p=>f.summarySeen.has(p.id)&&!f.state.blocked.includes(p.id));
  const liked=people.filter(p=>f.state.records[p.id]?.mine===true),matches=people.filter(p=>MomentoConversation.matched(f.state,p.id));
  const summary=JSON.stringify([people.map(p=>[p.id,p.name,f.state.records[p.id]?.mine,MomentoConversation.matched(f.state,p.id),f.state.records[p.id]?.friend,f.state.records[p.id]?.extended,f.state.records[p.id]?.requests?.date?.status]),MomentoShop.balance(salonState.shop,'videoCredits')]);if(summary===lastSummary)return;lastSummary=summary;
  const stats=container.querySelector('dl');stats.replaceChildren();
  for(const [label,value] of [['Rencontres',people.length],['Likes envoyés',liked.length],['Matchs réciproques',matches.length]]){const cell=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value);cell.append(dd,dt);stats.append(cell)}
  const list=container.querySelector('ul');list.replaceChildren();
  for(const p of liked){const record=f.state.records[p.id],li=document.createElement('li'),name=document.createElement('strong'),status=document.createElement('span');name.textContent=p.name;const mutual=MomentoConversation.matched(f.state,p.id);status.textContent=mutual?[record.friend?'Amis':'Match réciproque',record.extended?'Prolongation acceptée':'',record.requests?.date?.status==='done'?'Second rendez-vous accepté':''].filter(Boolean).join(' · '):'Like envoyé · choix privé';li.append(name,status);list.append(li)}
  container.querySelector('.call-review-empty').hidden=liked.length>0;container.querySelector('.call-review-credit').textContent='Accès privés d’essai restants : '+(MomentoShop.isRehearsalUnlimited(salonState.shop)?'∞':MomentoShop.balance(salonState.shop,'videoCredits'))+'. Aucun nouvel achat à la sortie.';
 }
 f.reviewRefresh=render;render();
 dialog.onclose=()=>{f.reviewRefresh=null;if(dialog.querySelector('[data-call-review]'))dialog.replaceChildren();if(callDemoAlive(f)&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true})};
 container.querySelector('[data-review-stay]').addEventListener('click',()=>dialog.close());
 container.querySelector('[data-review-leave]').addEventListener('click',()=>{
  // A detached/replayed button must never operate on a later account or flow.
  if(!callDemoAlive(f)||!dialog.open||!container.isConnected)return;
  callDemoPulse(f,false);if(!callDemoAlive(f))return;
  const record=f.state.records[f.state.personId];if(record)for(const q of Object.values(record.requests||{}))if(['pending','accepted'].includes(q.status))q.status='cancelled';
  callDemoSave(f);f.exitApproved=true;dialog.close();go(destination);
 });
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){const f=callDemoFlow;callSessionClearTransition(f);const dialog=document.querySelector('#modal');if(dialog?.querySelector('[data-call-review]')){dialog.close();dialog.replaceChildren()}}});

function callSessionWait(f){
 if(!callDemoAlive(f)||f.state.phase!=='preview')return;
 f.waitingPeer=true;if(f.table)f.table.waiting=false;document.querySelector('.conversation-view').hidden=false;document.querySelector('#callDemoPreflight').hidden=true;
 const stage=document.querySelector('#callDemoStage');if(!stage)return;
 stage.querySelector('.call-peer').hidden=true;
 stage.querySelector('[data-call-wait]')?.remove();
 const wait=document.createElement('section');wait.className='call-peer call-peer-wait';wait.dataset.callWait='';wait.setAttribute('aria-label','Attente du second participant');
 const logo=document.createElement('img');logo.src='/momento-logo.png';logo.alt='Momento';logo.width=2172;logo.height=724;
 const title=document.createElement('h2');title.textContent='Votre prochain bonjour arrive…';
 const copy=document.createElement('p');copy.textContent='Le tête-à-tête commencera quand vous serez tous les deux présents. Le chrono et votre entrée restent en attente.';
 const note=document.createElement('p');note.className='micro';note.textContent='Essai local : aucun participant distant n’est connecté.';
 const arrived=document.createElement('button');arrived.type='button';arrived.className='primary';arrived.textContent='Simuler l’arrivée de l’autre personne';arrived.addEventListener('click',()=>callSessionPeerArrived(f));
 const back=document.createElement('button');back.type='button';back.className='text-button';back.textContent='Revenir à mes choix';back.addEventListener('click',()=>{if(!callDemoAlive(f))return;f.waitingPeer=false;f.peerReady=false;if(f.table){f.table.waiting=false;f.table.preferencesConfirmed=false}wait.remove();stage.querySelector('.call-peer').hidden=false;callDemoRefresh(f)});
 wait.append(logo,title,copy,note,arrived,back);stage.insertBefore(wait,stage.firstChild);callDemoClock(f);const round=document.querySelector('#tableRound');if(round)round.textContent='En attente à deux';
}
function callSessionPeerArrived(f=callDemoFlow){
 if(!callDemoAlive(f)||!f.waitingPeer||f.state.phase!=='preview')return;
 if(f.table&&callDemoNow(f)+MomentoConversation.ROUND+MomentoConversation.DECISION>f.table.event.closesAt){f.waitingPeer=false;document.querySelector('[data-call-wait]')?.remove();callDemoRefresh(f);document.querySelector('#tablePreferenceError').textContent='Le créneau ne permet plus un tête-à-tête complet.';return}
 f.waitingPeer=false;f.peerReady=true;const stage=document.querySelector('#callDemoStage');stage?.querySelector('[data-call-wait]')?.remove();const peer=stage?.querySelector('.call-peer');if(peer)peer.hidden=false;
 callDemoStart();
}
