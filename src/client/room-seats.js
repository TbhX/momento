/* Fresh aggregate indicators only. No reservation, admission or paid right is created here. */
const MomentoRoomSeats=(()=>{
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 let dispose=null;
 const number=n=>Number.isSafeInteger(n)&&n>=0;
 function markup(id){if(!uuid.test(id))return '';return `<div class="room-seats" data-room-seats="${id}" aria-label="Places et présences de cette table ronde"><div class="room-seat-genders"><span>Femmes <b data-seat="women">—</b></span><span>Hommes <b data-seat="men">—</b></span></div><div class="room-seat-attendance"><span>Présents <b data-seat="present">—</b></span><span>Attendus <b data-seat="expected">—</b></span>${MomentoThemes.hint('info','Places libres calculées sur les inscriptions confirmées, hors liste d’attente. Présents : présences actives récentes. Attendus : inscrits confirmés qui ne sont pas encore présents. Actualisation toutes les dix secondes, seulement pendant la consultation. La confirmation de votre inscription reste vérifiée côté serveur.')}</div><small data-seat="status">Actualisation…</small></div>`}
 function paint(el,s){
  const put=(name,text)=>{const target=el.querySelector('[data-seat="'+name+'"]');if(target)target.textContent=text};
  const balanced=s?.balanced===true&&[20,50,100].includes(s.capacity)&&number(s.women)&&number(s.men);
  put('women',balanced?Math.max(0,s.capacity/2-s.women)+' / '+s.capacity/2:'—');
  put('men',balanced?Math.max(0,s.capacity/2-s.men)+' / '+s.capacity/2:'—');
  put('present',number(s?.present)?s.present:'—');put('expected',number(s?.expected)?s.expected:'—');
  put('status',balanced?'Places restantes · '+(number(s.waiting)&&s.waiting?s.waiting+' en attente · ':'')+'auto 10 s':'Répartition non disponible · auto 10 s');
  el.dataset.fresh='true';
 }
 function stop(){dispose?.();dispose=null}
 function mount(root=app){
  stop();const nodes=[...root.querySelectorAll('[data-room-seats]')].slice(0,12);if(!nodes.length)return;
  const ids=[...new Set(nodes.map(n=>n.dataset.roomSeats).filter(id=>uuid.test(id)))];if(!ids.length)return;
  let alive=true,pending=false,timer=null;
  function schedule(delay=10000){clearTimeout(timer);if(alive&&root.isConnected&&typeof document!=='undefined'&&!document.hidden)timer=setTimeout(refresh,delay)}
  function unavailable(text,clear=false){for(const n of nodes){n.dataset.fresh='false';for(const field of n.querySelectorAll('[data-seat]')){if(field.dataset.seat==='status')field.textContent=text;else if(clear)field.textContent='—'}}}
  async function refresh(){
   clearTimeout(timer);if(!alive||document.hidden||pending||!root.isConnected)return;
   pending=true;let delay=10000;
   try{
    const data=await api('/community/seats?rooms='+ids.join(','));if(!alive||!root.isConnected)return;
    const map=new Map((data.items||[]).map(s=>[s.id,s]));
    for(const n of nodes){const s=map.get(n.dataset.roomSeats);if(s)paint(n,s);else{for(const field of n.querySelectorAll('[data-seat]'))field.textContent=field.dataset.seat==='status'?'Table indisponible':'—';n.dataset.fresh='false'}}
   }catch(error){if(!alive)return;if([401,403].includes(error.status)){unavailable('Indisponible',true);alive=false}else{unavailable('Dernières données · actualisation interrompue');delay=error.status===429?Math.max(10000,(error.retryAfter||60)*1000):30000}}
   finally{pending=false;schedule(delay)}
  }
  function visibility(){if(document.hidden)clearTimeout(timer);else refresh()}
  document.addEventListener('visibilitychange',visibility);
  dispose=()=>{alive=false;clearTimeout(timer);document.removeEventListener('visibilitychange',visibility)};
  refresh();
 }
 window.addEventListener('pagehide',stop);
 return{markup,paint,mount,stop};
})();
