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
  v.calls[0].resolve({items:[snapshot]});await tick();assert.equal(v.root.querySelector('[data-seat=women]').textContent,'1 / 25');assert.equal(v.root.querySelector('[data-seat=men]').textContent,'2 / 25');assert.equal(v.root.querySelector('[data-seat=expected]').textContent,'35');assert.equal([...v.timers.values()][0].delay,10000);
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
