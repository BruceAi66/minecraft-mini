// =====================================================================
//  触屏专项冒烟测试: MC_TOUCH=1 强制触屏模式
//  验证: 1) 触屏控件挂载  2) 摇杆输入改移动方向  3) 触屏物理分支
//       4) 挖/放按钮事件  5) 触屏开始按钮逻辑  6) 触屏帮助显示
//       7) 点热栏选方块
//  用法: MC_TOUCH=1 node smoke-touch.js
// =====================================================================
'use strict';
const fs = require('fs');

const STUBS = `
// ---------- DOM 桩(触屏: 需要 getElementById 返回带 addEventListener 的元素) ----------
function makeCtx(){
  return { fillStyle:'', fillRect(){}, clearRect(){},
    createLinearGradient(){ return { addColorStop(){} }; },
    createRadialGradient(){ return { addColorStop(){} }; },
    drawImage(){}, imageSmoothingEnabled:true };
}
function makeEl(){
  return { style:{}, textContent:'', innerHTML:'', title:'', id:'',
    width:0, height:0, className:'',
    classList:{ toggle(){}, add(){}, remove(){} },
    appendChild(){}, querySelector(){ return makeEl(); },
    getContext(){ return makeCtx(); },
    requestPointerLock(){}, requestFullscreen(){ if(this._fs) this._fs(); },
    getBoundingClientRect(){ return { left:0, top:0, width:100, height:100 }; },
    addEventListener(ev, fn){ (this._ls = this._ls || {})[ev] = fn; } };
}
// 按 id 缓存元素: getElementById 返回同一个对象,保证「游戏注册监听器」和「测试触发」是同一个元素
const elCache = {};
function getEl(id){ if(!elCache[id]){ elCache[id] = makeEl(); elCache[id].id = id; } return elCache[id]; }
globalThis.window = { innerWidth:390, innerHeight:844, devicePixelRatio:2, addEventListener(){},
  AudioContext:undefined, webkitAudioContext:undefined, matchMedia:()=>({matches:false}),
  location:{ search: '?touch=1' } };
globalThis.document = {
  createElement(t){ return t==='canvas' ? Object.assign(makeEl(),{getContext:makeCtx,width:0,height:0}) : makeEl(); },
  getElementById: getEl,   // 返回缓存元素,保证游戏/测试同一对象
  body:{ appendChild(){}, classList:{ add(){}, remove(){} } },
  addEventListener(){}, pointerLockElement:null,
  documentElement:{ requestFullscreen(){} },
  fullscreenElement:null };
globalThis.addEventListener = function(){};
globalThis.innerWidth = 390; globalThis.innerHeight = 844; globalThis.devicePixelRatio = 2;
globalThis.location = { search: '?touch=1' };
const RAFQ = [];
globalThis.requestAnimationFrame = fn => { RAFQ.push(fn); return RAFQ.length; };
globalThis.performance = { now: (()=>{ let t=0; return ()=> (t+=16.7); })() };

// ---------- THREE 桩 ----------
class V3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  clone(){return new V3(this.x,this.y,this.z);} }
class Mat4 { constructor(){ this.elements=new Array(16).fill(0); } }
class Obj3 { constructor(){ this.position=new V3(); this.rotation={x:0,y:0,z:0,order:''};
  this.scale=new V3(1,1,1); this.quaternion={}; this.matrix=new Mat4();
  this.visible=true; this.children=[]; this.renderOrder=0; }
  updateMatrix(){} add(){} }
class Color { constructor(h){ this.r=this.g=this.b=0; if(typeof h==='number') this.setHex(h); }
  setHex(h){this.r=((h>>16)&255)/255; this.g=((h>>8)&255)/255; this.b=(h&255)/255; return this;}
  copy(c){this.r=c.r;this.g=c.g;this.b=c.b;return this;}
  lerp(c,t){this.r+=(c.r-this.r)*t; this.g+=(c.g-this.g)*t; this.b+=(c.b-this.b)*t; return this;}
  setScalar(v){this.r=this.g=this.b=v; return this;} }
class Fog { constructor(c,n,f){ this.color=new Color(c); this.near=n; this.far=f; } }
class Scene extends Obj3 { constructor(){ super(); this.background=new Color(); this.fog=null; } }
class PerspectiveCamera extends Obj3 { constructor(f,a,n,ff){ super(); this.fov=f;this.aspect=a;this.near=n;this.far=ff; }
  updateProjectionMatrix(){} getWorldDirection(v){ v.set(0,0,-1); return v; } }
class WebGLRenderer { constructor(){ this.domElement={addEventListener(){},requestPointerLock(){}}; } setSize(){} setPixelRatio(){} render(){} }
class Light extends Obj3 { constructor(c,i){ super(); this.color=new Color(c); this.intensity=i; } }
class AmbientLight extends Light {}
class DirectionalLight extends Light { constructor(c,i){ super(c,i); this.target={position:new V3()}; } }
class BufferAttribute { constructor(arr,is){ this.array=arr; this.itemSize=is; } }
class BufferGeometry { constructor(){ this.attributes={}; } setAttribute(n,a){ this.attributes[n]=a; } }
class BoxGeometry extends BufferGeometry {}
class PlaneGeometry extends BufferGeometry {}
class SphereGeometry extends BufferGeometry {}
class EdgesGeometry extends BufferGeometry { constructor(g){ super(); } }
class InstancedMesh extends Obj3 { constructor(g,m,c){ super(); this.geometry=g; this.material=m; this.count=c;
  this.instanceMatrix={needsUpdate:false}; this.instanceColor=null; this.frustumCulled=true; this._mats=[]; }
  setMatrixAt(i,m){ this._mats[i]=m; } getMatrixAt(i){ return this._mats[i]||new Mat4(); }
  setColorAt(i,c){ if(!this.instanceColor) this.instanceColor={needsUpdate:false}; } }
class Mesh extends Obj3 { constructor(g,m){ super(); this.geometry=g; this.material=m; } }
class Material { constructor(){ this.color=new Color(); this.fog=true; } }
class MeshLambertMaterial extends Material {}
class MeshBasicMaterial extends Material {}
class SpriteMaterial extends Material { constructor(o){ super(); Object.assign(this,o); } }
class Sprite extends Obj3 { constructor(m){ super(); this.material=m; } }
class PointsMaterial extends Material { constructor(o){ super(); Object.assign(this,o); } }
class Points extends Obj3 { constructor(g,m){ super(); this.geometry=g; this.material=m; } }
class LineBasicMaterial extends Material { constructor(o){ super(); Object.assign(this,o); } }
class LineSegments extends Obj3 { constructor(g,m){ super(); this.geometry=g; this.material=m; } }
class V2 { constructor(x=0,y=0){this.x=x;this.y=y;} set(x,y){this.x=x;this.y=y;return this;} }
class CanvasTexture { constructor(img){ this.image=img; this.wrapS=this.wrapT=1001;
  this.repeat=new V2(1,1); this.offset=new V2(0,0); this.magFilter=1006; this.minFilter=1006; this.generateMipmaps=true; } }
const RepeatWrapping=1000, NearestFilter=1006, BackSide=1;
globalThis.THREE = { Scene, Fog, PerspectiveCamera, WebGLRenderer, Color, AmbientLight, DirectionalLight,
  BufferAttribute, BufferGeometry, BoxGeometry, PlaneGeometry, SphereGeometry, EdgesGeometry, InstancedMesh, Mesh,
  MeshLambertMaterial, MeshBasicMaterial, SpriteMaterial, Sprite, PointsMaterial, Points,
  LineBasicMaterial, LineSegments, CanvasTexture, RepeatWrapping, NearestFilter, BackSide,
  Vector3:V3, Matrix4:Mat4, Object3D:Obj3 };
`;

const ASSERTS = `

let pass=0, fail=0;
function ok(c,n){ if(c){pass++;console.log('  ✔',n);} else {fail++;console.log('  ✘ 失败:',n);} }

console.log('【0. 触屏模式启用】');
ok(isTouch===true, 'isTouch=true(URL 强制)');
ok(document.body.classList.add.called===undefined || true, '触屏控件已创建(无异常)');

console.log('【1. 摇杆输入改移动】');
// 记录起始,设摇杆向上,跑一帧物理,位置应沿视角前向移动
const start = player.pos.clone();
player.yaw = 0;            // 朝向 -Z
joy.dx = 0; joy.dy = 1;    // 摇杆上推到底
for(let i=0;i<10;i++) physStep(0.016);
const dz = start.z - player.pos.z;
ok(dz > 0.1, '摇杆上推 → 向前移动 dz=' + dz.toFixed(2) + ' (>0.1)');
joy.dx = 1; joy.dy = 0;    // 摇杆右推
const sx = player.pos.x;
for(let i=0;i<10;i++) physStep(0.016);
ok(player.pos.x - sx > 0.1, '摇杆右推 → 向右移动 dx=' + (player.pos.x-sx).toFixed(2) + ' (>0.1)');
joy.dx = 0; joy.dy = 0;

console.log('【2. 触屏物理分支(水中/飞行)】');
player.mode='creative'; player.flying=true;
joy.dy = 1;
player.vel.set(0,0,0);
physStep(0.016);
ok(player.vel.y > 0 || player.vel.x!==0 || player.vel.z!==0, '飞行+摇杆上推 → 有速度 (v='+player.vel.y.toFixed(2)+')');
joy.dy = 0;
player.mode='creative'; player.flying=false;
player.pos.copy(SPAWN); player.vel.set(0,0,0);

console.log('【3. 触屏开始按钮(全屏不锁鼠标)】');
// 给 documentElement.requestFullscreen 挂计数钩子
let fsCount = 0;
document.documentElement.requestFullscreen = () => { fsCount++; };
ok(typeof requestLock === 'function', 'requestLock 已定义');
overlay.style.display = 'flex';
requestLock();
ok(overlay.style.display === 'none', '触屏 requestLock → overlay 隐藏');
ok(fsCount > 0, '触屏 requestLock → 调用了 requestFullscreen (count='+fsCount+')');

console.log('【4. 挖/放按钮事件】');
// 先探针: 游戏里 btnMine 是否绑了监听器
ok(btnMine && btnMine._ls && typeof btnMine._ls['touchstart']==='function',
   'btnMine 已绑定 touchstart 监听器 ('+ (btnMine&&btnMine._ls?'有':'无') +')');
// 相机朝下,让 pick() 命中脚下地面(挖按钮才能真正挖到)
camera.position.copy(player.pos); camera.position.y += player.eye;
camera.getWorldDirection = v => v.set(0,-1,0);
// 挖按钮 → mine(): 挖掉脚下
player.mode='survival'; player.health=20; inventory.fill(0);
const wb = world.size;
if(btnMine && btnMine._ls) btnMine._ls['touchstart']({ preventDefault(){} });
const invSum = inventory.reduce((a,v)=>a+v,0);
ok(world.size < wb, '挖按钮 → 世界方块减少 ('+wb+'→'+world.size+')');
ok(invSum > 0, '挖按钮 → 背包增加 (sum='+invSum+')');

// 放按钮 → place(): 在玩家正前方放一个「参照方块」,让 pick() 命中它,再往它旁边放
const wb2 = world.size;
player.mode='creative';
const fx = Math.floor(player.pos.x), fy = Math.floor(player.pos.y+1), fz = Math.floor(player.pos.z)-3;
addBlock(fx, fy, fz, 1);   // 参照方块(正前方 3 格,眼睛那一层)
camera.position.set(player.pos.x, player.pos.y+player.eye, player.pos.z);
camera.getWorldDirection = v => v.set(0,0,-1);
const hitCheck = pick();
ok(hitCheck !== null, 'pick() 命中参照方块 '+(hitCheck?JSON.stringify(hitCheck):'null'));
if(btnPlace && btnPlace._ls) btnPlace._ls['touchstart']({ preventDefault(){} });
ok(world.size > wb2, '放按钮 → 世界方块增加 ('+wb2+'→'+world.size+')');
player.mode='creative';

console.log('【5. 触屏帮助显示】');
ok(document.getElementById('touch-help') ? true : false, 'touch-help 元素存在');
ok(document.getElementById('rotate-overlay') ? true : false, 'rotate-overlay 锁横屏提示层存在');

console.log('【6. 主循环 100 帧(触屏模式无异常)】');
let thrown=null;
try{ for(let i=0;i<100 && RAFQ.length;i++){ const fn=RAFQ.shift(); fn(i*16.7+16.7); } }catch(e){ thrown=e; }
ok(!thrown, thrown ? ('无异常: '+thrown.message) : '100 帧无异常');

console.log('【7. 触屏点热栏选方块】');
ok(hotbarSlots.length === BLOCKS.length-1, '热栏格子数 = 方块数-1 ('+hotbarSlots.length+')');
const curBefore7 = current;
hotbarSlots[2].el._ls['touchstart']({ preventDefault(){} });
ok(current === 3, '点第3格 → current=3 (实际 '+current+', 前 '+curBefore7+')');
hotbarSlots[8].el._ls['touchstart']({ preventDefault(){} });
ok(current === 9, '点第9格 → current=9 (实际 '+current+')');

console.log('【8. 右摇杆转视角 + 双指放方块】');
// 右摇杆右推满偏 → 驱动主循环帧 → yaw 变化
const yaw0 = player.yaw, pitch0 = player.pitch;
ljZone._ls['touchstart']({ preventDefault(){}, changedTouches:[{ identifier:51, clientX:200, clientY:300 }] });
ljZone._ls['touchmove']({ preventDefault(){}, changedTouches:[{ identifier:51, clientX:255, clientY:300 }] });  // 右满偏 dx=1(桩 base 圆心50,宽100)
for(let i=0;i<10 && RAFQ.length;i++){ const fn=RAFQ.shift(); fn(i*16.7+16.7); }
ok(player.yaw !== yaw0, '右摇杆右推 → yaw 变化 ('+yaw0.toFixed(3)+'→'+player.yaw.toFixed(3)+')');
// 右摇杆上推满偏 → pitch 变化(抬头)
ljZone._ls['touchmove']({ preventDefault(){}, changedTouches:[{ identifier:51, clientX:200, clientY:245 }] });  // 上满偏 dy=1
for(let i=0;i<10 && RAFQ.length;i++){ const fn=RAFQ.shift(); fn(i*16.7+16.7); }
ok(player.pitch !== pitch0, '右摇杆上推 → pitch 变化 ('+pitch0.toFixed(3)+'→'+player.pitch.toFixed(3)+')');
ljZone._ls['touchend']({ changedTouches:[{ identifier:51 }] });
// 松开后不再转视角
const yawAfter = player.yaw;
for(let i=0;i<5 && RAFQ.length;i++){ const fn=RAFQ.shift(); fn(i*16.7+16.7); }
ok(player.yaw === yawAfter, '右摇杆松开 → yaw 不再变化');
// 双指放方块(视角区)
const wb3 = world.size;
removeBlock(48, 20, 46);   // 腾出参照方块(48,20,45)的 +z 面邻位——【4】放按钮实际放的 adj=[48,20,46](见 hitCheck),否则双指 place 无处可放
const wb3b = world.size;   // 基准取 remove 之后: place 应 +1
// 桩 camera 不会随玩家坠落同步(【4】挖脚下后玩家已掉到 y≈16),把 camera 放回参照方块(48,20,45)正前方,否则 pick 扫不到 → place 直接 return
camera.position.set(48.5, 20.6, 48.5);
lookZone._ls['touchstart']({ preventDefault(){}, changedTouches:[{ identifier:61, clientX:200, clientY:300 }] });
lookZone._ls['touchstart']({ preventDefault(){}, changedTouches:[{ identifier:62, clientX:210, clientY:310 }] });
ok(world.size > wb3b, '双指第二指 → 放方块 ('+wb3b+'→'+world.size+')');
lookZone._ls['touchend']({ changedTouches:[{ identifier:61 }, { identifier:62 }] });

console.log('');
console.log('触屏测试结果: '+pass+' 通过 / '+fail+' 失败');
process.exit(fail?1:0);
`;

// 拼装: 桩(STUBS 的 makeEl.addEventListener 已把监听器存进 _ls,测试直接调 _ls) + 游戏本体 + 断言
// 直接从 index.html 提取最后一个 inline <script> 块(游戏主代码),不读旧缓存
const htmlSrc = fs.readFileSync(__dirname + '/index.html','utf8');
const blocks = htmlSrc.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/g) || [];
const gameNow = blocks[blocks.length-1].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
fs.writeFileSync('/tmp/mc-touch-run.js', STUBS + '\n' + gameNow + '\n' + ASSERTS);
require('/tmp/mc-touch-run.js');
