import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
const themes=createRequire(import.meta.url)('../src/client/themes.js');
test('eight distinct ambiances and safe optional links, random keeps the supplied eligible pool',()=>{
 assert.equal(themes.catalog.length,8);assert.equal(new Set(themes.catalog.map(t=>themes.ambiance(t.slug).name)).size,8);
 for(const t of themes.catalog){const a=themes.ambiance(t.slug);assert.ok(a.questions.length>=3);if(a.link){const u=new URL(a.link[1]);assert.equal(u.protocol,'https:');assert.equal(u.search,'')}}
 const pool=['eligible-a','eligible-b','eligible-c'];const result=themes.shuffle(pool,()=>0);assert.deepEqual(pool,['eligible-a','eligible-b','eligible-c']);assert.deepEqual(result.sort(),pool);assert.equal(themes.get('random').interest,'Tous');
});
test('conversation prompts work without WebGL, requests, persistence or automatic sharing',async()=>{
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only'});const w=dom.window;w.fetch=()=>{throw Error('No external request allowed')};w.eval(await readFile('src/client/themes.js','utf8'));
 for(const t of w.MomentoThemes.catalog){const host=w.document.querySelector('main');host.replaceChildren();const panel=w.MomentoThemes.mount(host,t.slug);assert.equal(panel.open,false);const q=panel.querySelector('blockquote').textContent;panel.querySelector('button').click();assert.notEqual(panel.querySelector('blockquote').textContent,q);assert.equal(host.dataset.roomTheme,t.slug);for(const a of panel.querySelectorAll('a')){assert.equal(a.target,'_blank');assert.equal(a.rel,'noopener noreferrer')}assert.equal(panel.querySelector('[onclick]'),null)}dom.window.close();
});
test('random room confirmation shuffles only compatible, unblocked and unseen profiles',async()=>{
 const dom=new JSDOM('<p id="tablePreferenceError"></p>',{runScripts:'outside-only'}),w=dom.window;
 w.eval(await readFile('src/client/themes.js','utf8'));w.eval(await readFile('src/client/roundtable.js','utf8'));
 w.$=s=>w.document.querySelector(s);w.callDemoNow=()=>1000;w.tableReadPreferences=()=>({gender:'woman',minAge:25,maxAge:35,interest:'Tous',intent:'love'});
 w.MomentoSalon={people:['a','b','blocked','met','young','man','friend'].map(id=>({id,gender:id==='man'?'man':'woman',age:id==='young'?20:30,intent:id==='friend'?'friendship':'love'}))};
 let ids;w.MomentoConversation={roundDuration:()=>100,DECISION:30,configureParticipants:(state,list)=>{ids=Array.from(list)}};
 const f={state:{phase:'preview',blocked:['blocked']},table:{theme:'random',format:{capacity:20,rounds:10},event:{closesAt:10000,met:['met']}}};
 assert.equal(w.tableConfirmPreferences(f),true);assert.deepEqual(ids.sort(),['a','b']);assert.equal(f.table.preferencesConfirmed,true);dom.window.close();
});
