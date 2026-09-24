/**
 * 细则数据的校验与规范化。
 *
 * 用途：导入别人导出的 JSON、或从文本解析出的草稿时，
 * 不能因为某个字段缺失/类型不对就让整个应用崩掉。
 * normalizeCatalog() 负责补默认值并丢弃非法项，validateCatalog() 负责报告问题。
 *
 * 设计原则：**能修就修，修不了的丢掉并记下来**，
 * 绝不让一份有问题的数据导致白屏 —— 用户填了两百屏才发现崩了是不可接受的。
 */

export const MODES = [
  'count',        // 逐项问有没有，每项记 unit 分
  'items-grade',  // 逐项问具名比赛，再选获奖级别和等次
  'grade',        // 整组一屏，可添加多个奖项
  'honor',        // 按「级别 × 角色」勾选
  'pickmax',      // 同一子类里只取最高分
  'range',        // 分值由评审组认定，学生自填
  'tier',         // 按区间归档
  'penalty'       // 扣分项
];

export const MODE_LABEL = {
  'count': '逐项计数（每项固定分）',
  'items-grade': '具名比赛（逐项选奖项等级）',
  'grade': '获奖列表（可添加多个奖项）',
  'honor': '荣誉（级别 × 角色）',
  'pickmax': '取最高（同类只算最高一张证书）',
  'range': '区间自填（分值由评审组认定）',
  'tier': '分档计分（如志愿时长）',
  'penalty': '扣分项'
};

const YU_KEYS = ['D', 'Z', 'T', 'M', 'L'];
const YU_DEFAULT = {
  D: { key: 'D', name: '德育', desc: '' },
  Z: { key: 'Z', name: '智育', desc: '' },
  T: { key: 'T', name: '体育', desc: '' },
  M: { key: 'M', name: '美育', desc: '' },
  L: { key: 'L', name: '劳育', desc: '' }
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const numOr = (v, d) => (isNum(v) ? v : (isNum(Number(v)) && v !== '' && v !== null ? Number(v) : d));
/** 宽容地取一个有限数值；'0.15' 这种字符串也要认 */
const posNum = (v) => {
  if (isNum(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};
const str = (v, d = '') => (typeof v === 'string' ? v : d);

let seq = 0;
/** 生成一个不会跟已有 id 冲突的短 id */
export function genId(prefix = 'g') {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

/* ------------------------------------------------------------------ *
 * 规范化
 * ------------------------------------------------------------------ */

function normItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const name = str(it.name).trim();
    if (!name) continue;
    let id = str(it.id).trim() || genId('i');
    while (seen.has(id)) id = genId('i');
    seen.add(id);
    const o = { id, name };
    const u = posNum(it.unit);
    if (u !== undefined) o.unit = u;
    out.push(o);
  }
  return out;
}

function normLevels(levels) {
  if (!Array.isArray(levels)) return [];
  return levels
    .filter(l => l && typeof l === 'object' && str(l.name).trim())
    .map(l => {
      const o = { key: str(l.key).trim() || genId('lv'), name: str(l.name).trim() };
      if (Array.isArray(l.scores)) o.scores = l.scores.map(n => numOr(n, 0));
      for (const k of ['leader', 'member', 'individual']) {
        if (isNum(l[k])) o[k] = l[k];
      }
      return o;
    });
}

function normOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .filter(o => o && typeof o === 'object' && str(o.name).trim())
    .map(o => {
      const r = { id: str(o.id).trim() || genId('o'), name: str(o.name).trim() };
      if (isNum(o.min)) r.min = o.min;
      if (isNum(o.max)) r.max = o.max;
      if (isNum(o.unit)) r.unit = o.unit;
      if (isNum(o.flat)) r.flat = o.flat;
      if (isNum(o.score)) r.score = o.score;
      if (str(o.unitLabel)) r.unitLabel = o.unitLabel;
      if (str(o.proofNote)) r.proofNote = o.proofNote;
      return r;
    });
}

function normSubgroups(subs) {
  if (!Array.isArray(subs)) return [];
  return subs
    .filter(s => s && typeof s === 'object')
    .map(s => ({
      id: str(s.id).trim() || genId('sg'),
      name: str(s.name).trim() || '未命名分类',
      options: normOptions(s.options)
    }));
}

function normTiers(tiers) {
  if (!Array.isArray(tiers)) return [];
  return tiers
    .filter(t => t && typeof t === 'object')
    .map(t => {
      const o = {
        min: numOr(t.min, 0),
        score: numOr(t.score, 0),
        label: str(t.label)
      };
      // max 允许是 Infinity（最后一档），JSON 里会变成 null，要还原回来
      if (t.max == null || t.max === null) o.max = Infinity;
      else o.max = isNum(t.max) ? t.max : (Number.isFinite(Number(t.max)) ? Number(t.max) : Infinity);
      if (t.maxExclusive === true) o.maxExclusive = true;
      return o;
    });
}

/**
 * 把任意输入整理成一份合法可用的细则。不抛异常。
 * @returns {{catalog: object, dropped: string[]}} dropped 里是被丢弃的项，供上层提示用户
 */
export function normalizeCatalog(raw) {
  const dropped = [];
  const src = (raw && typeof raw === 'object') ? raw : {};
  if (raw && typeof raw !== 'object') dropped.push('整个文件不是对象');

  // 五育元信息
  const yu = {};
  for (const k of YU_KEYS) {
    const v = src.yu && src.yu[k];
    yu[k] = {
      key: k,
      name: str(v && v.name, YU_DEFAULT[k].name),
      desc: str(v && v.desc, '')
    };
  }

  // 分组
  const groups = [];
  const seenIds = new Set();
  const srcGroups = Array.isArray(src.groups) ? src.groups : [];
  if (!Array.isArray(src.groups) && src.groups != null) dropped.push('groups 不是数组');

  for (const g of srcGroups) {
    if (!g || typeof g !== 'object') { dropped.push('一个非对象的分组'); continue; }
    const title = str(g.title).trim();
    if (!title) { dropped.push('一个没有名称的分组'); continue; }

    let id = str(g.id).trim() || genId('grp');
    while (seenIds.has(id)) id = genId('grp');
    seenIds.add(id);

    const mode = MODES.includes(g.mode) ? g.mode : 'count';
    if (g.mode && !MODES.includes(g.mode)) dropped.push(`分组「${title}」的模式 ${g.mode} 不认识，按「逐项计数」处理`);

    const o = {
      id,
      yu: YU_KEYS.includes(g.yu) ? g.yu : 'D',
      title,
      mode,
      cap: (g.cap === null || g.cap === undefined) ? null : numOr(g.cap, null),
      note: str(g.note)
    };
    for (const k of ['stampNote', 'pickHint', 'doubleCountNote', 'examples', 'paperNote']) {
      if (str(g[k])) o[k] = g[k];
    }

    if (mode === 'count' || mode === 'items-grade') {
      o.unit = numOr(g.unit, 0.1);
      o.items = normItems(g.items);
      if (!o.items.length) dropped.push(`分组「${title}」没有任何项目，已跳过`);
      if (mode === 'items-grade') {
        o.rankNames = Array.isArray(g.rankNames) && g.rankNames.length ? g.rankNames.map(s => str(s)) : ['一等奖', '二等奖', '三等奖', '优秀奖'];
        o.levels = normLevels(g.levels);
        if (g.extra && typeof g.extra === 'object') {
          o.extra = { name: str(g.extra.name, '特等奖'), bonus: numOr(g.extra.bonus, 0) };
        }
      }
      if (o.items.length) groups.push(o);
      continue;
    }

    if (mode === 'grade') {
      o.rankNames = Array.isArray(g.rankNames) && g.rankNames.length ? g.rankNames.map(s => str(s)) : ['一等奖', '二等奖', '三等奖', '优秀奖'];
      o.levels = normLevels(g.levels);
      if (g.extra && typeof g.extra === 'object') {
        o.extra = { name: str(g.extra.name, '特等奖'), bonus: numOr(g.extra.bonus, 0) };
      }
      groups.push(o);
      continue;
    }

    if (mode === 'honor') {
      o.levels = normLevels(g.levels);
      groups.push(o);
      continue;
    }

    if (mode === 'pickmax') {
      o.subgroups = normSubgroups(g.subgroups);
      groups.push(o);
      continue;
    }

    if (mode === 'range' || mode === 'penalty') {
      o.options = normOptions(g.options);
      groups.push(o);
      continue;
    }

    if (mode === 'tier') {
      o.unit = str(g.unit, '小时');
      o.tiers = normTiers(g.tiers);
      groups.push(o);
      continue;
    }

    groups.push(o);
  }

  // 公式名
  const formulaNames = {};
  if (src.formulaNames && typeof src.formulaNames === 'object') {
    for (const [k, v] of Object.entries(src.formulaNames)) {
      if (typeof v === 'string' && v.trim()) formulaNames[k] = v.trim();
    }
  }
  // 缺公式名的分组用标题兜底，避免 PDF 顶行出现 undefined
  for (const g of groups) {
    if (!formulaNames[g.id]) formulaNames[g.id] = `${g.title}加分`;
  }

  const notes = Array.isArray(src.notes)
    ? src.notes.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim())
    : [];

  const conflicts = {};
  if (src.conflicts && typeof src.conflicts === 'object') {
    for (const [k, v] of Object.entries(src.conflicts)) {
      if (typeof v === 'string' && v.trim()) conflicts[k] = v.trim();
    }
  }

  const checklist = Array.isArray(src.checklist)
    ? src.checklist.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim())
    : [];

  return {
    catalog: {
      id: str(src.id).trim() || genId('cat'),
      name: str(src.name).trim() || '未命名细则',
      school: str(src.school).trim(),
      college: str(src.college).trim(),
      term: str(src.term).trim(),
      deadline: str(src.deadline).trim(),
      materialRange: str(src.materialRange).trim(),
      notes,
      yu,
      formulaNames,
      groups,
      conflicts,
      checklist
    },
    dropped
  };
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

/**
 * 检查一份（已规范化的）细则是否可用。
 * errors 会让工具没法正常工作；warnings 只是可疑，应该提醒用户复核。
 */
export function validateCatalog(cat) {
  const errors = [];
  const warnings = [];

  if (!cat || typeof cat !== 'object') return { errors: ['不是一份有效的细则'], warnings };
  if (!Array.isArray(cat.groups) || !cat.groups.length) errors.push('细则里没有任何分组');
  if (!cat.name) warnings.push('细则没有名称');

  const ids = new Set();
  for (const g of cat.groups ?? []) {
    if (ids.has(g.id)) errors.push(`分组 id 重复：${g.id}`);
    ids.add(g.id);

    if (!MODES.includes(g.mode)) errors.push(`分组「${g.title}」的计分模式 ${g.mode} 不认识`);

    const needItems = g.mode === 'count' || g.mode === 'items-grade';
    if (needItems && !(g.items ?? []).length) {
      warnings.push(`分组「${g.title}」没有项目，学生会被问到空白一屏`);
    }
    const needLevels = g.mode === 'grade' || g.mode === 'honor' || g.mode === 'items-grade';
    if (needLevels && !(g.levels ?? []).length) {
      errors.push(`分组「${g.title}」是分级计分，但没有配置任何级别`);
    }
    if (needLevels) {
      for (const l of g.levels ?? []) {
        if (g.mode === 'honor') {
          if (!isNum(l.leader) && !isNum(l.member) && !isNum(l.individual)) {
            warnings.push(`分组「${g.title}」的「${l.name}」没有任何分值`);
          }
        } else if (!Array.isArray(l.scores) || !l.scores.length) {
          warnings.push(`分组「${g.title}」的「${l.name}」没有分值`);
        }
      }
    }
    if (g.mode === 'pickmax' && !(g.subgroups ?? []).length) {
      warnings.push(`分组「${g.title}」没有子类，学生会被问到空白一屏`);
    }
    if ((g.mode === 'range' || g.mode === 'penalty') && !(g.options ?? []).length) {
      warnings.push(`分组「${g.title}」没有选项，学生会被问到空白一屏`);
    }
    if (g.mode === 'tier' && !(g.tiers ?? []).length) {
      errors.push(`分组「${g.title}」是分档计分，但没有配置档位`);
    }
    // 只有「多个可选项却没设总上限」才值得提醒：单选一类的认定项
    // （如「突出事迹」）细则里本来就不封顶，报了是误报。
    if (g.mode === 'range' && (g.options ?? []).length > 1 && g.cap === null) {
      warnings.push(`分组「${g.title}」有多个可选项却没设封顶值，确认细则里确实不限分`);
    }
    if (isNum(g.cap) && g.cap < 0) errors.push(`分组「${g.title}」的封顶值是负数`);
  }

  return { errors, warnings };
}

/** 统计一份细则会给学生问出多少屏 */
export function countQuestions(cat) {
  let n = 0;
  for (const g of cat?.groups ?? []) {
    if (g.mode === 'count' || g.mode === 'items-grade') n += (g.items ?? []).length;
    else n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * 空模板（编辑器新建用）
 * ------------------------------------------------------------------ */

export function makeEmptyCatalog(name = '新细则') {
  return {
    id: genId('cat'),
    name,
    school: '',
    college: '',
    term: '',
    deadline: '',
    materialRange: '',
    notes: [],
    yu: JSON.parse(JSON.stringify(YU_DEFAULT)),
    formulaNames: {},
    groups: []
  };
}

export function makeEmptyGroup(yu = 'D', mode = 'count') {
  const g = {
    id: genId('grp'),
    yu,
    title: '新分组',
    mode,
    cap: null,
    note: '',
    unit: 0.1,
    items: []
  };
  if (mode === 'items-grade' || mode === 'grade') {
    g.rankNames = ['一等奖', '二等奖', '三等奖', '优秀奖'];
    g.levels = [
      { key: 'national', name: '国家级 / 国际级', scores: [6, 5, 4, 3] },
      { key: 'province', name: '省市级', scores: [4, 3, 2, 1] },
      { key: 'school', name: '学校级', scores: [2, 1.5, 1, 0.5] },
      { key: 'college', name: '学院级', scores: [2, 0.75, 0.5, 0.25] }
    ];
    g.extra = { name: '特等奖', bonus: 1 };
  }
  if (mode === 'honor') {
    g.levels = [
      { key: 'national', name: '国家级', leader: 4, member: 2, individual: 4 },
      { key: 'province', name: '省部级', leader: 3, member: 1.5, individual: 3 },
      { key: 'school', name: '学校级', leader: 2, member: 1, individual: 2 },
      { key: 'college', name: '学院级', leader: 1, member: 0.5, individual: 1 }
    ];
  }
  if (mode === 'pickmax') g.subgroups = [{ id: genId('sg'), name: '分类一', options: [] }];
  if (mode === 'range' || mode === 'penalty') g.options = [];
  if (mode === 'tier') {
    g.unit = '小时';
    g.tiers = [
      { min: 0, max: 10, score: 0, label: '不足 10 小时', maxExclusive: true },
      { min: 10, max: 20, score: 0.1, label: '10–20 小时' },
      { min: 20, max: 30, score: 0.2, label: '20–30 小时' },
      { min: 30, max: Infinity, score: 0.3, label: '30 小时以上' }
    ];
  }
  return g;
}
