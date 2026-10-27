import {readFile,readdir,mkdir,rm,writeFile,copyFile,cp} from 'node:fs/promises';
import {build} from 'esbuild';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const effects=await build({entryPoints:['src/vendor/background-entry.js'],bundle:true,write:false,format:'iife',platform:'browser',target:['es2020'],minify:true,legalComments:'eof',plugins:[{name:'livekit-global',setup(build){build.onResolve({filter:/^livekit-client$/},()=>({path:'livekit-client',namespace:'livekit-global'}));build.onLoad({filter:/.*/,namespace:'livekit-global'},()=>({contents:'module.exports=globalThis.LivekitClient;',loader:'js'}))}}]});
const assets={};for(const name of await readdir('src/client'))assets['/'+name]=/\.(png|jpg|mp4|gif)$/.test(name)?{binary:(await readFile('src/client/'+name)).toString('base64')}:await readFile('src/client/'+name,'utf8');
assets['/bistro-3d-engine.js']=(await build({entryPoints:['src/vendor/bistro-3d-entry.js'],bundle:true,write:false,format:'iife',platform:'browser',target:['es2020'],minify:true,legalComments:'eof'})).outputFiles[0].text;
const publicSEO=createRequire(import.meta.url)('../src/client/public-seo.js');
const publicTemplate=assets['/index.html'];
for(const [key,info] of Object.entries(publicSEO.pages))assets[info.path+'index.html']=publicSEO.renderDocument(publicTemplate,key);
assets['/robots.txt']='User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: '+publicSEO.origin+'/sitemap.xml\n';
assets['/sitemap.xml']='<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+Object.values(publicSEO.pages).map(p=>'<url><loc>'+publicSEO.origin+p.path+'</loc></url>').join('')+'</urlset>';
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
  if(path==='/confidentialite.html'){
   const notices={identity:'La connexion est gérée par Supabase Auth. La version autonome de Momento ne demande aucun compte ChatGPT. L’adresse et le mot de passe servent à se connecter ; les droits d’administration sont définis côté serveur, sans privilège lié à l’adresse saisie.',storage:'Les profils et références d’images sont enregistrés dans Supabase Postgres. Les photos et décors sont dans un bucket Supabase Storage privé, accessibles uniquement après autorisation par Momento. Cloudflare Pages héberge l’application.',deletion:'La suppression ferme le compte, retire ses images privées puis son identité Supabase Auth et ses données liées. Si une étape échoue, le compte reste fermé aux rencontres et vous pouvez terminer la suppression depuis l’écran de compte. Les comptes externes ne sont pas supprimés.'};
   bytes=String(bytes).replace(/<p data-runtime-privacy="(identity|storage|deletion)">[\s\S]*?<\/p>/g,(_,kind)=>'<p data-runtime-privacy="'+kind+'">'+notices[kind]+'</p>');
  }
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
