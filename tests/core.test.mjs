import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateGuide,newGuide,toHtml,toMarkdown,uid} from '../lib/model.ts';
import {encrypt,decrypt} from '../lib/crypto.ts';

test('guide identifiers work when randomUUID is unavailable in an HTTP preview',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(crypto,'randomUUID');
 Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});
 try {
  const ids=Array.from({length:100},()=>uid());
  assert.equal(new Set(ids).size,100);
  for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(newGuide().id);
 } finally {
  if(descriptor)Object.defineProperty(crypto,'randomUUID',descriptor);
  else delete crypto.randomUUID;
 }
});

test('imports preserve titles, notes and safe screenshots without trusting ids or revocation keys',()=>{
 const g=validateGuide({version:1,id:'unsafe',title:'A guide',steps:[{id:'bad',title:'Click Save',note:'A note',image:'data:image/png;base64,AAAA',url:'https://example.com/a?secret=123#key'}],share:{token:'secret'}});
 assert.equal(g.title,'A guide');assert.equal(g.steps[0].note,'A note');assert.equal(g.steps[0].url,'https://example.com/a');assert.notEqual(g.id,'unsafe');assert.equal(g.share,undefined);
});
test('rejects active content, unsupported payloads, and oversized step arrays',()=>{
 for(const image of ['javascript:alert(1)','https://tracker.test/pixel','data:image/svg+xml;base64,AAAA'])assert.throws(()=>validateGuide({version:1,title:'x',steps:[{title:'x',note:'',image}]}));
 assert.throws(()=>validateGuide({version:1,title:'x',steps:Array(101).fill({title:'x',note:''})}));
 assert.throws(()=>validateGuide({version:1,title:'x',steps:[null]}));
});
test('HTML and Markdown export user content as text',()=>{
 const g=newGuide();g.title='<script>alert(1)</script>';g.description='A & B';g.steps=[{id:'1',title:'<img onerror=alert(1)>',note:'[click](javascript:alert(1))'}];
 const html=toHtml(g);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('A &amp; B'));assert.ok(toMarkdown(g).includes('\\[click\\]'));
});
test('AES-GCM round trip, incorrect key and tamper rejection',async()=>{
 const encrypted=await encrypt('a private screenshot guide');assert.equal(await decrypt(encrypted.body.buffer,encrypted.key),'a private screenshot guide');
 const second=await encrypt('other');await assert.rejects(()=>decrypt(encrypted.body.buffer,second.key));encrypted.body[15]^=1;await assert.rejects(()=>decrypt(encrypted.body.buffer,encrypted.key));
});

function recorder(){
 const data={};const session={};let injects=0;let badge='';let screenshots=0;
 const tab={id:5,windowId:1,active:true,url:'https://example.com/app'};
 const storage=source=>({async get(key){return {[key]:structuredClone(source[key])};},async set(value){Object.assign(source,structuredClone(value));},async remove(key){delete source[key];}});
 const chrome={storage:{local:storage(data),session:storage(session)},runtime:{getURL:s=>'chrome-extension://once/'+s,onMessage:{addListener(){}},onStartup:{addListener(){}}},action:{async setBadgeText(v){badge=v.text;},async setBadgeBackgroundColor(){}},permissions:{async contains(){return true;}},scripting:{async executeScript(){injects++;}},tabs:{async get(){return tab;},async query(){return [tab];},async captureVisibleTab(){screenshots++;throw new Error('Screenshot unsupported in test');},async create(){return {id:8};},onUpdated:{addListener(){}},onRemoved:{addListener(){}}}};
 const context=vm.createContext({chrome,console,crypto,URL,Date,Promise,Number,JSON,fetch});
 vm.runInContext(readFileSync(new URL('../extension/background.js',import.meta.url),'utf8'),context);
 return {context,data,tab,screenshots:()=>screenshots,call:(m,s={url:'chrome-extension://once/popup.html'})=>{context.m=m;context.sender=s;return vm.runInContext('command(m,sender)',context);}};
}
test('recorder start, text-only fallback, stop, and sender isolation',async()=>{
 const r=recorder();assert.equal((await r.call({type:'START',tabId:5,origin:'https://example.com'})).ok,true);
 const m={type:'CAPTURE',title:'Click Settings',href:'https://example.com/app',width:1000,height:700,masks:[],x:10,y:20};
 await r.call(m,{url:'https://evil.test',tab:r.tab,frameId:0});assert.equal(r.data.once.guide.steps.length,0);
 await r.call(m,{url:r.tab.url,tab:r.tab,frameId:0});assert.equal(r.data.once.guide.steps.length,1);assert.equal(r.data.once.guide.steps[0].title,'Click Settings');assert.equal(r.data.once.guide.steps[0].image,undefined);
 await r.call({type:'STOP'});assert.equal(r.data.once.recording,false);await r.call(m,{url:r.tab.url,tab:r.tab,frameId:0});assert.equal(r.data.once.guide.steps.length,1);
 assert.equal((await r.call({type:'STATUS'},{url:'https://example.com'})).error,'Not allowed');
});
test('manifest has no blanket install-time host access and no remote script execution',()=>{
 const m=JSON.parse(readFileSync(new URL('../extension/manifest.json',import.meta.url)));assert.equal(m.manifest_version,3);assert.equal(m.host_permissions,undefined);assert.deepEqual(m.permissions,['activeTab','scripting','storage']);assert.ok(!m.content_security_policy.extension_pages.includes('unsafe-eval'));
});
test('page controls are tab-scoped and pause prevents capture',async()=>{
 const r=recorder();await r.call({type:'START',tabId:5,origin:'https://example.com'});
 const sender={url:r.tab.url,tab:r.tab,frameId:0};
 const other={...sender,tab:{...r.tab,id:6}};
 assert.equal((await r.call({type:'PAGE_STATUS'},other)).recording,false);
 assert.equal((await r.call({type:'PAGE_CONTROL',action:'stop'},other)).error,'Not allowed');
 await r.call({type:'PAGE_CONTROL',action:'pause'},sender);
 const m={type:'CAPTURE',title:'Click',href:r.tab.url,width:1000,height:700,x:10,y:20,masks:[]};
 await r.call(m,sender);assert.equal(r.data.once.guide.steps.length,0);
 await r.call({type:'PAGE_CONTROL',action:'pause'},sender);await r.call(m,sender);assert.equal(r.data.once.guide.steps.length,1);
 await r.call({type:'PAGE_CONTROL',action:'stop'},sender);assert.equal(r.data.once.recording,false);
 assert.equal((await r.call(null)).error,'Invalid command');
});
test('unsafe or invalid masking never invokes screenshot capture',async()=>{
 const r=recorder();await r.call({type:'START',tabId:5,origin:'https://example.com'});
 const sender={url:r.tab.url,tab:r.tab,frameId:0};
 const m={type:'CAPTURE',title:'Click',href:r.tab.url,width:1000,height:700,x:10,y:20,masks:[]};
 await r.call({...m,unsafeMasking:true},sender);
 await r.call({...m,masks:[{x:NaN,y:0,w:50,h:50}]},sender);
 assert.equal(r.screenshots(),0);assert.equal(r.data.once.guide.steps.length,2);
});
