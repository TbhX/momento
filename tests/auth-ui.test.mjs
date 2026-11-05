import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const source=await readFile(new URL('../src/client/auth.js',import.meta.url),'utf8');
async function ui(configuration={},respond=()=>Response.json({accepted:true}),url='https://momento.example/'){
 const dom=new JSDOM('<!doctype html><html lang="fr"><body><main id="app"></main></body></html>',{url,runScripts:'outside-only'}),{window}=dom,calls=[];
 window.fetch=async(path,options={})=>{if(path==='/api/auth/config')return Response.json({mode:'supabase',configured:true,providers:['google'],sms:false,email:true,emailSignup:true,recovery:false,...configuration});const call={path,options,body:options.body?JSON.parse(options.body):null};calls.push(call);return respond(call)};
 window.eval(source+'\nwindow.auth=MomentoAuth;');
 const render=()=>{window.document.querySelector('#app').innerHTML=window.auth.markup();window.auth.bind()};window.renderAccountGate=render;window.clearLocalBeforeLogout=()=>{window.localCleared=true};
 await window.auth.init();render();return{dom,window,document:window.document,auth:window.auth,calls,render};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function submit(window,form){form.requestSubmit();await settle()}

test('email fields only appear when configured and enabled, alongside enabled providers',async()=>{
 const hidden=await ui({email:false});assert.equal(hidden.document.querySelector('#authEmailForm'),null);assert.ok(hidden.document.querySelector('[data-provider="google"]'));hidden.dom.window.close();
 const unavailable=await ui({configured:false});assert.equal(unavailable.document.querySelector('input[type="password"]'),null);assert.match(unavailable.document.body.textContent,/en préparation/);unavailable.dom.window.close();
});
test('native signup closure hides registration while preserving login and blocking programmatic signup selection',async()=>{
 const view=await ui({emailSignup:false,emailMode:'basic',emailRecovery:false}),{document,auth}=view;
 assert.ok(document.querySelector('#authEmailForm'));assert.equal(document.querySelector('[data-email-mode="signup"]'),null);assert.match(document.querySelector('#authSignupClosed').textContent,/temporairement fermées/);
 assert.equal(auth.emailEnabled(),true);assert.equal(auth.signupEnabled(),false);auth.selectMode('signup');assert.equal(document.querySelector('#authEmailSubmit').textContent,'Se connecter');
 assert.equal(document.querySelector('#authConfirmationField').hidden,true);view.dom.window.close();
 const unknown=await ui({emailSignup:undefined});assert.equal(unknown.auth.signupEnabled(),false);assert.equal(unknown.document.querySelector('[data-email-mode="signup"]'),null);unknown.dom.window.close();
});
test('a signup closed after rendering produces a clear message and clears both password fields',async()=>{
 const view=await ui({},()=>Response.json({error:'signup_closed'},{status:409})),{document,window,calls}=view;
 document.querySelector('[data-email-mode="signup"]').click();const form=document.querySelector('#authEmailForm');form.elements.email.value='member@example.test';form.elements.password.value='A unique fixture phrase 2026';form.elements.confirmation.value=form.elements.password.value;
 await submit(window,form);assert.equal(calls.length,1);assert.match(document.querySelector('#authError').textContent,/temporairement fermées/);assert.equal(form.elements.password.value,'');assert.equal(form.elements.confirmation.value,'');view.dom.window.close();
});
test('signup validates confirmation, sends only credentials to the same-origin API and clears password fields',async()=>{
 const view=await ui(),{document,window,calls}=view;document.querySelector('[data-email-mode="signup"]').click();const form=document.querySelector('#authEmailForm');form.elements.email.value='member@example.test';form.elements.password.value='A unique fixture phrase 2026';form.elements.confirmation.value='A different fixture phrase';
 await submit(window,form);assert.equal(calls.length,0);assert.match(document.querySelector('#authError').textContent,/identiques/);assert.equal(form.elements.password.value,'');
 form.elements.password.value='A unique fixture phrase 2026';form.elements.confirmation.value=form.elements.password.value;await submit(window,form);
 assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/auth/email/signup');assert.deepEqual(calls[0].body,{email:'member@example.test',password:'A unique fixture phrase 2026'});assert.equal(calls[0].options.headers['X-Momento-Request'],'1');assert.equal(calls[0].options.credentials,'same-origin');assert.equal(form.elements.password.value,'');assert.equal(form.elements.confirmation.value,'');assert.match(document.querySelector('#authStatus').textContent,/lien de confirmation/);assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);view.dom.window.close();
});
test('forgot password and resend confirmation disable password fields and never submit an old password',async()=>{
 for(const [button,path] of [['#authForgotPassword','recover'],['#authResendConfirmation','resend']]){
  const view=await ui(),{document,window,calls}=view,form=document.querySelector('#authEmailForm');form.elements.password.value='Previous password';document.querySelector(button).click();assert.equal(form.elements.password.disabled,true);assert.equal(form.elements.password.value,'');assert.equal(document.querySelector('#authPasswordFields').hidden,true);form.elements.email.value='member@example.test';await submit(window,form);assert.equal(calls[0].path,'/api/auth/email/'+path);assert.deepEqual(calls[0].body,{email:'member@example.test'});assert.match(document.querySelector('#authStatus').textContent,/Si /);view.dom.window.close();
 }
});
test('recovery is offered before loading the profile and forces a fresh login after password update',async()=>{
 const view=await ui({recovery:true},()=>Response.json({passwordUpdated:true,otherSessionsRevoked:true}),'https://momento.example/?authFlow=recovery'),{document,window,auth,calls}=view;assert.equal(auth.mustRecover(),true);assert.equal(document.querySelector('[data-provider]'),null);const form=document.querySelector('#newPasswordForm');form.elements.password.value='Another unique phrase 2026';form.elements.confirmation.value=form.elements.password.value;
 await submit(window,form);assert.deepEqual(calls[0].body,{password:'Another unique phrase 2026'});assert.equal(calls[0].path,'/api/auth/email/password');assert.equal(window.localCleared,true);assert.ok(document.querySelector('#authEmailForm'));assert.match(document.querySelector('#authStatus').textContent,/Vous pouvez vous reconnecter/);assert.equal(window.location.search,'');assert.equal(window.localStorage.length,0);view.dom.window.close();
});
test('expired recovery returns to login and a revocation failure is explicitly shown',async()=>{
 const expired=await ui({recovery:false},undefined,'https://momento.example/?authFlow=recovery');assert.match(expired.document.querySelector('#authError').textContent,/expiré/);assert.ok(expired.document.querySelector('#authEmailForm'));expired.dom.window.close();
 const view=await ui({recovery:true},()=>Response.json({passwordUpdated:true,otherSessionsRevoked:false})),form=view.document.querySelector('#newPasswordForm');form.elements.password.value='Another unique phrase 2026';form.elements.confirmation.value=form.elements.password.value;await submit(view.window,form);assert.match(view.document.querySelector('#authStatus').textContent,/n’a pas pu être confirmée/);view.dom.window.close();
});
test('account bootstrap does not request the profile while a recovery flow is being displayed',async()=>{
 const view=await ui({recovery:true}),{window}=view;window.app=window.document.querySelector('#app');window.eval(await readFile(new URL('../src/client/account.js',import.meta.url),'utf8'));let profiles=0,gates=0;window.accountRequest=async()=>{profiles++;throw Error('Unexpected profile load')};window.renderAccountGate=()=>gates++;window.setupInstall=()=>{};await window.initAccount();assert.equal(profiles,0);assert.equal(gates,1);view.dom.window.close();
});

test('basic password mode offers only signup and login, explains no recovery, and never promises a confirmation email',async()=>{
 const view=await ui({providers:[],sms:false,emailMode:'basic',emailRecovery:false},()=>Response.json({accepted:true,next:'signin'})),{document,window,calls}=view;
 assert.equal(document.querySelector('[data-provider]'),null);assert.ok(document.querySelector('#authEmailForm'));assert.equal(document.querySelector('#authForgotPassword').hidden,true);assert.equal(document.querySelector('#authResendConfirmation').hidden,true);assert.match(document.querySelector('#authBasicNotice').textContent,/sans confirmation/);assert.match(document.querySelector('#authBasicNotice').textContent,/récupération.*pas encore disponible/);
 document.querySelector('#authForgotPassword').click();assert.equal(document.querySelector('#authEmailSubmit').textContent,'Se connecter');assert.equal(document.querySelector('#authPasswordFields').hidden,false);
 document.querySelector('[data-email-mode="signup"]').click();assert.equal(document.querySelector('#authForgotPassword').hidden,true);assert.equal(document.querySelector('#authResendConfirmation').hidden,true);
 const form=document.querySelector('#authEmailForm');form.elements.email.value='member@example.test';form.elements.password.value='A unique fixture phrase 2026';form.elements.confirmation.value=form.elements.password.value;await submit(window,form);assert.equal(calls[0].path,'/api/auth/email/signup');assert.match(document.querySelector('#authStatus').textContent,/Se connecter/);assert.doesNotMatch(document.querySelector('#authStatus').textContent,/recevrez.*lien/);assert.equal(form.elements.password.value,'');assert.equal(form.elements.confirmation.value,'');assert.equal(window.localStorage.length,0);view.dom.window.close();
});

test('a response from a replaced signup form cannot write errors or status in the next form',async()=>{
 for(const response of [()=>Response.json({accepted:true}),()=>Response.json({error:'signup_closed'},{status:409})]){
 let finish;const v=await ui({},()=>new Promise(resolve=>finish=resolve));v.auth.selectMode('signup');const old=v.document.querySelector('#authEmailForm');old.elements.email.value='fixture@example.test';old.elements.password.value=old.elements.confirmation.value='Long fixture phrase 2026';await submit(v.window,old);v.render();const fresh=v.document.querySelector('#authEmailForm');assert.equal(fresh.querySelector('button').disabled,true);finish(response());await settle();assert.equal(v.document.querySelector('#authError').textContent,'');assert.doesNotMatch(v.document.querySelector('#authStatus').textContent,/recevrez|fermées/);assert.equal(fresh.querySelector('button').disabled,false);assert.equal(old.elements.password.value,'');v.dom.window.close();
 }
});
test('detached credential forms cannot submit and repeated submissions remain serialized',async()=>{
 let finish;const v=await ui({},()=>new Promise(resolve=>finish=resolve));const old=v.document.querySelector('#authEmailForm');old.elements.email.value='fixture@example.test';old.elements.password.value='fixture phrase';v.render();old.onsubmit({preventDefault(){}});assert.equal(v.calls.length,0);
 const form=v.document.querySelector('#authEmailForm');form.elements.email.value='fixture@example.test';form.elements.password.value='fixture phrase';await submit(v.window,form);form.onsubmit({preventDefault(){}});assert.equal(v.calls.length,1);finish(Response.json({error:'invalid_credentials'},{status:401}));await settle();v.dom.window.close();
});
test('abandoned recovery cannot clear another view or its account state',async()=>{
 let finish;const v=await ui({recovery:true},()=>new Promise(resolve=>finish=resolve));const form=v.document.querySelector('#newPasswordForm');form.elements.password.value=form.elements.confirmation.value='Long fixture phrase 2026';await submit(v.window,form);v.document.querySelector('#app').innerHTML='<p>Autre page</p>';finish(Response.json({passwordUpdated:true,otherSessionsRevoked:true}));await settle();assert.equal(v.window.localCleared,undefined);assert.equal(v.document.querySelector('#app').textContent,'Autre page');assert.equal(form.elements.password.value,'');v.dom.window.close();
});
test('leaving authentication clears revealed passwords and OTP values',async()=>{
 const v=await ui({sms:true});const form=v.document.querySelector('#authEmailForm');form.elements.password.value='fixture secret';v.document.querySelector('#authShowPassword').click();v.document.querySelector('#authPhoneCode').value='123456';v.auth.clear();assert.equal(form.elements.password.value,'');assert.equal(form.elements.password.type,'password');assert.equal(v.document.querySelector('#authShowPassword').checked,false);assert.equal(v.document.querySelector('#authPhoneCode').value,'');v.dom.window.close();
});
test('SMS verification clears its code on refusal and late SMS delivery cannot reopen another form',async()=>{
 let finish;const v=await ui({sms:true},()=>new Promise(resolve=>finish=resolve));const start=v.document.querySelector('#phoneStartForm');start.elements.phone.value='+33600000000';await submit(v.window,start);v.render();finish(Response.json({maskedPhone:'••00'}));await settle();assert.equal(v.document.querySelector('#phoneVerifyForm').hidden,true);assert.equal(v.document.querySelector('#phoneStartForm').hidden,false);
 const verify=v.document.querySelector('#phoneVerifyForm');verify.hidden=false;verify.elements.code.value='123456';await submit(v.window,verify);finish(Response.json({error:'invalid_code'},{status:400}));await settle();assert.equal(verify.elements.code.value,'');assert.match(v.document.querySelector('#authError').textContent,/incorrect/);v.dom.window.close();
});
test('unavailable auth retries without inline JavaScript and unknown providers never become markup',async()=>{
 const v=await ui({providers:['google','google','<img src=x onerror=alert(1)>']});assert.equal(v.document.querySelectorAll('[data-provider]').length,1);assert.equal(v.document.querySelector('img'),null);v.dom.window.close();
 const unavailable=await ui({configured:false});let retries=0;unavailable.window.initAccount=()=>retries++;const button=unavailable.document.querySelector('[data-auth-retry]');assert.equal(button.hasAttribute('onclick'),false);button.click();assert.equal(retries,1);button.remove();button.click();assert.equal(retries,1);unavailable.dom.window.close();
});

test('only the latest authentication configuration may control signup availability',async()=>{
 const v=await ui();const replies=[];v.window.fetch=()=>new Promise(resolve=>replies.push(resolve));const old=v.auth.init(),fresh=v.auth.init();replies[1](Response.json({mode:'supabase',configured:true,providers:[],email:true,emailSignup:false}));await fresh;replies[0](Response.json({mode:'supabase',configured:true,providers:[],email:true,emailSignup:true}));await old;assert.equal(v.auth.signupEnabled(),false);v.dom.window.close();
});
