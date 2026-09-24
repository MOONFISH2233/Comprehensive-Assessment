/**
 * 独立核对：把 catalog 里每个项目名拿回细则 PDF 原文里搜。
 * 目的不是跑 CI，而是抄录完成后人工跑一次，确认没有编造或错字。
 * 用法：node test/verify-against-pdf.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CATALOG } from '../catalog.js';

const CATALOG = DEFAULT_CATALOG.groups;

const here = path.dirname(fileURLToPath(import.meta.url));
const dumpPath = process.argv[2] ?? path.join(here, '..', '细则原文.txt');

if (!fs.existsSync(dumpPath)) {
  console.error(`找不到细则原文：${dumpPath}`);
  console.error('先用 python + pymupdf 把 PDF 抽成文本，再跑这个脚本。');
  process.exit(2);
}

// 全角/半角、空白、大小写、各类引号都归一化，否则「•」和「·」之类会误报
const norm = (s) => s
  .toLowerCase()
  .replace(/\s+/g, '')
  .replace(/[“”"「」『』]/g, '"')
  .replace(/[‘’']/g, "'")
  .replace(/[•·・]/g, '')
  .replace(/[，,]/g, ',')          // 细则原文自己在半角/全角逗号之间反复横跳
  .replace(/[、]/g, '/')           // 顿号与斜杠在原文里混用（「SCI、EI、SSCI」vs「SCI / EI / SSCI」）
  .replace(/[；;]/g, ';')
  .replace(/[：:]/g, ':')
  .replace(/[（(]/g, '(')
  .replace(/[）)]/g, ')')
  .replace(/[－—–]/g, '-')
  .replace(/[➕]/g, '+');

const raw = fs.readFileSync(dumpPath, 'utf8');
const hay = norm(raw);

let checked = 0;
let viaSrc = 0;
const missing = [];

/**
 * 显示名（name）为了让学生看得懂，可以比原文更口语化；
 * 只要提供 src，就校验 src 的原文出处。没有 src 的按 name 校验。
 */
function check(groupId, id, displayName, src) {
  checked++;
  const probe = src ?? displayName;
  if (src) viaSrc++;
  if (!hay.includes(norm(probe))) missing.push({ group: groupId, id, name: displayName, src });
}

for (const g of CATALOG) {
  for (const it of (g.items ?? [])) check(g.id, it.id, it.name, it.src);
  for (const o of (g.options ?? [])) check(g.id, o.id, o.name, o.src);
  for (const sg of (g.subgroups ?? [])) {
    for (const o of sg.options) check(g.id, o.id, o.name, o.src);
  }
}

console.log(`核对 ${checked} 项（其中 ${viaSrc} 项按 src 原文校验），未找到 ${missing.length} 项。`);
if (missing.length) {
  console.log('\n以下条目在细则原文里找不到出处，需要人工确认：');
  for (const m of missing) console.log(`  [${m.group}] ${m.id}  ${m.name}${m.src ? `\n      src: ${m.src}` : ''}`);
  process.exit(1);
}
console.log('全部在原文中找到出处。');
