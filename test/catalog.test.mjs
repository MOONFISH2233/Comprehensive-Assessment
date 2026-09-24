import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CATALOG } from '../catalog.js';
import { validateCatalog, countQuestions } from '../catalog-schema.js';

const CATALOG = DEFAULT_CATALOG.groups;
const YU = DEFAULT_CATALOG.yu;
const FORMULA_NAMES = DEFAULT_CATALOG.formulaNames;

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
  'Z-zhuanli': 5,        // 细则 p4 专利 2 项 + 论文 2 项 + 明月班种子轮 1 项
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

test('大创分值表：级别 × 结题成绩', () => {
  const dc = CATALOG.find(g => g.id === 'Z-dachuang');
  assert.equal(dc.mode, 'grade');
  assert.deepEqual(dc.rankNames, ['优秀', '良好', '合格']);
  const s = (k) => dc.levels.find(l => l.key === k).scores;
  assert.deepEqual(s('national'), [6, 5, 4], '国家级 优/良/合格');
  assert.deepEqual(s('province'), [4, 3, 2], '省部级');
  assert.deepEqual(s('school'), [2, 1, 0.5], '校级');
});

test('专利 / 论文 / 种子轮分值', () => {
  const zl = CATALOG.find(g => g.id === 'Z-zhuanli');
  const u = (id) => zl.items.find(i => i.id === id).unit;
  assert.equal(u('Z-zl-inv'), 2, '发明专利 2 分');
  assert.equal(u('Z-zl-util'), 1, '实用新型 1 分');
  assert.equal(u('Z-lw-sci'), 6, 'SCI/EI/SSCI 6 分');
  assert.equal(u('Z-lw-core'), 3, '核心期刊 3 分');
  assert.equal(u('Z-cy-seed'), 6, '明月班种子轮融资 6 分');
});

test('每个分组都有 levels / items / options 之类能被表单消费的结构', () => {
  // 这条是为一个真实 bug 加的：曾经有个分组用了自定义字段而不是标准结构，
  // 分级表单读 group.levels[0] 会直接抛异常。
  for (const g of CATALOG) {
    if (g.mode === 'count') {
      assert.ok(Array.isArray(g.items), `${g.id} 缺少 items`);
    } else if (g.mode === 'items-grade') {
      assert.ok(Array.isArray(g.items), `${g.id} 缺少 items`);
      assert.ok(Array.isArray(g.levels) && g.levels.length, `${g.id} 缺少 levels`);
      assert.ok(Array.isArray(g.rankNames) && g.rankNames.length, `${g.id} 缺少 rankNames`);
    } else if (g.mode === 'grade') {
      assert.ok(Array.isArray(g.levels) && g.levels.length, `${g.id} 缺少 levels`);
      assert.ok(Array.isArray(g.rankNames) && g.rankNames.length, `${g.id} 缺少 rankNames`);
      for (const l of g.levels) {
        assert.ok(Array.isArray(l.scores), `${g.id} 的级别「${l.name}」缺少 scores 数组`);
      }
    } else if (g.mode === 'honor') {
      assert.ok(Array.isArray(g.levels) && g.levels.length, `${g.id} 缺少 levels`);
    } else if (g.mode === 'pickmax') {
      assert.ok(Array.isArray(g.subgroups) && g.subgroups.length, `${g.id} 缺少 subgroups`);
    } else if (g.mode === 'range' || g.mode === 'penalty') {
      assert.ok(Array.isArray(g.options) && g.options.length, `${g.id} 缺少 options`);
    } else if (g.mode === 'tier') {
      assert.ok(Array.isArray(g.tiers) && g.tiers.length, `${g.id} 缺少 tiers`);
    }
  }
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
