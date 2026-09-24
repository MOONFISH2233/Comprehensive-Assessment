/**
 * 草稿解析器。
 *
 * 定位是「省打字，不保证正确」，所以测试分两类：
 *   ① 纯函数部分（清洗、数值提取）要准 —— 这些错了会误导用户
 *   ② 真实细则的解析结果只断言「大框架认出来了」，不追求逐条正确 ——
 *      那本来就不是它的职责，逐条正确靠的是人在编辑器里复核
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDraft, cleanLines } from '../draft-parser.js';
import { normalizeCatalog, countQuestions } from '../catalog-schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PDF_TEXT = path.join(here, '..', '细则原文.txt');

/* ---------- 文本清洗 ---------- */

test('cleanLines：去掉页码和空行', () => {
  const out = cleanLines('第一行\n\n  \n第 3 页\n- 7 -\n第二行');
  assert.deepEqual(out, ['第一行', '第二行']);
});

test('cleanLines：去掉超长行（多半是乱码）', () => {
  const out = cleanLines('正常\n' + 'x'.repeat(300));
  assert.deepEqual(out, ['正常']);
});

/* ---------- 数值提取 ---------- */

test('解析：认出「加 X 分」', () => {
  const d = parseDraft(
    '一、德育\n（1）思政教育活动\n参加某活动，加 0.1 分\n上限 0.6 分'
  );
  const g = d.groups[0];
  assert.ok(g, '应认出一个分组');
  assert.equal(g.unit, 0.1);
  assert.equal(g.cap, 0.6);
});

test('解析：认出「累计不超过 X 分」这种封顶写法', () => {
  const d = parseDraft('一、德育\n（1）活动加分\n参加一次加 0.1 分\n累计不超过 0.5 分');
  assert.equal(d.groups[0].cap, 0.5);
});

test('解析：认出竞赛类并按 grade 处理', () => {
  const d = parseDraft('二、智育\n（1）竞赛获奖加分\n获得一等奖、二等奖、三等奖的依次计分');
  assert.equal(d.groups[0].mode, 'grade');
  assert.ok(Array.isArray(d.groups[0].levels), 'grade 组必须有 levels，否则表单会崩');
  assert.ok(Array.isArray(d.groups[0].rankNames));
});

test('解析：认出「由评审组认定」并按 range 处理', () => {
  const d = parseDraft('一、德育\n（1）学生干部加分\n由评审组根据实际工作情况打分，0.5-2.5 分');
  assert.equal(d.groups[0].mode, 'range');
  assert.ok(d.groups[0].options?.length, 'range 组必须有 options');
});

/* ---------- 每个解析出来的分组都必须是「表单能消费的」 ---------- */

test('解析结果里每个分组都有对应模式需要的数据结构', () => {
  const d = parseDraft('一、德育\n（1）活动\n参加一次加 0.1 分\n二、智育\n（1）竞赛\n一等奖 6 分\n（2）证书\n六级通过加 1 分\n三、劳育\n（1）志愿\n累计 30 小时以上加 0.3 分');
  for (const g of d.groups) {
    if (g.mode === 'count') assert.ok(Array.isArray(g.items), `${g.title} 缺 items`);
    if (g.mode === 'grade') {
      assert.ok(Array.isArray(g.levels), `${g.title} 缺 levels`);
      assert.ok(Array.isArray(g.rankNames), `${g.title} 缺 rankNames`);
    }
    if (g.mode === 'range') assert.ok(Array.isArray(g.options), `${g.title} 缺 options`);
    if (g.mode === 'tier') assert.ok(Array.isArray(g.tiers), `${g.title} 缺 tiers`);
  }
});

test('解析结果能通过规范化（脏数据不能让编辑器崩）', () => {
  const d = parseDraft('随便一段完全不规整的文字\n没有编号也没有育\n就这样');
  const { catalog } = normalizeCatalog(d);
  assert.ok(catalog && Array.isArray(catalog.groups));
  assert.ok(countQuestions(catalog) >= 0);
});

test('空文本不抛异常', () => {
  for (const bad of ['', '   ', null, undefined]) {
    const d = parseDraft(bad);
    assert.ok(Array.isArray(d.groups));
  }
});

/* ---------- 拿真实细则跑一遍 ---------- */

test('真实细则：至少认出五育中的四个', (t) => {
  if (!fs.existsSync(PDF_TEXT)) return t.skip('找不到细则原文.txt');
  const d = parseDraft(fs.readFileSync(PDF_TEXT, 'utf8'));
  const yus = new Set(d.groups.map(g => g.yu));
  // 不要求五个全中：原文里「体育」既是育名也出现在别的标题里，容易混
  assert.ok(yus.size >= 4, `只认出了 ${yus.size} 个育：${[...yus]}（应 ≥4）`);
});

test('真实细则：分组数量落在合理区间（不能漏太多，也不能过分割）', (t) => {
  if (!fs.existsSync(PDF_TEXT)) return t.skip('找不到细则原文.txt');
  const d = parseDraft(fs.readFileSync(PDF_TEXT, 'utf8'));
  const items = d.groups.reduce((s, g) => s + (g.items?.length ?? 0), 0);
  console.log(`      实跑结果：${d.groups.length} 组 / ${items} 条 / 共 ${countQuestions(d)} 屏` +
              `（人工整理是 21 组 / 128 条 / 141 屏）`);

  // 下界：漏太多就等于没省力气
  assert.ok(d.groups.length >= 12, `只认出 ${d.groups.length} 个分组，漏太多`);
  // 上界：过分割比漏认更糟 —— 用户要手动删一堆假分组，还不如从零录。
  // 曾经因为把「1) 优秀：四级≥560分」这类备注当成标题，21 组被切成 82 组。
  assert.ok(d.groups.length <= 32, `认出 ${d.groups.length} 个分组，过分割严重（应 ≤32）`);
  assert.ok(items >= 100, `只认出 ${items} 条项目（应 ≥100）`);
});

test('真实细则：不会把备注行当成分组标题', (t) => {
  if (!fs.existsSync(PDF_TEXT)) return t.skip('找不到细则原文.txt');
  const d = parseDraft(fs.readFileSync(PDF_TEXT, 'utf8'));
  for (const g of d.groups) {
    assert.ok(!/^[0-9\s]+$/.test(g.title), `标题是纯数字：「${g.title}」`);
    assert.ok((g.title.match(/[一-龥]/g) || []).length >= 2,
              `标题不像名字：「${g.title}」`);
    assert.ok(!/[≥≤]/.test(g.title), `标题里带比较符：「${g.title}」`);
  }
});

test('真实细则：解析结果规范化后没有结构性 error', (t) => {
  if (!fs.existsSync(PDF_TEXT)) return t.skip('找不到细则原文.txt');
  const d = parseDraft(fs.readFileSync(PDF_TEXT, 'utf8'));
  const { catalog } = normalizeCatalog(d);
  for (const g of catalog.groups) {
    if (g.mode === 'grade' || g.mode === 'honor') {
      assert.ok(g.levels?.length, `${g.title} 缺级别，表单会崩`);
    }
  }
});
