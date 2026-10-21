import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile('src/client/media-loader.js','utf8');
function setup(){const dom=new JSDOM('<!doctype html><head></head><body></body>',{url:'https://momento.example/',runScripts:'outside-only'});dom.window.eval(source);return dom}
test('the video SDK is idle until requested and concurrent uses share one script',async()=>{
 const dom=setup(),{window}=dom;assert.equal(window.document.querySelector('script'),null);const first=window.MomentoVideoSDK.load(),second=window.MomentoVideoSDK.load();assert.equal(first,second);const script=window.document.querySelector('script');assert.equal(script.getAttribute('src'),'/livekit-client.js');assert.equal(window.document.querySelectorAll('script').length,1);window.LivekitClient={Room:class{}};script.onload();assert.equal(await first,window.LivekitClient);assert.equal(await window.MomentoVideoSDK.load(),window.LivekitClient);assert.equal(window.document.querySelectorAll('script').length,1);window.close();
});
test('a failed or empty SDK response can be retried without a full page reload',async()=>{
 const dom=setup(),{window}=dom;for(const event of ['onerror','onload']){const promise=window.MomentoVideoSDK.load(),rejection=assert.rejects(promise,/réessayez/);window.document.querySelector('script')[event]();await rejection;assert.equal(window.document.querySelector('script'),null)}const retry=window.MomentoVideoSDK.load();window.LivekitClient={loaded:true};window.document.querySelector('script').onload();assert.equal(await retry,window.LivekitClient);window.close();
});
