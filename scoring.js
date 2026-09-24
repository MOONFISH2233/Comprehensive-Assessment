import { CATALOG } from './catalog.js';

/**
 * 计分引擎（纯函数，无副作用，可在 Node 里单测）
 *
 * 只算「加分」部分。学业加权平均分 z1、体测 t1、各项基础分 d1/m1/l1 由学校导入，
 * 不参与计算 —— 收集表要的也只是「XX总加分」。
 *
 * answers 形状：{ [groupId]: payload }，payload 随 mode 而变：
 *   count        { [itemId]: 次数 }，另可用 answers[`${groupId}__custom`] 放自填项
 *   items-grade  { [itemId]: { levelKey, rankIndex, isExtra? } }
 *   grade        [{ levelKey, rankIndex, isExtra?, competitionName? }]
 *   honor        { [levelKey]: 'individual' | 'leader' | 'member' | [...] }
 *   pickmax      { [subgroupId]: [optionId, ...] }
 *   range        { [optionId]: 学生自填分值 }
 *   tier         { hours: number }
 *   penalty      { [optionId]: 次数或 1 }
 */

// 浮点直接累加会出 0.30000000000000004，统一按「万分之一分」的整数累加，最后再除回来
const toCenti = (n) => Math.round(n * 10000);
const fromCenti = (c) => Math.round(c) / 10000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// 上限专用：Infinity 是合法上限（「30 小时以上」那档），不能被 num() 折成 0
const upper = (v) => (v == null || v === Infinity ? Infinity : num(v));

function groupScore(group, payload) {
  // 早退路径也必须带上 capped，否则调用方读到 undefined 会算出 NaN
  if (!payload) return { raw: 0, capped: 0, lines: [], truncated: false };
  const lines = [];
  const push = (itemId, itemName, points, note) =>
    lines.push({ itemId, itemName, points, ...(note ? { note } : {}) });

  switch (group.mode) {
    case 'count': {
      for (const item of group.items ?? []) {
        const n = num(payload[item.id]);
        if (n > 0) {
          // 单项可用 unit 覆盖分组默认分值（如劳育的暑假实习 0.15 分）
          push(item.id, item.name ?? item.id, (item.unit ?? group.unit) * n);
        }
      }
      break;
    }

    case 'items-grade': {
      for (const item of group.items ?? []) {
        const award = payload[item.id];
        if (!award) continue;
        const lv = (group.levels ?? []).find(l => l.key === award.levelKey);
        if (!lv) continue;
        // 级别或等次没选全就不计分 —— 宁可少算，也不能替学生往高报
        if (award.rankIndex == null) continue;
        let pts = num(lv.scores?.[award.rankIndex]);
        let label = group.rankNames?.[award.rankIndex] ?? '';
        if (award.isExtra && group.extra) {
          pts += num(group.extra.bonus);
          label = group.extra.name;
        }
        if (pts > 0) push(item.id, `${item.name} ${lv.name}${label}`, pts);
      }
      break;
    }

    case 'grade': {
      const arr = Array.isArray(payload) ? payload : [];
      for (const [i, award] of arr.entries()) {
        const lv = (group.levels ?? []).find(l => l.key === award.levelKey);
        if (!lv) continue;
        let pts = num(lv.scores?.[award.rankIndex]);
        let label = `${lv.name}${group.rankNames?.[award.rankIndex] ?? ''}`;
        if (award.isExtra && group.extra) {
          pts += num(group.extra.bonus);
          label = `${lv.name}${group.extra.name}`;
        }
        if (pts > 0) {
          push(`${group.id}-${i}`, `${label}${award.competitionName ? `（${award.competitionName}）` : ''}`, pts);
        }
      }
      break;
    }

    case 'honor': {
      for (const lv of group.levels ?? []) {
        const roles = payload[lv.key];
        if (!roles) continue;
        const list = Array.isArray(roles) ? roles : [roles];
        const pts = Math.max(...list.map(r => num(lv[r])));
        if (pts > 0) push(`${group.id}-${lv.key}`, `${lv.name}荣誉`, pts);
      }
      break;
    }

    case 'pickmax': {
      for (const sg of group.subgroups ?? []) {
        const chosen = payload[sg.id];
        if (!chosen) continue;
        const ids = Array.isArray(chosen) ? chosen : [chosen];
        let best = null;
        for (const opt of sg.options ?? []) {
          if (!ids.includes(opt.id)) continue;
          if (best === null || num(opt.score) > num(best.score)) best = opt;
        }
        if (best) push(best.id, `${sg.name}：${best.name}`, num(best.score));
      }
      break;
    }

    case 'range': {
      for (const opt of group.options ?? []) {
        const v = num(payload[opt.id]);
        if (v <= 0) continue;
        const lo = num(opt.min);
        const hi = upper(opt.max);
        const clamped = Math.min(Math.max(v, lo), hi);
        push(opt.id, opt.name ?? opt.id, clamped,
          clamped !== v ? `已按细则区间夹到 ${clamped} 分` : undefined);
      }
      break;
    }

    case 'tier': {
      const h = num(payload.hours);
      // 上限默认含（细则写「10-20 小时（含 20 小时）」）；
      // 只有「不足 N 小时」那一档是开区间，用 maxExclusive 标记
      const tier = (group.tiers ?? []).find(t => {
        const lo = num(t.min);
        const hi = upper(t.max);
        return h >= lo && (t.maxExclusive ? h < hi : h <= hi);
      });
      if (tier && tier.score > 0) {
        push(group.id, `志愿时长 ${h} 小时（${tier.label}）`, num(tier.score));
      }
      break;
    }

    case 'penalty': {
      for (const opt of group.options ?? []) {
        const n = num(payload[opt.id]);
        if (n <= 0) continue;
        const pts = opt.flat != null ? -num(opt.flat) : -num(opt.unit) * n;
        push(opt.id, opt.name ?? opt.id, pts);
      }
      break;
    }

    default:
      return { raw: 0, capped: 0, lines: [], truncated: false };
  }

  // 自填项目（细则临时增补）。与同组项目一起受封顶约束。
  for (const c of (payload.__custom ?? [])) {
    if (num(c.points) > 0) push(`${group.id}-custom-${c.name}`, `${c.name}（自填）`, num(c.points));
  }

  const raw = lines.reduce((s, l) => s + toCenti(l.points), 0);
  let capped = raw;
  // 扣分组不封顶：cap 是「加分上限」，不是「扣分上限」
  if (group.mode !== 'penalty' && group.cap != null && raw > toCenti(group.cap)) {
    capped = toCenti(group.cap);
  }
  return {
    raw: fromCenti(raw),
    capped: fromCenti(capped),
    lines,
    truncated: capped < raw
  };
}

export function computeBreakdown(answers, catalog = CATALOG) {
  const out = {};
  for (const group of catalog) {
    const r = groupScore(group, answers?.[group.id]);
    (out[group.yu] ??= { total: 0, groups: [] }).groups.push({
      groupId: group.id,
      groupTitle: group.title,
      mode: group.mode,
      points: r.capped,
      raw: r.raw,
      truncated: !!r.truncated,
      cap: group.cap ?? null,
      lines: r.lines
    });
  }
  return out;
}

export function computeScores(answers, catalog = CATALOG) {
  const bd = computeBreakdown(answers, catalog);
  const out = { D: 0, Z: 0, T: 0, M: 0, L: 0 };
  for (const [yu, v] of Object.entries(bd)) {
    out[yu] = fromCenti(v.groups.reduce((s, g) => s + toCenti(g.points), 0));
  }
  return out;
}
