import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, YU, FORMULA_NAMES } from '../catalog.js';

test('五个育都有分组', () => {
  for (const y of ['D', 'Z', 'T', 'M', 'L']) {
    const groups = CATALOG.filter(g => g.yu === y);
    assert.ok(groups.length > 0, `${y} 育没有任何分组`);
  }
});

test('分组与项目的 id 全局唯一', () => {
  const ids = new Set();
  for (const g of CATALOG) {
    assert.ok(!ids.has(g.id), `重复的分组 id: ${g.id}`);
    ids.add(g.id);
    for (const it of (g.items ?? [])) {
      assert.ok(!ids.has(it.id), `重复的项目 id: ${it.id}`);
      ids.add(it.id);
    }
  }
});

// 各 count / items-grade 组的具名项目数，逐组钉死。
// 这样以后任何人改动 catalog 漏掉一项，测试会立刻指出是哪一组。
const EXPECTED_ITEMS = {
  'D-sizheng': 7,        // 细则 p1 参加思政教育加分
  'Z-kejihuodong': 50,   // 细则 p6–7 参加科技学术活动加分
  'T-duanlian': 13,      // 细则 p9 课外体育锻炼活动
  'T-bisai': 11,         // 细则 p9 体育比赛
  'M-huodong': 25,       // 细则 p10–11 积极参加美育实践或文艺活动
  'L-sushe': 2,          // 细则 p11 宿舍文明卫生
  'L-shijian': 15        // 细则 p12 社会实践 13 项 + 暑假实习/助教 2 项（0.15 分）
};

test('每一组的项目数与细则原文一致', () => {
  for (const [gid, n] of Object.entries(EXPECTED_ITEMS)) {
    const g = CATALOG.find(x => x.id === gid);
    assert.ok(g, `catalog 里找不到分组 ${gid}`);
    assert.equal(g.items?.length ?? 0, n, `${gid} 项目数应为 ${n}`);
  }
});

test('具名项目总数', () => {
  const n = CATALOG.reduce((s, g) => s + (g.items?.length ?? 0), 0);
  const expected = Object.values(EXPECTED_ITEMS).reduce((a, b) => a + b, 0);
  assert.equal(n, expected, `项目总数应为 ${expected}，实际 ${n}`);
});

test('非逐项组的选项数', () => {
  const asOptions = (g) =>
    g.mode === 'pickmax' ? (g.subgroups ?? []).reduce((s, sg) => s + sg.options.length, 0)
    : (g.options?.length ?? 0);
  assert.equal(asOptions(CATALOG.find(g => g.id === 'D-shehui')), 9, '社会服务岗位');
  assert.equal(asOptions(CATALOG.find(g => g.id === 'D-koufen')), 8, '德育扣分项');
  assert.equal(asOptions(CATALOG.find(g => g.id === 'Z-jineng')), 15, '专业技能');
});

test('每个分组都有计分模式与封顶字段', () => {
  for (const g of CATALOG) {
    assert.ok(g.mode, `${g.id} 缺少 mode`);
    assert.ok('cap' in g, `${g.id} 缺少 cap 字段（不封顶请显式写 null）`);
    assert.ok(g.title, `${g.id} 缺少 title`);
    assert.ok(YU[g.yu], `${g.id} 的 yu=${g.yu} 不是合法值`);
  }
});

test('封顶值与细则一致', () => {
  const capOf = (id) => CATALOG.find(g => g.id === id)?.cap;
  assert.equal(capOf('D-sizheng'), 0.6);
  assert.equal(capOf('D-shehui'), 2.5);
  assert.equal(capOf('Z-kejihuodong'), 0.6);
  assert.equal(capOf('T-duanlian'), 0.6);
  assert.equal(capOf('M-huodong'), 0.6);
  assert.equal(capOf('M-zuzhi'), 1.0);
  assert.equal(capOf('L-sushe'), 0.5);
  assert.equal(capOf('L-shijian'), 0.6);
  assert.equal(capOf('L-zhiyuan'), 0.3);
});

test('竞赛奖项分值表与细则一致', () => {
  const jingsai = CATALOG.find(g => g.id === 'Z-jingsai');
  const scoresOf = (key) => jingsai.levels.find(l => l.key === key).scores;
  assert.deepEqual(scoresOf('national'), [6, 5, 4, 3], '国家级 一/二/三/优秀');
  assert.deepEqual(scoresOf('province'), [4, 3, 2, 1], '省市级');
  assert.deepEqual(scoresOf('school'), [2, 1.5, 1, 0.5], '学校级');
  assert.deepEqual(scoresOf('college'), [2, 0.75, 0.5, 0.25], '学院级（按学院细则，非学校办法的 1 分）');
  assert.equal(jingsai.extra.bonus, 1, '特等奖在一等奖基础上加 1 分');
});

test('荣誉分值表与细则一致', () => {
  const ry = CATALOG.find(g => g.id === 'D-rongyu');
  const lv = (k) => ry.levels.find(l => l.key === k);
  assert.deepEqual([lv('national').leader, lv('national').member, lv('national').individual], [4, 2, 4]);
  assert.deepEqual([lv('province').leader, lv('province').member, lv('province').individual], [3, 1.5, 3]);
  assert.deepEqual([lv('school').leader, lv('school').member, lv('school').individual], [2, 1, 2]);
  assert.deepEqual([lv('college').leader, lv('college').member, lv('college').individual], [1, 0.5, 1]);
});

test('大创、专利、论文分值', () => {
  const ky = CATALOG.find(g => g.id === 'Z-keyan');
  const dc = (k) => ky.dachuang.find(d => d.key === k).scores;
  assert.deepEqual(dc('national'), { 优: 6, 良: 5, 合格: 4 });
  assert.deepEqual(dc('province'), { 优: 4, 良: 3, 合格: 2 });
  assert.deepEqual(dc('school'), { 优: 2, 良: 1, 合格: 0.5 });
  assert.equal(ky.dachuangExtra.score, 6, '明月班种子轮融资 6 分');
  assert.deepEqual(ky.patent.map(p => p.score), [2, 1], '发明专利 2 分 / 实用新型 1 分');
  assert.deepEqual(ky.paper.map(p => p.score), [6, 3], 'SCI 6 分 / 核心 3 分');
});

test('志愿时长档位与细则一致', () => {
  const zy = CATALOG.find(g => g.id === 'L-zhiyuan');
  assert.deepEqual(zy.tiers.map(t => [t.min, t.max, t.score]),
    [[0, 10, 0], [10, 20, 0.1], [20, 30, 0.2], [30, Infinity, 0.3]]);
  assert.equal(zy.tiers[0].maxExclusive, true, '「不足 10 小时」是开区间');
});

test('五育元信息完整', () => {
  assert.deepEqual(Object.keys(YU).sort(), ['D', 'L', 'M', 'T', 'Z']);
});

test('每个加分分组都有公式名（PDF 顶行要用），扣分组不列', () => {
  for (const g of CATALOG) {
    if (g.mode === 'penalty') {
      assert.ok(!FORMULA_NAMES[g.id], `${g.id} 是扣分组，不该出现在公式名里`);
      continue;
    }
    assert.ok(FORMULA_NAMES[g.id], `${g.id} 缺少 FORMULA_NAMES 条目`);
    assert.ok(FORMULA_NAMES[g.id].endsWith('加分'), `${g.id} 的公式名应以「加分」结尾`);
  }
  // 反向检查：没有多余的条目
  for (const id of Object.keys(FORMULA_NAMES)) {
    assert.ok(CATALOG.some(g => g.id === id), `FORMULA_NAMES 里的 ${id} 在 CATALOG 中不存在`);
  }
});

test('每个逐项组的每一条都有 id 和 name', () => {
  for (const g of CATALOG) {
    if (g.mode !== 'count' && g.mode !== 'items-grade') continue;
    for (const it of (g.items ?? [])) {
      assert.ok(it.id, `${g.id} 有项目缺 id`);
      assert.ok(it.name && it.name.trim(), `${g.id} 的项目 ${it.id} 缺 name`);
    }
  }
});
