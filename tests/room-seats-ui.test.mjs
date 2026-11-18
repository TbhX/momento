import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/client/room-seats.js',import.meta.url),'utf8');
const id='00000000-0000-4000-8000-000000000001';
async function tick(){await new Promise(r=>setImmediate(r))}
function setup(){
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only',pretendToBeVisual:true}),{window}=dom,root=window.document.querySelector('main'),timers=new Map(),calls=[];
 let serial=0,hidden=false;
 window.MomentoThemes={hint:()=>'<button aria-label="Explications">i</button>'};
 window.setTimeout=(fn,delay)=>{timers.set(++serial,{fn,delay});return serial};window.clearTimeout=n=>timers.delete(n);
 Object.defineProperty(window.document,'hidden',{get:()=>hidden});
 window.api=path=>new Promise((resolve,reject)=>calls.push({path,resolve,reject}));
 window.eval(source+';window.seats=MomentoRoomSeats');root.innerHTML=window.seats.markup(id);window.seats.mount(root);
 return{dom,window,root,calls,timers,hide(v){hidden=v;window.document.dispatchEvent(new window.Event('visibilitychange'))},run(){const [key,timer]=[...timers][0];timers.delete(key);timer.fn()}};
}
test('seat indicators refresh on visibility, preserve focus, avoid overlap and stop after navigation',async()=>{
 const v=setup();try{
  assert.equal(v.calls.length,1);v.hide(true);v.hide(false);assert.equal(v.calls.length,1,'no overlapping request');
  const snapshot={id,capacity:50,balanced:true,women:24,men:23,present:12,expected:35,waiting:2};
  v.calls[0].resolve({items:[snapshot]});await tick();assert.equal(v.root.querySelector('[data-seat=women]').textContent,'1 / 25');assert.equal(v.root.querySelector('[data-seat=men]').textContent,'2 / 25');assert.equal(v.root.querySelector('[data-seat=expected]').textContent,'35');assert.equal(v.root.querySelector('[data-seat=confirmed]').textContent,'47 / 50');assert.equal([...v.timers.values()][0].delay,10000);
  const button=v.root.querySelector('button');button.focus();v.run();v.calls[1].resolve({items:[{...snapshot,women:25,present:15,expected:33}]});await tick();assert.equal(v.window.document.activeElement,button);assert.equal(v.root.querySelector('[data-seat=women]').textContent,'0 / 25');
  v.hide(true);assert.equal(v.timers.size,0);v.hide(false);assert.equal(v.calls.length,3);
  v.window.seats.stop();v.calls[2].resolve({items:[{...snapshot,women:20}]});await tick();assert.equal(v.timers.size,0);assert.equal(v.root.querySelector('[data-seat=women]').textContent,'0 / 25','late response ignored');
 }finally{v.window.seats.stop();v.dom.window.close()}
});
test('rate limiting marks stale numbers and honors retry time; revoked access clears them',async()=>{
 const v=setup();try{
  v.calls[0].reject(Object.assign(Error(),{status:429,retryAfter:70}));await tick();assert.equal([...v.timers.values()][0].delay,70000);assert.match(v.root.querySelector('[data-seat=status]').textContent,/interrompue/);
  v.run();v.calls[1].reject(Object.assign(Error(),{status:403}));await tick();assert.equal(v.timers.size,0);assert.equal(v.root.querySelector('[data-seat=women]').textContent,'—');assert.equal(v.root.querySelector('[data-seat=status]').textContent,'Indisponible');
 }finally{v.window.seats.stop();v.dom.window.close()}
});
test('selected room counters survive page cleanup and share the bounded page batch',async()=>{
 const v=setup();try{
  v.window.accountReady=true;const bar=v.window.document.createElement('aside');bar.id='selectedRoomBar';bar.innerHTML=v.window.seats.markup(id);v.root.before(bar);
  v.window.seats.mount(v.root);assert.equal(v.calls[1].path.split('rooms=')[1],id);
  v.calls[1].resolve({items:[{id,capacity:20,balanced:true,women:4,men:4,present:2,expected:6}]});await tick();assert.equal(bar.querySelector('[data-seat=present]').textContent,'2');assert.equal(v.root.querySelector('[data-seat=present]').textContent,'2');
  v.window.seats.stop();v.root.replaceChildren();await tick();assert.equal(v.calls.length,3);v.calls[2].resolve({items:[{id,present:3}]});await tick();assert.equal(bar.querySelector('[data-seat=present]').textContent,'3');assert.equal(v.timers.size,1);
  v.window.accountReady=false;bar.remove();v.window.seats.stop();await tick();assert.equal(v.timers.size,0);assert.equal(v.calls.length,3);
 }finally{v.window.seats.stop(false);v.dom.window.close()}
});

test('a selected room plus twelve catalogue cards are all refreshed with bounded sequential requests',async()=>{
 const v=setup();try{v.window.accountReady=true;const bar=v.window.document.createElement('aside');bar.id='selectedRoomBar';bar.innerHTML=v.window.seats.markup(id);v.root.before(bar);v.root.innerHTML=Array.from({length:12},(_,n)=>v.window.seats.markup('00000000-0000-4000-8000-'+String(n+2).padStart(12,'0'))).join('');v.window.seats.mount(v.root);assert.equal(v.calls[1].path.split('rooms=')[1].split(',').length,12);v.calls[1].resolve({items:[]});await tick();assert.equal(v.calls[2].path.split('rooms=')[1].split(',').length,1);v.calls[2].resolve({items:[]});await tick();assert.equal(v.timers.size,1);assert.equal(v.root.lastElementChild.querySelector('[data-seat=status]').textContent,'Table indisponible')}finally{v.window.seats.stop(false);v.dom.window.close()}
});
