// 在 headless chromium 里真实渲染游戏,截 3 张图:
// 1) 默认出生点视野  2) 高空俯瞰  3) 挖/放后的世界
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 9226;
const URL = 'file:///root/minecraft-mini.html';
const chrome = spawn('chromium-browser', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader',
  '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/mc-cdp-profile2',
  '--window-size=1280,720', 'about:blank'
], { stdio: ['ignore','ignore','pipe'] });

let ws, id = 0;
const pending = new Map();
function send(method, params){
  return new Promise((res, rej)=>{ const mid=++id; pending.set(mid,{res,rej});
    ws.send(JSON.stringify({id:mid, method, params})); });
}
const waitMs = ms => new Promise(r=>setTimeout(r,ms));

async function main(){
  let target=null;
  for(let i=0;i<40;i++){ await waitMs(250);
    try{ const r=await fetch(`http://127.0.0.1:${PORT}/json`); const l=await r.json();
      target=l.find(t=>t.type==='page'); if(target) break; }catch(e){} }
  if(!target){ console.log('CDP 没起来'); process.exit(2); }

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=rej; });
  ws.onmessage = ev => { const m=JSON.parse(ev.data);
    if(m.id && pending.has(m.id)){ const p=pending.get(m.id); pending.delete(m.id);
      m.error?p.rej(new Error(m.error.message)):p.res(m.result); }
    else if(m.method==='Runtime.exceptionThrown') console.log('【异常】', JSON.stringify(m.params.exceptionDetails));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', {url:URL}); await waitMs(2200);

  const evalJs = async (expr) => (await send('Runtime.evaluate',{expression:expr,returnByValue:true})).result.value;
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', {format:'png'});
    fs.writeFileSync('/tmp/'+name+'.png', Buffer.from(r.data,'base64'));
    console.log('截图:', name+'.png', (r.data.length/1024/1.33).toFixed(0)+'KB');
  };

  // 运行几帧让画面稳定
  await evalJs(`new Promise(r=>{ let n=0; const f=()=>{ if(++n<30) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); })`);
  // 1) 默认出生点(隐藏 overlay)
  await evalJs(`document.getElementById('overlay').style.display='none';`);
  await shot('mc1-spawn');

  // 2) 高空俯瞰(切创造+飞行,拉高视野)
  await evalJs(`
    player.mode='creative'; player.flying=true;
    player.pos.set(48, 34, 48); player.vel.set(0,0,0);
    player.yaw = 0.6; player.pitch = -0.9;
  `);
  await evalJs(`new Promise(r=>{ let n=0; const f=()=>{ if(++n<30) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); })`);
  await shot('mc2-aerial');

  // 3) 看白天阳光下的沙滩近景
  await evalJs(`
    player.pos.set(52, 20, 40); player.yaw = -1.2; player.pitch = -0.25;
  `);
  await evalJs(`new Promise(r=>{ let n=0; const f=()=>{ if(++n<30) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); })`);
  await shot('mc3-closeup');

  chrome.kill('SIGKILL');
  console.log('完成');
  process.exit(0);
}
main().catch(e=>{ console.error('失败:',e); chrome.kill('SIGKILL'); process.exit(1); });
