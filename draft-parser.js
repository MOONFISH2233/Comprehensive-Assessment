/**
 * 从细则文本生成草稿。
 *
 * 定位：**省打字，不保证正确**。不同学校/学院的细则格式差别很大，
 * 结构规整的能认出七八成，格式乱的只有三四成。所以：
 *   - 每个分组带 confidence（0–1），让用户在编辑器里优先复核没把握的
 *   - 认不出来的宁可不认，不要瞎猜（猜错比漏掉更危险 —— 分值报高是违纪方向）
 *
 * 输入是纯文本（粘贴来的，或 pdf.js 从 PDF 抽的）。
 */

import { genId } from './catalog-schema.js';

/* ------------------------------------------------------------------ *
 * 文本预处理
 * ------------------------------------------------------------------ */

/** PDF 抽出来的文本常有页眉页脚、断行、全角空格，先收拾干净 */
export function cleanLines(text) {
  const raw = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[－—–]/g, '-');

  const out = [];
  for (let line of raw.split('\n')) {
    line = line.trim();
    if (!line) continue;
    if (/^第?\s*\d+\s*页/.test(line)) continue;         // 页码
    if (/^-?\s*\d+\s*-$/.test(line)) continue;
    if (line.length > 200) continue;                     // 多半是乱码长串
    out.push(line);
  }
  return out;
}

const YU_PATTERNS = [
  ['D', /(^|[、\s])(德\s*育)/],
  ['Z', /(^|[、\s])(智\s*育)/],
  ['T', /(^|[、\s])(体\s*育)/],
  ['M', /(^|[、\s])(美\s*育)/],
  ['L', /(^|[、\s])(劳\s*育)/]
];

function detectYu(line) {
  // 只认「像标题」的行：短、且以中文数字/括号开头，或整行就是「德育」
  const isHeadingish = /^[（(【]?\s*[一二三四五六七八九十\d]\s*[）)】]?\s*[、.．]?/.test(line)
                    || line.length <= 8;
  if (!isHeadingish && line.length > 20) return null;
  for (const [key, re] of YU_PATTERNS) {
    if (re.test(line)) return key;
  }
  return null;
}

/**
 * 分组标题：以 （1）/ 1. 这类编号开头。
 *
 * 这里必须保守 —— 漏认一个分组只是少省一次打字，认错一个却要用户手动删。
 * 实测原始版本把「1) 优秀：四级≥560 分」这类**备注行**也当成了分组，
 * 21 组被切成了 82 组，比从零录还累。
 */
function detectGroupHeading(line) {
  const m = line.match(/^[（(]\s*(\d+)\s*[）)]\s*(.+)$/) ||
            line.match(/^(\d+)\s*[、.．]\s*(.+)$/);
  if (!m) return null;
  const title = m[2].trim();

  if (!title || title.length > 25) return null;
  if (/[：:]/.test(title)) return null;                  // 「优秀：四级≥560分」这类备注
  if (/[≥≤><]/.test(title)) return null;
  if (/\d\s*(分|小时)/.test(title)) return null;
  if (/^[（(【]/.test(title)) return null;                 // 嵌套编号
  if (/^[a-zA-Z]/.test(title)) return null;               // 「1) SAT...」这类

  // 标题得像个名字。PDF 抽出来的表格常留下「1」「评」「5（必须是…）」这种碎片，
  // 不过滤的话会凭空多出几十个要手动删的假分组。
  const cjk = (title.match(/[一-龥]/g) || []).length;
  if (cjk < 2) return null;
  return title;
}

/* ------------------------------------------------------------------ *
 * 数值与模式
 * ------------------------------------------------------------------ */

/** 从一行里找「加分值」：加 0.1 分 / 0.1分 / 6 分 */
function findScore(line) {
  const m = line.match(/加\s*([0-9]+(?:\.[0-9]+)?)\s*分/) ||
            line.match(/([0-9]+(?:\.[0-9]+)?)\s*分\s*$/);
  return m ? Number(m[1]) : null;
}

/** 从一段里找封顶：上限 0.6 分 / 累计不超过 0.6 分 / 总上限 1 分 */
function findCap(text) {
  const m = text.match(/(?:上限|总上限|累计不超过|不超过|最高)\s*(?:为)?\s*([0-9]+(?:\.[0-9]+)?)\s*分/);
  return m ? Number(m[1]) : null;
}

/** 从一段里找一组候选分值（用于表格被压扁的情况） */
function findScores(text) {
  const out = [];
  const re = /([0-9]+(?:\.[0-9]+)?)/g;
  let m;
  while ((m = re.exec(text))) {
    const v = Number(m[1]);
    if (v >= 0 && v <= 20) out.push(v);
  }
  return out;
}

/** 猜计分模式。认不准就退回 count，并降低置信度。 */
function guessMode(text, itemCount) {
  const t = text;
  if (/[一二三四五六]等奖|特等奖|优秀奖/.test(t)) return { mode: 'grade', conf: 0.7 };
  if (/小时/.test(t) && /累计|以上|区间/.test(t)) return { mode: 'tier', conf: 0.5 };
  if (/由评审组|根据实际|酌情|经认定|领导小组认定/.test(t)) return { mode: 'range', conf: 0.6 };
  if (/同一类型|只加最高|取最高|最高分一次/.test(t)) return { mode: 'pickmax', conf: 0.5 };
  if (/每次|每参加|参加一次|依次计/.test(t)) return { mode: 'count', conf: 0.6 };
  if (itemCount > 1) return { mode: 'count', conf: 0.5 };
  return { mode: 'count', conf: 0.3 };
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

const CAP_WORDS = /加分|奖项|荣誉|项目$|活动$|比赛$|服务|创业|时长|卫生|锻炼|实践|科研|技能|比赛|竞赛|论文|专利/;

/**
 * 解析细则文本，产出一份草稿细则。
 * @returns 一份符合 catalog 形状的对象（未规范化，交给 normalizeCatalog 收尾）
 */
export function parseDraft(text, opts = {}) {
  const lines = cleanLines(text);
  const groups = [];
  let curYu = null;
  let curGroup = null;

  const flush = () => {
    if (curGroup && (curGroup.items.length || curGroup._body.length)) {
      buildGroup(curGroup);
      groups.push(curGroup);
    }
    curGroup = null;
  };

  for (const line of lines) {
    // 1) 育标题
    const yu = detectYu(line);
    if (yu && line.length <= 30 && !detectGroupHeading(line)) {
      flush();
      curYu = yu;
      // 「一、德育」这种行本身就是标题，不往下走
      if (line.length <= 12) continue;
    }
    if (!curYu) curYu = 'D';   // 没认出育标题也先收着，别丢内容

    // 2) 分组标题
    const gh = detectGroupHeading(line);
    if (gh) {
      flush();
      curGroup = { yu: curYu, title: gh.replace(/[：:]\s*$/, ''), items: [], _body: [] };
      continue;
    }

    // 3) 正文
    if (!curGroup) continue;
    curGroup._body.push(line);

    // 看起来像条目名的行（不含分值的短句）收成项目
    if (line.length <= 45 && !/^[0-9.\s]+$/.test(line)) {
      const trimmed = line.replace(/[；;，,。]\s*$/, '');
      const looksLikeItem = trimmed.length >= 3 && !/^(备注|说明|注|其中|含)/.test(trimmed);
      if (looksLikeItem) curGroup.items.push({ id: genId('i'), name: trimmed });
    }
  }
  flush();

  // 4) 组装
  const draft = {
    id: genId('cat'),
    name: opts.name || '导入的细则',
    school: opts.school || '',
    college: opts.college || '',
    term: opts.term || '',
    deadline: opts.deadline || '',
    materialRange: opts.materialRange || '',
    notes: [],
    yu: defaultYu(),
    formulaNames: {},
    groups,
    conflicts: {},
    checklist: []
  };

  for (const g of groups) draft.formulaNames[g.id] = `${g.title}加分`;
  return draft;
}

function buildGroup(g) {
  const body = g._body.join(' ');
  delete g._body;

  const cap = findCap(body);
  const conf0 = 0.5;

  // 模式
  const { mode, conf: modeConf } = guessMode(body, g.items.length);
  g.mode = mode;

  // 表格被压扁时，条目和分值会分开：分值集中在后面
  const inlineScores = g.items.map(it => findScore(it.name));
  const hasInline = inlineScores.some(s => s != null);

  if (mode === 'count') {
    const parsed = inlineScores.filter(s => s != null);
    // 常见的「每项 0.1 分」：所有条目同一个分值
    const unit = parsed.length ? mostCommon(parsed) : 0.1;
    g.unit = unit;
    g.items = g.items.map((it, i) => {
      const s = inlineScores[i];
      const clean = it.name.replace(/[，,]?\s*(加)?\s*[0-9]+(?:\.[0-9]+)?\s*分.*$/, '').trim();
      const o = { id: it.id, name: clean || it.name };
      // 条目自带的分值与默认值不同时才单独记
      if (s != null && s !== unit) o.unit = s;
      return o;
    });
    g.cap = cap;
    // 置信度：条目自带分值、认出了封顶，都会提高把握
    g.confidence = clamp(0.35 + (hasInline ? 0.3 : 0) + (cap != null ? 0.15 : 0));
    return;
  }

  if (mode === 'grade') {
    // 竞赛类：给一套最常用的默认矩阵，让用户改分值而不是从零填
    g.rankNames = ['一等奖', '二等奖', '三等奖', '优秀奖'];
    g.levels = [
      { key: 'national', name: '国家级 / 国际级', scores: [6, 5, 4, 3] },
      { key: 'province', name: '省市级', scores: [4, 3, 2, 1] },
      { key: 'school', name: '学校级', scores: [2, 1.5, 1, 0.5] },
      { key: 'college', name: '学院级', scores: [2, 0.75, 0.5, 0.25] }
    ];
    g.extra = { name: '特等奖', bonus: 1 };
    g.cap = cap;
    g.confidence = 0.3;   // 分值矩阵基本靠默认值，必须复核
    return;
  }

  if (mode === 'range') {
    const nums = findScores(body).filter(n => n > 0 && n <= 20);
    const lo = nums.length ? Math.min(...nums) : 0.5;
    const hi = nums.length > 1 ? Math.max(...nums) : Math.max(lo * 2, 1);
    g.options = [{ id: genId('o'), name: g.title, min: lo, max: hi }];
    g.cap = cap;
    g.confidence = 0.4;
    return;
  }

  if (mode === 'tier') {
    const nums = [...new Set(findScores(body))].sort((a, b) => a - b);
    g.unit = '小时';
    g.tiers = nums.length >= 2
      ? nums.map((n, i) => ({
          min: i === 0 ? 0 : nums[i - 1],
          max: n,
          score: i * 0.1,
          label: `${i === 0 ? 0 : nums[i - 1]}–${n} 小时`
        }))
      : [{ min: 0, max: 10, score: 0, label: '不足 10 小时' },
         { min: 10, max: Infinity, score: 0.1, label: '10 小时以上' }];
    if (g.tiers.length) g.tiers[0].maxExclusive = true;
    g.cap = cap;
    g.confidence = 0.3;
    return;
  }

  // 兜底
  g.unit = 0.1;
  g.cap = cap;
  g.confidence = 0.25;
}

function defaultYu() {
  return {
    D: { key: 'D', name: '德育', desc: '' },
    Z: { key: 'Z', name: '智育', desc: '' },
    T: { key: 'T', name: '体育', desc: '' },
    M: { key: 'M', name: '美育', desc: '' },
    L: { key: 'L', name: '劳育', desc: '' }
  };
}

function mostCommon(arr) {
  const c = new Map();
  for (const v of arr) c.set(v, (c.get(v) ?? 0) + 1);
  let best = arr[0], n = 0;
  for (const [v, k] of c) if (k > n) { best = v; n = k; }
  return best;
}

const clamp = (n) => Math.max(0, Math.min(1, Number(n.toFixed(2))));
