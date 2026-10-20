import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {withExternalAuth,externalAuthConfiguration} from '../worker/external-auth.mjs';

const origin='https://momento.example',supabase='https://abcdefghijklmnopqrst.supabase.co';
const uuid='00000000-0000-4000-8000-000000000001';
const user={id:uuid,aud:'authenticated',role:'authenticated',email:'member@example.test',email_confirmed_at:new Date().toISOString(),created_at:new Date().toISOString(),app_metadata:{provider:'google'},user_metadata:{role:'admin'}};
function database(){const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL)');return{sql,prepare(query){return{bind(...args){return{first:async()=>sql.prepare(query).get(...args),run:async()=>sql.prepare(query).run(...args)}}}}}}
function setup(){return{SUPABASE_URL:supabase,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture_key_only_123456',MOMENTO_APP_ORIGIN:origin,AUTH_OAUTH_PROVIDERS:'google,apple,facebook',AUTH_COOKIE_SECRET:'fixture-only-secret-with-more-than-32-characters',AUTH_SMS_ENABLED:'true',DB:database()}}
function request(path,body,cookies='',extra={}){return new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{...(cookies?{Cookie:cookies}:{}),...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json','X-Momento-Request':'1'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})})}
const application={async fetch(req,env){return Response.json({id:req.headers.get('oai-authenticated-user-id'),email:req.headers.get('oai-authenticated-user-email'),mode:env.MOMENTO_IDENTITY_PROVIDER})}};
const worker=withExternalAuth(application);
function jar(){const values=new Map();return{apply(response){for(const c of response.headers.getSetCookie()){const part=c.split(';')[0],i=part.indexOf('='),name=part.slice(0,i),value=part.slice(i+1);if(/Max-Age=0(?:;|$)/i.test(c))values.delete(name);else values.set(name,value)}},header(){return [...values].map(([key,value])=>key+'='+value).join('; ')},values}}
function authResponse(body,options={}){return Response.json(body,{...options,headers:{'X-Supabase-Api-Version':'2024-01-01',...options.headers}})}
function fixture(){const calls=[],options={},usedCodes=new Set();let challenge=null,validVerifier=null,rejectUser=false,otpCalls=0,verifyCalls=0,currentUser=structuredClone(user),sid='00000000-0000-4000-8000-000000000099';
 const token=()=>({access_token:['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:currentUser.id,exp:Math.floor(Date.now()/1000)+3600,session_id:sid})).toString('base64url'),'fixture'].join('.'),refresh_token:'fixture-refresh-token',expires_in:3600,token_type:'bearer',user:currentUser});
 return{calls,token,options,setUser(value){currentUser=value},setSession(value){sid=value},rejectUser(){rejectUser=true},get otpCalls(){return otpCalls},get verifyCalls(){return verifyCalls},fetch:async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url),body=init.body?JSON.parse(init.body):null;calls.push({path:url.pathname,query:url.searchParams,body,method:init.method||'GET'});
  if(url.pathname==='/auth/v1/settings')return authResponse({external:{google:true,apple:false,facebook:true,phone:true,email:true},mailer_autoconfirm:options.autoconfirm===true});
  if(url.pathname==='/auth/v1/signup'){challenge=body.code_challenge;if(options.signupError)return authResponse({msg:'Account exists',code:'user_already_exists'},{status:422});if(options.autoconfirm&&!options.noSignupSession)return authResponse(token());return authResponse({id:uuid,email:body.email,identities:[{provider:'email'}]})}
  if(url.pathname==='/auth/v1/recover'){challenge=body.code_challenge;if(options.recoveryError)return authResponse({msg:'Unknown account',code:'user_not_found'},{status:404});return authResponse({})}
  if(url.pathname==='/auth/v1/resend'){challenge=body.code_challenge;return authResponse({})}
  if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password'){if(body.password!=='A unique fixture phrase 2026'||body.email!=='member@example.test')return authResponse({msg:'invalid credentials',code:options.signinCode||'invalid_credentials'},{status:400});return authResponse(token())}
  if(url.pathname==='/auth/v1/otp'){otpCalls++;return authResponse({})}
  if(url.pathname==='/auth/v1/verify'){verifyCalls++;if(body.token!=='123456')return authResponse({msg:'Invalid OTP',code:'otp_expired'},{status:403});return authResponse(token())}
  if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='pkce'){if(!body.code_verifier||usedCodes.has(body.auth_code))return authResponse({msg:'invalid verifier',code:'bad_code_verifier'},{status:400});const digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.code_verifier))).toString('base64url');if(challenge&&digest!==challenge)return authResponse({msg:'invalid verifier'},{status:400});usedCodes.add(body.auth_code);validVerifier=body.code_verifier;return authResponse(token())}
  if(url.pathname==='/auth/v1/user'){if(init.method==='PUT'&&options.updateError)return authResponse({msg:'Weak password',code:'weak_password'},{status:422});return rejectUser?authResponse({msg:'rejected'},{status:401}):authResponse(currentUser)}
  if(url.pathname==='/auth/v1/logout')return options.logoutError?authResponse({msg:'Unavailable',code:'unexpected_failure'},{status:400}):new Response(null,{status:204});
  throw Error('Unexpected Auth request '+url.pathname);
 },setChallenge(value){challenge=value},get verifier(){return validVerifier}};
}
async function withFixture(run){const original=globalThis.fetch,f=fixture();globalThis.fetch=f.fetch;try{await run(f)}finally{globalThis.fetch=original}}

test('standalone strips forged Sites identity on public routes and never accepts it on protected APIs',async()=>withFixture(async f=>{
 const env=setup(),spoof={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'};
 const publicResponse=await worker.fetch(request('/',undefined,'',spoof),env);assert.equal((await publicResponse.json()).id,null);
 const protectedResponse=await worker.fetch(request('/api/me',undefined,'',spoof),env);assert.equal(protectedResponse.status,401);assert.equal(f.calls.some(c=>c.path==='/auth/v1/user'),false);
 assert.equal((await worker.fetch(request('/signin-with-chatgpt'),env)).status,404);
}));
test('missing configuration or server secret keys fail closed and never trigger fallback authentication',async()=>{
 const env=setup();env.SUPABASE_PUBLISHABLE_KEY='sb_secret_never_allowed';assert.equal(externalAuthConfiguration(env).configured,false);
 assert.equal((await worker.fetch(request('/api/me',undefined,'',{'oai-authenticated-user-id':'owner'}),env)).status,503);
 const config=await(await worker.fetch(request('/api/auth/config'),env)).json();assert.equal(config.configured,false);assert.deepEqual(config.providers,[]);
});
test('only providers really enabled upstream are offered; OAuth is PKCE with HttpOnly host cookies',async()=>withFixture(async f=>{
 const env=setup(),config=await(await worker.fetch(request('/api/auth/config'),env)).json();assert.deepEqual(config.providers,['google','facebook']);assert.equal(config.sms,true);
 assert.equal((await worker.fetch(request('/api/auth/oauth',{provider:'apple'}),env)).status,409);
 const response=await worker.fetch(request('/api/auth/oauth',{provider:'google'}),env),data=await response.json();assert.equal(response.status,200);
 const target=new URL(data.url);assert.equal(target.origin,supabase);assert.equal(target.searchParams.get('code_challenge_method'),'s256');assert.equal(target.searchParams.get('redirect_to'),origin+'/api/auth/callback');
 const cookies=response.headers.getSetCookie();assert.ok(cookies.length);for(const cookie of cookies){assert.match(cookie,/^__Host-momento-auth/);assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/i);assert.doesNotMatch(cookie,/Domain=/i)}
 assert.doesNotMatch(JSON.stringify(data),/access_token|refresh_token|code_verifier/);
 const browser=jar();browser.apply(response);f.setChallenge(target.searchParams.get('code_challenge'));
 const callback=await worker.fetch(request('/api/auth/callback?code=fixture-code',undefined,browser.header()),env);assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),origin+'/');assert.ok(f.verifier);browser.apply(callback);
 const own=await worker.fetch(request('/api/me',undefined,browser.header(),{'oai-authenticated-user-id':'other'}),env);assert.equal(own.status,200);assert.equal((await own.json()).id,'supabase:'+uuid);assert.match(own.headers.get('cache-control'),/no-store/);
 f.rejectUser();assert.equal((await worker.fetch(request('/api/me',undefined,browser.header()),env)).status,401);
}));
test('OAuth callback without the originating browser cannot create a session',async()=>withFixture(async f=>{
 const env=setup();const response=await worker.fetch(request('/api/auth/callback?code=stolen-code'),env);assert.equal(response.status,303);assert.equal(response.headers.get('location'),origin+'/?authError=failed');assert.equal(response.headers.getSetCookie().some(c=>c.startsWith('__Host-momento-auth=')&&!/Max-Age=0/.test(c)),false);
 assert.equal(f.calls.some(c=>c.path==='/auth/v1/token'&&!!c.body.code_verifier),false);
}));
test('cross-origin and CSRF-less auth writes are rejected before contacting providers',async()=>withFixture(async f=>{
 const env=setup();for(const headers of [{Origin:'https://evil.example'},{'X-Momento-Request':''},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await worker.fetch(request('/api/auth/phone/start',{phone:'+33612345678'},'',headers),env)).status,403);
 assert.equal(f.otpCalls,0);assert.equal((await worker.fetch(request('/api/auth/logout'),env)).status,405);
}));
test('phone verification is bound to a signed challenge and limits wrong codes without storing tokens in JSON',async()=>withFixture(async f=>{
 const env=setup(),browser=jar();const start=await worker.fetch(request('/api/auth/phone/start',{phone:'+33612345678'}),env);assert.equal(start.status,200);browser.apply(start);assert.match(start.headers.get('set-cookie'),/HttpOnly/);
 const stolen=browser.header().replace(/.$/,'x');assert.equal((await worker.fetch(request('/api/auth/phone/verify',{code:'123456'},stolen),env)).status,401);assert.equal(f.verifyCalls,0);
 for(let i=0;i<5;i++)assert.equal((await worker.fetch(request('/api/auth/phone/verify',{code:'000000'},browser.header()),env)).status,401);
 assert.equal((await worker.fetch(request('/api/auth/phone/verify',{code:'123456'},browser.header()),env)).status,429);assert.equal(f.verifyCalls,5);
 const stored=JSON.stringify(env.DB.sql.prepare('SELECT key FROM rate_limits').all());assert.doesNotMatch(stored,/33612345678|000000|123456/);
}));
test('SMS budget and phone limits stop new upstream sends; SMS is disabled by default',async()=>withFixture(async f=>{
 const env=setup();env.AUTH_SMS_DAILY_BUDGET='2';for(const phone of ['+33612345678','+33687654321'])assert.equal((await worker.fetch(request('/api/auth/phone/start',{phone}),env)).status,200);
 assert.equal((await worker.fetch(request('/api/auth/phone/start',{phone:'+33699999999'}),env)).status,429);assert.equal(f.otpCalls,2);
 delete env.AUTH_SMS_ENABLED;assert.equal((await worker.fetch(request('/api/auth/phone/start',{phone:'+33612345678'}),env)).status,409);assert.equal(f.otpCalls,2);
}));
test('SMS creates a verified session; logout revokes it upstream and clears all identity cookies',async()=>withFixture(async f=>{
 const env=setup(),browser=jar();browser.apply(await worker.fetch(request('/api/auth/phone/start',{phone:'+33612345678'}),env));const verified=await worker.fetch(request('/api/auth/phone/verify',{code:'123456'},browser.header()),env);assert.equal(verified.status,200);assert.deepEqual(await verified.json(),{authenticated:true});browser.apply(verified);
 assert.equal((await worker.fetch(request('/api/me',undefined,browser.header()),env)).status,200);
 const logout=await worker.fetch(request('/api/auth/logout',{},browser.header()),env);assert.equal(logout.status,200);assert.ok(f.calls.some(c=>c.path==='/auth/v1/logout'));browser.apply(logout);assert.equal(browser.values.size,0);assert.equal((await worker.fetch(request('/api/me',undefined,browser.header()),env)).status,401);
}));
test('standalone administrator rights require a configured UUID rather than email or user metadata',async()=>{
 const source=await readFile('worker/service.mjs','utf8');const fn=source.slice(source.indexOf('function adminRequest'),source.indexOf('function readiness'));
 const {adminRequest}=await import('data:text/javascript;base64,'+Buffer.from(fn+'\nexport {adminRequest}').toString('base64'));
 const req=request('/api/service/admin',undefined,'',{'oai-authenticated-user-id':'supabase:'+uuid,'oai-authenticated-user-email':'owner@example.test'});
 const env={MOMENTO_IDENTITY_PROVIDER:'supabase',MOMENTO_ADMIN_EMAIL:'owner@example.test'};assert.equal(adminRequest(req,env),false);env.MOMENTO_ADMIN_USER_IDS=uuid;assert.equal(adminRequest(req,env),true);env.MOMENTO_ADMIN_USER_IDS='another-user';assert.equal(adminRequest(req,env),false);
});

const password='A unique fixture phrase 2026';
function emailSetup(){return{...setup(),AUTH_EMAIL_ENABLED:'true',AUTH_EMAIL_DAILY_BUDGET:'20'}}
async function beginRecovery(f,env,browser=jar()){
 const start=await worker.fetch(request('/api/auth/email/recover',{email:user.email}),env);assert.equal(start.status,200,await start.clone().text());browser.apply(start);
 const send=f.calls.find(c=>c.path==='/auth/v1/recover');assert.equal(send.query.get('redirect_to'),origin+'/api/auth/recovery/callback');assert.ok(send.body.code_challenge);
 const callback=await worker.fetch(request('/api/auth/recovery/callback?code=recovery-code',undefined,browser.header()),env);assert.equal(callback.headers.get('location'),origin+'/?authFlow=recovery');browser.apply(callback);return browser;
}

test('email requires explicit activation, counters, server secret and confirmed-address configuration upstream',async()=>withFixture(async f=>{
 const env=setup();assert.equal((await(await worker.fetch(request('/api/auth/config'),env)).json()).email,false);
 assert.equal((await worker.fetch(request('/api/auth/email/signup',{email:user.email,password}),env)).status,409);
 env.AUTH_EMAIL_ENABLED='true';delete env.DB;assert.equal(externalAuthConfiguration(env).email,false);env.DB=database();env.AUTH_COOKIE_SECRET='short';assert.equal(externalAuthConfiguration(env).email,false);
 const enabled=emailSetup();f.options.autoconfirm=true;assert.equal((await(await worker.fetch(request('/api/auth/config'),enabled)).json()).email,false);assert.equal((await worker.fetch(request('/api/auth/email/signup',{email:user.email,password}),enabled)).status,409);
 assert.equal(f.calls.filter(c=>c.path==='/auth/v1/signup').length,0);
}));
test('email signup is PKCE, confirms before authentication, bounds input and never accepts client redirects or roles',async()=>withFixture(async f=>{
 const env=emailSetup(),browser=jar();const signup=await worker.fetch(request('/api/auth/email/signup',{email:' MEMBER@EXAMPLE.TEST ',password,role:'admin',redirectTo:'https://evil.example'}),env);assert.equal(signup.status,200);assert.deepEqual(await signup.json(),{accepted:true,next:'confirm_email'});browser.apply(signup);
 const call=f.calls.find(c=>c.path==='/auth/v1/signup');assert.equal(call.body.email,user.email);assert.equal(call.query.get('redirect_to'),origin+'/api/auth/callback');assert.ok(call.body.code_challenge);assert.deepEqual(call.body.data,{});
 for(const cookie of signup.headers.getSetCookie()){assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.doesNotMatch(cookie,/Domain=/)}
 assert.equal((await worker.fetch(request('/api/me',undefined,browser.header()),env)).status,401);
 assert.equal((await worker.fetch(request('/api/auth/email/signup',{email:'not an email',password}),env)).status,400);
 assert.equal((await worker.fetch(request('/api/auth/email/signup',{email:'other@example.test',password:'short'}),env)).status,400);
 assert.equal((await worker.fetch(request('/api/auth/email/signup',{email:'other@example.test',password:'😀'.repeat(30)}),env)).status,400);
 assert.equal((await worker.fetch(request('/api/auth/email/signup',{email:user.email,password:'p'.repeat(5000)}),env)).status,413);
 const stolen=await worker.fetch(request('/api/auth/callback?code=confirmation'),env);assert.equal(stolen.headers.get('location'),origin+'/?authError=failed');
 const confirmed=await worker.fetch(request('/api/auth/callback?code=confirmation',undefined,browser.header()),env);assert.equal(confirmed.headers.get('location'),origin+'/');browser.apply(confirmed);assert.equal((await worker.fetch(request('/api/me',undefined,browser.header()),env)).status,200);
}));
test('signup and recovery give generic acknowledgements for pre-existing or unknown accounts',async()=>withFixture(async f=>{
 const env=emailSetup();f.options.signupError=true;const existing=await worker.fetch(request('/api/auth/email/signup',{email:user.email,password}),env);assert.equal(existing.status,200);assert.deepEqual(await existing.json(),{accepted:true,next:'confirm_email'});
 f.options.recoveryError=true;const unknown=await worker.fetch(request('/api/auth/email/recover',{email:'unknown@example.test'}),env);assert.equal(unknown.status,200);assert.deepEqual(await unknown.json(),{accepted:true,next:'recovery_email'});
}));
test('email mutations reject cross-site requests and absent CSRF before provider calls',async()=>withFixture(async f=>{
 const env=emailSetup();for(const path of ['signup','signin','recover','password'])for(const headers of [{Origin:'https://evil.example'},{'X-Momento-Request':''},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await worker.fetch(request('/api/auth/email/'+path,{email:user.email,password},'',headers),env)).status,403);
 assert.equal(f.calls.length,0);
}));
test('password signin returns only a verified identity cookie and generic invalid-credential errors',async()=>withFixture(async f=>{
 const env=emailSetup(),browser=jar();const wrong=await worker.fetch(request('/api/auth/email/signin',{email:user.email,password:'wrong'}),env);const first=await wrong.json();assert.equal(wrong.status,401);f.options.signinCode='email_not_confirmed';const unconfirmed=await worker.fetch(request('/api/auth/email/signin',{email:user.email,password:'wrong'}),env);assert.deepEqual(await unconfirmed.json(),first);
 const success=await worker.fetch(request('/api/auth/email/signin',{email:user.email,password}),env);assert.equal(success.status,200);assert.deepEqual(await success.json(),{authenticated:true});browser.apply(success);const own=await worker.fetch(request('/api/me',undefined,browser.header()),env);assert.equal((await own.json()).id,'supabase:'+uuid);
 assert.doesNotMatch(JSON.stringify(first),/member@example|token|password/);assert.match(success.headers.get('cache-control'),/no-store/);
}));
test('email budgets and address limits stop sends and brute force; stored counters contain only HMAC identifiers',async()=>withFixture(async f=>{
 const env=emailSetup();env.AUTH_EMAIL_DAILY_BUDGET='1';assert.equal((await worker.fetch(request('/api/auth/email/signup',{email:user.email,password}),env)).status,200);assert.equal((await worker.fetch(request('/api/auth/email/recover',{email:'other@example.test'}),env)).status,429);assert.equal(f.calls.filter(c=>c.path==='/auth/v1/recover').length,0);
 for(let i=0;i<10;i++)assert.equal((await worker.fetch(request('/api/auth/email/signin',{email:user.email,password:'wrong'}),env)).status,401);assert.equal((await worker.fetch(request('/api/auth/email/signin',{email:user.email,password}),env)).status,429);
 const rows=JSON.stringify(env.DB.sql.prepare('SELECT * FROM rate_limits').all());assert.doesNotMatch(rows,/member@example|other@example|wrong|A unique/);
}));
test('recovery verifies browser, email and PKCE intent before issuing a short-lived grant',async()=>withFixture(async f=>{
 const env=emailSetup(),browser=jar();const send=await worker.fetch(request('/api/auth/email/recover',{email:user.email}),env);browser.apply(send);const startCookies=browser.header();
 const stolen=await worker.fetch(request('/api/auth/recovery/callback?code=recovery-code'),env);assert.equal(stolen.headers.get('location'),origin+'/?authError=recovery_expired');assert.equal(f.calls.filter(c=>c.path==='/auth/v1/token').length,0);
 const name=[...browser.values.keys()].find(n=>n.includes('email-flow'));const original=browser.values.get(name);browser.values.set(name,original.slice(0,-1)+(original.endsWith('x')?'y':'x'));const tampered=await worker.fetch(request('/api/auth/recovery/callback?code=recovery-code',undefined,browser.header()),env);assert.equal(tampered.headers.get('location'),origin+'/?authError=recovery_expired');assert.equal(f.calls.filter(c=>c.path==='/auth/v1/token').length,0);
 const callback=await worker.fetch(request('/api/auth/recovery/callback?code=recovery-code',undefined,startCookies),env);assert.equal(callback.headers.get('location'),origin+'/?authFlow=recovery');browser.values.set(name,original);browser.apply(callback);
 const config=await(await worker.fetch(request('/api/auth/config',undefined,browser.header()),env)).json();assert.equal(config.recovery,true);assert.doesNotMatch(JSON.stringify(config),/access_token|refresh_token|member@example|00000000/);
 const cookie=callback.headers.getSetCookie().find(c=>c.startsWith('__Host-momento-recovery='));assert.match(cookie,/Max-Age=900/);assert.match(cookie,/HttpOnly/);
 const replay=await worker.fetch(request('/api/auth/recovery/callback?code=recovery-code',undefined,startCookies),env);assert.equal(replay.headers.get('location'),origin+'/?authError=recovery_expired');
}));
test('password reset consumes its grant once even with simultaneous requests and revokes refresh sessions',async()=>withFixture(async f=>{
 const env=emailSetup(),browser=await beginRecovery(f,env),cookies=browser.header();assert.equal((await worker.fetch(request('/api/auth/email/password',{password:'short'},cookies),env)).status,400);
 const responses=await Promise.all([worker.fetch(request('/api/auth/email/password',{password:'A new unique phrase 2026'},cookies),env),worker.fetch(request('/api/auth/email/password',{password:'A different unique phrase'},cookies),env)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);
 const success=responses.find(r=>r.status===200);assert.deepEqual(await success.json(),{passwordUpdated:true,otherSessionsRevoked:true});assert.equal(f.calls.filter(c=>c.path==='/auth/v1/user'&&c.method==='PUT').length,1);assert.ok(f.calls.some(c=>c.path==='/auth/v1/logout'&&c.query.get('scope')==='global'));
 browser.apply(success);assert.equal(browser.values.size,0);assert.equal((await worker.fetch(request('/api/auth/email/password',{password},cookies),env)).status,401);assert.equal(f.calls.filter(c=>c.path==='/auth/v1/user'&&c.method==='PUT').length,1);
}));
test('a recovery grant cannot be used by another account or another session',async()=>withFixture(async f=>{
 const env=emailSetup(),browser=await beginRecovery(f,env);const cookies=browser.header();f.setUser({...user,id:'00000000-0000-4000-8000-000000000002'});assert.equal((await worker.fetch(request('/api/auth/email/password',{password},cookies),env)).status,401);f.setUser(user);
 const other=jar();f.setSession('00000000-0000-4000-8000-000000000098');other.apply(await worker.fetch(request('/api/auth/email/signin',{email:user.email,password}),env));for(const [name,value] of browser.values)if(name==='__Host-momento-recovery')other.values.set(name,value);
 assert.equal((await worker.fetch(request('/api/auth/email/password',{password},other.header()),env)).status,401);assert.equal(f.calls.some(c=>c.method==='PUT'),false);
}));
test('expired recovery grants are rejected and cleared',async()=>withFixture(async f=>{
 const env=emailSetup(),browser=await beginRecovery(f,env),now=Date.now;try{const later=now()+16*60000;Date.now=()=>later;const configResponse=await worker.fetch(request('/api/auth/config',undefined,browser.header()),env);assert.equal((await configResponse.json()).recovery,false);assert.match(configResponse.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await worker.fetch(request('/api/auth/email/password',{password},browser.header()),env)).status,401)}finally{Date.now=now}
 assert.equal(f.calls.some(c=>c.method==='PUT'),false);
}));
test('a provider-rejected new password can be corrected without reusing a successful reset grant',async()=>withFixture(async f=>{
 const env=emailSetup(),browser=await beginRecovery(f,env);f.options.updateError=true;assert.equal((await worker.fetch(request('/api/auth/email/password',{password},browser.header()),env)).status,400);f.options.updateError=false;assert.equal((await worker.fetch(request('/api/auth/email/password',{password:'Another unique phrase 2026'},browser.header()),env)).status,200);
}));
test('confirmation can be resent without a password and creates a fresh browser-bound PKCE challenge',async()=>withFixture(async f=>{
 const env=emailSetup(),browser=jar();const response=await worker.fetch(request('/api/auth/email/resend',{email:user.email,redirectTo:'https://evil.example'}),env);assert.equal(response.status,200);assert.deepEqual(await response.json(),{accepted:true,next:'confirm_email'});browser.apply(response);
 const call=f.calls.find(c=>c.path==='/auth/v1/resend');assert.equal(call.body.type,'signup');assert.ok(call.body.code_challenge);assert.equal(call.body.password,undefined);assert.equal(call.query.get('redirect_to'),origin+'/api/auth/callback');const callback=await worker.fetch(request('/api/auth/callback?code=resent-confirmation',undefined,browser.header()),env);assert.equal(callback.headers.get('location'),origin+'/');
}));
test('recovery cannot be downgraded through an ordinary callback or created from an OAuth verifier alone',async()=>withFixture(async f=>{
 const env=emailSetup(),browser=jar();browser.apply(await worker.fetch(request('/api/auth/email/recover',{email:user.email}),env));const response=await worker.fetch(request('/api/auth/callback?code=recovery-code',undefined,browser.header()),env);assert.equal(response.headers.get('location'),origin+'/?authError=failed');browser.apply(response);assert.equal(browser.values.size,0);
 const oauth=jar();oauth.apply(await worker.fetch(request('/api/auth/oauth',{provider:'google'}),env));const forged=await worker.fetch(request('/api/auth/recovery/callback?code=oauth-code',undefined,oauth.header()),env);assert.equal(forged.headers.get('location'),origin+'/?authError=recovery_expired');assert.equal(forged.headers.getSetCookie().some(c=>c.startsWith('__Host-momento-recovery=')&&!c.includes('Max-Age=0')),false);
}));
test('unconfirmed credentials cannot retain a newly issued session, while a confirmed phone can authenticate',async()=>withFixture(async f=>{
 const env=emailSetup(),browser=jar();f.setUser({...user,email_confirmed_at:null});const response=await worker.fetch(request('/api/auth/email/signin',{email:user.email,password}),env);assert.equal(response.status,401);browser.apply(response);assert.equal(browser.values.size,0);
 f.setUser({...user,email:'',email_confirmed_at:null,phone_confirmed_at:new Date().toISOString()});browser.apply(await worker.fetch(request('/api/auth/phone/start',{phone:'+33612345678'}),env));browser.apply(await worker.fetch(request('/api/auth/phone/verify',{code:'123456'},browser.header()),env));const own=await worker.fetch(request('/api/me',undefined,browser.header()),env);assert.equal(own.status,200);assert.equal((await own.json()).email,null);
}));
test('password update reports failed global revocation accurately and still clears local cookies',async()=>withFixture(async f=>{
 const env=emailSetup(),browser=await beginRecovery(f,env);f.options.logoutError=true;const response=await worker.fetch(request('/api/auth/email/password',{password},browser.header()),env);assert.equal(response.status,200);assert.deepEqual(await response.json(),{passwordUpdated:true,otherSessionsRevoked:false});browser.apply(response);assert.equal(browser.values.size,0);
}));

test('basic password signup requires matching upstream mode, uses no mail PKCE or server key, and creates HttpOnly session cookies',async()=>withFixture(async f=>{
 const env={...emailSetup(),AUTH_EMAIL_MODE:'basic',AUTH_OAUTH_PROVIDERS:'',AUTH_SMS_ENABLED:'false'},browser=jar();
 assert.equal((await(await worker.fetch(request('/api/auth/config'),env)).json()).email,false);
 assert.equal((await worker.fetch(request('/api/auth/email/signup',{email:user.email,password}),env)).status,409);
 assert.equal(f.calls.some(c=>c.path==='/auth/v1/signup'),false);
 f.options.autoconfirm=true;
 const config=await(await worker.fetch(request('/api/auth/config'),env)).json();assert.equal(config.email,true);assert.equal(config.emailMode,'basic');assert.equal(config.emailRecovery,false);assert.deepEqual(config.providers,[]);assert.equal(config.sms,false);
 const response=await worker.fetch(request('/api/auth/email/signup',{email:user.email,password,role:'admin',redirectTo:'https://evil.example'}),env);assert.equal(response.status,200);const payload=await response.json();assert.deepEqual(payload,{authenticated:true,next:'profile',emailVerified:false});assert.doesNotMatch(JSON.stringify(payload),/access_token|refresh_token/);browser.apply(response);
 const sent=f.calls.find(c=>c.path==='/auth/v1/signup');assert.equal(sent.body.email,user.email);assert.equal(sent.body.password,password);assert.equal(sent.body.code_challenge??null,null);assert.equal(sent.query.has('redirect_to'),false);assert.equal(sent.body.role,undefined);
 assert.ok(response.headers.getSetCookie().some(c=>c.startsWith('__Host-momento-auth=')&&/HttpOnly/.test(c)&&/Secure/.test(c)));
 assert.equal((await worker.fetch(request('/api/me',undefined,browser.header()),env)).status,200);
 assert.equal(f.calls.some(c=>/recover|resend|authorize/.test(c.path)),false);
 const logout=await worker.fetch(request('/api/auth/logout',{},browser.header()),env);assert.equal(logout.status,200);browser.apply(logout);assert.equal(browser.values.size,0);
 browser.apply(await worker.fetch(request('/api/auth/email/signin',{email:user.email,password}),env));assert.equal((await worker.fetch(request('/api/me',undefined,browser.header()),env)).status,200);
}));
test('basic mode blocks all email links and recovery callbacks without upstream mail calls',async()=>withFixture(async f=>{
 const env={...emailSetup(),AUTH_EMAIL_MODE:'basic'};f.options.autoconfirm=true;
 for(const action of ['recover','resend','password']){const response=await worker.fetch(request('/api/auth/email/'+action,{email:user.email,password}),env);assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'email_links_not_enabled'})}
 const callback=await worker.fetch(request('/api/auth/recovery/callback?code=unused'),env);assert.equal(callback.headers.get('location'),origin+'/?authError=recovery_expired');
 assert.equal(f.calls.some(c=>['/auth/v1/recover','/auth/v1/resend','/auth/v1/token','/auth/v1/user'].includes(c.path)),false);
}));
test('basic signup enforces password and shared signup quotas, conceals existing accounts and refuses a missing session',async()=>withFixture(async f=>{
 const env={...emailSetup(),AUTH_EMAIL_MODE:'basic',AUTH_EMAIL_DAILY_BUDGET:'2'};f.options.autoconfirm=true;
 assert.equal((await worker.fetch(request('/api/auth/email/signup',{email:user.email,password:'short'}),env)).status,400);
 f.options.signupError=true;const existing=await worker.fetch(request('/api/auth/email/signup',{email:user.email,password}),env);assert.equal(existing.status,200);assert.deepEqual(await existing.json(),{accepted:true,next:'signin'});assert.equal(existing.headers.getSetCookie().some(c=>c.startsWith('__Host-momento-auth=')&&!c.includes('Max-Age=0')),false);
 f.options.signupError=false;f.options.noSignupSession=true;assert.equal((await worker.fetch(request('/api/auth/email/signup',{email:'other@example.test',password}),env)).status,503);
 assert.equal((await worker.fetch(request('/api/auth/email/signup',{email:'third@example.test',password}),env)).status,429);assert.equal(f.calls.filter(c=>c.path==='/auth/v1/signup').length,2);
 assert.equal(externalAuthConfiguration({...env,AUTH_EMAIL_MODE:'unknown'}).configured,false);
}));

 test('basic signup never keeps cookies when Auth cannot verify the new identity',async()=>withFixture(async f=>{
 const env={...emailSetup(),AUTH_EMAIL_MODE:'basic'};f.options.autoconfirm=true;f.rejectUser();
 const response=await worker.fetch(request('/api/auth/email/signup',{email:user.email,password}),env);assert.equal(response.status,503);
 const browser=jar();browser.apply(response);assert.equal(browser.values.size,0);assert.equal((await worker.fetch(request('/api/me',undefined,browser.header()),env)).status,401);
}));
