import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const root=new URL('../src/client/',import.meta.url);
async function experience(member=false,authSettings={},administrator=false,initialHash=''){
 const html=await readFile(new URL('index.html',root),'utf8'),dom=new JSDOM(html,{url:'https://momento.example/'+initialHash,runScripts:'outside-only',pretendToBeVisual:true}),{window}=dom,calls=[];
 window.scrollTo=()=>{};window.matchMedia=()=>({matches:true});window.HTMLElement.prototype.scrollIntoView=()=>{};
 window.fetch=async(path,options={})=>{calls.push(path);if(path==='/api/auth/config')return Response.json({mode:'supabase',configured:true,providers:[],sms:false,email:false,emailSignup:false,emailMode:'basic',emailRecovery:false,recovery:false,...authSettings});if(path==='/api/me')return member?Response.json({accountRef:'qa-only',persistence:'supabase',profile:member==='incomplete'?null:{name:'<img src=x onerror=alert(1)>',age:29,city:'Paris'}}):Response.json({error:'authentication_required'},{status:401});if(path==='/api/service/community')return Response.json({memberId:'00000000-0000-4000-8000-000000000001',themes:[],rooms:[],friends:[],requests:[],invitations:[],presence:null,admissionsEnabled:false});if(path.startsWith('/api/service/admin?'))return Response.json({role:'admin',counts:{members:1,rooms:7,openReports:0,suspended:0},reports:[],audit:[],hasMore:false});if(path==='/api/service/status')return Response.json({admin:administrator,moderator:administrator,premium:false,dailyLimit:1,used:0,bookingLimit:1,readiness:{enabled:false}});throw Error('Unexpected API call '+path)};
 const files=['domain.js','app.js','auth.js','home.js','account.js','shop-model.js','salon-model.js','salon.js','shop.js','community.js','live.js','admin.js'];
 const scripts=await Promise.all(files.map(file=>readFile(new URL(file,root),'utf8')));
 window.refreshOwnAvatars=()=>{};window.setupInstall=()=>{};window.profileAppearanceMarkup=()=>'';window.eval(scripts.join("\n")+"\nwindow.cleanState=()=>state;window.ready=()=>accountReady;window.setReady=(v)=>{accountReady=v};window.route=()=>page;");
 await window.initAccount();return{dom,window,document:window.document,calls};
}
test('anonymous visitors discover the home page but cannot open member pages or call service APIs',async()=>{
 const v=await experience(),{document,window,calls}=v;assert.match(document.querySelector('h1').textContent,/Le feeling commence/);assert.equal(document.querySelector('[data-member-nav]').hidden,true);
 for(const route of ['salon','friends','videos','shop','profile','bookings']){window.go(route);assert.equal(document.querySelector('[data-member-nav]').hidden,true);assert.ok(document.querySelector('.onboarding-card'));assert.equal(document.querySelector('#authEmailForm'),null);window.go('home');}
 assert.equal(calls.some(p=>p.startsWith('/api/service')),false);v.dom.window.close();
});
test('the home signup action follows native signup availability independently of existing-member login',async()=>{
 for(const enabled of [true,false]){
  const v=await experience(false,{email:true,emailSignup:enabled}),{document,window}=v;
  assert.match(document.querySelector('.home-actions button.primary').textContent,enabled?/Créer mon compte/:/Se connecter/);
  assert.match(document.querySelector('.home-account-note').textContent,enabled?/aucun compte ChatGPT/:/inscriptions momentanément fermées/);
  window.homeAccountAction();assert.equal(document.querySelector('#authEmailSubmit').textContent,enabled?'Créer mon compte':'Se connecter');window.go('audit');assert.match(document.body.textContent,enabled?/Les comptes sont ouverts/:/nouvelles inscriptions sont momentanément fermées/);v.dom.window.close();
 }
});
test('public information pages remain accessible and changing to home never exposes stored profile markup',async()=>{
 const v=await experience(),{window,document}=v;window.go('audit');assert.match(document.querySelector('h1').textContent,/Des étapes claires/);assert.match(document.body.textContent,/inscription.*e-mail/);window.go('dates');assert.match(document.querySelector('h1').textContent,/Un premier bonjour/);window.go('home');assert.equal(window.ready(),false);assert.equal(document.querySelector('[data-member-action]').hidden,true);v.dom.window.close();
});
test('signed-in navigation preserves the profile gate, escapes names and replaces closed service routes with honest preparation pages',async()=>{
 const v=await experience(true),{window,document,calls}=v;assert.equal(window.ready(),true);assert.match(document.querySelector('.home-account-note').textContent,/<img src=x/);assert.equal(document.querySelector('img[onerror]'),null);
 for(const route of ['bookings','matches','events']){window.go(route);await new Promise(r=>setImmediate(r));assert.ok(document.querySelector('.prepared-page'));assert.equal(calls.includes('/api/service/'+({bookings:'bookings',matches:'matches',events:'events',admin:'admin'})[route]),false);}
 window.go('admin');await new Promise(r=>setImmediate(r));assert.match(document.querySelector('h1').textContent,/Accès réservé/);assert.equal(calls.some(path=>path.startsWith('/api/service/admin?')),false);
 window.go('profile');assert.ok(document.querySelector('#profileForm'));assert.equal(document.querySelector('[data-member-nav]').hidden,false);assert.equal(document.querySelector('[data-page="profile"]').getAttribute('aria-current'),'page');assert.equal(window.location.hash,'#profil');window.go('home');assert.equal(document.querySelector('[data-member-nav]').hidden,true);assert.equal(document.querySelector('[data-member-action]').hidden,false);v.dom.window.close();
});

test('an Auth identity with no registered profile remains gated from all member services',async()=>{
 const v=await experience('incomplete'),{window,document,calls}=v;assert.equal(window.ready(),false);assert.ok(document.querySelector('#enrollForm'));assert.equal(document.querySelector('[data-member-nav]').hidden,true);window.go('shop');assert.ok(document.querySelector('#enrollForm'));assert.equal(calls.some(p=>p.startsWith('/api/service')),false);v.dom.window.close();
});

test('Supabase rooms and friends show persisted empty data, with a separate explicit simulation',async()=>{
 const v=await experience(true),{window,document,calls}=v;
 window.go('salon');await new Promise(r=>setImmediate(r));assert.ok(document.querySelector('#communityFilters'));assert.match(document.querySelector('#communityRooms').textContent,/Aucun salon réel/);assert.equal(document.querySelector('.salon-demo'),null);
 window.go('friends');await new Promise(r=>setImmediate(r));assert.match(document.querySelector('#communityContent').textContent,/Mes amis · 0/);assert.ok(calls.includes('/api/service/community'));
 window.communityDemo('salon');assert.match(document.querySelector('.community-demo-note').textContent,/profils fictifs/);
 window.go('friends');await new Promise(r=>setImmediate(r));assert.match(document.querySelector('#communityContent').textContent,/Mes amis · 0/);assert.equal(document.querySelector('.community-demo-note'),null);v.dom.window.close();
});

test('activated administrators get protected moderation and separate free/Premium rehearsal paths',async()=>{
 const v=await experience(true,{},true),{window,document,calls}=v;
 window.go('admin');await new Promise(r=>setImmediate(r));assert.match(document.querySelector('h1').textContent,/Prendre soin/);
 assert.equal(document.querySelector('[data-admin-nav]').hidden,false);assert.ok(calls.some(path=>path.startsWith('/api/service/admin?')));
 const before=calls.length;window.adminRunSimulation('premium');assert.match(document.querySelector('.community-demo-note').textContent,/Démonstration/);
 assert.equal(calls.length,before);assert.match(document.body.textContent,/Retour à l’administration/);
 window.go('home');assert.equal(document.querySelector('[data-admin-nav]').hidden,true);v.dom.window.close();
});

test('administrator activation is public but has no password or code in storage or URL',async()=>{
 const v=await experience(false,{email:true,emailSignup:true,emailMode:'basic'},false,'#activer-admin'),{window,document,calls}=v;
 assert.ok(calls.includes('/api/auth/config'));assert.equal(calls.includes('/api/me'),false);assert.equal(window.location.hash,'#activer-admin');assert.ok(document.querySelector('#adminSetupForm'));
 assert.equal(document.querySelector('#adminSetupPassword').minLength,12);assert.equal(document.querySelector('#adminSetupToken').type,'password');
 assert.equal(calls.some(path=>path.includes('admin-setup')),false);assert.equal(document.querySelector('[data-member-nav]').hidden,true);window.openAccount('signin');assert.ok(document.querySelector('#authEmailForm'));v.dom.window.close();
});
