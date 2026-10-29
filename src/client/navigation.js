/* Transitions never delay routing. Only the current navigation can finish the frame. */
const MomentoNavigation=(()=>{
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),small=matchMedia('(max-width: 900px)');
 const panel=document.querySelector('#appSidebar'),workspace=document.querySelector('#appWorkspace'),toggle=document.querySelector('#sidebarToggle'),scrim=document.querySelector('#sidebarScrim'),progress=document.querySelector('#navigationProgress');
 const positions=new Map();let sequence=0,depth=0,animation=null,loadingTimer=null,currentView='home',menuOpen=false,menuReturn=null;
 function clearPending(){clearTimeout(loadingTimer);if(progress)progress.hidden=true;app.inert=false;app.removeAttribute('aria-busy');animation?.cancel();animation=null}
 function closeMenu(restore=false){if(!panel)return;const wasOpen=menuOpen;menuOpen=false;document.body.classList.remove('menu-open');toggle?.setAttribute('aria-expanded','false');if(scrim)scrim.hidden=true;if(workspace)workspace.inert=false;panel.inert=small.matches;panel.removeAttribute('role');panel.removeAttribute('aria-modal');if(restore&&wasOpen)(menuReturn?.isConnected?menuReturn:toggle)?.focus({preventScroll:true})}
 function toggleMenu(){if(!small.matches)return;if(menuOpen){closeMenu(true);return}menuReturn=document.activeElement;menuOpen=true;panel.inert=false;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');document.body.classList.add('menu-open');toggle?.setAttribute('aria-expanded','true');if(scrim)scrim.hidden=false;if(workspace)workspace.inert=true;panel.querySelector('.sidebar-close')?.focus({preventScroll:true})}
 function finish(ticket,restore,focusFrom){if(ticket!==sequence)return;clearPending();currentView=document.body.dataset.page||currentView;app.scrollTop=restore?(positions.get(currentView)||0):0;
  const active=document.activeElement;if(focusFrom?.closest?.('.sidebar-nav,.header-actions')||!active||active===document.body||!active.isConnected)app.focus({preventScroll:true});
  if(!reduced.matches&&typeof app.animate==='function'){animation=app.animate([{opacity:.62,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'cubic-bezier(.22,1,.36,1)'});animation.finished.then(()=>{if(ticket===sequence)animation=null}).catch(()=>{})}
 }
 function run(destination,render){if(depth)return render();if(typeof MomentoThemes!=='undefined')MomentoThemes.hideTip?.();if(typeof MomentoHomeMotion!=='undefined')MomentoHomeMotion.stop();positions.set(currentView,app.scrollTop);const ticket=++sequence,restore=typeof experienceHistory!=='undefined'&&experienceHistory,focusFrom=document.activeElement;clearPending();closeMenu();let result;depth++;try{result=render()}catch(error){depth--;finish(ticket,restore,focusFrom);throw error}depth--;
  if(result&&typeof result.then==='function'){app.inert=true;app.setAttribute('aria-busy','true');loadingTimer=setTimeout(()=>{if(ticket===sequence&&progress)progress.hidden=false},140);return Promise.resolve(result).then(value=>{finish(ticket,restore,focusFrom);return value},error=>{if(ticket===sequence){app.innerHTML='<div class="empty"><h2>Un petit instant.</h2><p role="alert">Cette page ne peut pas être affichée. Réessayez depuis le menu.</p></div>';finish(ticket,restore,focusFrom)}return undefined})}
  finish(ticket,restore,focusFrom);return result;
 }
 // Bind only the initial shell controls and capture approved destinations once.
 // Neither injected data attributes nor a function name from HTML are executed.
 const routes=new Set(['home','salon','tablePreview','hosted','friends','callDemo','videos','shop','profile','hostedPreview','concept','plans','dates','admin']);
 function ordinaryLinkClick(event,link){return !event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&!link.hasAttribute('download')&&(!link.target||link.target==='_self')}
 function bindRoute(control,destination){if(!routes.has(destination))return;control.addEventListener('click',event=>{if(event.defaultPrevented||control.disabled||control.closest('[hidden],[inert]'))return;if(control.tagName==='A'&&!ordinaryLinkClick(event,control))return;event.preventDefault();go(destination)})}
 document.querySelectorAll('.sidebar-nav [data-page],.header-actions [data-page]').forEach(control=>bindRoute(control,control.dataset.page));
 document.querySelectorAll('[data-shell-home]').forEach(control=>bindRoute(control,'home'));
 const bind=(selector,action)=>document.querySelectorAll(selector).forEach(control=>control.addEventListener('click',event=>{if(event.defaultPrevented||control.disabled||control.closest('[hidden],[inert]'))return;action()}));
 bind('[data-shell-close]',()=>closeMenu(true));bind('[data-shell-toggle]',toggleMenu);
 bind('[data-shell-install]',()=>installApp());bind('[data-shell-signin]',()=>openAccount('signin'));
 document.addEventListener('keydown',event=>{if(!menuOpen)return;if(event.key==='Escape'){event.preventDefault();closeMenu(true);return}if(event.key!=='Tab')return;const items=[...panel.querySelectorAll('a[href],button:not([disabled])')].filter(el=>!el.closest('[hidden]')&&el.tabIndex!==-1),first=items[0],last=items.at(-1);if(!first)return;if(event.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){event.preventDefault();last.focus()}else if(!event.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){event.preventDefault();first.focus()}});
 document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(!link||!ordinaryLinkClick(event,link))return;if(link.getAttribute('href')==='/confidentialite.html'){event.preventDefault();go('privacy')}});
 small.addEventListener?.('change',()=>closeMenu(true));reduced.addEventListener?.('change',()=>{if(reduced.matches){animation?.cancel();animation=null}});closeMenu();
 return{run,toggleMenu,closeMenu};
})();
