// =====================================================================
//  minecraft-mini v3 运行时冒烟测试(node 环境)
//  把「DOM/canvas/THREE/WebAudio 桩 + 游戏本体 + 断言」拼成一个模块运行,
//  这样断言代码能直接访问游戏的内部变量(world/player/physStep...)
//  真跑: 初始化 + 300 帧主循环, 再验证 地形/渲染/DDA/摔落伤害/水中/背包
//  用法: node smoke.js
// =====================================================================
'use strict';
const fs = require('fs');

const STUBS = `
// ---------- DOM 桩 ----------
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
    appendChild(){}, addEventListener(){}, querySelector(){ return makeEl(); },
    getContext(){ return makeCtx(); }, requestPointerLock(){} };
}
globalThis.window = { innerWidth:1280, innerHeight:720, devicePixelRatio:1, addEventListener(){},
  AudioContext:undefined, webkitAudioContext:undefined, matchMedia:()=>({matches:false}),
  location:{ search: process.env.MC_TOUCH==='1' ? '?touch=1' : '' } };
globalThis.document = {
  createElement(t){ return t==='canvas' ? Object.assign(makeEl(),{getContext:makeCtx,width:0,height:0}) : makeEl(); },
  getElementById(){ return makeEl(); },
  body:{ appendChild(){} }, addEventListener(){}, pointerLockElement:null };
global.addEventListener = function(){};
global.innerWidth = 1280; global.innerHeight = 720; global.devicePixelRatio = 1;
global.location = { search: process.env.MC_TOUCH==='1' ? '?touch=1' : '' };
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

// =====================================================================
//  断言区(与游戏同模块作用域,可直接访问内部变量)
// =====================================================================
let pass = 0, fail = 0;
function ok(cond, name){
  if(cond){ pass++; console.log('  ✔', name); }
  else { fail++; console.log('  ✘ 失败:', name); }
}

console.log('【1. 地形生成】');
ok(world.size > 50000, '世界方块数 ' + world.size + ' (>50000)');
let hmin=99, hmax=0, underwater=0;
for(let i=0;i<heightAt.length;i++){
  const h=heightAt[i];
  if(h<hmin)hmin=h; if(h>hmax)hmax=h;
  if(h<SEA) underwater++;
}
ok(hmin>=2 && hmax<=36, '高度范围 ' + hmin + '..' + hmax + ' (2..36)');
ok(underwater>500, '水下/沙滩列 ' + underwater + ' 个 (有湖泊)');

console.log('【2. 渲染完整性】');
let inst=0;
for(let i=1;i<layers.length;i++) inst += layers[i].mesh.count;
ok(inst === world.size, '实例总数 ' + inst + ' === 世界方块 ' + world.size);
ok(layers.every((L,i)=> i===0 || L.mesh.count<=100000), '每层实例数未超上限');

console.log('【3. 噪声函数】');
let nmin=1, nmax=0;
for(let i=0;i<200;i++){ const v=fbm(i*0.3, i*0.7, 4, seed); if(v<nmin)nmin=v; if(v>nmax)nmax=v; }
ok(nmin>=0 && nmax<=1, 'fbm 范围 [' + nmin.toFixed(3) + ', ' + nmax.toFixed(3) + '] 在 [0,1]');

console.log('【4. DDA 拾取】');
camera.position.copy(player.pos); camera.position.y += player.eye;   // 相机放玩家眼睛处
camera.getWorldDirection = v => v.set(0,-1,0);
const hitDown = pick();
const groundY = heightAt[(Math.floor(player.pos.z)|0)*W + (Math.floor(player.pos.x)|0)];
ok(hitDown && hitDown.y === groundY, '向下拾取命中 y=' + (hitDown&&hitDown.y) + ' (地表=' + groundY + ')');
const groundId = hitDown ? world.get(vkey(hitDown.x,hitDown.y,hitDown.z)) : 0;
ok(groundId===1 || groundId===4, '脚下是地面方块(草或沙) id=' + groundId);

console.log('【5. 摔落伤害(生存)】');
player.mode='survival'; player.health=20; player.fallStart=null;
player.pos.y = groundY+20; player.vel.set(0,0,0);
for(let i=0;i<400;i++){ physStep(0.016); if(player.onGround) break; }
ok(player.health < 20, '摔落后血量 ' + player.health + ' (<20 受伤了)');
ok(player.health >= 0, '血量未为负');
ok(player.onGround && player.pos.y >= groundY+1 && player.pos.y <= groundY+2,
   '落地站稳 y=' + player.pos.y.toFixed(2) + ' (地表' + groundY + '+1~+2)');

console.log('【5.5 地标建筑: 山 / 参天大树 / 城堡】');
ok(heightAt[18*W+70] >= 25, '山(70,18)抬升到 ' + heightAt[18*W+70] + ' (≥25)');
const btH = heightAt[BIG_TREE.z*W+BIG_TREE.x];
ok(world.get(vkey(BIG_TREE.x, btH+10, BIG_TREE.z)) === 5, '参天大树树干(原木)存在');
ok(world.get(vkey(BIG_TREE.x+1, btH+32, BIG_TREE.z+1)) === 6, '树冠尖顶有树叶');
ok(CASTLE.x0>0, '城堡找到平地 (x0='+CASTLE.x0+', z0='+CASTLE.z0+', base='+CASTLE.base+')');
ok(world.get(vkey(CASTLE.x0+8, CASTLE.base+1, CASTLE.z0+5)) === 9, '城堡平台圆石存在');
ok(world.get(vkey(CASTLE.x0+3, CASTLE.base+1+15, CASTLE.z0+3)) === 3 || world.get(vkey(CASTLE.x0+3, CASTLE.base+1+15, CASTLE.z0+3)) === 9, '城堡尖塔高耸存在');

console.log('【6. 水中判定】');
let waterCol = null;
for(let z=4;z<D;z+=3) for(let x=4;x<W;x+=3){
  if(heightAt[z*W+x] < SEA){
    // 只选「深水且头顶开阔」的水柱: h<=SEA-2 保证玩家脚(SEA-0.3)悬在水中不插地, h+1..h+6 无方块保证跳起不撞头
    const hh = heightAt[z*W+x];
    if(hh > SEA-2) continue;
    let clear = true;
    for(let y=hh+1; y<=hh+6; y++) if(world.has(vkey(x,y,z))){ clear=false; break; }
    if(clear){ waterCol={x,z}; break; }
  }
  if(waterCol) break;
}
if(waterCol){
  const hh = heightAt[waterCol.z*W+waterCol.x];
  player.pos.set(waterCol.x+0.5, hh+0.5, waterCol.z+0.5);
  ok(inWater()===true, '水下判定真 (地表' + hh + ' 海面' + SEA + ')');
  player.pos.set(waterCol.x+0.5, SEA+1.5, waterCol.z+0.5);
  ok(inWater()===false, '水面以上判定假');
  // 水中跳跃: 接近水面按空格 = 跳跃初速(能跳上岸);深水悬空 = 纯上浮
  keys.Space = true;
  player.pos.set(waterCol.x+0.5, SEA-0.3, waterCol.z+0.5);
  player.vel.set(0,0,0); player.onGround=false;
  physStep(0.016);
  ok(player.vel.y > 5, '水中接近水面按空格 → 跳跃初速 v='+player.vel.y.toFixed(1)+' (>5)');
  if(hh <= SEA-1.5){   // 水深≥2 才测深水悬空(否则此柱没有「悬空」区)
    player.pos.set(waterCol.x+0.5, hh+1, waterCol.z+0.5);
    player.vel.set(0,0,0); player.onGround=false;
    physStep(0.016);
    ok(player.vel.y <= 4, '深水悬空按空格 → 纯上浮 v='+player.vel.y.toFixed(1)+' (≤4)');
  } else { ok(true, '跳过深水断言(此水柱过浅)'); }
  keys.Space = false;
} else { ok(false, '没找到水下柱(异常)'); }
player.mode='creative'; player.flying=false;
player.pos.copy(SPAWN); player.vel.set(0,0,0);

console.log('【7. 挖/放(生存背包)】');
player.mode='survival'; player.health=20;
inventory.fill(0);
const dropId = DROPS[groundId];   // 挖脚下那块(草→泥土 或 沙→沙)
mine();                            // 走真实生存挖掘路径(删块+入背包+粒子+音效)
ok(inventory[dropId] === 1, '挖地面得掉落物 x' + inventory[dropId] + ' (掉落id=' + dropId + ')');
current = dropId;
place();                           // 走真实放置路径(放块+扣背包+音效)
ok(inventory[dropId] === 0, '放回后剩 ' + inventory[dropId]);
ok(world.has(vkey(hitDown.x,hitDown.y,hitDown.z)), '方块已放回');
player.mode='creative';

console.log('【8. 主循环 300 帧】');
let thrown=null;
try {
  for(let i=0;i<300 && RAFQ.length;i++){
    const fn = RAFQ.shift();
    fn(i*16.7 + 16.7);
  }
} catch(e){ thrown = e; }
ok(!thrown, thrown ? ('无异常: '+thrown.message) : '300 帧无异常');
ok(player.health===20 && player.mode==='creative', '帧后状态正常');
ok(tod > 0.30, '昼夜时间在走 tod=' + tod.toFixed(3));

console.log('');
console.log('结果: ' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
`;

// 拼装: 桩 + 游戏本体 + 断言 → 写临时文件 → require(共享模块作用域)
// 直接从 index.html 提取最后一个 inline <script> 块(游戏主代码),不读旧缓存
const htmlSrc = fs.readFileSync(__dirname + '/index.html','utf8');
const blocks = htmlSrc.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/g) || [];
const game = blocks[blocks.length-1].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
fs.writeFileSync('/tmp/mc-run.js', STUBS + '\n' + game + '\n' + ASSERTS);
require('/tmp/mc-run.js');
