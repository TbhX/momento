/* One vocabulary for the public discovery, room directory and local round tables. */
(function(root){
 const catalog=[
  ['music','Musique','Sur la même fréquence','Une playlist, un concert, un premier point commun.','music','Musique'],
  ['nearby','À proximité','Un bonjour à deux pas','Les petits bonheurs près de chez vous.','pin','Tous'],
  ['culture','Culture','Des histoires à partager','Cinéma, livres, cuisine et sorties.','culture','Tous'],
  ['travel','Voyages','La prochaine escale','Vos prochaines découvertes commencent ici.','travel','Voyages'],
  ['astrology','Astro','Sous une bonne étoile','Un brise-glace pour les curieux des signes.','star','Tous'],
  ['sport','Sport','La bonne énergie','Du mouvement et des passions à partager.','sport','Sport'],
  ['profession','Univers pro','Au-delà des projets','Des parcours différents, des idées à échanger.','work','Tous']
 ].map(([slug,label,title,description,icon,interest])=>Object.freeze({slug,label,title,description,icon,interest}));
 const paths={music:'M9 18V5l11-2v13M9 8l11-2M9 18c0 2-6 3-6 0s6-3 6 0m11-2c0 2-6 3-6 0s6-3 6 0',pin:'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',culture:'M3 4h6l3 2 3-2h6v15h-6l-3 2-3-2H3ZM12 6v15',travel:'m3 10 7 1 6-8 3 1-4 8 5 3-1 2-6-2-4 6-2-1 2-7-6-1Z',star:'m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',sport:'M6 3v18M3 7h6M3 17h6M18 3v18M15 7h6M15 17h6M9 12h6',work:'M8 7V3h8v4M3 7h18v14H3ZM3 12l9 4 9-4M12 13v5',clock:'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',people:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',audio:'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0ZM5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8',video:'M3 5h12v14H3ZM15 10l7-4v12l-7-4',heart:'M12 21S2 15 2 8a5 5 0 0 1 10-1A5 5 0 0 1 22 8c0 7-10 13-10 13',plus:'M12 4v16M4 12h16',refresh:'M20 7V2l-3 3a9 9 0 1 0 3 12M20 7h-5',info:'M12 11v7M12 7v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',arrow:'M5 12h14m-6-6 6 6-6 6',filter:'M4 6h16M7 12h10M10 18h4',credit:'M3 5h18v14H3ZM16 12h5M7 9h3'};
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const get=slug=>catalog.find(t=>t.slug===slug)||catalog[0];
 const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name]||paths.info}"/></svg>`;
 function hint(name,label,value=''){return `<button type="button" class="ui-hint" data-tip="${escape(label)}" aria-label="${escape(label)}">${icon(name)}${value!==''?'<span aria-hidden="true">'+escape(value)+'</span>':''}</button>`}
 function tiles(action,selected='',items=catalog){return `<div class="theme-tiles" aria-label="Thèmes des tables rondes">${items.map(t=>`<button type="button" class="theme-tile theme-${t.slug}" data-theme="${t.slug}" aria-pressed="${t.slug===selected}" onclick="${action}('${t.slug}')" data-tip="${escape(t.description)}">${icon(t.icon)}<span>${escape(t.label)}</span><span class="theme-tile-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>`}
 let selected='music';const api={catalog:Object.freeze(catalog),get,icon,hint,tiles,selected:()=>selected,select:slug=>{if(catalog.some(t=>t.slug===slug))selected=slug}};
 if(typeof module!=='undefined'){module.exports=api;return}root.MomentoThemes=api;
 let tip,anchor;
 function hide(){if(tip)tip.hidden=true;anchor?.removeAttribute('aria-describedby');anchor=null}
 function show(button){hide();anchor=button;if(!tip){tip=document.createElement('div');tip.id='momento-ui-tip';tip.className='ui-tooltip';tip.setAttribute('role','tooltip');document.body.append(tip)}tip.textContent=button.dataset.tip;tip.hidden=false;button.setAttribute('aria-describedby',tip.id);const r=button.getBoundingClientRect(),width=Math.min(260,innerWidth-24);tip.style.width=width+'px';tip.style.left=Math.max(12,Math.min(innerWidth-width-12,r.left+r.width/2-width/2))+'px';tip.style.top=Math.max(12,Math.min(innerHeight-tip.offsetHeight-12,r.bottom+8))+'px'}
 document.addEventListener('pointerover',e=>{const b=e.target.closest?.('[data-tip]');if(b&&b!==anchor)show(b)});
 document.addEventListener('pointerout',e=>{if(anchor&&anchor.contains(e.target)&&(!e.relatedTarget||!anchor.contains(e.relatedTarget)))hide()});
 document.addEventListener('focusin',e=>{const b=e.target.closest?.('[data-tip]');if(b)show(b);else hide()});
 document.addEventListener('click',e=>{const b=e.target.closest?.('[data-tip]');if(b)show(b);else hide()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide()});
 document.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);api.hideTip=hide;
})(typeof globalThis!=='undefined'?globalThis:this);
