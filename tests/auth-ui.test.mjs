import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const source=await readFile(new URL('../src/client/auth.js',import.meta.url),'utf8');
async function ui(configuration={},respond=()=>Response.json({accepted:true}),url='https://momento.example/'){
 const dom=new JSDOM('<!doctype html><html lang="fr"><body><main id="app"></main></body></html>',{url,runScripts:'outside-only'}),{window}=dom,calls=[];
 window.fetch=async(path,options={})=>{if(path==='/api/auth/config')return Response.json({mode:'supabase',configured:true,providers:['google'],sms:false,email:true,recovery:false,...configuration});const call={path,options,body:options.body?JSON.parse(options.body):null};calls.push(call);return respond(call)};
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
