import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withExternalAuth} from '../worker/external-auth.mjs';

test('Pages serves assets with security headers through its native ASSETS binding, stripping caller identities',async()=>{
 const received=[],app={fetch:async()=>{throw Error('Static request reached the application API')}};
 const worker=withExternalAuth(app,{staticBinding:'ASSETS',staticHeaders:{'Content-Security-Policy':"default-src 'self'"}});
 const env={ASSETS:{async fetch(req){received.push(req);return new Response('momento',{headers:{'Content-Type':'text/html'}})}}};
 const response=await worker.fetch(new Request('https://memento.pages.dev/',{headers:{'oai-authenticated-user-id':'forged'}}),env);
 assert.equal(response.status,200);assert.equal(await response.text(),'momento');assert.equal(received[0].headers.get('oai-authenticated-user-id'),null);assert.equal(response.headers.get('Content-Security-Policy'),"default-src 'self'");
});
test('Pages authentication and protected APIs cannot fall through to public static assets',async()=>{
 let requests=0;const worker=withExternalAuth({fetch:async()=>Response.json({unexpected:true})},{staticBinding:'ASSETS'}),env={ASSETS:{fetch:async()=>{requests++;return new Response('public')}}};
 const config=await worker.fetch(new Request('https://memento.pages.dev/api/auth/config'),env);assert.equal((await config.json()).mode,'supabase');
 for(const path of ['/api/me','/api/me/photo','/api/service/status','/api/profile-photo/other'])assert.equal((await worker.fetch(new Request('https://memento.pages.dev'+path),env)).status,503);
 assert.equal(requests,0);
});
