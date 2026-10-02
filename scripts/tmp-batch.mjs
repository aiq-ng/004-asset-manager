import { spawn } from "node:child_process";
const port = "9264";
const chrome = spawn("google-chrome", ["--headless=new",`--remote-debugging-port=${port}`,"--no-sandbox","--disable-gpu",`--user-data-dir=/tmp/opencode/chrome-b6`,"--window-size=1500,1100","about:blank"], { stdio: "ignore" });
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
let target; for(let i=0;i<40;i++){try{const l=await (await fetch(`http://localhost:${port}/json/list`)).json(); target=l.find(t=>t.type==="page"); if(target)break;}catch{} await sleep(250);}
const ws=new WebSocket(target.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pending=new Map();
ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,res);ws.send(JSON.stringify({id:n,method:m,params:p}));});
const ev=async(x)=>{const {result}=await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true,userGesture:true}); if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description||"err"); return result.result.value;};
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Network.setCookie",{name:"inv-cat-session",value:process.env.SESSION_TOKEN,domain:"localhost",path:"/"});

const helpers = `window.__set=(s,v)=>{const e=document.querySelector(s);if(!e)throw new Error('missing '+s);Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
window.__setItem=(n,v)=>{const e=document.querySelector('input[aria-label="Serial number for item '+n+'"]');if(!e)throw new Error('missing item '+n);Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));};
window.__click=(t)=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes(t));if(!b)throw new Error('no button '+t);b.click();};
window.__btn=()=>[...document.querySelectorAll('footer button, dialog button')].map(b=>b.textContent.trim()).filter(t=>/Save and next|Submit/.test(t)).join(' | ');
window.__prog=()=>document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') ?? 'done';
window.__draft=()=>localStorage.getItem('inv-cat:bulk-asset-entry'); true`;

const goAssets = async () => { await send("Page.navigate",{url:"http://localhost:3000/assets"}); await sleep(7000); await ev(helpers); };
await goAssets();
await ev(`localStorage.removeItem('inv-cat:bulk-asset-entry')`);

const RUN = "B"+Date.now().toString(36).slice(-5).toUpperCase();
const QTY = 6;
await ev(`__click('Register in bulk')`); await sleep(1000);
await ev(`__set('select[name=assetType]','MON')`);
await ev(`__set('textarea[name=description]','Batch run ${RUN}')`);
await ev(`__set('input[name=quantity]','${QTY}')`); await sleep(300);
await ev(`__click('Start entering')`); await sleep(1000);
console.log("button partway :", await ev(`__btn()`));
console.log("progress       :", await ev(`__prog()`));

// fill 5 of 6 -> should still say Save and next
for (let i=0;i<5;i++){ await ev(`__setItem(${i+1},${JSON.stringify(`${RUN}-${i+1}`)})`); await sleep(120); }
console.log("5/6 filled btn :", await ev(`__btn()`), "| progress:", await ev(`__prog()`));

// save ONE individually -> durable path
await ev(`__click('Save and next')`); await sleep(2800);
console.log("after 1 save   :", await ev(`__btn()`), "| progress:", await ev(`__prog()`));
console.log("saved chip     :", await ev(`[...document.querySelectorAll('dialog a[href^="/assets/IT-"]')].map(a=>a.textContent.trim()).join(' ')`));

// draft persisted mid-batch?
const draft = await ev(`__draft()`);
console.log("draft saved    :", draft ? JSON.parse(draft).serials.filter(s=>s).length + " serials, saved=" + JSON.stringify(JSON.parse(draft).saved) : "NONE");

// ACCIDENTAL CLOSE, then reopen
await ev(`__click('Cancel')`); await sleep(1200);
await ev(`__click('Register in bulk')`); await sleep(1200);
console.log("--- after accidental close + reopen ---");
console.log("reopened straight to entry:", await ev(`!!document.querySelector('input[aria-label^="Serial number for item 2"]')`));
console.log("restored progress         :", await ev(`__prog()`));
console.log("restored filled serials   :", await ev(`[...document.querySelectorAll('input[aria-label^="Serial number for item"]')].map(e=>e.value).filter(Boolean).join(' ')`));
console.log("restored saved chip       :", await ev(`[...document.querySelectorAll('dialog a[href^="/assets/IT-"]')].map(a=>a.textContent.trim()).join(' ')`));

// fill the last one -> button must become Submit
await ev(`__setItem(6,${JSON.stringify(`${RUN}-6`)})`); await sleep(300);
console.log("all filled btn :", await ev(`__btn()`));

// one duplicate on purpose: reuse an existing seeded serial in the last-but-one slot
await ev(`__setItem(5,'SN-LAP-0001')`); await sleep(200);
console.log("submitting with 1 duplicate in the middle...");
await ev(`__click('Submit')`); await sleep(4000);
console.log("final          :", await ev(`__prog()`));
console.log("success banner :", await ev(`document.querySelector('[role=status]')?.textContent?.trim()?.slice(0,160)`));
console.log("status nodes   :", await ev(`[...document.querySelectorAll('[role=status],[role=alert]')].map(n=>n.textContent.trim().replace(/\\s+/g,' ')).join('  ||  ').slice(0,400)`));
console.log("skipped slot still holds the bad serial:", await ev(`document.querySelector('input[aria-label="Serial number for item 5"]')?.value`));
console.log("progress text  :", await ev(`[...document.querySelectorAll('p')].map(p=>p.textContent.trim()).find(t=>/registered$/.test(t))`));
console.log("footer button  :", await ev(`__btn()`));
console.log("draft still holds serial 5:", await ev(`JSON.parse(__draft()).serials[4]`));
// fix the bad serial and save the last one individually
await ev(`__setItem(5,'${'FIXED'}-5')`); await sleep(300);
console.log("btn after fix  :", await ev(`__btn()`));
await ev(`__click('Submit')`); await sleep(3500);
console.log("--- after resubmitting the fixed one ---");
console.log("progress       :", await ev(`__prog()`));
console.log("item5 value    :", JSON.stringify(await ev(`document.querySelector('input[aria-label="Serial number for item 5"]')?.value ?? null`)));
console.log("status after   :", await ev(`[...document.querySelectorAll('[role=status],[role=alert]')].map(n=>n.textContent.trim().replace(/\\s+/g,' ')).join('  ||  ').slice(0,400)`));
console.log("ids on done    :", await ev(`[...document.querySelectorAll('dialog a[href^="/assets/IT-"]')].map(a=>a.textContent.trim()).join(' ')`));
console.log("print link     :", await ev(`document.querySelector('a[href*="/assets/labels?ids="]')?.getAttribute('href')?.slice(0,50)+'…'`));
console.log("draft cleared  :", await ev(`__draft() === null`));
ws.close(); chrome.kill();
