import {readFile,readdir,mkdir,rm,writeFile,copyFile,cp} from 'node:fs/promises';
import {build} from 'esbuild';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const effects=await build({entryPoints:['src/vendor/background-entry.js'],bundle:true,write:false,format:'iife',platform:'browser',target:['es2020'],minify:true,legalComments:'eof',plugins:[{name:'livekit-global',setup(build){build.onResolve({filter:/^livekit-client$/},()=>({path:'livekit-client',namespace:'livekit-global'}));build.onLoad({filter:/.*/,namespace:'livekit-global'},()=>({contents:'module.exports=globalThis.LivekitClient;',loader:'js'}))}}]});
const assets={};for(const name of await readdir('src/client'))assets['/'+name]=name.endsWith('.png')?{binary:(await readFile('src/client/'+name)).toString('base64')}:await readFile('src/client/'+name,'utf8');
const require=createRequire(import.meta.url),processorRequire=createRequire(require.resolve('@livekit/track-processors')),visionDirectory=dirname(processorRequire.resolve('@mediapipe/tasks-vision'));
const effectHashes=JSON.parse(await readFile('src/vendor/effects-assets.json','utf8'));
for(const [name,hash] of Object.entries(effectHashes)){
 const bytes=await readFile(name==='selfie_segmenter.tflite'?'src/vendor/selfie-segmenter.tflite':join(visionDirectory,'wasm',name));
 if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Unexpected video effects asset: '+name);
 assets['/assets/video-effects/'+name]={binaryGzip:gzipSync(bytes,{level:9}).toString('base64'),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream'};
}
assets['/background-processors.js']=effects.outputFiles[0].text;
assets['/livekit-client.js']=await readFile('node_modules/livekit-client/dist/livekit-client.umd.js','utf8');
const worker=(await readFile('worker/shop.mjs','utf8'))+'\n'+(await readFile('worker/profile-media.mjs','utf8'))+'\n'+(await readFile('worker/billing.mjs','utf8'))+'\n'+(await readFile('worker/service.mjs','utf8'))+'\n'+(await readFile('worker/handler.mjs','utf8'));
if(!process.argv.includes('--standalone')&&!process.argv.includes('--pages')){
await mkdir('worker',{recursive:true});await writeFile('worker/index.js','const ASSETS='+JSON.stringify(assets)+';\n'+worker);
await rm('dist',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});await copyFile('worker/index.js','dist/server/index.js');await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built self-contained Worker with embedded assets.');

await cp('drizzle','dist/.openai/drizzle',{recursive:true});
}

const pagesTarget=process.argv.includes('--pages');
if(process.argv.includes('--standalone')||pagesTarget){
 const outputDir=pagesTarget?'pages-dist':'production-dist',publicDir=pagesTarget?outputDir:outputDir+'/public';
 await rm(outputDir,{recursive:true,force:true});await mkdir(publicDir,{recursive:true});
 for(const [path,value] of Object.entries(assets)){
  const target=publicDir+path;await mkdir(dirname(target),{recursive:true});
  let bytes=typeof value==='string'?value:value.binaryGzip?gunzipSync(Buffer.from(value.binaryGzip,'base64')):Buffer.from(value.binary,'base64');
  if(path==='/confidentialite.html')bytes=String(bytes).replace('La connexion est fournie par ChatGPT. Momento utilise l’identifiant transmis par cette connexion pour isoler votre compte et l’adresse électronique de l’organisateur pour protéger son espace.','La connexion est fournie par Supabase Auth, via les fournisseurs activés par Momento : Google ou adresse e-mail et mot de passe, selon leur activation. Le SMS reste désactivé. Aucun compte ChatGPT n’est nécessaire. Momento utilise votre identifiant vérifié pour isoler votre profil. Votre adresse électronique et/ou numéro de téléphone servent à votre connexion ; votre numéro n’est pas affiché aux membres. Les droits d’administration sont définis côté serveur.').replace('Elle ne supprime pas votre compte ChatGPT.','La suppression du compte autonome retire aussi son identité Supabase Auth et ses images privées. Si une étape échoue, le compte reste fermé aux rencontres et vous pouvez terminer la suppression depuis l’écran de connexion. Les sessions révoquées sont refusées côté serveur.').replace('Les profils sont enregistrés dans le stockage R2 de l’hébergement Sites et les données de fonctionnement dans sa base D1.','Les profils et leurs références d’images sont enregistrés dans Supabase Postgres ; les photos et décors sont dans un bucket Supabase Storage privé. Cloudflare Pages héberge l’application. Les salons réels ne sont pas encore raccordés.').replace('Supprimer mon profil Momento','Supprimer mon compte Momento').replace('Version du 19 octobre 2026.','Version du 20 octobre 2026.').replace('Les services de connexion et d’hébergement ont leurs propres traitements.','Des cookies de connexion nécessaires, sécurisés et inaccessibles au JavaScript, maintiennent votre session. Les fournisseurs de connexion, Supabase et Cloudflare ont leurs propres traitements. Aucun carnet de contacts ni publication sur vos réseaux sociaux n’est demandé.');
  await writeFile(target,bytes);
 }
 // Large WASM/model assets are static files, not Worker code (free-tier code size).
 const standalone=worker.replace('export default {async fetch(request,env)', 'const momentoApplication={async fetch(request,env)');
 if(standalone===worker)throw Error('Standalone application export not found.');
 await build({stdin:{contents:"import {withExternalAuth} from './worker/external-auth.mjs';\nconst ASSETS={};\n"+standalone+'\nexport default withExternalAuth(momentoApplication,{staticHeaders:secureHeaders,staticBinding:'+JSON.stringify(pagesTarget?'ASSETS':'PUBLIC_ASSETS')+',mediaCodec:{boundedMediaBytes,cleanProfileJPEG}});',resolveDir:process.cwd(),sourcefile:'momento-standalone.mjs'},bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,outfile:outputDir+(pagesTarget?'/_worker.js':'/worker.js'),legalComments:'eof'});
 if(pagesTarget)await writeFile(outputDir+'/_routes.json',JSON.stringify({version:1,include:['/*'],exclude:[]},null,2)+'\n');
 else await cp('drizzle',outputDir+'/drizzle',{recursive:true});
 console.log('Built '+(pagesTarget?'Cloudflare Pages':'standalone Worker')+' target: Supabase Auth with selectable Postgres/Storage account backend, no Sites identity.');
}
