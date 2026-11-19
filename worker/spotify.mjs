// Optional, short-lived Spotify library import. Tokens never enter page JavaScript.
export const SPOTIFY_COOKIES=['__Host-momento-spotify-flow','__Host-momento-spotify'];
const client='93613b73b6ec47f2a1da346b55dd5890';
const fail=(code,status=400)=>Object.assign(Error(code),{momentoAuthError:true,status});
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(secret){if(typeof secret!=='string'||secret.length<32)throw fail('spotify_unavailable',503);return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('momento:spotify:v1:'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt'])}
export async function sealSpotify(secret,data){const iv=crypto.getRandomValues(new Uint8Array(12));return b64(iv)+'.'+b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),new TextEncoder().encode(JSON.stringify(data))))}
export async function readSpotify(secret,value,user,session,now=Date.now()){try{if(typeof value!=='string'||value.length>3800)throw 0;const parts=value.split('.');if(parts.length!==2)throw 0;const [iv,body]=parts;const record=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv)},await key(secret),bytes(body))));if(record.user!==user||record.session!==session||!Number.isFinite(record.expires)||record.expires<=now||record.expires>now+600000)throw 0;return record}catch{throw fail('spotify_reconnect',401)}}
export async function spotifyRoute(request,{env,context,user,session,origin,limit,claim,fetcher=fetch}){
 const url=new URL(request.url),path=url.pathname;const put=(name,value,age=600)=>context.put(name,value,{maxAge:age});const clear=()=>SPOTIFY_COOKIES.forEach(n=>put(n,'',0));
 const json=v=>Response.json(v,{headers:{'Cache-Control':'private, no-store'}});
 const redirect=()=>new Response(null,{status:303,headers:{Location:origin+'/#table-ronde','Cache-Control':'private, no-store'}});
 if(!session||env.SUPABASE_DATA_ENABLED!=='true')throw fail('spotify_unavailable',503);
 if(path!=='/spotify'&&request.method==='POST'&&(request.headers.get('Origin')!==origin||request.headers.get('X-Momento-Request')!=='1'))throw fail('invalid_origin',403);
 if(path==='/api/spotify/disconnect'&&request.method==='POST'){clear();return json({disconnected:true})}
 await limit(user.id);
 const redirectURI=origin+'/spotify',clientId=env.SPOTIFY_CLIENT_ID||client;
 if(path==='/api/spotify/connect'&&request.method==='POST'){
  const verifier=b64(crypto.getRandomValues(new Uint8Array(32))),state=b64(crypto.getRandomValues(new Uint8Array(32))),expires=Date.now()+600000;
  put(SPOTIFY_COOKIES[0],await sealSpotify(env.AUTH_COOKIE_SECRET,{kind:'flow',user:user.id,session,verifier,state,expires}));put(SPOTIFY_COOKIES[1],'',0);
  const auth=new URL('https://accounts.spotify.com/authorize');auth.search=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectURI,scope:'user-library-read',state,code_challenge_method:'S256',code_challenge:b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)))}).toString();return json({url:auth.href});
 }
 if(path==='/spotify'&&request.method==='GET'){
  const flow=await readSpotify(env.AUTH_COOKIE_SECRET,context.jar.get(SPOTIFY_COOKIES[0]),user.id,session);put(SPOTIFY_COOKIES[0],'',0);
  if(flow.kind!=='flow'||!/^[A-Za-z0-9_-]{43}$/.test(flow.state)||!/^[A-Za-z0-9_-]{43}$/.test(flow.verifier))throw fail('spotify_invalid_state',400);
  if(url.searchParams.getAll('state').length!==1||url.searchParams.get('state')!==flow.state||!await claim('auth:recovery-use:spotify:'+flow.state,flow.expires))throw fail('spotify_invalid_state',400);
  if(url.searchParams.has('error'))return redirect();
  const code=url.searchParams.get('code');if(url.searchParams.getAll('code').length!==1||!code||code.length>2048)throw fail('spotify_invalid_code',400);
  const response=await fetcher('https://accounts.spotify.com/api/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirectURI,client_id:clientId,code_verifier:flow.verifier})});
  if(!response.ok)throw fail('spotify_connection_failed',502);const token=await response.json();if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>1500||!String(token.scope||'').split(' ').includes('user-library-read')||!Number.isFinite(Number(token.expires_in))||Number(token.expires_in)<1)throw fail('spotify_connection_failed',502);
  const age=Math.min(600,Math.floor(Number(token.expires_in)));put(SPOTIFY_COOKIES[1],await sealSpotify(env.AUTH_COOKIE_SECRET,{kind:'access',user:user.id,session,token:token.access_token,expires:Date.now()+age*1000}),age);return redirect();
 }
 if(path==='/api/spotify/likes'&&request.method==='GET'){
  let record;try{record=await readSpotify(env.AUTH_COOKIE_SECRET,context.jar.get(SPOTIFY_COOKIES[1]),user.id,session);if(record.kind!=='access'||typeof record.token!=='string'||!record.token)throw 0}catch{clear();throw fail('spotify_reconnect',401)}
  const response=await fetcher('https://api.spotify.com/v1/me/tracks?limit=20&offset=0',{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+record.token}});
  if(response.status===401){clear();throw fail('spotify_reconnect',401)}if(response.status===429)throw Object.assign(fail('spotify_rate_limited',429),{retryAfter:Math.min(3600,Math.max(1,Number(response.headers.get('Retry-After'))||60))});if(!response.ok)throw fail('spotify_library_unavailable',502);
  const data=await response.json();return json({items:(Array.isArray(data.items)?data.items:[]).slice(0,20).flatMap(item=>{const t=item?.track;return t&&/^[A-Za-z0-9]{22}$/.test(t.id)&&typeof t.name==='string'?[{id:t.id,name:t.name.slice(0,180),artists:(Array.isArray(t.artists)?t.artists:[]).slice(0,5).map(a=>String(a?.name||'').slice(0,80)).join(', '),url:'https://open.spotify.com/track/'+t.id}]:[]}),limit:20});
 }
 throw fail('method_not_allowed',405);
}
