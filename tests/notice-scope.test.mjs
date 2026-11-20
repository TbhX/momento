import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
test('notices stay with the same room and never reappear after departure',async()=>{
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only',pretendToBeVisual:true});
 try{const {window:w}=dom,d=w.document,api=w.eval(await readFile(new URL('../src/client/notices.js',import.meta.url),'utf8')+';MomentoNotices');
 const room=()=>{d.querySelector('main').innerHTML='<section class="roundtable-demo"><nav class="room-mobile-nav"></nav></section>'};
 room();api.push('Première salle');api.place();assert.match(d.body.textContent,/Première salle/);
 room();api.push('Deuxième salle');assert.doesNotMatch(d.body.textContent,/Première salle/);
 api.leaveRoom();d.querySelector('main').replaceChildren();api.push('Accueil');assert.equal(d.querySelector('.momento-notices p').textContent,'Accueil');assert.equal(d.querySelectorAll('.momento-notice').length,1)
 }finally{dom.window.close()}
});
