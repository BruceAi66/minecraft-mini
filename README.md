# ⛏ 网页版我的世界 (minecraft-mini)

纯前端 Three.js 体素沙盒游戏,单文件 HTML,零依赖、零服务器、完全本地运行。

**下载本仓库后即可本地游玩,不需要联网、不需要服务器。**

## 本地游玩(两种方式)

**方式一(推荐):直接打开成品**
1. 下载本仓库(绿色 Code 按钮 → Download ZIP,或 `git clone`)
2. 打开 `minecraft-mini.html`(双击,用 Chrome / Safari / Edge 等浏览器打开)
3. 开玩!

**方式二(开发者):从源码重新打包**
```bash
python3 build.py       # 打包: index.html + three.min.js → minecraft-mini.html
node smoke.js          # 桌面冒烟测试(27 断言)
node smoke-touch.js    # 触屏冒烟测试(23 断言)
```

## 特性

- 程序化值噪声地形(96×96,湖泊/沙滩/三座山)
- 昼夜循环(100s/天:太阳/月亮/星星/云/天空渐变)
- 生存/创造双模式(挖/放/背包/摔落伤害/飞行)
- 触屏双摇杆(左移动/右视角)+ 热栏选方块 + 跳跃按钮(MC PE 布局)
- 地标:哈利波特风城堡 + 参天大树 + 三座山
- 水中跳跃(近水面跳上岸/深水上浮)
- WebAudio 程序合成音效,零素材
- DDA 射线拾取 + 子步进物理防穿墙
- PWA 支持(manifest + service worker:本地部署时可选启用离线缓存)

## 操作

| 桌面 | 触屏 |
|---|---|
| WASD 移动 | 左摇杆移动 |
| 鼠标转视角 | 右摇杆转视角 |
| 左键挖 / 右键放 | ⛏ 挖 / 🧱 放(双指=放) |
| 空格跳 | ⤒ 跳 |
| 1-9/滚轮选方块 | 点热栏选方块 |
| C 切模式 · F 飞行 · M 静音 | 同左 |

## 项目结构

```
minecraft-mini/
├── index.html              # 源码(带中文注释,改这个)
├── build.py                # 打包脚本(注入 three.min.js → 单文件)
├── three.min.js            # Three.js r128
├── minecraft-mini.html     # 打包成品(下载即玩,双击打开)
├── smoke.js                # 桌面冒烟测试
├── smoke-touch.js          # 触屏冒烟测试
├── manifest.webmanifest    # PWA 清单(可选)
├── sw.js                   # Service Worker(可选,需 HTTPS 或 localhost)
└── icon-512.png            # 应用图标
```

## 技术

- Three.js r128(InstancedMesh 每方块一格,9 种方块)
- 值噪声 fBm 地形 + DDA 体素拾取 + 子步进物理
- 无任何后端,纯客户端运行

---
出品:艾哥
