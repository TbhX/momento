let adminReportCache=new Map();
let adminSandboxBusy=false;
function adminSandboxReset(){
 adminSandboxActive=false;adminSandboxPremium=false;
 if(typeof salonPersona!=='undefined')salonPersona='free';
 if(typeof salonState!=='undefined')MomentoShop.setRehearsalUnlimited(salonState?.shop,false);
 if(typeof callDemoFlow!=='undefined')MomentoShop.setRehearsalUnlimited(callDemoFlow?.peerWallet,false);
}
async function adminUnlimitedSimulation(premium=false,view='salon'){
 if(!accountReady||!liveStatus?.admin||adminSandboxBusy)return;adminSandboxBusy=true;const gen=liveGeneration;
 try{
  const permission=await api('/admin/test-access');
  if(gen!==liveGeneration||!accountReady||!liveStatus?.admin)return;
  if(permission.simulationOnly!==true||permission.unlimitedCredits!==true||permission.paymentsEnabled!==false)throw Error('Mode de test indisponible.');
  adminSandboxReset();adminSandboxActive=true;adminSandboxPremium=premium===true;salonPersona='admin';salonState=null;communityDemo(['salon','friends','videos','shop'].includes(view)?view:'salon');
  const banner=document.querySelector('.community-demo-note');if(banner){const note=document.createElement('p');note.textContent='Admin illimité · entrées, accès privés et créations fictifs. Aucun crédit réel ni paiement bancaire.';banner.append(note)}
 }catch(error){toast(error.message)}finally{adminSandboxBusy=false}
}
function adminSandboxSetPremium(value){
 if(!adminSandboxActive||!liveStatus?.admin||salonPersona!=='admin')return;
 salonStopMedia();adminSandboxPremium=value===true;salonState.premium=adminSandboxPremium;salonSave();salonOpen(salonView);
}
function refreshAdminNavigation(){
 document.querySelectorAll('[data-admin-nav]').forEach(button=>button.hidden=!accountReady||!(liveStatus?.admin||liveStatus?.moderator));
}
function renderAdminSetup(){
 if(typeof leaveLiveRoom==='function')leaveLiveRoom();stop();page='adminSetup';publicView='info';
 syncExperienceShell('account');setExperiencePage('adminSetup');
 app.innerHTML=`<section class="admin-activation"><span class="home-eyebrow">ACCÈS ORGANISATEUR</span><h1>Votre espace.<br><em>Votre mot de passe.</em></h1><p>Activez le compte préparé pour vous avec votre code privé à usage unique. L’adresse de connexion reste celle choisie lors de sa création.</p><form id="adminSetupForm" class="auth-email-form"><label for="adminSetupToken">Code d’activation privé</label><input id="adminSetupToken" name="token" type="password" autocomplete="one-time-code" autocapitalize="none" spellcheck="false" minlength="64" maxlength="64" required><label for="adminSetupPassword">Choisir mon mot de passe</label><input id="adminSetupPassword" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="64" required aria-describedby="adminSetupHint"><p id="adminSetupHint" class="micro">12 à 64 caractères. Choisissez une phrase unique que vous n’utilisez pas ailleurs.</p><label for="adminSetupConfirmation">Confirmer le mot de passe</label><input id="adminSetupConfirmation" name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="64" required><button class="primary wide">Activer mon accès</button><p id="adminSetupStatus" role="status" aria-live="polite"></p></form><button class="text-button" onclick="openAccount('signin')">J’ai déjà activé mon compte →</button><p class="micro">Le code expire et devient inutilisable après activation. Aucun abonnement n’est activé.</p></section>`;
 const form=$('#adminSetupForm');form.onsubmit=async e=>{
  e.preventDefault();const button=form.querySelector('button'),out=$('#adminSetupStatus');if(button.disabled)return;
  if(form.elements.password.value!==form.elements.confirmation.value){out.textContent='Les deux mots de passe doivent être identiques.';return;}
  button.disabled=true;out.textContent='Activation en cours…';
  try{
   const response=await fetch('/api/auth/admin-setup',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json','X-Momento-Request':'1'},body:JSON.stringify({token:form.elements.token.value.trim(),password:form.elements.password.value})});
   const result=await response.json();
   if(!response.ok){const messages={admin_setup_invalid:'Code invalide, expiré, déjà utilisé ou activation en cours. Vérifiez le code et patientez deux minutes avant de réessayer.',invalid_password:'Choisissez un mot de passe de 12 à 64 caractères, différent du précédent.',too_many_attempts:'Trop de tentatives. Patientez quinze minutes.'};throw Error(messages[result.error]||'Activation momentanément indisponible. Patientez deux minutes avant de réessayer.');}
   form.innerHTML='<p role="status">Votre accès administrateur est activé. Connectez-vous avec votre adresse et le mot de passe que vous venez de choisir, puis complétez votre profil.</p><button type="button" class="primary wide" onclick="openAccount(\'signin\')">Se connecter →</button>';
  }catch(error){out.textContent=error.message;button.disabled=false;}
  finally{for(const name of ['token','password','confirmation'])if(form.elements[name])form.elements[name].value='';}
 };
}
const adminStates={all:'Tous',open:'À examiner',reviewing:'En cours',resolved:'Traités',dismissed:'Classés'};
async function adminDashboard(gen,status='open',cursor=null){
 if(!liveStatus?.admin&&!liveStatus?.moderator){app.innerHTML='<section class="prepared-page"><h1>Accès réservé.</h1><p>Connectez-vous avec votre compte organisateur activé pour ouvrir cet espace.</p><button class="secondary" onclick="go(\'profile\')">Mon compte</button></section>';return;}
 const query=new URLSearchParams({status});if(cursor){query.set('before',cursor.created_at);query.set('beforeId',cursor.id);}
 const data=await api('/admin?'+query);if(gen!==liveGeneration||page!=='admin')return;
 adminReportCache=new Map(data.reports.map(report=>[report.id,report]));
 app.innerHTML=`<section class="admin-heading"><div><span class="home-eyebrow">ESPACE ORGANISATEUR</span><h1>Prendre soin<br><em>des premiers liens.</em></h1><p>Retrouvez vos comptes, vos salons et les signalements.</p></div><button class="secondary" onclick="go('admin')">Actualiser</button></section><div class="admin-metrics">${[['members','Comptes actifs'],['rooms','Salons au catalogue'],['openReports','Signalements à examiner'],['suspended','Comptes suspendus']].map(([key,label])=>`<article><strong>${Number(data.counts[key])||0}</strong><span>${label}</span></article>`).join('')}</div>${data.role==='admin'?`<section class="admin-card"><span class="home-eyebrow">LABORATOIRE</span><h2>Essayer chaque formule.</h2><p>Ces deux parcours utilisent des profils fictifs et des données séparées sur cet appareil. Votre abonnement réel et ceux des membres restent inchangés.</p><div class="admin-actions"><button class="primary" onclick="adminUnlimitedSimulation(false)">Admin illimité · Gratuit</button><button class="secondary" onclick="adminUnlimitedSimulation(true)">Admin illimité · Premium</button><button class="secondary" onclick="adminRunSimulation('free')">Tester un utilisateur gratuit</button><button class="primary" onclick="adminRunSimulation('premium')">Tester un utilisateur Premium</button><button class="secondary" onclick="videoPreflight()">Tester ma caméra et mon micro</button></div><p class="micro">L’aperçu des appareils est local. Aucun appel, achat ou renouvellement bancaire n’est lancé.</p></section>`:''}<section class="admin-card"><div class="admin-section-heading"><h2>Signalements</h2><label for="adminReportFilter">Afficher<select id="adminReportFilter">${Object.entries(adminStates).map(([key,label])=>`<option value="${key}" ${key===status?'selected':''}>${label}</option>`).join('')}</select></label></div><p id="adminActionStatus" role="status" aria-live="polite"></p><div class="admin-reports">${data.reports.map(report=>`<article class="admin-report"><div><span class="badge">${txt(adminStates[report.status]||report.status)}</span><p class="micro">${txt(when(report.created_at))}</p></div><h3>${txt(report.target_name||'Profil supprimé')}</h3><p class="admin-report-reason">${txt(report.reason)}</p><p class="micro">Signalé par ${txt(report.reporter_name||'Compte supprimé')} · ${report.target_status==='suspended'?'Profil suspendu':'État : '+txt(report.target_status||'supprimé')}</p><div class="admin-actions">${[['reviewing','Prendre en charge'],['resolved','Marquer traité'],['dismissed','Classer']].filter(([action])=>action!==report.status).map(([action,label])=>`<button class="secondary" onclick="adminReview('${report.id}','${action}')">${label}</button>`).join('')}${data.role==='admin'&&report.target_id&&!report.protected_target&&['active','suspended'].includes(report.target_status)?`<button class="text-button" onclick="adminReview('${report.id}','${report.target_status==='suspended'?'restore':'suspend'}')">${report.target_status==='suspended'?'Rétablir ce profil':'Suspendre ce profil'}</button>`:''}</div></article>`).join('')||'<p class="admin-empty">Aucun signalement dans cette vue.</p>'}</div><div class="admin-actions">${cursor?'<button class="secondary" onclick="go(\'admin\')">Revenir aux plus récents</button>':''}${data.hasMore?'<button class="secondary" id="adminNextReports">Voir les suivants →</button>':''}</div></section><section class="admin-card"><h2>Dernières actions</h2><ul class="admin-audit">${data.audit.map(entry=>`<li><b>${txt(({admin_setup_completed:'Activation administrateur',report_reviewing:'Prise en charge',report_resolved:'Signalement traité',report_dismissed:'Signalement classé',report_suspend:'Suspension',report_restore:'Profil rétabli'})[entry.action]||'Action administrative')}</b><span>${txt(when(entry.created_at))}</span></li>`).join('')||'<li>Aucune action enregistrée.</li>'}</ul></section>`;
 $('#adminReportFilter').onchange=e=>adminReload(e.target.value);
 if(data.hasMore)$('#adminNextReports').onclick=()=>adminReload(status,data.reports.at(-1));
}
async function adminReload(status,cursor=null){try{await adminDashboard(liveGeneration,status,cursor);}catch(error){toast(error.message);}}
async function adminReview(id,action){
 const report=adminReportCache.get(id);if(!report||page!=='admin')return;
 if(['suspend','restore'].includes(action)&&!confirm(`${action==='suspend'?'Suspendre':'Rétablir'} le profil « ${report.target_name||'supprimé'} » ? Cette action sera enregistrée.`))return;
 const buttons=[...app.querySelectorAll('.admin-reports button')];buttons.forEach(button=>button.disabled=true);
 const out=$('#adminActionStatus');out.textContent='Enregistrement…';
 try{await api('/admin/reports',{id,action,expected:report.status});toast('Action enregistrée.');await adminReload($('#adminReportFilter').value);}
 catch(error){if(out.isConnected)out.textContent=error.message;}
 finally{buttons.forEach(button=>button.disabled=false);}
}
function adminRunSimulation(persona){
 if(!liveStatus?.admin||!['free','premium'].includes(persona))return;adminSandboxReset();
 salonPersona=persona;salonState=null;communityDemo('salon');
 const banner=document.querySelector('.community-demo-note');if(banner){const back=document.createElement('button');back.className='secondary';back.textContent='Retour à l’administration';back.onclick=()=>go('admin');banner.append(back);}
}
