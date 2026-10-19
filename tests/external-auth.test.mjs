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
function fixture(){const calls=[];let challenge=null,validVerifier=null,rejectUser=false,otpCalls=0,verifyCalls=0;
 const token=()=>({access_token:['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:uuid,exp:Math.floor(Date.now()/1000)+3600,session_id:'test'})).toString('base64url'),'fixture'].join('.'),refresh_token:'fixture-refresh-token',expires_in:3600,token_type:'bearer',user});
 return{calls,token,rejectUser(){rejectUser=true},get otpCalls(){return otpCalls},get verifyCalls(){return verifyCalls},fetch:async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url),body=init.body?JSON.parse(init.body):null;calls.push({path:url.pathname,query:url.searchParams,body});
  if(url.pathname==='/auth/v1/settings')return Response.json({external:{google:true,apple:false,facebook:true,phone:true}});
  if(url.pathname==='/auth/v1/otp'){otpCalls++;return Response.json({})}
  if(url.pathname==='/auth/v1/verify'){verifyCalls++;if(body.token!=='123456')return Response.json({msg:'Invalid OTP',code:'otp_expired'},{status:403});return Response.json(token())}
  if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='pkce'){if(!body.code_verifier)return Response.json({msg:'invalid verifier',code:'bad_code_verifier'},{status:400});const digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.code_verifier))).toString('base64url');if(challenge&&digest!==challenge)return Response.json({msg:'invalid verifier'},{status:400});validVerifier=body.code_verifier;return Response.json(token())}
  if(url.pathname==='/auth/v1/user')return rejectUser?Response.json({msg:'rejected'},{status:401}):Response.json(user);
  if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204});
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
