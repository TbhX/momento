import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spotifyRoute,sealSpotify,readSpotify,SPOTIFY_COOKIES as cookies} from '../worker/spotify.mjs';
const origin='https://momento.example',secret='isolated-test-secret-with-over-32-characters';
function fixture(){const jar=new Map(),writes=[],claims=new Set(),calls=[];return {env:{SUPABASE_DATA_ENABLED:'true',AUTH_COOKIE_SECRET:secret},user:{id:'member'},session:'session',origin,context:{jar,put(n,v,o){jar.set(n,v);writes.push({n,v,o})}},writes,calls,limit:async()=>{},claim:async(k)=>{assert.ok(k.startsWith('auth:recovery-use:spotify:'));if(claims.has(k))return false;claims.add(k);return true},fetcher:async(url,init)=>{calls.push({url,init});return Response.json({access_token:'TEST-ACCESS',refresh_token:'TEST-REFRESH',scope:'user-library-read',expires_in:3600})}}}
function req(path,method='GET',headers={}){return new Request(origin+path,{method,headers:{Origin:origin,'X-Momento-Request':'1',...headers}})}
async function connect(f){const r=await spotifyRoute(req('/api/spotify/connect','POST'),f);return new URL((await r.json()).url)}
test('Spotify PKCE uses least privilege, one-use state and encrypted short-lived session cookies',async()=>{
 const f=fixture(),url=await connect(f),flowCookie=f.context.jar.get(cookies[0]);const flow=await readSpotify(secret,flowCookie,'member','session');
 assert.equal(url.origin,'https://accounts.spotify.com');assert.equal(url.searchParams.get('scope'),'user-library-read');assert.equal(url.searchParams.get('redirect_uri'),origin+'/spotify');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(url.searchParams.get('code_challenge'),Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(flow.verifier))).toString('base64url'));
 assert.ok(!flowCookie.includes(flow.verifier));const callback=req('/spotify?state='+flow.state+'&code=fixture');const r=await spotifyRoute(callback,f);assert.equal(r.status,303);assert.equal(r.headers.get('Location'),origin+'/#table-ronde');assert.equal(await r.text(),'');
 const access=await readSpotify(secret,f.context.jar.get(cookies[1]),'member','session');assert.equal(access.token,'TEST-ACCESS');assert.equal(access.refresh_token,undefined);assert.ok(access.expires<=Date.now()+600000);assert.equal(f.calls.length,1);assert.equal(f.calls[0].init.body.get('client_secret'),null);
 f.context.jar.set(cookies[0],flowCookie);await assert.rejects(spotifyRoute(callback,f),/spotify_invalid_state/);assert.equal(f.calls.length,1);
});
test('Spotify cookies reject other accounts, sessions, expiry, tampering and wrong purpose',async()=>{
 const f=fixture();await connect(f);const value=f.context.jar.get(cookies[0]);for(const [u,s] of [['other','session'],['member','other']])await assert.rejects(readSpotify(secret,value,u,s),/spotify_reconnect/);
 await assert.rejects(readSpotify(secret,value+'x','member','session'),/spotify_reconnect/);await assert.rejects(readSpotify(secret,value,'member','session',Date.now()+600001),/spotify_reconnect/);
 f.context.jar.set(cookies[1],value);await assert.rejects(spotifyRoute(req('/api/spotify/likes'),f),/spotify_reconnect/);assert.equal(f.calls.length,0);
});
test('Spotify rejects wrong/duplicate state and CSRF before external requests',async()=>{
 const f=fixture(),url=await connect(f),value=f.context.jar.get(cookies[0]),state=url.searchParams.get('state');for(const query of ['state=wrong&code=x','state='+state+'&state='+state+'&code=x']){f.context.jar.set(cookies[0],value);await assert.rejects(spotifyRoute(req('/spotify?'+query),f),/spotify_invalid_state/)}
 await assert.rejects(spotifyRoute(req('/api/spotify/connect','POST',{Origin:'https://foreign.example'}),f),e=>e.status===403);assert.equal(f.calls.length,0);
});
test('Spotify library exposes bounded metadata only, handles malformed items and upstream revocation',async()=>{
 const f=fixture();f.context.jar.set(cookies[1],await sealSpotify(secret,{kind:'access',user:'member',session:'session',token:'TEST-ACCESS',expires:Date.now()+600000}));
 f.fetcher=async(url,init)=>{assert.equal(url,'https://api.spotify.com/v1/me/tracks?limit=20&offset=0');assert.equal(init.headers.Authorization,'Bearer TEST-ACCESS');return Response.json({items:[null,{track:{id:'invalid',name:'x'}},...Array.from({length:30},()=>({track:{id:'a'.repeat(22),name:'x'.repeat(300),artists:[null,{name:'artist'}],secret:'never'}}))]})};
 const result=await (await spotifyRoute(req('/api/spotify/likes'),f)).json();assert.equal(result.items.length,18);assert.equal(result.items[0].name.length,180);assert.deepEqual(Object.keys(result.items[0]),['id','name','artists','url']);assert.ok(!JSON.stringify(result).includes('TEST-ACCESS'));
 f.fetcher=async()=>new Response(null,{status:429,headers:{'Retry-After':'9000'}});await assert.rejects(spotifyRoute(req('/api/spotify/likes'),f),e=>e.status===429&&e.retryAfter===3600);
 f.fetcher=async()=>new Response(null,{status:401});await assert.rejects(spotifyRoute(req('/api/spotify/likes'),f),e=>e.status===401);assert.ok(cookies.every(n=>f.context.jar.get(n)===''));
});
test('Spotify cancellation and disconnect do not fetch or retain access',async()=>{
 const f=fixture(),url=await connect(f);assert.equal((await spotifyRoute(req('/spotify?state='+url.searchParams.get('state')+'&error=access_denied'),f)).status,303);assert.equal(f.calls.length,0);
 assert.equal((await spotifyRoute(req('/api/spotify/disconnect','POST'),f)).status,200);assert.ok(cookies.every(n=>f.context.jar.get(n)===''));
});
