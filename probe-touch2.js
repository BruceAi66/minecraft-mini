// 触屏双平台验证: iOS Safari + Android Chrome
// 在页面加载前注入脚本强制 matchMedia 返回粗指针/无hover, 让 isTouch 变真, 从而真跑触屏初始化
// 每平台测: 控件显示 / 摇杆移动 / 视角拖动 / 挖按钮 / 放按钮
'use strict';
const { spawn } = require('child_process');
const PORT = 9229;
const URL = 'file:///root/minecraft-mini.html';

async function runOne(label, ua, maxTouch){
  return new Promise(resolve=>{
    const chrome = spawn('chromium-browser', [
      '--headless=new','--no-sandbox','--disable-gpu','--disable-software-rasterizer',
      '--remote-debugging-port='+PORT,'--user-data-dir=/tmp/mc-cdp-'+label,
      '--window-size=390,844','about:blank'
    ], { stdio:['ignore','ignore','pipe'] });
    let ws, id=0; const pending=new Map();
    const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    let done=false;
    const finish=(msg)=>{ if(done)return; done=true; try{chrome.kill('SIGKILL');}catch(e){} console.log(msg); resolve(); };
    setTimeout(()=>finish('  [超时] '+label), 55000);

    (async()=>{
      let target=null;
      for(let i=0;i<30;i++){ await wait(200); try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const l=await r.json();target=l.find(t=>t.type==='page');if(target)break;}catch(e){} }
      if(!target) return finish('  [CDP失败] '+label);
      ws=new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
      ws.onmessage=ev=>{const m=JSON.parse(ev.data);
        if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);} };
      await send('Page.enable'); await send('Runtime.enable');
      await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:maxTouch});
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
      // 平台指纹
      const plat = { ios:'iPhone', android:'Linux; Android 14' }[label];
      await send('Emulation.setUserAgentOverride',{userAgent:ua, platform:plat});
      // 页面加载前注入: 强制粗指针/无hover/maxTouchPoints
      await send('Page.addScriptToEvaluateOnNewDocument',{source:`
        const _mq = window.matchMedia;
        window.matchMedia = function(q){
          if(q.includes('pointer: coarse')) return {matches:true, media:q, addEventListener(){}, addListener(){}, removeListener(){}};
          if(q.includes('pointer')) return {matches:false, media:q, addEventListener(){}, addListener(){}, removeListener(){}};
          if(q.includes('hover')) return {matches:false, media:q, addEventListener(){}, addListener(){}, removeListener(){}};
          return _mq(q);
        };
        Object.defineProperty(navigator, 'maxTouchPoints', {value: ${maxTouch}, configurable:true});
      `});
      await send('Page.navigate',{url:URL}); await wait(2500);
      const ev=async e=>{try{return (await send('Runtime.evaluate',{expression:e,returnByValue:true})).result.value;}catch(err){return 'ERR:'+err.message;}};

      console.log('■ '+label+' ('+ua.slice(0,40)+'...)');
      console.log('  isTouch =', await ev('isTouch'));
      console.log('  控件: 摇杆=', await ev(`getComputedStyle(document.getElementById('joystick-zone')).display`),
        ' 视角=', await ev(`getComputedStyle(document.getElementById('look-zone')).display`),
        ' 挖=', await ev(`getComputedStyle(document.getElementById('btn-mine')).display`),
        ' 准星=', await ev(`getComputedStyle(document.getElementById('crosshair')).display`));
      console.log('  触屏帮助=', await ev(`getComputedStyle(document.getElementById('touch-help')).display`));

      await ev(`document.getElementById('overlay').style.display='none';`);

      // 摇杆
      const start = await ev(`({x:player.pos.x,z:player.pos.z})`);
      const rc = await ev(`(()=>{const r=document.getElementById('joystick-base').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})()`);
      if(!rc.w){ console.log('  摇杆: 无区域'); }
      else {
        const cx=rc.l+rc.w/2, cy=rc.t+rc.h/2;
        await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:1,radiusX:2,radiusY:2,force:1}]});
        await wait(50);
        await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx,y:cy-rc.h/2,id:1,radiusX:2,radiusY:2,force:1}]});
        await wait(250);
        await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        const now = await ev(`({x:player.pos.x,z:player.pos.z})`);
        console.log('  摇杆移动 位移=', Math.hypot(now.x-start.x, now.z-start.z).toFixed(2), '(>0.5 生效)');
      }

      // 视角
      const yb = await ev('player.yaw');
      const lrc = await ev(`(()=>{const r=document.getElementById('look-zone').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})()`);
      if(!lrc.w){ console.log('  视角: 无区域'); }
      else {
        const lx=lrc.l+lrc.w/2, ly=lrc.t+lrc.h/2;
        await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:lx,y:ly,id:2,radiusX:2,radiusY:2,force:1}]});
        await wait(40);
        await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:lx+100,y:ly+30,id:2,radiusX:2,radiusY:2,force:1}]});
        await wait(60);
        await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        console.log('  视角拖动 yaw变化=', (await ev('player.yaw')-yb).toFixed(3), '(≠0 生效)');
      }

      // 挖
      await ev(`player.mode='survival'; inventory.fill(0);`);
      const wb = await ev('world.size');
      const brc = await ev(`(()=>{const r=document.getElementById('btn-mine').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})()`);
      if(!brc.w){ console.log('  挖: 无按钮'); }
      else {
        const bx=brc.l+brc.w/2, by=brc.t+brc.h/2;
        await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bx,y:by,id:3,radiusX:2,radiusY:2,force:1}]});
        await wait(80);
        await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        const inv = await ev(`inventory.reduce((a,v,i)=>v?a+i+':'+v+',':a,'')`);
        console.log('  挖按钮 世界', wb, '→', await ev('world.size'), ' 背包=', inv);
      }

      // 放(用放按钮)
      const pb = await ev('world.size');
      const prc = await ev(`(()=>{const r=document.getElementById('btn-place').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})()`);
      if(!prc.w){ console.log('  放: 无按钮'); }
      else {
        const px=prc.l+prc.w/2, py=prc.t+prc.h/2;
        await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:px,y:py,id:4,radiusX:2,radiusY:2,force:1}]});
        await wait(80);
        await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        console.log('  放按钮 世界', pb, '→', await ev('world.size'), '(+1 生效)');
      }
      finish('  完成');
    })().catch(e=>finish('  [异常] '+label+': '+e.message));
  });
}

(async()=>{
  await runOne('ios', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 5);
  await runOne('android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36', 5);
  process.exit(0);
})();
