/* Applied to successes and failures, including native Pages assets. */
export function hardenResponse(response,request,env={}){
 const headers=new Headers(response.headers),type=headers.get('Content-Type')||'',path=new URL(request.url).pathname;
 headers.set('X-Content-Type-Options','nosniff');headers.set('X-Frame-Options','DENY');
 headers.set('Referrer-Policy','no-referrer');headers.set('Strict-Transport-Security','max-age=31536000');
 headers.set('Permissions-Policy','camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), browsing-topics=()');
 headers.set('Cross-Origin-Opener-Policy','same-origin');
 if(path.startsWith('/api/')||type.includes('text/html')){headers.set('Cache-Control','private, no-store');headers.set('Pragma','no-cache');headers.set('Cross-Origin-Resource-Policy','same-origin')}
 if(type.includes('text/html')){
  let csp=headers.get('Content-Security-Policy')||"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'";
  // Native media is still closed: do not allow third-party signalling/frames
  // until the authenticated media integration defines exact reviewed origins.
  if(env.SUPABASE_DATA_ENABLED==='true')csp=csp.replace(/(?:^|;)\s*(?:connect-src|frame-src)\s+[^;]*/g,'')+"; connect-src 'self'; frame-src 'none'";
  headers.set('Content-Security-Policy',csp.replace(/(?:^|;)\s*(?:base-uri|frame-ancestors|script-src-elem)\s+[^;]*/g,'')+"; base-uri 'none'; frame-ancestors 'none'; script-src-elem 'self';");
 }
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
