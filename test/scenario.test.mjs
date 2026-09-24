/**
 * 端到端场景核算：用一个虚构学生的完整答案，对照手算结果。
 * 单元测试证明「每条规则单独正确」，这里证明「规则组合起来也对」。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CATALOG } from '../catalog.js';
import { computeScores } from '../scoring.js';

const CATALOG = DEFAULT_CATALOG.groups;

test('场景：一个典型学生的五育加分与手算一致', () => {
  const answers = {
    // 德育：3 场思政活动（0.3）+ 班长自填 1.5
    'D-sizheng': { 'D-sz-1': 1, 'D-sz-3': 1, 'D-sz-5': 1 },
    'D-shehui':  { 'D-sh-6': 1.5 },
    // 智育：六级通过 1 + 普通话二甲 0.3 + 校级二等奖 1.5
    'Z-jineng':  { 'Z-jn-waiyu': ['Z-jn-cet6'], 'Z-jn-pth': ['Z-jn-pth2a'] },
    'Z-jingsai': [{ levelKey: 'school', rankIndex: 1, competitionName: '某竞赛' }],
    // 体育：3 项课外锻炼
    'T-duanlian': { 'T-dl-1': 1, 'T-dl-2': 1, 'T-dl-3': 1 },
    // 美育：5 项活动
    'M-huodong': { 'M-hd-1': 1, 'M-hd-2': 1, 'M-hd-3': 1, 'M-hd-4': 1, 'M-hd-5': 1 },
    // 劳育：志愿 32 小时 0.3 + 五星寝室 2 次 0.2
    'L-zhiyuan': { hours: 32 },
    'L-sushe':   { 'L-ss-1': 2 }
  };

  assert.deepEqual(computeScores(answers), {
    D: 1.8,   // 0.3 + 1.5
    Z: 2.8,   // 1 + 0.3 + 1.5
    T: 0.3,   // 3 × 0.1
    M: 0.5,   // 5 × 0.1
    L: 0.5    // 0.3 + 0.2
  });
});

test('场景：思政活动勾满 10 项仍封顶在 0.6', () => {
  const items = CATALOG.find(g => g.id === 'D-sizheng').items;
  const answers = { 'D-sizheng': Object.fromEntries(items.map(i => [i.id, 1])) };
  assert.equal(computeScores(answers).D, 0.6);
});

test('场景：四级和六级都通过，只按六级算 1 分', () => {
  const answers = { 'Z-jineng': { 'Z-jn-waiyu': ['Z-jn-cet4', 'Z-jn-cet6'] } };
  assert.equal(computeScores(answers).Z, 1);
});

test('场景：德育扣分为负，且不冲抵其他育', () => {
  const answers = {
    'D-koufen': { 'D-kf-6': 1, 'D-kf-1': 3 },   // 记过 -8，缺课 3 次 -0.3
    'Z-jineng': { 'Z-jn-waiyu': ['Z-jn-cet6'] } // 智育仍为 1
  };
  const out = computeScores(answers);
  assert.equal(out.D, -8.3);
  assert.equal(out.Z, 1);
});

test('场景：志愿时长各档边界', () => {
  const of = (hours) => computeScores({ 'L-zhiyuan': { hours } }).L;
  assert.equal(of(0), 0);
  assert.equal(of(9.5), 0, '不足 10 小时不得分');
  assert.equal(of(10), 0.1, '10 小时进第一档');
  assert.equal(of(20), 0.1, '20 小时含在第一档');
  assert.equal(of(20.5), 0.2);
  assert.equal(of(30), 0.2, '30 小时含在第二档');
  assert.equal(of(30.5), 0.3);
  assert.equal(of(200), 0.3, '再多也是 0.3');
});

test('场景：劳育自填项也受 0.6 封顶', () => {
  const answers = {
    'L-shijian': {
      'L-sj-1': 1, 'L-sj-2': 1, 'L-sj-3': 1, 'L-sj-4': 1,
      'L-sj-5': 1, 'L-sj-6': 1, 'L-sj-7': 1, 'L-sj-8': 1
    }
  };
  assert.equal(computeScores(answers).L, 0.6, '8 × 0.1 = 0.8，应封顶到 0.6');
});

test('场景：暑假实习按 0.15 而非 0.1 计', () => {
  assert.equal(computeScores({ 'L-shijian': { 'L-sj-14': 1 } }).L, 0.15);
});

test('场景：特等奖 = 一等奖 + 1', () => {
  assert.equal(computeScores({ 'Z-jingsai': [{ levelKey: 'national', rankIndex: 0, isExtra: true }] }).Z, 7);
});
