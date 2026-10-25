import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/client/home-motion.js',import.meta.url),'utf8');
function setup(reduced=false){
 const dom=new JSDOM('<aside><img alt="Momento"><video hidden muted loop playsinline preload="none" data-src="/momento-logo-loop.mp4"></video><button hidden>Pause</button></aside>',{runScripts:'outside-only',pretendToBeVisual:true});
 const {window}=dom,root=window.document.querySelector('aside'),video=root.querySelector('video'),button=root.querySelector('button');
 let play=0,pause=0,listener,visibility=false,intersection,disconnected=false;
 const motion={matches:reduced,addEventListener(t,fn){listener=fn},removeEventListener(t,fn){if(listener===fn)listener=null}};
 window.matchMedia=()=>motion;Object.defineProperty(window.document,'hidden',{get:()=>visibility});
 window.IntersectionObserver=class{constructor(fn){intersection=fn}observe(){}disconnect(){disconnected=true}};
 video.play=()=>{play++;return Promise.resolve()};video.pause=()=>{pause++};
 window.eval(source+';window.motionController=MomentoHomeMotion');window.motionController.mount(root);
 return{dom,window,root,video,button,motion,get play(){return play},get pause(){return pause},get disconnected(){return disconnected},
  intersect(value){intersection([{isIntersecting:value}])},visibility(value){visibility=value;window.document.dispatchEvent(new window.Event('visibilitychange'))},reduce(value){motion.matches=value;listener?.()}};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('logo animation loads only in view and plays silently in a loop with pause and resume',async()=>{
 const v=setup();try{
  assert.equal(v.video.getAttribute('src'),null);assert.equal(v.play,0);
  v.intersect(true);await tick();assert.equal(v.video.getAttribute('src'),'/momento-logo-loop.mp4');assert.equal(v.video.muted,true);assert.equal(v.video.loop,true);assert.equal(v.video.hidden,false);
  v.button.click();assert.equal(v.video.hidden,true);assert.match(v.button.getAttribute('aria-label'),/Animer/);
  const count=v.play;v.intersect(false);v.intersect(true);assert.equal(v.play,count,'manual pause survives visibility changes');
  v.button.click();await tick();assert.equal(v.video.hidden,false);
  v.visibility(true);assert.equal(v.video.hidden,true);v.visibility(false);await tick();assert.equal(v.video.hidden,false);
 }finally{v.window.motionController.stop();v.dom.window.close()}
});
test('reduced motion keeps the poster and avoids the video download until an explicit choice',async()=>{
 const v=setup(true);try{
  v.intersect(true);await tick();assert.equal(v.video.getAttribute('src'),null);assert.equal(v.play,0);assert.equal(v.video.hidden,true);
  v.button.click();await tick();assert.equal(v.video.hidden,false);
  v.reduce(true);assert.equal(v.video.hidden,true);v.reduce(false);await tick();assert.equal(v.video.hidden,false);
 }finally{v.window.motionController.stop();v.dom.window.close()}
});
test('late playback completion cannot revive media after leaving the page',async()=>{
 const v=setup();let resolve;try{
  v.video.play=()=>new Promise(r=>resolve=r);v.intersect(true);v.window.motionController.stop();const paused=v.pause;
  resolve();await tick();assert.ok(v.pause>paused);assert.equal(v.video.hidden,true);assert.equal(v.disconnected,true);
  const count=v.pause;v.visibility(true);assert.equal(v.pause,count,'document listener removed');
 }finally{v.dom.window.close()}
});
test('autoplay refusal and media error retain a useful static logo',async()=>{
 const v=setup();try{
  v.video.play=()=>Promise.reject(Error('autoplay blocked'));v.intersect(true);await tick();assert.equal(v.video.hidden,true);assert.match(v.button.textContent,/Animer/);
  v.video.dispatchEvent(new v.window.Event('error'));assert.equal(v.button.hidden,true);assert.equal(v.video.hidden,true);assert.ok(v.root.querySelector('img'));
 }finally{v.window.motionController.stop();v.dom.window.close()}
});
