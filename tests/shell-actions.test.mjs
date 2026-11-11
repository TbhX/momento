import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const template=await readFile('src/client/index.html','utf8'),source=await readFile('src/client/navigation.js','utf8');
const seo=createRequire(import.meta.url)('../src/client/public-seo.js');
function fixture(mobile=false){
 const dom=new JSDOM(template,{url:'https://momento.example/',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.app=w.document.querySelector('#app');w.matchMedia=q=>({matches:q.includes('900px')&&mobile,addEventListener(){}});
 w.go=page=>calls.push(['go',page]);w.installApp=()=>calls.push(['install']);w.openAccount=mode=>calls.push(['account',mode]);
 w.eval(source+'\nwindow.navigation=MomentoNavigation;');
 return{dom,w,d:w.document,calls};
}
test('shell and all five prerendered documents contain no executable HTML attributes or inline scripts',()=>{
 for(const html of [template,...Object.keys(seo.pages).map(key=>seo.renderDocument(template,key))]){
  const dom=new JSDOM(html);try{for(const el of dom.window.document.querySelectorAll('*'))for(const attr of el.attributes){assert.doesNotMatch(attr.name,/^on/i);if(['href','src','action','formaction'].includes(attr.name))assert.doesNotMatch(attr.value,/^\s*javascript:/i)}
  assert.equal(dom.window.document.querySelectorAll('script:not([src])').length,0);
  }finally{dom.window.close()}
 }
});
test('external shell listeners route once and support nested icons with inline execution disabled',()=>{
 const f=fixture();try{
  f.d.querySelector('.sidebar-nav [data-page=concept] svg').dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  f.d.querySelector('[data-shell-home] img').click();f.d.querySelector('[data-shell-signin]').click();f.d.querySelector('[data-shell-install]').click();f.d.querySelector('.app-statusbar a').click();
  assert.deepEqual(f.calls,[['go','concept'],['go','home'],['account','signin'],['install'],['go','privacy']]);
 }finally{f.dom.window.close()}
});
test('modified, secondary, download, external-target and cancelled links retain browser behavior',()=>{
 const f=fixture();try{
  for(const selector of ['[data-shell-home]','.sidebar-nav [data-page=concept]','.app-statusbar a']){
   const link=f.d.querySelector(selector);
   for(const extra of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{button:2}]){const e=new f.w.MouseEvent('click',{bubbles:true,cancelable:true,button:0,...extra});link.dispatchEvent(e);assert.equal(e.defaultPrevented,false)}
   for(const [name,value] of [['target','_blank'],['download','notice']]){link.setAttribute(name,value);const e=new f.w.MouseEvent('click',{bubbles:true,cancelable:true,button:0});link.dispatchEvent(e);assert.equal(e.defaultPrevented,false);link.removeAttribute(name)}
   const cancelled=new f.w.MouseEvent('click',{bubbles:true,cancelable:true,button:0});cancelled.preventDefault();link.dispatchEvent(cancelled);
  }
  assert.deepEqual(f.calls,[]);
 }finally{f.dom.window.close()}
});
test('new or altered data attributes cannot select arbitrary shell commands or destinations',()=>{
 const f=fixture();try{
  const control=f.d.querySelector('.sidebar-nav [data-page=salon]');control.dataset.page='deleteAccount';control.click();
  const injected=f.d.createElement('button');injected.dataset.page='admin';injected.setAttribute('data-shell-signin','');f.d.querySelector('.sidebar-nav').append(injected);injected.click();
  const hidden=f.d.querySelector('[data-page=profile]');hidden.click();
  assert.deepEqual(f.calls,[['go','salon']]);
 }finally{f.dom.window.close()}
});
test('mobile open, close and scrim controls preserve focus and escape behavior without HTML handlers',()=>{
 const f=fixture(true);try{
  const toggle=f.d.querySelector('#sidebarToggle'),close=f.d.querySelector('.sidebar-close');toggle.focus();toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(f.d.activeElement,close);assert.equal(f.d.querySelector('#appWorkspace').inert,true);
  close.click();assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(f.d.activeElement,toggle);
  toggle.click();f.d.querySelector('#sidebarScrim').click();assert.equal(toggle.getAttribute('aria-expanded'),'false');
  toggle.click();f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(f.d.activeElement,toggle);
 }finally{f.dom.window.close()}
});

test('expanded filters and room settings stay visible without stealing focus',()=>{
 const {dom,w,d}=fixture();try{const app=w.app;app.getBoundingClientRect=()=>({top:100,bottom:600,height:500});
 for(const markup of ['<form class="directory-filters"><details><summary>Filtres</summary></details></form>','<details class="hosted-details"><summary>Personnaliser</summary></details>']){
 app.innerHTML=markup;const el=app.querySelector('details'),summary=el.querySelector('summary');summary.focus();el.open=true;el.getBoundingClientRect=()=>({top:450,bottom:750,height:300});app.scrollTop=0;el.dispatchEvent(new w.Event('toggle'));assert.equal(app.scrollTop,166);assert.equal(d.activeElement,summary);
 el.getBoundingClientRect=()=>({top:150,bottom:450,height:300});el.dispatchEvent(new w.Event('toggle'));assert.equal(app.scrollTop,166);
 el.hidden=true;el.getBoundingClientRect=()=>({top:450,bottom:1250,height:800});el.dispatchEvent(new w.Event('toggle'));assert.equal(app.scrollTop,166);el.hidden=false;el.dispatchEvent(new w.Event('toggle'));assert.equal(app.scrollTop,500);
 el.open=false;el.dispatchEvent(new w.Event('toggle'));assert.equal(app.scrollTop,500);el.remove();el.open=true;el.dispatchEvent(new w.Event('toggle'));assert.equal(app.scrollTop,500);
 }
 app.innerHTML='<details class="call-moment-more" open><summary>Appel</summary></details>';const other=app.firstElementChild;other.getBoundingClientRect=()=>({top:450,bottom:750,height:300});app.scrollTop=0;other.dispatchEvent(new w.Event('toggle'));assert.equal(app.scrollTop,0);
 }finally{dom.window.close()}
});
