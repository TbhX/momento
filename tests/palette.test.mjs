import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile('src/client/palette.js','utf8');
function setup(gender='unspecified'){
 const dom=new JSDOM('<!doctype html><head><meta name="theme-color" content="#faf8fc"></head><body data-palette="duo"><main></main></body>',{url:'https://momento.example/',runScripts:'outside-only'}),{window}=dom;window.accountReady=true;window.accountProfile={gender};window.accountRequest=async(method,body)=>({gender:body.gender});window.eval(source+'\nwindow.palette=MomentoPalette;');window.palette.sync('fixture-one');window.document.querySelector('main').innerHTML=window.palette.markup();return dom;
}
test('automatic pastel colors use declared gender and visitors always see both colors',()=>{
 const dom=setup(),{window}=dom,p=window.palette;assert.equal(p.resolved('woman'),'rose');assert.equal(p.resolved('man'),'blue');for(const gender of ['nonbinary','other','unspecified',undefined])assert.equal(p.resolved(gender),'duo');assert.equal(p.resolved('woman','blue'),'blue');assert.equal(p.resolved('man','rose'),'rose');assert.equal(p.resolved('man','rose',false),'duo');window.accountProfile={gender:'unspecified',looking:'Des femmes',name:'Alice'};p.sync();assert.equal(window.document.body.dataset.palette,'duo');window.close();
});
test('manual colors are account scoped and signing out immediately restores the visitor mix',()=>{
 const dom=setup('woman'),{window}=dom,p=window.palette;assert.equal(window.document.body.dataset.palette,'rose');p.setChoice('blue');assert.equal(window.document.body.dataset.palette,'blue');p.reset();assert.equal(window.document.body.dataset.palette,'duo');p.sync('fixture-two');assert.equal(window.document.body.dataset.palette,'rose');p.sync('fixture-one');assert.equal(window.document.body.dataset.palette,'blue');p.setChoice('auto');assert.equal(window.document.body.dataset.palette,'rose');p.reset(true);assert.equal(window.localStorage.getItem('momento-palette:fixture-one'),null);window.close();
});
test('saving optional gender changes the automatic theme only after the profile service succeeds',async()=>{
 const dom=setup(),{window}=dom,requests=[];window.accountRequest=async(method,body)=>{requests.push({method,body});return{gender:body.gender}};await window.palette.setGender('man');assert.equal(requests.length,1);assert.equal(requests[0].method,'PATCH');assert.equal(requests[0].body.gender,'man');assert.deepEqual(Object.keys(requests[0].body),['gender']);assert.equal(window.document.body.dataset.palette,'blue');assert.equal(window.document.querySelector('meta[name="theme-color"]').content,'#f8fbff');assert.match(window.document.querySelector('#paletteStatus').textContent,/Profil enregistré/);window.close();
});
test('a failed profile write preserves gender and theme, and an invalid value never reaches the API',async()=>{
 const dom=setup('woman'),{window}=dom;let calls=0;window.accountRequest=async()=>{calls++;throw Error('Service indisponible')};window.document.querySelector('#profileGender').value='man';await window.palette.setGender('man');assert.equal(window.accountProfile.gender,'woman');assert.equal(window.document.body.dataset.palette,'rose');assert.equal(window.document.querySelector('#profileGender').value,'woman');assert.equal(window.document.querySelector('#profileGender').disabled,false);await window.palette.setGender('unexpected');assert.equal(calls,1);window.close();
});
test('a late profile response cannot apply colors or identity to a signed-out screen',async()=>{
 const dom=setup('woman'),{window}=dom;let finish;window.accountRequest=()=>new Promise(resolve=>finish=resolve);const pending=window.palette.setGender('man');window.accountReady=false;window.accountProfile=null;window.palette.reset();finish({gender:'man'});await pending;assert.equal(window.document.body.dataset.palette,'duo');assert.equal(window.accountProfile,null);window.close();
});
test('palette controls remain usable when browser storage is blocked',()=>{
 const dom=setup('woman'),{window}=dom;Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}});window.palette.sync('fixture-two');window.palette.setChoice('blue');assert.equal(window.document.body.dataset.palette,'blue');assert.match(window.document.querySelector('#paletteStatus').textContent,/stockage est indisponible/);window.palette.reset();assert.equal(window.document.body.dataset.palette,'duo');window.close();
});
