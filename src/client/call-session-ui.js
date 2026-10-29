/* Local rehearsal only. No peer-only votes, persisted recap or server rights. */
function callSessionShouldReview(){const f=callDemoFlow;return !!(f&&callDemoAlive(f)&&!f.exitApproved&&f.summarySeen?.size)}
function callSessionTransition(f){
 if(!callDemoAlive(f))return;callSessionClearTransition(f);
 if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const stage=document.querySelector('#callDemoStage');if(!stage)return;
 const badge=document.createElement('div');badge.className='call-swipe-momento';badge.setAttribute('aria-hidden','true');
 const logo=document.createElement('img');logo.src='/momento-logo.png';logo.alt='';logo.width=2172;logo.height=724;badge.append(logo);stage.append(badge);f.swipeBadge=badge;
 // Visual only: the next person and clock are already updated synchronously.
 f.swipeTimer=setTimeout(()=>callSessionClearTransition(f),500);
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

function callSessionCancelWait(f){
 if(!f)return;f.waitingPeer=false;f.peerReady=false;
 const stage=document.querySelector('#callDemoStage');stage?.querySelector('[data-call-wait]')?.remove();const peer=stage?.querySelector('.call-peer');if(peer)peer.hidden=false;
}
function callSessionWait(f){
 if(!callDemoAlive(f)||f.state.phase!=='preview')return;
 f.waitingPeer=true;if(f.table)f.table.waiting=false;document.querySelector('.conversation-view').hidden=false;document.querySelector('#callDemoPreflight').hidden=true;
 const stage=document.querySelector('#callDemoStage');if(!stage)return;
 if(stage.querySelector('[data-call-wait]')){callDemoClock(f);if(f.table)tableCallWindowSync(f);return}
 stage.querySelector('.call-peer').hidden=true;
 stage.querySelector('[data-call-wait]')?.remove();
 const wait=document.createElement('section');wait.className='call-peer call-peer-wait';wait.dataset.callWait='';wait.setAttribute('aria-label','Attente du second participant');
 const logo=document.createElement('img');logo.src='/momento-logo.png';logo.alt='Momento';logo.width=2172;logo.height=724;logo.className='wait-brand';
 const content=document.createElement('div');content.className='wait-composition';
 const person='<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="13" r="7"/><path d="M7 35v-4a13 13 0 0 1 26 0v4"/></svg>';
 content.innerHTML='<div class="wait-duo" aria-hidden="true"><div class="wait-person wait-person-you">'+person+'<span>Vous</span></div><div class="wait-connection"><svg viewBox="0 0 24 24"><path d="M12 20S3 14.5 3 8.5a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1C21 14.5 12 20 12 20Z"/></svg></div><div class="wait-person wait-person-peer">'+person+'<span>Votre rencontre</span><div class="wait-dots"><i></i><i></i><i></i></div></div></div><div class="wait-copy"><span class="wait-eyebrow">UNE PLACE POUR L’INATTENDU</span><h2>Votre prochain<br><em>bonjour se prépare…</em></h2><p>L’échange commencera lorsque vous serez tous les deux là.</p><span class="wait-state"><i aria-hidden="true"></i>En attente de l’autre personne</span></div>';
 const note=document.createElement('small');note.className='wait-demo-label';note.textContent='Essai local';note.title='Aucun participant distant connecté.';wait.append(logo,content,note);stage.insertBefore(wait,stage.firstChild);callDemoClock(f);const round=document.querySelector('#tableRound');if(round)round.textContent='En attente à deux';if(f.table)tableCallWindowSync(f);
}
function callSessionPeerArrived(f=callDemoFlow){
 if(!callDemoAlive(f)||!f.waitingPeer||f.state.phase!=='preview')return;
 if(f.table&&callDemoNow(f)+MomentoConversation.roundDuration(f.state)+MomentoConversation.DECISION>f.table.event.closesAt){callSessionCancelWait(f);callDemoRefresh(f);document.querySelector('#tablePreferenceError').textContent='Le créneau ne permet plus un tête-à-tête complet.';return}
 f.waitingPeer=false;f.peerReady=true;const stage=document.querySelector('#callDemoStage');stage?.querySelector('[data-call-wait]')?.remove();const peer=stage?.querySelector('.call-peer');if(peer)peer.hidden=false;
 callDemoStart();
}

// These controls operate only on the captured local rehearsal, after fresh admin authorization.
function callAdminToolsMount(f){
 if(!liveStatus?.admin||!callDemoAlive(f))return;
 const host=document.querySelector('.table-call-column')||document.querySelector('.conversation-demo');if(!host)return;
 const panel=document.createElement('details');panel.className='call-admin-tools';panel.dataset.callAdminTools='';panel.open=true;
 panel.innerHTML='<summary>⚙ Administration · tests locaux</summary><p>Aucun participant réel, message envoyé ou débit bancaire.</p><div data-admin-call-actions></div><p role="status" data-admin-call-status></p>';
 const actions=[['arrival','Arrivée du participant',()=>callSessionPeerArrived(f)],['like','Son like',()=>callDemoPeerLike(true)],['unlike','Son refus',()=>callDemoPeerLike(false)],['incoming','Demande de prolongation reçue',()=>callDemoIncomingExtension()],['accept','Accepter ma prolongation',()=>callDemoSimulateExtensionAnswer(true)],['decline','Refuser ma prolongation',()=>callDemoSimulateExtensionAnswer(false)],['ending','Alerte de fin',()=>callDemoPreviewEnding()]];
 if(f.table)actions.unshift(['start','Avancer à l’horaire du salon',()=>tableAdvanceStart()]);
 let busy=false;const current=()=>panel.isConnected&&callDemoAlive(f)&&liveStatus?.admin&&f.audience==='demo';
 for(const [key,label,action] of actions){const button=document.createElement('button');button.type='button';button.className='secondary';button.dataset.adminCallAction=key;button.textContent=label;
 button.addEventListener('click',async()=>{if(busy||!current())return;const person=f.state.personId,round=f.state.round,phase=f.state.phase,token=f.state.records[person]?.requests.continue?.token;busy=true;button.disabled=true;const status=panel.querySelector('[data-admin-call-status]');status.textContent='Vérification de l’accès…';
 try{const permission=await api('/admin/test-access');if(!current())return;if(permission.simulationOnly!==true||permission.unlimitedCredits!==true||permission.realSessions!==false||permission.paymentsEnabled!==false)throw Error('Accès de test indisponible.');
 if(key==='arrival'&&!f.waitingPeer){status.textContent='Confirmez d’abord vos envies et votre entrée pour attendre un participant.';return}
 if(!['start','arrival'].includes(key)&&!['date','vote','continued'].includes(f.state.phase)){status.textContent='Commencez un tête-à-tête simulé avant cette action.';return}
 if(f.state.personId!==person||f.state.round!==round||f.state.phase!==phase||f.state.records[person]?.requests.continue?.token!==token){status.textContent='La rencontre a changé. Relancez la commande pour la situation actuelle.';return}action();status.textContent='Commande exécutée dans l’essai local. Les conditions de match et de consentement restent nécessaires.';
 }catch{if(panel.isConnected)status.textContent='Accès administrateur refusé ou indisponible. Vérifiez votre connexion et la double authentification.'}finally{busy=false;button.disabled=false}});
 panel.querySelector('[data-admin-call-actions]').append(button)}host.append(panel);
}
