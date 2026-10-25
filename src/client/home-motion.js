/* Decorative homepage media: no devices, audio, account data or third-party requests. */
const MomentoHomeMotion=(()=>{
 let dispose=null;
 function stop(){dispose?.();dispose=null}
 function mount(root){
  stop();if(!root)return;
  const video=root.querySelector('video'),button=root.querySelector('button'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let alive=true,visible=true,choice=null,failed=false,ticket=0,shouldPlay=false;
  video.muted=true;video.defaultMuted=true;button.hidden=false;
  function pause(){ticket++;shouldPlay=false;video.autoplay=false;video.pause();video.hidden=true}
  function sync(){
   const wanted=choice===null?!reduced.matches:choice;
   const run=alive&&root.isConnected&&!document.hidden&&visible&&!failed&&wanted;
   button.textContent=wanted&&!failed?'Pause':'Animer';
   button.setAttribute('aria-label',wanted&&!failed?'Mettre en pause l’animation du logo':'Animer le logo Momento');
   button.disabled=failed;
   if(!run){pause();return}
   const current=++ticket;shouldPlay=true;video.autoplay=true;
   if(!video.getAttribute('src'))video.src=video.dataset.src;
   const playing=video.play();
   Promise.resolve(playing).then(()=>{
    if(!alive||current!==ticket){if(!alive||!shouldPlay)video.pause();return}
    video.hidden=false;
   }).catch(()=>{if(!alive||current!==ticket)return;choice=false;sync()});
  }
  const toggle=()=>{choice=choice===null?reduced.matches:!choice;sync()};
  const motion=()=>{choice=null;sync()};
  const error=()=>{failed=true;sync();button.hidden=true};
  button.addEventListener('click',toggle);document.addEventListener('visibilitychange',sync);
  reduced.addEventListener?.('change',motion);video.addEventListener('error',error);
  let observer=null;
  if(typeof IntersectionObserver==='function'){
   visible=false;observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);sync()},{threshold:0.1});observer.observe(root);
  }
  dispose=()=>{alive=false;pause();observer?.disconnect();button.removeEventListener('click',toggle);document.removeEventListener('visibilitychange',sync);reduced.removeEventListener?.('change',motion);video.removeEventListener('error',error)};
  sync();
 }
 return{mount,stop};
})();
