import {access,stat} from 'node:fs/promises';
import {externalAuthConfiguration} from '../worker/external-auth.mjs';
const config=externalAuthConfiguration(process.env);
const missing=[...config.issues];
if(String(process.env.AUTH_COOKIE_SECRET||'').length<32)missing.push('auth_cookie_secret');
if(process.env.AUTH_SMS_ENABLED==='true'&&!config.sms)missing.push('sms_configuration');
if(process.env.AUTH_EMAIL_ENABLED==='true'&&!config.email)missing.push('email_configuration');
if(!String(process.env.MOMENTO_ADMIN_USER_IDS||'').split(',').some(s=>/^[0-9a-f-]{36}$/i.test(s.trim())))missing.push('admin_user_ids');
for(const path of ['production-dist/worker.js','production-dist/public/index.html','production-dist/public/auth.js'])try{await access(path)}catch{missing.push('missing_build:'+path)}
let workerBytes=0;try{workerBytes=(await stat('production-dist/worker.js')).size}catch{}
// Names and booleans only: never print environment values, keys, cookies or tokens.
console.log(JSON.stringify({ready:missing.length===0,missing,workerBytes,providers:config.providers,smsEnabled:config.sms,emailEnabled:config.email,externalProviderValidation:'required',hostingDeployment:'required'},null,2));
if(missing.length)process.exitCode=1;
