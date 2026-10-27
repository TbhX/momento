import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile('src/client/bistro-3d.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
test('3D stays lazy, survives participant refresh and disposes on navigation',async()=>{
 const dom=new JSDOM('<main id="app"></main>',{runScripts:'outside-only'}),w=dom.window;w.WebGL2RenderingContext=function(){};w.eval(source);assert.equal(w.document.querySelector('script'),null);
 const app=w.document.querySelector('main');app.innerHTML='<section class="roundtable-demo" data-room-capacity="50"><div id="people"></div></section>';await tick();let mounted=0,disposed=0;w.MomentoBistro3D={mount(host,capacity){mounted++;assert.equal(capacity,50);return{dispose(){disposed++},resize(){}}}};w.document.querySelector('script').dispatchEvent(new w.Event('load'));await tick();assert.equal(mounted,1);
 w.document.querySelector('#people').innerHTML='<b>Prénom</b>';await tick();assert.equal(mounted,1);app.innerHTML='<h1>Accueil</h1>';await tick();assert.equal(disposed,1);dom.window.close();
});
test('late engine cannot mount a departed room; unsupported devices retain fallback',async()=>{
 const dom=new JSDOM('<main id="app"><section class="table-public-teaser"></section></main>',{runScripts:'outside-only'}),w=dom.window;w.WebGL2RenderingContext=function(){};w.eval(source);const script=w.document.querySelector('script');w.document.querySelector('main').innerHTML='';await tick();let mounted=0;w.MomentoBistro3D={mount(){mounted++}};script.dispatchEvent(new w.Event('load'));await tick();assert.equal(mounted,0);dom.window.close();
 const fallback=new JSDOM('<main id="app"><section class="table-public-teaser"></section></main>',{runScripts:'outside-only'});fallback.window.eval(source);assert.ok(fallback.window.document.querySelector('.bistro-simple'));assert.equal(fallback.window.document.querySelector('script'),null);assert.equal(fallback.window.document.querySelector('[data-view=flat]').disabled,true);assert.equal(fallback.window.document.querySelector('[data-view=full]').disabled,false);fallback.window.close();
});
