import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyPublic} from '../scripts/verify-public.mjs';
function fixture(change=()=>{}){return async(url,options)=>{assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.body,undefined);const path=url.pathname;let type='text/html',status=200,body=`<title>${path}</title><link rel="canonical" href="https://fixture.test${path}"><meta name="robots" content="index,follow"><script src="/auth.js"></script><link rel="stylesheet" href="/auth.css">`;
 if(path==='/auth.js'){type='text/javascript';body='/* public */'}if(path==='/auth.css'){type='text/css';body='body{}'}if(path==='/api/auth/config'){type='application/json';body=JSON.stringify({mode:'supabase',configured:true,email:true,emailSignup:true,emailRecovery:false})}if(path==='/__momento_release_missing__')status=404;
 const response={type,status,body};change(path,response);return new Response(response.body,{status:response.status,headers:{'Content-Type':response.type,'Cache-Control':'no-store'}})}}
test('public release check deduplicates assets and never claims member or media readiness',async()=>{const result=await verifyPublic('https://fixture.test/',fixture());assert.equal(result.publicPages,5);assert.equal(result.startupAssets,2);assert.equal(result.commercialOpeningValidated,false);assert.equal(result.auth.recovery,false);assert.equal(result.authenticatedMemberTested,false)});
test('public release check rejects broken assets, incorrect canonical, auth outage and soft 404',async()=>{for(const change of [(p,r)=>{if(p==='/auth.js')r.type='text/html'},(p,r)=>{if(p==='/concept/')r.body=r.body.replace('fixture.test/concept/','wrong.test/concept/')},(p,r)=>{if(p==='/api/auth/config')r.body='{}'},(p,r)=>{if(p==='/__momento_release_missing__')r.status=200}])await assert.rejects(verifyPublic('https://fixture.test/',fixture(change)));await assert.rejects(verifyPublic('https://name:secret@fixture.test/',fixture()))});
test('an Auth outage stops the public check before any page or asset request',async()=>{
 for(const status of [503,429]){
  const paths=[];
  await assert.rejects(verifyPublic('https://fixture.test/',fixture((p,r)=>{paths.push(p);if(p==='/api/auth/config')r.status=status})),new RegExp('Unexpected status on /api/auth/config: '+status));
  assert.deepEqual(paths,['/api/auth/config']);
 }
 const paths=[];
 await assert.rejects(verifyPublic('https://fixture.test/',fixture((p,r)=>{paths.push(p);if(p==='/api/auth/config')r.body='{}'})),/authentication unavailable/);
 assert.deepEqual(paths,['/api/auth/config']);
});
test('closed signups still allow the complete availability check for existing accounts',async()=>{
 const paths=[];
 const result=await verifyPublic('https://fixture.test/',fixture((p,r)=>{paths.push(p);if(p==='/api/auth/config')r.body=JSON.stringify({mode:'supabase',configured:true,email:true,emailSignup:false,emailRecovery:false})}));
 assert.equal(paths[0],'/api/auth/config');assert.equal(result.auth.signup,false);assert.equal(result.auth.email,true);assert.equal(result.publicPages,5);assert.equal(result.startupAssets,2);assert.ok(paths.includes('/__momento_release_missing__'));
});
