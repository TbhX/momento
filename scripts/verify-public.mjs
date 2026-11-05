/* Read-only public release checks: no cookies, credentials, accounts or fixture writes. */
import {pathToFileURL} from 'node:url';
export async function verifyPublic(origin,fetcher=fetch){
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('Expected a public HTTPS origin.');
 const checks=[],assets=new Map(),titles=new Set();
 async function read(path,type,status=200){
  const response=await fetcher(new URL(path,base),{redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(response.status!==status)throw Error('Unexpected status on '+path+': '+response.status);
  if(!response.headers.get('content-type')?.includes(type))throw Error('Unexpected content type on '+path);
  checks.push({path,status:response.status});return response;
 }
 for(const path of ['/','/concept/','/formules/','/speed-dating/','/creer-un-salon/']){
  const r=await read(path,'text/html');if(!r.headers.get('cache-control')?.includes('no-store'))throw Error('HTML must not be cached: '+path);
  const html=await r.text(),title=html.match(/<title>([^<]+)<\/title>/i)?.[1],canonical=html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
  if(!title||titles.has(title))throw Error('Missing or duplicate title on '+path);titles.add(title);
  if(canonical!==new URL(path,base).href)throw Error('Incorrect canonical on '+path);
  if(!/<meta\b[^>]*name="robots"[^>]*content="index,follow"/i.test(html))throw Error('Public indexing metadata missing on '+path);
  for(const m of html.matchAll(/<script\b[^>]*src="([^"]+)"|<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/gi)){
   const url=new URL(m[1]||m[2],base);if(url.origin!==base.origin)throw Error('Unexpected external startup asset');assets.set(url.pathname+url.search,m[1]?'javascript':'text/css');
  }
 }
 const entries=[...assets.entries()];if(!entries.length||entries.length>100)throw Error('Unexpected startup asset inventory');
 for(let i=0;i<entries.length;i+=4)await Promise.all(entries.slice(i,i+4).map(async([path,type])=>{const r=await read(path,type);await r.body?.cancel()}));
 const configuration=await (await read('/api/auth/config','application/json')).json();
 if(configuration.mode!=='supabase'||configuration.configured!==true||configuration.email!==true)throw Error('Public email authentication unavailable');
 await (await read('/__momento_release_missing__','text/html',404)).body?.cancel();
 return{passed:true,checks,publicPages:titles.size,startupAssets:assets.size,auth:{mode:configuration.mode,email:configuration.email,signup:configuration.emailSignup===true,recovery:configuration.emailRecovery===true},authenticatedMemberTested:false,mediaTested:false,commercialOpeningValidated:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyPublic(process.argv[2]||'https://momento-7se.pages.dev/')));
