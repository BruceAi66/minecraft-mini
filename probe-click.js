// 用原生 WebSocket 连 headless chromium 的 CDP,模拟点击"开始游戏"按钮
// 抓: 控制台异常 / 页面错误 / 点击后 overlay 是否隐藏 / pointerLock 状态
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 9225;
const URL = 'file:///root/minecraft-mini.html';

const chrome = spawn('chromium-browser', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=/tmp/mc-cdp-profile',
  'about:blank'
], { stdio: ['ignore','ignore','pipe'] });

let ws, id = 0;
const pending = new Map();
function send(method, params){
  return new Promise((res, rej)=>{
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

async function waitMs(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function main(){
  // 等调试端口
  let target = null;
  for(let i=0;i<40;i++){
    await waitMs(250);
    try{
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await r.json();
      target = list.find(t=>t.type==='page');
      if(target) break;
    }catch(e){}
  }
  if(!target){ console.log('CDP target 没起来'); process.exit(2); }

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej)=>{ ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if(msg.id && pending.has(msg.id)){
      const p = pending.get(msg.id); pending.delete(msg.id);
      if(msg.error) p.rej(new Error(msg.error.message));
      else p.res(msg.result);
    } else if(msg.method === 'Runtime.exceptionThrown'){
      console.log('【异常】', JSON.stringify(msg.params.exceptionDetails));
    } else if(msg.method === 'Runtime.consoleAPICalled'){
      const txt = (msg.params.args||[]).map(a=>a.value||a.description||'').join(' ');
      if(txt) console.log('【console】', txt);
    } else if(msg.method === 'Log.entryAdded'){
      console.log('【log】', msg.params.entry.level, msg.params.entry.text);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: URL });
  await waitMs(2500);

  // 1) 游戏初始化状态
  const s1 = await send('Runtime.evaluate', {
    expression: `({
      three: typeof THREE !== 'undefined',
      world: (typeof world !== 'undefined') ? world.size : -1,
      slots: document.querySelectorAll('.slot').length,
      startBtn: !!document.getElementById('startBtn'),
      audioCtx: typeof AudioContext
    })`,
    returnByValue: true
  });
  console.log('【初始化】', JSON.stringify(s1.result.value));

  // 2) 尝试点击(先试能不能请求 pointer lock)
  const s2 = await send('Runtime.evaluate', {
    expression: `(()=>{
      let out = {};
      try{
        document.getElementById('startBtn').click();
        out.clicked = true;
      }catch(e){ out.clickErr = String(e); }
      out.pointerLock = !!document.pointerLockElement;
      out.overlayDisplay = getComputedStyle(document.getElementById('overlay')).display;
      return out;
    })()`,
    returnByValue: true
  });
  console.log('【点击结果】', JSON.stringify(s2.result.value));
  await waitMs(800);
  const s3 = await send('Runtime.evaluate', {
    expression: `({
      pointerLock: !!document.pointerLockElement,
      overlayDisplay: getComputedStyle(document.getElementById('overlay')).display,
      dbg: document.getElementById('dbg').textContent
    })`,
    returnByValue: true
  });
  console.log('【点击后】', JSON.stringify(s3.result.value));

  // 3) 直接调用 requestPointerLock 并单独测 AudioContext 是否抛错
  const s4 = await send('Runtime.evaluate', {
    expression: `(()=>{
      let r = {};
      try{
        const ac = new AudioContext();
        r.audioOK = true; ac.close();
      }catch(e){ r.audioErr = String(e); }
      return r;
    })()`,
    returnByValue: true
  });
  console.log('【AudioContext 单独】', JSON.stringify(s4.result.value));

  chrome.kill('SIGKILL');
  process.exit(0);
}

main().catch(e=>{ console.error('harness 失败:', e); chrome.kill('SIGKILL'); process.exit(1); });
