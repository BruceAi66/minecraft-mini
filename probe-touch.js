// 触屏验证 v2(轻量): 不开 GPU 软件渲染, 事件逐步派发, 每步容错
'use strict';
const { spawn } = require('child_process');
const PORT = 9228;
const URL = 'file:///root/minecraft-mini.html';
const chrome = spawn('chromium-browser', [
  '--headless=new','--no-sandbox','--disable-gpu','--disable-software-rasterizer',
  '--remote-debugging-port='+PORT,'--user-data-dir=/tmp/mc-cdp-touch2',
  '--window-size=390,844','about:blank'
], { stdio:['ignore','ignore','pipe'] });
let ws, id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  let target=null;
  for(let i=0;i<30;i++){ await wait(200); try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const l=await r.json();target=l.find(t=>t.type==='page');if(target)break;}catch(e){} }
  if(!target){console.log('CDP没起来');process.exit(2);}
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);
    if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);} };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  // 让 navigator.maxTouchPoints 返回 5,匹配真实手机
  await send('Runtime.evaluate',{expression:`Object.defineProperty(navigator,'maxTouchPoints',{value:5,configurable:true})`});
  await send('Page.navigate',{url:URL}); await wait(2200);
  const ev=async e=>{try{return (await send('Runtime.evaluate',{expression:e,returnByValue:true})).result.value;}catch(err){return 'ERR:'+err.message;}};

  console.log('【触屏检测】 isTouch =', await ev('isTouch'));
  console.log('【控件】 摇杆=', await ev(`getComputedStyle(document.getElementById('joystick-zone')).display`),
    ' 视角区=', await ev(`getComputedStyle(document.getElementById('look-zone')).display`),
    ' 挖=', await ev(`getComputedStyle(document.getElementById('btn-mine')).display`),
    ' 准星=', await ev(`getComputedStyle(document.getElementById('crosshair')).display`));
  console.log('【开始】 触屏帮助=', await ev(`getComputedStyle(document.getElementById('touch-help')).display`));

  await ev(`document.getElementById('overlay').style.display='none';`);

  // 摇杆: 拖动向上
  const start = await ev(`({x:player.pos.x,z:player.pos.z})`);
  const rc = await ev(`(()=>{const r=document.getElementById('joystick-base').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})()`);
  if(!rc.w){ console.log('【摇杆】 无区域(跳过)'); }
  else {
    const cx=rc.l+rc.w/2, cy=rc.t+rc.h/2;
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:1,radiusX:2,radiusY:2,force:1}]});
    await wait(50);
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx,y:cy-rc.h/2,id:1,radiusX:2,radiusY:2,force:1}]});
    await wait(250);
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const now = await ev(`({x:player.pos.x,z:player.pos.z})`);
    console.log('【摇杆移动】 位移=', Math.hypot(now.x-start.x, now.z-start.z).toFixed(2), '(>0.5 即生效)');
  }

  // 视角: 视角区拖动
  const yb = await ev('player.yaw');
  const lrc = await ev(`(()=>{const r=document.getElementById('look-zone').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})()`);
  if(!lrc.w){ console.log('【视角】 无区域(跳过)'); }
  else {
    const lx=lrc.l+lrc.w/2, ly=lrc.t+lrc.h/2;
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:lx,y:ly,id:2,radiusX:2,radiusY:2,force:1}]});
    await wait(40);
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:lx+100,y:ly+30,id:2,radiusX:2,radiusY:2,force:1}]});
    await wait(60);
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    console.log('【视角拖动】 yaw变化=', (await ev('player.yaw')-yb).toFixed(3), '(≠0 即生效)');
  }

  // 挖按钮
  await ev(`player.mode='survival'; inventory.fill(0);`);
  const wb = await ev('world.size');
  const brc = await ev(`(()=>{const r=document.getElementById('btn-mine').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})()`);
  if(!brc.w){ console.log('【挖】 无按钮(跳过)'); }
  else {
    const bx=brc.l+brc.w/2, by=brc.t+brc.h/2;
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bx,y:by,id:3,radiusX:2,radiusY:2,force:1}]});
    await wait(80);
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    console.log('【挖按钮】 世界', wb, '→', await ev('world.size'),
      ' 背包=', await ev(`inventory.reduce((a,v,i)=>v?a+i+':'+v+',':a,'')`));
  }

  console.log('【出品】 开始界面含"出品:艾哥" =', await ev(`document.getElementById('overlay').innerHTML.includes('出品:艾哥')`));
  chrome.kill('SIGKILL'); process.exit(0);
}
// 全局兜底: 60 秒没跑完就自杀
setTimeout(()=>{ console.log('【超时】 60s 强制结束'); try{chrome.kill('SIGKILL');}catch(e){} process.exit(3); }, 60000);
main().catch(e=>{console.error('失败:',e);try{chrome.kill('SIGKILL');}catch(x){}process.exit(1);});
