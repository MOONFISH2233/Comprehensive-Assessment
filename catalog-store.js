/**
 * 细则的存取。
 *
 * 内置一份默认细则（catalog.js），另外用户可以导入/编辑自己的细则，
 * 存在 localStorage 里。运行时读的是「当前选中的那一份」。
 *
 * 没有后端，所以「分享」就是导出成一个 .json 文件发出去，对方导入即可。
 */

import { DEFAULT_CATALOG } from './catalog.js';
import { normalizeCatalog, validateCatalog } from './catalog-schema.js';

const KEY_LIST = 'zongce-v2-catalogs';
const KEY_ACTIVE = 'zongce-v2-active';

// localStorage 可能被禁用（无痕模式）。禁用时退化成内存存储：
// 本次会话能用，刷新就没了 —— 比直接崩掉好。
let memList = null;
let memActive = null;

const storageOK = (() => {
  try {
    localStorage.setItem('__zc_probe2', '1');
    localStorage.removeItem('__zc_probe2');
    return true;
  } catch { return false; }
})();

function readList() {
  if (!storageOK) return memList ?? [];
  try {
    const raw = localStorage.getItem(KEY_LIST);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];   // 存档坏了就当没有，不要让整个应用起不来
  }
}

function writeList(list) {
  if (!storageOK) { memList = list; return; }
  try {
    localStorage.setItem(KEY_LIST, JSON.stringify(list));
  } catch (e) {
    console.warn('细则保存失败', e);
    throw new Error('保存失败：浏览器存储空间不足或已被禁用');
  }
}

/* ------------------------------------------------------------------ *
 * 读
 * ------------------------------------------------------------------ */

/** 列表：内置那份永远排在最前 */
export function listCatalogs() {
  const builtin = { ...DEFAULT_CATALOG, builtin: true };
  const mine = readList().map(c => ({ ...c, builtin: false }));
  return [builtin, ...mine];
}

export function getActiveId() {
  if (storageOK) {
    try { return localStorage.getItem(KEY_ACTIVE) || DEFAULT_CATALOG.id; } catch { /* 忽略 */ }
  }
  return memActive ?? DEFAULT_CATALOG.id;
}

export function setActiveId(id) {
  if (storageOK) {
    try { localStorage.setItem(KEY_ACTIVE, id); } catch { /* 忽略 */ }
  } else {
    memActive = id;
  }
}

/** 当前生效的细则。找不到就回退到内置那份（永远不该返回 null） */
export function getActiveCatalog() {
  const id = getActiveId();
  if (id === DEFAULT_CATALOG.id) return DEFAULT_CATALOG;
  const found = readList().find(c => c.id === id);
  return found ?? DEFAULT_CATALOG;
}

export function getCatalog(id) {
  if (id === DEFAULT_CATALOG.id) return { ...DEFAULT_CATALOG, builtin: true };
  const found = readList().find(c => c.id === id);
  return found ? { ...found, builtin: false } : null;
}

/* ------------------------------------------------------------------ *
 * 写
 * ------------------------------------------------------------------ */

/**
 * 新增或更新一份细则。
 * @returns {{ok:boolean, error?:string, catalog?:object, dropped?:string[]}}
 */
export function saveCatalog(input) {
  const { catalog, dropped } = normalizeCatalog(input);
  if (catalog.id === DEFAULT_CATALOG.id) {
    return { ok: false, error: '这是内置细则的 id，不能覆盖。请先「复制一份」再改。' };
  }
  const { errors } = validateCatalog(catalog);
  if (errors.length) return { ok: false, error: errors.join('；') };

  const list = readList();
  const i = list.findIndex(c => c.id === catalog.id);
  if (i >= 0) list[i] = catalog;
  else list.push(catalog);

  try {
    writeList(list);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  return { ok: true, catalog, dropped };
}

export function deleteCatalog(id) {
  if (id === DEFAULT_CATALOG.id) return { ok: false, error: '内置细则不能删除' };
  const list = readList().filter(c => c.id !== id);
  writeList(list);
  if (getActiveId() === id) setActiveId(DEFAULT_CATALOG.id);
  return { ok: true };
}

/** 复制一份（内置的也能复制，改起来不用从零开始） */
export function duplicateCatalog(id) {
  const src = getCatalog(id);
  if (!src) return { ok: false, error: '找不到这份细则' };
  const copy = JSON.parse(JSON.stringify(src));
  delete copy.builtin;
  copy.id = `cat-${Date.now().toString(36)}`;
  copy.name = `${src.name}（副本）`;
  // 分组 id 也要换掉，否则两份细则的 id 会撞
  const remap = {};
  copy.groups = (copy.groups ?? []).map(g => {
    const nid = `grp-${Math.random().toString(36).slice(2, 9)}`;
    remap[g.id] = nid;
    return { ...g, id: nid };
  });
  const fn = {};
  for (const [k, v] of Object.entries(copy.formulaNames ?? {})) {
    if (remap[k]) fn[remap[k]] = v;
  }
  // 没跟着换过去的，用分组标题兜底
  for (const g of copy.groups) {
    if (!fn[g.id]) fn[g.id] = `${g.title}加分`;
  }
  copy.formulaNames = fn;

  return saveCatalog(copy);
}

/* ------------------------------------------------------------------ *
 * 导入 / 导出
 * ------------------------------------------------------------------ */

const EXPORT_VERSION = 1;

export function exportJSON(catalog) {
  const clean = JSON.parse(JSON.stringify(catalog));
  delete clean.builtin;
  // Infinity 在 JSON 里会变成 null，tier 的最后一档靠这个还原，
  // 这里显式标一下，导入时更稳
  for (const g of clean.groups ?? []) {
    for (const t of g.tiers ?? []) {
      if (t.max === null) t.max = null;   // JSON.stringify 已经把 Infinity 转成 null 了
    }
  }
  return JSON.stringify({
    format: 'zongce-catalog',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString().slice(0, 10),
    catalog: clean
  }, null, 2);
}

/**
 * 从 JSON 文本导入。
 * 接受两种形状：带 format/version 外壳的，以及直接就是一份细则的。
 */
export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: '不是合法的 JSON 文件：' + e.message };
  }

  const raw = parsed && parsed.catalog ? parsed.catalog : parsed;
  if (parsed && parsed.format && parsed.format !== 'zongce-catalog') {
    return { ok: false, error: `文件格式是「${parsed.format}」，不是本工具的细则文件` };
  }
  if (parsed && parsed.version && parsed.version > EXPORT_VERSION) {
    return { ok: false, error: '这份文件来自更新版本的工具，请先升级' };
  }

  const { catalog, dropped } = normalizeCatalog(raw);
  const { errors, warnings } = validateCatalog(catalog);
  if (errors.length) return { ok: false, error: errors.join('；') };

  // 导入的 id 可能跟已有的撞，换一个
  const existing = new Set(listCatalogs().map(c => c.id));
  if (existing.has(catalog.id)) catalog.id = `cat-${Date.now().toString(36)}`;
  if (!catalog.name) catalog.name = '导入的细则';

  const saved = saveCatalog(catalog);
  if (!saved.ok) return saved;
  return { ok: true, catalog: saved.catalog, dropped, warnings };
}
