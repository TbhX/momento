/* Read-only deployment checks. No credentials, accounts or hosted fixtures. */
const target=new URL(process.argv[2]||'https://momento-7se.pages.dev/');
if(target.protocol!=='https:'||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw Error('Expected a public HTTPS origin.');
const checks=[];
async function check(path,expected,options={}){
 const response=await fetch(new URL(path,target),{redirect:'error',signal:AbortSignal.timeout(10000),...options});
 if(response.status!==expected)throw Error('Unexpected status on '+path+': '+response.status);
 for(const [header,part] of [['x-content-type-options','nosniff'],['x-frame-options','DENY'],['referrer-policy','no-referrer'],['cache-control','no-store']])if(!response.headers.get(header)?.includes(part))throw Error('Missing '+header+' on '+path);
 if(path==='/'){
  const csp=response.headers.get('content-security-policy')||'';
  for(const directive of ["frame-ancestors 'none'","script-src-elem 'self'","base-uri 'none'","connect-src 'self'","frame-src 'none'"])if(!csp.includes(directive))throw Error('Missing CSP '+directive);
  if(/\*\.livekit|\*\.daily/.test(csp))throw Error('Unexpected media wildcard');
 }
 await response.body?.cancel();checks.push({path,status:response.status});
}
await check('/',200);
await check('/api/me',401);
await check('/api/auth/mfa',401);
await check('/api/me',403,{headers:{'Origin':'https://foreign.invalid','Sec-Fetch-Site':'cross-site'}});
await check('/api/auth/mfa/enroll',403,{method:'POST',headers:{'Origin':'https://foreign.invalid','Sec-Fetch-Site':'cross-site','Content-Type':'application/json'},body:'{}'});
console.log(JSON.stringify({passed:true,checks,authenticatedMemberTested:false,hostedFixturesCreated:false}));
