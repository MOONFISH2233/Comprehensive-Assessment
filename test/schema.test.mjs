/**
 * 细则数据的校验、规范化、导入导出。
 * 这些代码的职责是「别人给的文件再脏也不能让应用崩掉」，所以重点测脏数据。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCatalog, validateCatalog, countQuestions,
  makeEmptyCatalog, makeEmptyGroup, MODES, genId
} from '../catalog-schema.js';
import { DEFAULT_CATALOG } from '../catalog.js';

/* ---------- 规范化：脏数据 ---------- */

test('normalizeCatalog：null / undefined / 字符串都不抛异常', () => {
  for (const bad of [null, undefined, '不是对象', 42, []]) {
    const { catalog } = normalizeCatalog(bad);
    assert.ok(catalog && Array.isArray(catalog.groups), `${JSON.stringify(bad)} 应产出空细则`);
  }
});

test('normalizeCatalog：缺字段时补默认值', () => {
  const { catalog } = normalizeCatalog({ name: '测试' });
  assert.equal(catalog.school, '');
  assert.deepEqual(catalog.notes, []);
  assert.equal(catalog.yu.D.name, '德育');
  assert.equal(catalog.yu.L.name, '劳育');
});

test('normalizeCatalog：丢弃没有名称的分组并记下来', () => {
  const { catalog, dropped } = normalizeCatalog({
    groups: [
      { title: '好的分组', mode: 'count', items: [{ name: '项目甲' }] },
      { title: '', mode: 'count', items: [{ name: 'x' }] },
      null,
    ]
  });
  assert.equal(catalog.groups.length, 1);
  assert.equal(catalog.groups[0].title, '好的分组');
  assert.ok(dropped.length >= 2, '应报告被丢弃的项');
});

test('normalizeCatalog：不认识的分组模式退回 count 而不是崩', () => {
  const { catalog, dropped } = normalizeCatalog({
    groups: [{ title: 'G', mode: '不存在的模式', items: [{ name: 'a' }] }]
  });
  assert.equal(catalog.groups[0].mode, 'count');
  assert.ok(dropped.some(d => d.includes('不存在的模式')));
});

test('normalizeCatalog：count 组没有项目就整组丢掉（否则会问出空白一屏）', () => {
  const { catalog } = normalizeCatalog({
    groups: [
      { title: '空组', mode: 'count', items: [] },
      { title: '有内容', mode: 'count', items: [{ name: 'a' }] }
    ]
  });
  assert.deepEqual(catalog.groups.map(g => g.title), ['有内容']);
});

test('normalizeCatalog：项目 id 重复时自动去重', () => {
  const { catalog } = normalizeCatalog({
    groups: [{ title: 'G', mode: 'count', items: [
      { id: 'same', name: 'a' }, { id: 'same', name: 'b' }, { id: 'same', name: 'c' }
    ]}]
  });
  const ids = catalog.groups[0].items.map(i => i.id);
  assert.equal(new Set(ids).size, 3, '重复 id 应被换掉');
});

test('normalizeCatalog：项目的 unit 可以是字符串数字', () => {
  const { catalog } = normalizeCatalog({
    groups: [{ title: 'G', mode: 'count', unit: '0.1', items: [{ name: 'a', unit: '0.15' }] }]
  });
  assert.equal(catalog.groups[0].unit, 0.1);
  assert.equal(catalog.groups[0].items[0].unit, 0.15);
});

test('normalizeCatalog：分组 id 重复时自动去重', () => {
  const { catalog } = normalizeCatalog({
    groups: [
      { id: 'dup', title: 'A', mode: 'count', items: [{ name: 'a' }] },
      { id: 'dup', title: 'B', mode: 'count', items: [{ name: 'b' }] },
    ]
  });
  assert.notEqual(catalog.groups[0].id, catalog.groups[1].id);
});

test('normalizeCatalog：缺 formulaName 时用分组标题兜底（避免 PDF 顶行出现 undefined）', () => {
  const { catalog } = normalizeCatalog({
    groups: [{ id: 'g1', title: '专业技能', mode: 'count', items: [{ name: 'a' }] }]
  });
  assert.equal(catalog.formulaNames.g1, '专业技能加分');
});

/* ---------- 内置细则本身要合格 ---------- */

test('内置细则能通过校验', () => {
  const { catalog } = normalizeCatalog(DEFAULT_CATALOG);
  const { errors, warnings } = validateCatalog(catalog);
  assert.deepEqual(errors, [], '内置细则不应有 error');
  assert.deepEqual(warnings, [], '内置细则不应有 warning');
});

test('内置细则规范化后条目数不变', () => {
  const { catalog } = normalizeCatalog(DEFAULT_CATALOG);
  const before = DEFAULT_CATALOG.groups.reduce((s, g) => s + (g.items?.length ?? 0), 0);
  const after = catalog.groups.reduce((s, g) => s + (g.items?.length ?? 0), 0);
  assert.equal(after, before, '规范化不该丢条目');
  assert.equal(catalog.groups.length, DEFAULT_CATALOG.groups.length);
});

test('内置细则的 tier 档位经过 JSON 往返后仍然是 Infinity', () => {
  // JSON 会把 Infinity 变成 null，导入时必须还原，否则「30 小时以上」那档会失效
  const round = JSON.parse(JSON.stringify(DEFAULT_CATALOG));
  const { catalog } = normalizeCatalog(round);
  const zy = catalog.groups.find(g => g.mode === 'tier');
  assert.ok(zy, '应有 tier 组');
  assert.equal(zy.tiers[zy.tiers.length - 1].max, Infinity);
});

/* ---------- 校验 ---------- */

test('validateCatalog：没有分组算 error', () => {
  const { errors } = validateCatalog({ groups: [] });
  assert.ok(errors.some(e => e.includes('没有任何分组')));
});

test('validateCatalog：分级计分但没有级别算 error', () => {
  const { errors } = validateCatalog({
    groups: [{ id: 'g', title: '竞赛', mode: 'grade', cap: null, levels: [], rankNames: ['一等奖'] }]
  });
  assert.ok(errors.some(e => e.includes('没有配置任何级别')));
});

test('validateCatalog：count 组没有项目算 warning（会问出空白一屏）', () => {
  const { warnings } = validateCatalog({
    groups: [{ id: 'g', title: '空组', mode: 'count', cap: null, items: [], unit: 0.1 }]
  });
  assert.ok(warnings.some(w => w.includes('空白一屏')));
});

test('validateCatalog：多个可选项却没设封顶，算 warning', () => {
  const { warnings } = validateCatalog({
    groups: [{ id: 'g', title: 'G', mode: 'range', cap: null,
               options: [{ id: 'a', name: 'x', min: 0, max: 1 },
                         { id: 'b', name: 'y', min: 0, max: 1 }] }]
  });
  assert.ok(warnings.some(w => w.includes('没设封顶')));
});

test('validateCatalog：只有一个可选项时不报封顶 warning（单选认定项本来就不封顶）', () => {
  const { warnings } = validateCatalog({
    groups: [{ id: 'g', title: '突出事迹', mode: 'range', cap: null,
               options: [{ id: 'o', name: 'x', min: 2.5, max: 7.5 }] }]
  });
  assert.ok(!warnings.some(w => w.includes('封顶')), '不该误报');
});

test('validateCatalog：扣分组没封顶不算 warning（扣分本来就不封顶）', () => {
  const { warnings } = validateCatalog({
    groups: [{ id: 'p', title: '扣分', mode: 'penalty', cap: null,
               options: [{ id: 'o', name: 'x', flat: 1 }] }]
  });
  assert.ok(!warnings.some(w => w.includes('没有设封顶')));
});

/* ---------- 屏数统计 ---------- */

test('countQuestions：逐项模式按条目数算，其余每组一屏', () => {
  const cat = {
    groups: [
      { mode: 'count', items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      { mode: 'items-grade', items: [{ id: 'd' }, { id: 'e' }] },
      { mode: 'grade' },
      { mode: 'tier' },
    ]
  };
  assert.equal(countQuestions(cat), 3 + 2 + 1 + 1);
});

test('countQuestions：内置细则的屏数与实际一致', () => {
  const { catalog } = normalizeCatalog(DEFAULT_CATALOG);
  const n = countQuestions(catalog);
  // 若改动 catalog 导致屏数变化，这里会提醒 —— 数字变了要确认是有意的
  assert.equal(n, 141, `屏数变成了 ${n}，确认是有意改动`);
});

/* ---------- 新建模板 ---------- */

test('makeEmptyGroup：给每种模式都产出可用的骨架', () => {
  for (const mode of MODES) {
    const g = makeEmptyGroup('D', mode);
    assert.equal(g.mode, mode);
    assert.ok(g.id && g.title);
    const { errors } = validateCatalog({ name: 'x', groups: [g] });
    // 空模板允许有 warning（还没填内容），但不该有结构性 error
    assert.ok(!errors.some(e => e.includes('没有配置')), `${mode} 的骨架不该缺关键结构`);
  }
});

test('makeEmptyCatalog：能直接通过规范化', () => {
  const { catalog } = normalizeCatalog(makeEmptyCatalog('测试细则'));
  assert.equal(catalog.name, '测试细则');
  assert.deepEqual(catalog.groups, []);
});

test('genId：反复调用不重复', () => {
  const ids = new Set(Array.from({ length: 500 }, () => genId('x')));
  assert.equal(ids.size, 500);
});
