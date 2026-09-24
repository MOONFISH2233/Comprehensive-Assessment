import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScores, computeBreakdown } from '../scoring.js';
import { CATALOG } from '../catalog.js';

/* ---------- count 模式与封顶 ---------- */

test('count 模式：勾 n 项记 n×unit 分，值为 0 的项不计', () => {
  const catalog = [{
    id: 'g1', yu: 'D', title: '测试组', mode: 'count',
    unit: 0.1, cap: null,
    items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  }];
  assert.equal(computeScores({ g1: { a: 1, b: 1, c: 0 } }, catalog).D, 0.2, 'a 和 b 各 0.1，c 为 0 不计');
  assert.equal(computeScores({ g1: { a: 1 } }, catalog).D, 0.1);
});

test('count 模式：同一项填多次按次数累加', () => {
  const catalog = [{
    id: 'g1', yu: 'D', title: '测试组', mode: 'count',
    unit: 0.1, cap: null, items: [{ id: 'a' }]
  }];
  assert.equal(computeScores({ g1: { a: 3 } }, catalog).D, 0.3);
});

test('count 模式：触发封顶后不再增长', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `i${i}` }));
  const catalog = [{ id: 'g1', yu: 'D', title: '测试组', mode: 'count', unit: 0.1, cap: 0.6, items }];
  const answers = { g1: Object.fromEntries(items.map(it => [it.id, 1])) };
  assert.equal(computeScores(answers, catalog).D, 0.6, '10 项 × 0.1 = 1.0，应被封顶到 0.6');
});

test('count 模式：单项可以用 unit 覆盖分组默认分值', () => {
  const catalog = [{
    id: 'g1', yu: 'L', title: '实践', mode: 'count', unit: 0.1, cap: 0.6,
    items: [{ id: 'normal' }, { id: 'intern', unit: 0.15 }]
  }];
  assert.equal(computeScores({ g1: { intern: 1 } }, catalog).L, 0.15);
  assert.equal(computeScores({ g1: { normal: 1, intern: 1 } }, catalog).L, 0.25);
});

test('未回答的分组计 0 分', () => {
  const catalog = [{ id: 'g1', yu: 'D', title: 'T', mode: 'count', unit: 0.1, cap: null, items: [{ id: 'a' }] }];
  assert.equal(computeScores({}, catalog).D, 0);
});

test('多个分组的分数累加', () => {
  const catalog = [
    { id: 'g1', yu: 'D', title: 'A', mode: 'count', unit: 0.1, cap: null, items: [{ id: 'a' }] },
    { id: 'g2', yu: 'D', title: 'B', mode: 'count', unit: 0.5, cap: null, items: [{ id: 'b' }] }
  ];
  assert.equal(computeScores({ g1: { a: 1 }, g2: { b: 1 } }, catalog).D, 0.6);
});

test('浮点误差被消除（0.1×3 应精确等于 0.3）', () => {
  const catalog = [{
    id: 'g1', yu: 'D', title: 'T', mode: 'count', unit: 0.1, cap: null,
    items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  }];
  assert.equal(computeScores({ g1: { a: 1, b: 1, c: 1 } }, catalog).D, 0.3);
});

/* ---------- pickmax ---------- */

test('pickmax：同一 subgroup 内只取最高分', () => {
  const catalog = [{
    id: 'g', yu: 'Z', title: '技能', mode: 'pickmax', cap: null,
    subgroups: [{ id: 's1', name: '外语', options: [
      { id: 'cet6', name: '六级通过', score: 1 },
      { id: 'cet4', name: '四级通过', score: 0.5 }
    ]}]
  }];
  assert.equal(computeScores({ g: { s1: ['cet6', 'cet4'] } }, catalog).Z, 1);
});

test('pickmax：不同 subgroup 各自取最高后相加', () => {
  const catalog = [{
    id: 'g', yu: 'Z', title: '技能', mode: 'pickmax', cap: null,
    subgroups: [
      { id: 's1', name: '外语', options: [{ id: 'cet6', name: '六级', score: 1 }] },
      { id: 's2', name: '普通话', options: [{ id: 'pth', name: '二甲', score: 0.3 }] }
    ]
  }];
  assert.equal(computeScores({ g: { s1: ['cet6'], s2: ['pth'] } }, catalog).Z, 1.3);
});

/* ---------- tier ---------- */

const TIER_CATALOG = [{ id: 'g', yu: 'L', title: '志愿', mode: 'tier', cap: 0.3, tiers: [
  { min: 0,  max: 10,       score: 0,   label: '不足 10 小时', maxExclusive: true },
  { min: 10, max: 20,       score: 0.1, label: '10–20 小时' },
  { min: 20, max: 30,       score: 0.2, label: '20–30 小时' },
  { min: 30, max: Infinity, score: 0.3, label: '30 小时以上' }
]}];

test('tier：志愿时长 32 小时计 0.3', () => {
  assert.equal(computeScores({ g: { hours: 32 } }, TIER_CATALOG).L, 0.3);
});

test('tier：边界值 20 小时取下档（细则写 10-20 含 20，计 0.1）', () => {
  assert.equal(computeScores({ g: { hours: 20 } }, TIER_CATALOG).L, 0.1);
});

test('tier：边界值 30 小时取下档（细则写 20-30 含 30，计 0.2）', () => {
  assert.equal(computeScores({ g: { hours: 30 } }, TIER_CATALOG).L, 0.2);
});

test('tier：不足 10 小时不得分', () => {
  assert.equal(computeScores({ g: { hours: 6 } }, TIER_CATALOG).L, 0);
});

test('tier：刚好 10 小时进入 0.1 档', () => {
  assert.equal(computeScores({ g: { hours: 10 } }, TIER_CATALOG).L, 0.1);
});

/* ---------- honor ---------- */

const HONOR_CATALOG = [{ id: 'g', yu: 'D', title: '荣誉', mode: 'honor', cap: null, levels: [
  { key: 'national', name: '国家级', individual: 4, leader: 4, member: 2 },
  { key: 'school',   name: '学校级', individual: 2, leader: 2, member: 1 }
]}];

test('honor：个人荣誉按个人分值计', () => {
  assert.equal(computeScores({ g: { national: 'individual' } }, HONOR_CATALOG).D, 4);
});

test('honor：同级别取最高角色（负责人 4 > 成员 2）', () => {
  assert.equal(computeScores({ g: { national: ['leader', 'member'] } }, HONOR_CATALOG).D, 4);
});

test('honor：不同级别各自计分后相加', () => {
  const a = { g: { national: 'individual', school: 'individual' } };
  assert.equal(computeScores(a, HONOR_CATALOG).D, 6);
});

/* ---------- grade ---------- */

const GRADE_CATALOG = [{ id: 'g', yu: 'Z', title: '竞赛', mode: 'grade', cap: null,
  rankNames: ['一等奖', '二等奖', '三等奖', '优秀奖'],
  levels: [
    { key: 'national', name: '国家级', scores: [6, 5, 4, 3] },
    { key: 'school',   name: '学校级', scores: [2, 1.5, 1, 0.5] }
  ],
  extra: { name: '特等奖', bonus: 1 } }];

test('grade：校级一等奖计 2 分', () => {
  assert.equal(computeScores({ g: [{ levelKey: 'school', rankIndex: 0 }] }, GRADE_CATALOG).Z, 2);
});

test('grade：国家级优秀奖计 3 分', () => {
  assert.equal(computeScores({ g: [{ levelKey: 'national', rankIndex: 3 }] }, GRADE_CATALOG).Z, 3);
});

test('grade：特等奖在一等奖基础上加 1 分', () => {
  const a = { g: [{ levelKey: 'national', rankIndex: 0, isExtra: true }] };
  assert.equal(computeScores(a, GRADE_CATALOG).Z, 7);
});

test('grade：多个奖项累加', () => {
  const a = { g: [{ levelKey: 'school', rankIndex: 0 }, { levelKey: 'school', rankIndex: 2 }] };
  assert.equal(computeScores(a, GRADE_CATALOG).Z, 3);
});

/* ---------- items-grade ---------- */

const ITEMS_GRADE = [{ id: 'g', yu: 'T', title: '体育比赛', mode: 'items-grade', cap: null,
  items: [{ id: 'i1', name: '春季运动会' }, { id: 'i2', name: '卓工杯篮球赛' }],
  rankNames: ['一等奖', '二等奖', '三等奖', '优秀奖'],
  levels: [{ key: 'school', name: '学校级', scores: [2, 1.5, 1, 0.5] }],
  extra: { name: '特等奖', bonus: 1 } }];

test('items-grade：具名比赛各自按等级计分后相加', () => {
  const a = { g: { i1: { levelKey: 'school', rankIndex: 0 }, i2: { levelKey: 'school', rankIndex: 2 } } };
  assert.equal(computeScores(a, ITEMS_GRADE).T, 3);
});

test('items-grade：未回答的具名比赛不计分', () => {
  assert.equal(computeScores({ g: {} }, ITEMS_GRADE).T, 0);
});

test('items-grade：特等奖加 1 分', () => {
  const a = { g: { i1: { levelKey: 'school', rankIndex: 0, isExtra: true } } };
  assert.equal(computeScores(a, ITEMS_GRADE).T, 3);
});

test('items-grade：没选级别不计分（不替学生猜，尤其不能默认国家级）', () => {
  const a = { g: { i1: { levelKey: null, rankIndex: 0, isExtra: false } } };
  assert.equal(computeScores(a, ITEMS_GRADE).T, 0);
});

test('items-grade：没选等次不计分', () => {
  const a = { g: { i1: { levelKey: 'school', rankIndex: null, isExtra: false } } };
  assert.equal(computeScores(a, ITEMS_GRADE).T, 0);
});

test('items-grade：级别选了空字符串同样不计分', () => {
  const a = { g: { i1: { levelKey: '', rankIndex: 0, isExtra: false } } };
  assert.equal(computeScores(a, ITEMS_GRADE).T, 0);
});

/* ---------- range ---------- */

const RANGE_CATALOG = [{ id: 'g', yu: 'D', title: '干部', mode: 'range', cap: 2.5,
  options: [{ id: 'o1', name: '班长', min: 0.5, max: 2.5 }] }];

test('range：自填值被夹到 min/max 之间', () => {
  assert.equal(computeScores({ g: { o1: 9 } }, RANGE_CATALOG).D, 2.5, '填 9 应夹到上限 2.5');
  assert.equal(computeScores({ g: { o1: 0.1 } }, RANGE_CATALOG).D, 0.5, '填 0.1 应夹到下限 0.5');
});

test('range：分组封顶生效', () => {
  const c = [{ id: 'g', yu: 'D', title: '干部', mode: 'range', cap: 2.5,
    options: [{ id: 'o1', min: 1, max: 2 }, { id: 'o2', min: 1, max: 2 }] }];
  assert.equal(computeScores({ g: { o1: 2, o2: 2 } }, c).D, 2.5, '4 分应被封顶到 2.5');
});

/* ---------- penalty ---------- */

test('penalty：按次数扣分', () => {
  const c = [{ id: 'p', yu: 'D', title: '扣分', mode: 'penalty', cap: null,
    options: [{ id: 'o1', name: '缺课', unit: 0.1 }] }];
  assert.equal(computeScores({ p: { o1: 3 } }, c).D, -0.3);
});

test('penalty：记过扣 8 分', () => {
  const c = [{ id: 'p', yu: 'D', title: '扣分', mode: 'penalty', cap: null,
    options: [{ id: 'o1', name: '记过', flat: 8 }] }];
  assert.equal(computeScores({ p: { o1: 1 } }, c).D, -8);
});

test('penalty：扣分与加分相抵（德育可为负）', () => {
  const c = [
    { id: 'a', yu: 'D', title: '加分', mode: 'count', unit: 0.5, cap: null, items: [{ id: 'x' }] },
    { id: 'p', yu: 'D', title: '扣分', mode: 'penalty', cap: null, options: [{ id: 'o1', flat: 1 }] }
  ];
  assert.equal(computeScores({ a: { x: 1 }, p: { o1: 1 } }, c).D, -0.5);
});

test('penalty：扣分不受 cap 影响（cap 是加分上限，不是扣分上限）', () => {
  const c = [
    { id: 'p', yu: 'D', title: '扣分', mode: 'penalty', cap: 0.5,
      options: [{ id: 'o1', flat: 8 }] }
  ];
  assert.equal(computeScores({ p: { o1: 1 } }, c).D, -8);
});

test('扣分只作用于德育，不影响其他育', () => {
  const c = [
    { id: 'z', yu: 'Z', title: '智育', mode: 'count', unit: 1, cap: null, items: [{ id: 'x' }] },
    { id: 'p', yu: 'D', title: '扣分', mode: 'penalty', cap: null, options: [{ id: 'o1', flat: 2 }] }
  ];
  const out = computeScores({ z: { x: 1 }, p: { o1: 1 } }, c);
  assert.equal(out.Z, 1);
  assert.equal(out.D, -2);
});

/* ---------- 自填项目 ---------- */

test('count 模式：自填项目按填的分值计入，并受该组封顶约束', () => {
  const c = [{ id: 'g', yu: 'Z', title: '科技活动', mode: 'count', unit: 0.1, cap: 0.6,
    items: [{ id: 'a' }] }];
  const a = { g: { a: 1, __custom: [{ name: '某讲座', points: 0.1 }] } };
  assert.equal(computeScores(a, c).Z, 0.2);

  const b = { g: { __custom: [{ name: 'x', points: 5 }] } };
  assert.equal(computeScores(b, c).Z, 0.6, '自填 5 分也应被封顶到 0.6');
});

/* ---------- 用真实 catalog 的不变量 ---------- */

test('用真实 catalog：空答案五育全为 0', () => {
  assert.deepEqual(computeScores({}, CATALOG), { D: 0, Z: 0, T: 0, M: 0, L: 0 });
});

test('用真实 catalog：全部勾满也不会突破任何封顶', () => {
  const answers = {};
  for (const g of CATALOG) {
    if (g.mode === 'count') {
      answers[g.id] = Object.fromEntries((g.items ?? []).map(i => [i.id, 99]));
    } else if (g.mode === 'items-grade') {
      answers[g.id] = Object.fromEntries((g.items ?? []).map(i => [i.id, { levelKey: g.levels[0].key, rankIndex: 0 }]));
    } else if (g.mode === 'pickmax') {
      answers[g.id] = Object.fromEntries((g.subgroups ?? []).map(s => [s.id, s.options.map(o => o.id)]));
    } else if (g.mode === 'tier') {
      answers[g.id] = { hours: 9999 };
    } else if (g.mode === 'range') {
      answers[g.id] = Object.fromEntries((g.options ?? []).map(o => [o.id, o.max]));
    } else if (g.mode === 'honor') {
      answers[g.id] = Object.fromEntries((g.levels ?? []).map(l => [l.key, 'individual']));
    } else if (g.mode === 'grade') {
      answers[g.id] = (g.levels ?? []).flatMap(l => l.scores.map((_, i) => ({ levelKey: l.key, rankIndex: i })));
    }
  }
  const bd = computeBreakdown(answers, CATALOG);
  for (const yu of Object.values(bd)) {
    for (const g of yu.groups) {
      if (g.cap != null && g.mode !== 'penalty') {
        assert.ok(g.points <= g.cap + 1e-9, `${g.groupId} 得分 ${g.points} 超过封顶 ${g.cap}`);
      }
    }
  }
});

test('用真实 catalog：breakdown 的分数之和等于 computeScores', () => {
  const answers = {
    'T-duanlian': { 'T-dl-1': 1, 'T-dl-2': 1, 'T-dl-3': 1 },
    'Z-jineng': { 'Z-jn-waiyu': ['Z-jn-cet6'], 'Z-jn-pth': ['Z-jn-pth2a'] },
    'L-zhiyuan': { hours: 25 }
  };
  const scores = computeScores(answers, CATALOG);
  const bd = computeBreakdown(answers, CATALOG);
  for (const yu of ['D', 'Z', 'T', 'M', 'L']) {
    const sum = (bd[yu]?.groups ?? []).reduce((s, g) => s + g.points, 0);
    assert.ok(Math.abs(sum - scores[yu]) < 1e-9, `${yu} 育 breakdown 合计 ${sum} ≠ ${scores[yu]}`);
  }
});
