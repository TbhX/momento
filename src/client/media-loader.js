/* The conference SDK is fetched only for a call or a local video effect. */
const MomentoVideoSDK=window.MomentoVideoSDK=(()=>{
 let pending=null;
 function load(){
  if(window.LivekitClient)return Promise.resolve(window.LivekitClient);
  if(pending)return pending;
  pending=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='/livekit-client.js';script.async=true;
   let timer;const cleanup=()=>{clearTimeout(timer);script.onload=null;script.onerror=null};
   const fail=()=>{cleanup();script.remove();pending=null;reject(Error('Le module vidéo n’a pas pu être chargé. Vérifiez votre connexion et réessayez.'))};
   script.onload=()=>{if(!window.LivekitClient){fail();return}cleanup();resolve(window.LivekitClient)};script.onerror=fail;timer=setTimeout(fail,15000);document.head.append(script);
  });return pending;
 }
 return{load};
})();
