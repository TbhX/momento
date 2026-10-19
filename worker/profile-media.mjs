const VIDEO_BACKGROUNDS=['none','blur','rose','night','studio','custom'];
async function mediaKeys(id){const root=(await accountKey(id)).replace(/\.json$/,'');return{settings:root+'/media.json',photo:root+'/photo.jpg',background:root+'/background.jpg'}}
async function readMediaSettings(env,id){const keys=await mediaKeys(id),obj=await env.BUCKET.get(keys.settings),raw=obj?await obj.json():{};return{photoVersion:typeof raw.photoVersion==='string'?raw.photoVersion:null,backgroundVersion:typeof raw.backgroundVersion==='string'?raw.backgroundVersion:null,videoBackground:VIDEO_BACKGROUNDS.includes(raw.videoBackground)?raw.videoBackground:'none'}}
async function withProfileMedia(env,id,profile){return profile?{...profile,...await readMediaSettings(env,id)}:null}
async function boundedMediaBytes(stream,limit,code='image_too_large'){if(!stream)return new Uint8Array();const reader=stream.getReader(),parts=[];let size=0;try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw fail(code,413)}parts.push(value)}}finally{reader.releaseLock()}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength}return bytes}
// The client re-encodes to JPEG; the server validates dimensions and strips metadata segments.
function cleanProfileJPEG(bytes,maxWidth,maxHeight){
 if(bytes.length<16||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw fail('invalid_image',400);
 let pos=2,width=0,height=0,scan=false;const parts=[bytes.slice(0,2)];
 while(pos<bytes.length-2){const start=pos;if(bytes[pos++]!==255)throw fail('invalid_image',400);while(bytes[pos]===255)pos++;const marker=bytes[pos++];if(marker===0||marker===216||marker===217||marker>=208&&marker<=215)throw fail('invalid_image',400);const length=(bytes[pos]<<8)|bytes[pos+1];if(length<2||pos+length>bytes.length)throw fail('invalid_image',400);
  if([192,193,194].includes(marker)){height=(bytes[pos+3]<<8)|bytes[pos+4];width=(bytes[pos+5]<<8)|bytes[pos+6];if(!width||!height||width>maxWidth||height>maxHeight)throw fail('image_dimensions',400)}
  if(marker===218){if(!width||!height)throw fail('invalid_image',400);parts.push(bytes.slice(start));scan=true;break}
  if(!(marker>=224&&marker<=239||marker===254))parts.push(bytes.slice(start,pos+length));pos+=length;
 }
 if(!scan)throw fail('invalid_image',400);const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length}return result;
}
async function profileMediaAPI(request,env,id,url){
 if(!env.BUCKET)throw fail('account_storage_unavailable',503);const account=await env.BUCKET.get(await accountKey(id)),record=account?await account.json():null;if(!record?.profile)throw fail('registration_required',403);
 const keys=await mediaKeys(id),settings=await readMediaSettings(env,id),kind=url.pathname.split('/').at(-1),isPhoto=kind==='photo';
 if(!['photo','background','media'].includes(kind))throw fail('not_found',404);
 if(request.method==='GET'){
  if(kind==='media')return json(settings);if(!(isPhoto?settings.photoVersion:settings.backgroundVersion))throw fail('not_found',404);const image=await env.BUCKET.get(isPhoto?keys.photo:keys.background);if(!image)throw fail('not_found',404);return new Response(image.body,{headers:{...secureHeaders,'Content-Type':'image/jpeg','Content-Disposition':'inline'}});
 }
 if(request.headers.get('Origin')!==url.origin||request.headers.get('X-Momento-Request')!=='1')throw fail('invalid_origin',403);
 if(kind==='media'&&request.method==='POST'){const body=await bodyJSON(request);if(!VIDEO_BACKGROUNDS.includes(body.videoBackground)||body.videoBackground==='custom'&&!settings.backgroundVersion)throw fail('invalid_background',400);settings.videoBackground=body.videoBackground}
 else if(request.method==='DELETE'&&kind!=='media'){await env.BUCKET.delete(isPhoto?keys.photo:keys.background);settings[isPhoto?'photoVersion':'backgroundVersion']=null;if(!isPhoto&&settings.videoBackground==='custom')settings.videoBackground='none'}
 else if(request.method==='POST'&&kind!=='media'){
  if(request.headers.get('Content-Type')!=='image/jpeg')throw fail('image_type',415);const limit=isPhoto?512*1024:1024*1024;if(Number(request.headers.get('Content-Length')||0)>limit)throw fail('image_too_large',413);const bytes=await boundedMediaBytes(request.body,limit);const clean=cleanProfileJPEG(bytes,isPhoto?1024:1920,isPhoto?1024:1080);
  await env.BUCKET.put(isPhoto?keys.photo:keys.background,clean,{httpMetadata:{contentType:'image/jpeg'}});settings[isPhoto?'photoVersion':'backgroundVersion']=crypto.randomUUID();if(!isPhoto)settings.videoBackground='custom';
 }else throw fail('method_not_allowed',405);
 await env.BUCKET.put(keys.settings,JSON.stringify(settings),{httpMetadata:{contentType:'application/json'}});return json(settings);
}
async function peerProfilePhoto(request,env,id,encounterId){
 if(request.method!=='GET')throw fail('method_not_allowed',405);if(!env.DB||!env.BUCKET)throw fail('service_unavailable',503);
 const encounter=await encounterFor(env.DB,encounterId,id),peer=other(encounter,id),now=Date.now();if(await blocked(env.DB,id,peer)||await one(env.DB,'SELECT id FROM members WHERE id IN (?,?) AND suspended=1',id,peer)||encounter.status==='cancelled')throw fail('forbidden',403);
 const inRound=encounter.status==='live'&&encounter.started_at&&now>=encounter.started_at+encounter.round*330000&&now<encounter.started_at+(encounter.round+1)*330000;if(!inRound)await matchFor(env.DB,encounterId,id,now);
 const settings=await readMediaSettings(env,peer);if(!settings.photoVersion)throw fail('not_found',404);const keys=await mediaKeys(peer),image=await env.BUCKET.get(keys.photo);if(!image)throw fail('not_found',404);return new Response(image.body,{headers:{...secureHeaders,'Content-Type':'image/jpeg','Content-Disposition':'inline'}});
}
async function deleteProfileMedia(env,id){const keys=await mediaKeys(id);await Promise.all([keys.photo,keys.background,keys.settings].map(key=>env.BUCKET.delete(key)))}

async function videoEffectsAsset(request,env,name){
 if(!['GET','HEAD'].includes(request.method))throw fail('method_not_allowed',405);
 const asset=ASSETS['/assets/video-effects/'+name];if(!asset?.binaryGzip)throw fail('not_found',404);
 const headers={...secureHeaders,'Content-Type':asset.contentType,'Cache-Control':'private, max-age=86400'};
 const body=request.method==='HEAD'?null:new Blob([Uint8Array.from(atob(asset.binaryGzip),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'));
 return new Response(body,{headers});
}
