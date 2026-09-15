const ORIGIN='https://onceguide-devp.diave.chatgpt.site';
let queue=Promise.resolve();let lastCapture=0;
const read=async()=> (await chrome.storage.local.get('once')).once||{};
const write=state=>chrome.storage.local.set({once:state});
async function badge(text){await chrome.action.setBadgeText({text});await chrome.action.setBadgeBackgroundColor({color:'#146344'});}
async function stop(){const state=await read();state.recording=false;state.paused=false;await write(state);await badge('');return state;}
async function imageFor(message,tab){
 const active=await chrome.tabs.query({active:true,windowId:tab.windowId});if(active[0]?.id!==tab.id)return undefined;
 if(Date.now()-lastCapture<600)return undefined;lastCapture=Date.now();
 const data=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'jpeg',quality:78});
 const after=await chrome.tabs.get(tab.id);const current=await chrome.tabs.query({active:true,windowId:tab.windowId});
 if(after.url!==message.href||current[0]?.id!==tab.id)return undefined;
 const bitmap=await createImageBitmap(await (await fetch(data)).blob());const scale=Math.min(1,1400/bitmap.width);const canvas=new OffscreenCanvas(Math.round(bitmap.width*scale),Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const sx=canvas.width/message.width,sy=canvas.height/message.height;
 ctx.fillStyle='#17261d';for(const r of message.masks){ctx.fillRect(Math.floor(r.x*sx)-2,Math.floor(r.y*sy)-2,Math.ceil(r.w*sx)+4,Math.ceil(r.h*sy)+4);}
 ctx.beginPath();ctx.arc(message.x*sx,message.y*sy,15,0,Math.PI*2);ctx.strokeStyle='#fff';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle='#168451';ctx.lineWidth=3;ctx.stroke();
 const blob=await canvas.convertToBlob({type:'image/jpeg',quality:.82});const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return 'data:image/jpeg;base64,'+btoa(binary);
}
async function capture(m,sender){
 const state=await read();if(!state.recording||state.paused||sender.tab?.id!==state.tabId||sender.frameId!==0||new URL(sender.url).origin!==state.origin)return;
 if(!Number.isFinite(m.width)||!Number.isFinite(m.height)||m.width<1||m.height<1||!Array.isArray(m.masks)||m.masks.length>250||typeof m.title!=='string')return;
 if(state.guide.steps.length>=100){await stop();return;}
 const safeGeometry=[m.x,m.y].every(Number.isFinite)&&m.masks.every(r=>r&&[r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.w>=0&&r.h>=0);
 let image;if(safeGeometry&&!m.unsafeMasking){try{image=await imageFor(m,sender.tab);}catch{}}
 state.guide.steps.push({id:crypto.randomUUID(),title:m.title.slice(0,120),note:image?'':'Screenshot unavailable for this step. Add one in the editor if needed.',image,url:state.origin});state.guide.updated=Date.now();
 if(JSON.stringify(state).length>8500000){state.guide.steps.at(-1).image=undefined;state.guide.steps.at(-1).note='Capture storage limit reached. Export this guide and start a new one.';state.recording=false;}
 await write(state);await badge(state.recording?String(state.guide.steps.length):'');
}
async function command(m,sender){
 if(!m||typeof m.type!=='string')return {error:'Invalid command'};
 if(m.type==='CAPTURE'){await capture(m,sender);return {ok:true};}
 if(m.type==='PAGE_STATUS'){const s=await read();return {recording:!!s.recording&&sender.tab?.id===s.tabId&&sender.frameId===0,paused:!!s.paused,origin:s.origin,steps:s.guide?.steps?.length||0};}
 if(m.type==='PAGE_CONTROL'){
  const s=await read();if(!s.recording||sender.tab?.id!==s.tabId||sender.frameId!==0||new URL(sender.url).origin!==s.origin)return {error:'Not allowed'};
  if(m.action==='stop')return stop();
  if(m.action==='pause'){s.paused=!s.paused;await write(s);await badge(s.paused?'II':'REC');return {ok:true};}
  return {error:'Unknown control'};
 }
 if(sender.url!==chrome.runtime.getURL('popup.html'))return {error:'Not allowed'};
 if(m.type==='STATUS')return read();
 if(m.type==='START'){
  const tab=await chrome.tabs.get(m.tabId);if(!tab.active||new URL(tab.url).origin!==m.origin)return {error:'The active website changed. Try again.'};
  if(!await chrome.permissions.contains({origins:[m.origin+'/*']}))return {error:'Website permission is required'};
  await chrome.scripting.executeScript({target:{tabId:m.tabId},files:['content.js']});
  const now=Date.now();const state={recording:true,tabId:m.tabId,origin:m.origin,guide:{version:1,id:crypto.randomUUID(),title:'Workflow on '+new URL(m.origin).hostname,description:'',created:now,updated:now,steps:[]}};await write(state);await badge('REC');return {ok:true};
 }
 if(m.type==='STOP')return stop();
 if(m.type==='PAUSE'){const s=await read();if(!s.recording)return {error:'Start recording first.'};s.paused=!s.paused;await write(s);await badge(s.paused?'II':'REC');return {ok:true};}
 if(m.type==='CLEAR'){await chrome.storage.local.remove('once');await badge('');return {ok:true};}
 if(m.type==='EDITOR'){
  const state=await read();if(!state.guide||state.recording)return {error:'Stop recording first.'};
  const tab=await chrome.tabs.create({url:ORIGIN+'/?capture=1'});
  await chrome.storage.session.set({oncePending:{tabId:tab.id,guide:state.guide}});return {ok:true};
 }
 return {error:'Unknown command'};
}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{queue=queue.then(()=>command(m,sender)).then(respond).catch(e=>respond({error:e.message||'Capture failed'}));return true;});
chrome.tabs.onUpdated.addListener((id,info)=>{if(info.status!=='complete')return;queue=queue.then(async()=>{
 const state=await read();if(state.recording&&state.tabId===id){const tab=await chrome.tabs.get(id);if(new URL(tab.url).origin!==state.origin){await stop();}else{await chrome.scripting.executeScript({target:{tabId:id},files:['content.js']});}}
 const {oncePending:p}=await chrome.storage.session.get('oncePending');if(p?.tabId!==id)return;
 const tab=await chrome.tabs.get(id);if(new URL(tab.url).origin!==ORIGIN)return;
 await chrome.scripting.executeScript({target:{tabId:id},func:(guide)=>{let n=0;const t=setInterval(()=>{if(document.documentElement.dataset.onceReady==='true'){window.postMessage({type:'ONCE_CAPTURE',guide},location.origin);clearInterval(t);}else if(++n>60)clearInterval(t);},500);},args:[p.guide]});await chrome.storage.session.remove('oncePending');
 }).catch(()=>{});});
chrome.tabs.onRemoved.addListener(id=>{queue=queue.then(async()=>{const s=await read();if(s.tabId===id)await stop();}).catch(()=>{});});
chrome.runtime.onStartup.addListener(()=>{void stop();});
