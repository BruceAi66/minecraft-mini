#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
minecraft-mini 构建脚本
流程: 改 index.html 源码 → 跑本脚本 → 生成单文件 minecraft-mini.html(内嵌 three.js)
用法:  python3 build.py
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent          # /root/minecraft-mini
OUT  = ROOT / 'minecraft-mini.html'                     # 打包成品(单文件,入库,下载即玩)
OLD  = ROOT / 'minecraft-mini-v2-backup.html'           # 旧打包备份(v2,含 three.js r128)
THREE_FILE = ROOT / 'three.min.js'

def extract_three():
    """从旧打包文件里抠出 three.js 内嵌脚本,存成独立文件(只做一次)"""
    if THREE_FILE.exists():
        return THREE_FILE.read_text()
    old = OLD.read_text()
    m = re.search(r'/\*\*\n \* @license.*?Copyright 2010-2021 Three\.js Authors.*?\n \*/\n', old, re.S)
    if not m:
        sys.exit('找不到 three.js 的 license 头,检查旧打包文件')
    start = m.start()
    end = old.index('</script>', start)
    three = old[start:end].rstrip() + '\n'
    THREE_FILE.write_text(three)
    print(f'已从 v2 打包提取 three.js -> {THREE_FILE.name} ({len(three)//1024} KB)')
    return three

def build():
    three = extract_three()
    src = (ROOT / 'index.html').read_text()
    if '/*__THREE_JS__*/' not in src:
        sys.exit('index.html 里没有 /*__THREE_JS__*/ 占位符')
    out = src.replace('/*__THREE_JS__*/', three)
    OUT.write_text(out)
    print(f'✔ 打包完成: {OUT} ({len(out)//1024} KB)')
    # 校验: 成品应只含一次 three.js,且占位符已被替换
    assert '/*__THREE_JS__*/' not in out, '占位符没被替换!'
    assert out.count('Copyright 2010-2021 Three.js Authors') == 1, 'three.js 数量不对'

if __name__ == '__main__':
    build()
