import { CATALOG, YU, FORMULA_NAMES } from './catalog.js';
import { computeScores, computeBreakdown } from './scoring.js';

const STORAGE_KEY = 'zongce-v1';

/* ------------------------------------------------------------------ *
 * 两份文件数值不一致处。工具一律取学院细则的值（标题写明「2026 下学期」，
 * 更新更具体），但要让学生知道差异存在，必要时问辅导员。
 * ------------------------------------------------------------------ */
export const CONFLICTS = {
  'Z-jingsai': '学院级一等奖：学院细则写 2 分，学校办法写 1 分。本工具按学院细则计 2 分。',
  'D-shehui':  '本组有两处两份文件不一致：① 班长/团支书，学院细则 0.5–2.5 分，学校办法 0.5–1.5；' +
               '② 校级社团学生干部，学院细则按考核合格 0.5 / 优秀 1.0，学校办法 0.5–2.5。' +
               '本工具两处都按学院细则取值。',
  'T-bisai':   '学院级一等奖：学院细则写 2 分，学校办法写 1 分。本工具按学院细则计 2 分。',
  'M-bisai':   '学院级一等奖：学院细则写 2 分，学校办法写 1 分。本工具按学院细则计 2 分。',
  'L-bisai':   '学院级一等奖：学院细则写 2 分，学校办法写 1 分。本工具按学院细则计 2 分。',
  'L-sushe':   '宿舍文明卫生上限：学院细则写 0.5 分，学校办法写 0.6 分；' +
               '学校办法另有「卓越工程师学院文明宿舍加 1 分」，学院细则未列。本工具按学院细则取 0.5 分上限。'
};

const CHECKLIST = [
  '所有材料的落款日期都在 2026.03.02 – 2026.09.05 之间',
  '没有和上学期重复加分的奖项（重复加分按违纪作弊处理，取消全年评奖评优资格）',
  '活动类照片能看清本人出镜',
  '劳育的志愿时长截图完整，能看到总时长数字',
  '五个育的 PDF 都已生成，数字都已抄进收集表'
];

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

export const state = {
  answers: {},      // groupId -> payload（见 scoring.js 顶部注释）
  proofs: {},       // itemId -> [{ name, dataUrl, w, h }]，只存内存，不落盘
  checklist: {},    // 交表前自查勾选
  view: 'overview', // overview | ask | result | pdf
  cursor: { flat: 0 }, // 问答位置，扁平问题数组的下标
  migratedV2: false, // 是否已跑过 migrateV2 数据迁移
  editing: false,    // true = 正在从「回改」页编辑某一组，改完回回改页而不是继续答题
  seenIntro: false,  // 是否看过使用说明页
  resumedAt: null    // 本次加载时恢复到的题号（只用于弹一次提示，不落盘）
};

export function save() {
  try {
    // 图片体积太大不进 localStorage；这里只存答题进度
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      answers: state.answers,
      checklist: state.checklist,
      view: state.view,
      cursor: state.cursor,
      migratedV2: state.migratedV2,
      seenIntro: state.seenIntro
    }));
  } catch (e) {
    // 无痕模式下会走到这里。render() 里的 #banner 已经在顶部提示用户了，这里只记日志。
    console.warn('进度保存失败（浏览器禁用了本地存储）', e);
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.answers) state.answers = d.answers;
    if (d.checklist) state.checklist = d.checklist;
    if (d.cursor && typeof d.cursor.flat === 'number') state.cursor = d.cursor;
    if (state.cursor.flat > 0) state.resumedAt = state.cursor.flat;  // 回来时提示「上次停在第 N 项」
    if (d.migratedV2) state.migratedV2 = true;
    if (d.seenIntro) state.seenIntro = true;
    if (d.view && d.view !== 'pdf') state.view = d.view; // pdf 视图依赖内存里的图片，刷新后回不去
    migrateV2();
  } catch {
    /* 存档损坏就从零开始，不要卡住用户 */
  }
}

/**
 * 老版本里「具名比赛」（体育比赛）的选级别界面是个够不着的死代码，
 * 学生点「有」之后级别被自动写成列表第一项 —— 也就是「国家级 + 一等奖」。
 * 那些值全部不是学生的真实选择，而且会把分往高报。这里一次性清空，让人重选。
 * 只跑一次，之后学生自己选的级别不会被覆盖。
 */
function migrateV2() {
  if (state.migratedV2) return;
  let touched = 0;
  for (const g of CATALOG) {
    if (g.mode !== 'items-grade') continue;
    const p = state.answers[g.id];
    if (!p) continue;
    for (const k of Object.keys(p)) {
      if (k === '__custom') continue;
      p[k] = { levelKey: null, rankIndex: null, isExtra: false };
      touched++;
    }
  }
  state.migratedV2 = true;
  save();
  if (touched > 0) {
    setTimeout(() => toast(`已清空 ${touched} 项体育比赛的级别，请按奖状落款章重新选择`, 6000), 300);
  }
}

export function reset() {
  state.answers = {};
  state.proofs = {};
  state.checklist = {};
  state.view = 'overview';
  state.cursor = { flat: 0 };
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* 忽略 */ }
}

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

const app = document.getElementById('app');
const banner = document.getElementById('banner');

/**
 * 浏览器可能禁用 localStorage（无痕模式、某些内置浏览器）。
 * 不检测的话，同学填了两百屏、刷新一下全没了，还以为是工具坏了。
 */
const STORAGE_OK = (() => {
  try {
    localStorage.setItem('__zc_probe', '1');
    localStorage.removeItem('__zc_probe');
    return true;
  } catch { return false; }
})();

const esc = (s) => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);

function toast(msg, ms = 2200) {
  document.querySelector('.toast')?.remove();
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms);
}

function on(sel, handler, evt = 'onclick') {
  app.querySelectorAll(sel).forEach(el => { el[evt] = handler; });
}

/* ------------------------------------------------------------------ *
 * 问题展开
 * ------------------------------------------------------------------ */

/**
 * count 与 items-grade 是「逐项问」（每个具名项目一屏）；
 * 其余模式（grade/honor/range/pickmax/tier/penalty）整组算一屏。
 */
export function flattenQuestions(catalog = CATALOG) {
  const out = [];
  for (const group of catalog) {
    if (group.mode === 'count' || group.mode === 'items-grade') {
      for (const item of group.items ?? []) out.push({ group, item });
    } else {
      out.push({ group, item: null });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 答题读写
 * ------------------------------------------------------------------ */

function isAnswered(group, item) {
  const a = state.answers[group.id];
  if (group.mode === 'count')       return !!(a && Number(a[item.id]) > 0);
  if (group.mode === 'items-grade') return !!(a && a[item.id]);
  return !!a;
}

function setAnswered(group, item, on) {
  if (group.mode === 'count') {
    const a = (state.answers[group.id] ??= {});
    if (on) a[item.id] = 1; else delete a[item.id];
    if (!Object.keys(a).length) delete state.answers[group.id];
  } else if (group.mode === 'items-grade') {
    const a = (state.answers[group.id] ??= {});
    // levelKey / rankIndex 都留空：级别和等次必须由学生自己选，不替他猜
    // （详见 levelSelect 注释）
    if (on) a[item.id] = { levelKey: null, rankIndex: null, isExtra: false };
    else delete a[item.id];
    if (!Object.keys(a).length) delete state.answers[group.id];
  } else {
    if (on) state.answers[group.id] ??= (group.mode === 'grade' ? [] : {});
    else delete state.answers[group.id];
  }
  save();
}

function advance() {
  const qs = flattenQuestions();
  const from = state.cursor.flat ?? 0;
  const to = from + 1;
  const prev = qs[from];
  const next = qs[to];
  state.cursor.flat = to;
  save();
  // 跨育时给一次反馈：一整块过完了。分段进度条 + 这个提示，
  // 比一根几乎不动的 136 步进度条更能让人觉得「在往前走」。
  if (prev && next && prev.group.yu !== next.group.yu) {
    const left = yuLeft(qs, to);
    toast(`${YU[prev.group.yu].name}部分已完成${left > 0 ? `，剩余 ${left} 组` : '，当前为最后一组'}`, 2400);
  }
  render();
}

/* ------------------------------------------------------------------ *
 * 「回改」：五育所有分组列一屏，点哪组进去改哪组
 * ------------------------------------------------------------------ */

/** 某一组已经填了几项（非逐项模式按「填没填」算 1） */
function answeredCount(group) {
  const p = state.answers[group.id];
  if (!p) return 0;
  if (group.mode === 'count') {
    return (group.items ?? []).filter(it => Number(p[it.id]) > 0).length
         + (p.__custom?.length ?? 0);
  }
  if (group.mode === 'items-grade') {
    return (group.items ?? []).filter(it => p[it.id]).length;
  }
  if (group.mode === 'grade') return Array.isArray(p) ? p.length : 0;
  if (group.mode === 'penalty' || group.mode === 'range') return Object.keys(p).length ? 1 : 0;
  return 1;
}

function leaveEdit() {
  state.editing = false;
  state.view = 'review';
  save();
  render();
}

/** 从「回改」页进入某一组。count / items-grade 进清单页，其余进表单页。 */
function goEdit(group) {
  state.editing = true;
  save();
  if (group.mode === 'count' || group.mode === 'items-grade') return openListView(group);
  return openDetailPanel(group);
}

function renderReview() {
  const scores = computeScores(state.answers);
  const totalItems = flattenQuestions().length;
  const totalAnswered = flattenQuestions().filter(q => isAnswered(q.group, q.item)).length;

  app.innerHTML = `
    <div class="card">
      <div style="font-weight:600">修改已填内容</div>
      <div class="muted" style="margin-top:6px; line-height:1.55">
        点击任一分组进入修改，完成后自动返回本页。<br>
        逐项部分共 ${totalItems} 项，已填 ${totalAnswered} 项。
      </div>
    </div>

    ${Object.values(YU).map(y => `
      <div class="card">
        <div class="row" style="margin-bottom:4px">
          <span style="font-weight:600">${y.name}</span>
          <span class="tag">${fmt(scores[y.key])} 分</span>
        </div>
        ${CATALOG.filter(g => g.yu === y.key).map(g => {
          const n = answeredCount(g);
          return `
          <div class="row item" data-edit="${esc(g.id)}" style="padding:12px 0; cursor:pointer">
            <span style="flex:1; padding-right:8px; line-height:1.45">${esc(g.title)}</span>
            <span class="muted num" style="flex:none; min-width:44px; text-align:right">
              ${n ? `${n} 项` : '未填'}
            </span>
            <span style="color:var(--brand); font-weight:600; flex:none">修改 →</span>
          </div>`;
        }).join('')}
      </div>
    `).join('')}

    <button class="primary" id="back" style="width:100%">← 回总览</button>
  `;

  app.querySelectorAll('[data-edit]').forEach(row => row.onclick = () => {
    const g = CATALOG.find(x => x.id === row.dataset.edit);
    if (g) goEdit(g);
  });
  app.querySelector('#back').onclick = () => { state.view = 'overview'; save(); render(); };
}

function goBack() {
  state.cursor.flat = Math.max(0, (state.cursor.flat ?? 0) - 1);
  save();
  render();
}

/* ------------------------------------------------------------------ *
 * 视图：使用说明（首次打开先看这个）
 * ------------------------------------------------------------------ */

function renderIntro() {
  app.innerHTML = `
    <div class="card hero">
      <img src="./logo.png" alt="">
      <div class="hero-title">综测加分自评向导</div>
      <div class="hero-sub">重庆大学国家卓越工程师学院 · 2026 下学期</div>
      <div class="hero-meta">
        <span class="pill">材料区间 2026.03.02 – 2026.09.05</span>
        <span class="pill warn">截止 2026-09-25 17:59</span>
      </div>
    </div>

    <div class="card">
      <h2 class="sec">工具用途</h2>
      <p class="p">本工具依据学院《2026 下学期学生综合测评奖励加分项目实施细则》，
         逐条列出全部加分项目供自查，并按细则计算五育加分，生成收集表所需的证明材料 PDF。</p>
      <p class="p">收集表需提交 <b>五个育的加分数字</b>（各一栏）与对应的
         <b>证明材料 PDF</b>（各一份），本工具输出即为此两项。</p>
    </div>

    <div class="card">
      <h2 class="sec">使用流程</h2>
      <ol class="steps">
        <li>
          <b>逐项自评</b>
          <span>按细则顺序逐条确认，共约 136 项。未参加的项目直接跳过；整组均无的，可点击「本组全没有」。</span>
        </li>
        <li>
          <b>上传材料</b>
          <span>对照清单选取证明材料照片，系统自动压缩。每一项加分均须提供对应证明，未提供的项目不计入。</span>
        </li>
        <li>
          <b>生成 PDF</b>
          <span>每育生成一份 PDF，格式与学院《综测填写模板》一致，下载后上传至收集表对应栏位。</span>
        </li>
      </ol>
    </div>

    <div class="card">
      <h2 class="sec">注意事项</h2>
      <ul class="tight">
        <li>材料落款日期须在 <b>2026.03.02 – 2026.09.05</b> 之间。</li>
        <li>上学期已加分的奖项<b>不得重复申报</b>。经查实重复加分的，
            按学校有关规定处理，取消本学年评奖评优资格。</li>
        <li>奖项级别以<b>落款章</b>为准：落款章为「重庆大学」或「重庆大学党委」
            的认定为学校级，其余认定为学院级。</li>
        <li>活动类照片须<b>本人出镜</b>；劳育加分须提供<b>完整的志愿时长截图</b>。</li>
      </ul>
    </div>

    <div class="card">
      <h2 class="sec">数据存储</h2>
      <p class="p">所有填写内容与材料图片仅保存在使用者本人的浏览器中，<b>不会上传至服务器</b>。</p>
      <p class="p">因数据保存在本地，更换设备、清除浏览器数据或更换浏览器后，
         已填内容将无法保留，已生成的 PDF 不受影响。建议按育分批完成，并及时保存生成的 PDF。</p>
    </div>

    <div class="card">
      <h2 class="sec">使用环境</h2>
      <ul class="tight">
        <li>建议使用手机自带浏览器（Safari / Chrome 等）打开。</li>
        <li>若从微信内打开，<b>PDF 可能无法下载</b>，请点击右上角「···」→「在浏览器打开」。</li>
        <li>iOS 设备下载 PDF 后，需点击「分享」→「存储到文件」。</li>
      </ul>
    </div>

    <div class="card">
      <h2 class="sec">说明</h2>
      <p class="p">本工具依据学院实施细则实现计分规则，<b>非学校官方工具</b>，
         最终成绩以评审组认定为准。细则与学校办法存在 6 处数值不一致，
         本工具一律按学院细则取值，并在相应位置标注。</p>
      <p class="p">如有疑问请咨询辅导员。</p>
    </div>

    <button class="primary huge" id="go" style="width:100%; margin-bottom:16px">开始使用</button>
    <p class="muted" style="text-align:center; margin:0 0 8px">
      本页仅首次显示，可在总览页重新查看。
    </p>
  `;

  app.querySelector('#go').onclick = () => {
    state.seenIntro = true;
    // 还没开始答就直接进问卷；已经答过一些的返回总览
    state.view = Object.keys(state.answers).length ? 'overview' : 'ask';
    save();
    render();
  };
}

/* ------------------------------------------------------------------ *
 * 视图：概览
 * ------------------------------------------------------------------ */

function renderOverview() {
  const scores = computeScores(state.answers);
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const answered = flattenQuestions().filter(q => isAnswered(q.group, q.item)).length;
  // 只填了「其他」自填项时 answered 是 0，但确实已经动过了，按钮和清空入口都该出现
  const touched = answered > 0 || Object.keys(state.answers).length > 0;

  app.innerHTML = `
    <div class="warnbox danger">
      <b>注意事项</b>上学期已加过分的奖项不能再加。
      同一证书跨学期重复加分，一经查实按违纪作弊处理，取消本学年全部评奖评优资格。
    </div>

    ${Object.values(YU).map(y => `
      <div class="card">
        <div class="row">
          <div>
            <div style="font-weight:600">${y.name}</div>
            <div class="muted">${y.desc}</div>
          </div>
          <div style="text-align:right">
            <div class="big num">${fmt(scores[y.key])}</div>
            <div class="muted">加分</div>
          </div>
        </div>
      </div>
    `).join('')}

    <div class="card">
      <div class="row">
        <span class="muted">五育加分合计</span>
        <span class="big num">${fmt(total)}</span>
      </div>
      <div class="muted" style="margin-top:8px; line-height:1.55">
        这只是「加分」部分，不含学业成绩（权重 65%）、体测和各项基础分，
        和最终综测总分不是一回事。收集表要填的就是这五个数字。
      </div>
    </div>

    <button class="primary huge" id="start" style="width:100%; margin-bottom:10px">
      ${touched ? `继续逐项自评（已答 ${answered} / ${flattenQuestions().length} 项）` : '开始逐项自评'}
    </button>
    ${touched ? `
      <button id="review" style="width:100%; margin-bottom:10px">修改已填内容</button>
      <div class="btnrow" style="margin-bottom:10px">
        <button id="jumpResult">直接看结果</button>
        <button class="danger" id="reset">清空数据</button>
      </div>` : ''}
    <button class="ghost" id="intro" style="width:100%">看使用说明</button>
  `;

  app.querySelector('#intro').onclick = () => { state.view = 'intro'; save(); render(); };

  app.querySelector('#start').onclick = () => {
    state.editing = false; state.view = 'ask'; save(); render();
  };
  app.querySelector('#review')?.addEventListener('click', () => {
    state.editing = false; state.view = 'review'; save(); render();
  });
  app.querySelector('#jumpResult')?.addEventListener('click', () => { state.view = 'result'; save(); render(); });
  app.querySelector('#reset')?.addEventListener('click', () => {
    if (confirm('确定清空所有已填内容？此操作不可撤销。')) { reset(); render(); }
  });
}

/* ------------------------------------------------------------------ *
 * 视图：逐项问答
 * ------------------------------------------------------------------ */

/**
 * 分段进度条：按五育分 5 段，每段自己填。
 * 不用「136 步走一根匀速条」——实测匀速条几乎不动，中途退出率和不显示一样差；
 * 而且在育的边界显示进度效果最好（学生能感到「一整个板块过完了」）。
 */
function segbarHTML(qs, idx) {
  const span = {};
  qs.forEach((q, i) => {
    const s = (span[q.group.yu] ??= { lo: i, hi: i });
    s.hi = i;
  });
  return '<div class="segbar">' + Object.keys(YU).map(k => {
    const s = span[k];
    if (!s) return '';
    const total = s.hi - s.lo + 1;
    const done = Math.min(Math.max(idx - s.lo, 0), total);
    const pct = (done / total) * 100;
    const cls = idx > s.hi ? 'done' : (idx >= s.lo ? 'cur' : '');
    return `<i class="${cls}"><b style="width:${pct}%"></b></i>`;
  }).join('') + '</div>';
}

/** 还剩几个育没走完 */
function yuLeft(qs, idx) {
  const order = Object.keys(YU);
  const cur = qs[idx]?.group.yu ?? order[order.length - 1];
  return order.length - order.indexOf(cur) - 1;
}

function renderAsk() {
  const qs = flattenQuestions();
  const idx = state.cursor.flat ?? 0;

  if (idx >= qs.length) { state.view = 'result'; save(); return render(); }
  if (idx < 0) { state.cursor.flat = 0; return renderAsk(); }

  const q = qs[idx];
  const g = q.group;
  const title = q.item ? q.item.name : g.title;
  const left = yuLeft(qs, idx);

  app.innerHTML = `
    <div class="card">
      <div class="row">
        <span class="tag">${YU[g.yu].name} · ${esc(g.title)}</span>
        <span class="muted num">${idx + 1} / ${qs.length}</span>
      </div>
      ${segbarHTML(qs, idx)}
      <div class="muted" style="margin-bottom:10px">
        ${left > 0 ? `剩余 ${left} 组` : '最后一组了'}
      </div>
      <div style="font-size:20px; font-weight:600; line-height:1.4">${esc(title)}</div>
      ${g.note ? `<div class="muted" style="margin-top:8px; line-height:1.65">${esc(g.note)}</div>` : ''}
      ${g.stampNote ? `<div class="warnbox" style="margin-top:12px">${esc(g.stampNote)}</div>` : ''}
      ${g.doubleCountNote ? `<div class="warnbox" style="margin-top:12px">${esc(g.doubleCountNote)}</div>` : ''}
      ${CONFLICTS[g.id] ? `<div class="warnbox" style="margin-top:12px">
        <b>两份文件不一致：</b>${esc(CONFLICTS[g.id])}<br>
        <span class="dim">保险起见问一句辅导员。</span></div>` : ''}
      ${(g.mode === 'count' && q.item === g.items[0])
        ? `<div class="muted" style="margin-top:10px">细则没列出的项目（比如其他讲座），
             可以点下面「本组清单」里的「补充其他」自填。</div>` : ''}
    </div>

    <div class="card flush" style="padding:4px 8px">
      <div class="btnrow" style="margin:8px 0">
        <button class="ghost" id="list">本组清单</button>
        ${(g.mode === 'count' || g.mode === 'items-grade')
          ? '<button class="ghost" id="skip">本组全没有</button>' : ''}
      </div>
      <div class="btnrow" style="margin:8px 0">
        ${idx > 0 ? '<button class="ghost" id="back">← 上一项</button>' : ''}
        <button class="ghost" id="home">返回总览</button>
      </div>
    </div>

    <!-- 作答按钮固定在屏幕底部：手小的人不用去够屏幕中段。
         两个都是中性按钮，不给「有」加高亮 —— 见 index.html 里 .choice 的注释 -->
    <div class="answerbar">
      <button class="choice" id="yes">有</button>
      <button class="choice" id="no">没有</button>
    </div>
  `;

  app.querySelector('#no').onclick = () => { setAnswered(g, q.item, false); advance(); };
  app.querySelector('#yes').onclick = () => {
    setAnswered(g, q.item, true);
    if (g.mode === 'count') return advance();
    // 具名比赛：必须当场按落款章选级别，选完才继续下一题
    if (g.mode === 'items-grade') return openItemGradePicker(g, q.item);
    openDetailPanel(g);
  };
  // 第 1 题没有「上一项」按钮，这里必须容错
  app.querySelector('#back')?.addEventListener('click', goBack);
  app.querySelector('#home').onclick = () => { state.view = 'overview'; save(); render(); };
  app.querySelector('#list').onclick = () => openListView(g);
  app.querySelector('#skip')?.addEventListener('click', () => skipGroup(g, qs, idx));
}

function skipGroup(group, qs, idx) {
  const inGroup = qs.filter(x => x.group === group).length;
  const label = group.mode === 'count' ? '项' : '场比赛';
  if (!confirm(`确认「${group.title}」这 ${inGroup} ${label}你全都没有？\n\n（确认后会跳到下一组）`)) return;
  for (const x of qs) if (x.group === group) setAnswered(group, x.item, false);
  state.cursor.flat = idx + inGroup;
  save();
  render();
}

/* ------------------------------------------------------------------ *
 * 视图：本组清单 + 自填
 * ------------------------------------------------------------------ */

/**
 * 自填项目（细则临时增补）存在组答案内部：answers[groupId].__custom。
 * 必须和 scoring.js 的读取位置一致，否则填了不算分。
 */
function customOf(groupId) {
  return state.answers[groupId]?.__custom ?? [];
}

function setCustom(groupId, list) {
  if (list.length) {
    (state.answers[groupId] ??= {}).__custom = list;
  } else if (state.answers[groupId]) {
    delete state.answers[groupId].__custom;
    if (!Object.keys(state.answers[groupId]).length) delete state.answers[groupId];
  }
  save();
}

function openListView(group) {
  const items = (group.mode === 'count' || group.mode === 'items-grade')
    ? group.items
    : [{ id: group.id, name: group.title }];

  const draw = () => {
    const custom = customOf(group.id);   // 每次重绘重新读，避免拿到被替换掉的旧数组
    app.innerHTML = `
      <div class="card">
        <div style="font-weight:600">${esc(group.title)}</div>
        <div class="muted" style="margin-top:4px; line-height:1.55">
          ${esc(group.note ?? '')}　点一下切换「有 / 没有」。
        </div>
      </div>
      <div class="card">
        ${items.map(it => `
          <div class="row item" data-id="${esc(it.id)}" style="padding:12px 0">
            <span style="flex:1; padding-right:10px; line-height:1.45">${esc(it.name)}</span>
            <span class="tag ${isAnswered(group, it) ? 'ok' : ''}">${isAnswered(group, it) ? '有' : '没有'}</span>
          </div>
        `).join('')}
      </div>
      ${group.mode === 'count' ? `
      <div class="card">
        <div style="font-weight:600; margin-bottom:6px">补充其他</div>
        <div class="muted" style="margin-bottom:10px; line-height:1.55">
          细则里没列出的项目填在这里。加进来后同样受本组上限约束。
        </div>
        ${custom.map((c, i) => `
          <div class="row item" style="padding:10px 0">
            <span style="flex:1">${esc(c.name)}　<b class="num">${fmt(c.points)} 分</b></span>
            <button class="danger" data-delc="${i}">删除</button>
          </div>
        `).join('')}
        <input id="cname" type="text" placeholder="项目名称" style="margin-bottom:8px">
        <input id="cpts" type="number" step="0.05" min="0" placeholder="分值（细则怎么写就怎么填）"
               style="margin-bottom:8px">
        <button id="addc" style="width:100%">添加</button>
      </div>` : ''}
      ${group.mode === 'items-grade'
        ? '<button class="primary" id="bulk" style="width:100%; margin-bottom:10px">逐项选级别 / 修改</button>'
        : ''}
      <button class="primary" id="done" style="width:100%">
        ${state.editing ? '完成，返回列表' : '返回自评'}
      </button>
    `;

    app.querySelector('#bulk')?.addEventListener('click', () => openItemsGradeForm(group));

    app.querySelectorAll('.row.item[data-id]').forEach(row => {
      row.onclick = () => {
        const it = items.find(i => i.id === row.dataset.id);
        // 整组单屏的模式（grade/honor/range/tier/penalty）在这里不逐项切换
        if (group.mode !== 'count' && group.mode !== 'items-grade') return;
        setAnswered(group, it, !isAnswered(group, it));
        draw();
      };
    });

    app.querySelector('#addc')?.addEventListener('click', () => {
      const name = app.querySelector('#cname').value.trim();
      const pts = Number(app.querySelector('#cpts').value);
      if (!name) return toast('请填写项目名称');
      if (!(pts > 0)) return toast('请填写大于 0 的分值');
      setCustom(group.id, [...custom, { name, points: pts }]);
      openListView(group);
    });

    app.querySelectorAll('[data-delc]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      const list = [...customOf(group.id)];
      list.splice(Number(b.dataset.delc), 1);
      setCustom(group.id, list);
      openListView(group);
    });

    app.querySelector('#done').onclick = () => {
      if (state.editing) return leaveEdit();
      state.view = 'ask'; save(); render();
    };
  };

  draw();
}

/* ------------------------------------------------------------------ *
 * 视图：各模式的详细表单
 * ------------------------------------------------------------------ */

function conflictBanner(groupId) {
  const msg = CONFLICTS[groupId];
  if (!msg) return '';
  return `<div class="warnbox"><b>两份文件不一致：</b>${esc(msg)}<br>
    <span class="muted">保险起见问一句辅导员。</span></div>`;
}

function openDetailPanel(group) {
  switch (group.mode) {
    case 'grade':       return openGradeForm(group);
    case 'items-grade': return openItemsGradeForm(group);
    case 'honor':       return openHonorForm(group);
    case 'range':       return openRangeForm(group);
    case 'pickmax':     return openPickmaxForm(group);
    case 'tier':        return openTierForm(group);
    case 'penalty':     return openPenaltyForm(group);
    default:
      state.answers[group.id] = {};
      save(); (state.editing ? leaveEdit : advance)();
  }
}

const RANKS = (group) => (group.rankNames ?? [])
  .map((n, i) => ({ value: String(i), label: n }))
  .concat(group.extra ? [{ value: 'extra', label: `${group.extra.name}（在一等奖基础上 +${group.extra.bonus} 分）` }] : []);

/**
 * 级别选择器。
 *
 * 关键：不预选任何级别。体育活动那些具名比赛如果默认选中列表第一项
 * （国家级），等于替学生往最高报——这正是会被判「弄虚作假」的方向。
 * 必须让学生自己按奖状落款章选，没选就不计分。
 */
function levelSelect(group, id, selectedKey, placeholder = '— 请按奖状落款章选择级别 —') {
  const unset = !selectedKey;
  return `<select data-lv="${esc(id)}" class="${unset ? 'needs-attention' : ''}">
    ${placeholder ? `<option value="" ${unset ? 'selected' : ''}>${esc(placeholder)}</option>` : ''}
    ${group.levels.map(l => `<option value="${esc(l.key)}" ${l.key === selectedKey ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
  </select>`;
}

// 等次同样不预选：默认「一等奖」也是替学生往高报
function rankSelect(group, id, award, placeholder = '— 请选择获奖等次 —') {
  const unset = !award || (award.rankIndex == null && !award.isExtra);
  return `<select data-rk="${esc(id)}" class="${unset ? 'needs-attention' : ''}">
    ${placeholder ? `<option value="" ${unset ? 'selected' : ''}>${esc(placeholder)}</option>` : ''}
    ${RANKS(group).map(r => {
      const sel = unset ? false
        : (r.value === 'extra' ? !!award.isExtra
                               : (!award.isExtra && Number(r.value) === award.rankIndex));
      return `<option value="${r.value}" ${sel ? 'selected' : ''}>${esc(r.label)}</option>`;
    }).join('')}
  </select>`;
}

function doneButton(label = '完成，继续下一项') {
  return `<button class="primary" id="done" style="width:100%">${label}</button>`;
}
// 默认行为：从「回改」页进来的回回改页，否则继续逐项答题
function bindDone(onDone) {
  const fn = onDone ?? (state.editing ? leaveEdit : advance);
  app.querySelector('#done').onclick = () => fn();
}

/* --- 竞赛获奖（可添加多个奖项） --- */
function openGradeForm(group) {
  const ptsOf = (a) => {
    const lv = group.levels.find(l => l.key === a.levelKey);
    return (lv?.scores?.[a.rankIndex] ?? 0) + (a.isExtra && group.extra ? group.extra.bonus : 0);
  };

  const draw = () => {
    // 必须在 draw 内重新读：增删奖项时换的是新数组，闭包外捕获的会变陈旧
    const awards = state.answers[group.id] ?? [];
    app.innerHTML = `
      ${conflictBanner(group.id)}
      <div class="card">
        <div style="font-weight:600">${esc(group.title)}</div>
        ${group.note ? `<div class="muted" style="margin-top:6px; line-height:1.55">${esc(group.note)}</div>` : ''}
        ${group.stampNote ? `<div class="warnbox" style="margin-top:10px">${esc(group.stampNote)}</div>` : ''}
        ${group.paperNote ? `<div class="muted" style="margin-top:8px">${esc(group.paperNote)}</div>` : ''}
      </div>

      ${group.mode === 'grade' && group.dachuang ? `
      <div class="card">
        <div style="font-weight:600; margin-bottom:8px">大创 / 专利 / 论文</div>
        <div class="muted" style="margin-bottom:10px; line-height:1.55">
          大学生创新创业训练计划：国家级优 6 / 良 5 / 合格 4；
          省部级优 4 / 良 3 / 合格 2；校级优 2 / 良 1 / 合格 0.5。
          ${esc(group.dachuangExtra.name)}计 ${group.dachuangExtra.score} 分。<br>
          发明专利 ${group.patent[0].score} 分、实用新型 ${group.patent[1].score} 分。<br>
          ${group.paper.map(p => `${esc(p.name)}计 ${p.score} 分`).join('；')}。
        </div>
        <div class="muted">在下面按同样方式添加即可，选级别、填名称。</div>
      </div>` : ''}

      <div class="card">
        <div style="font-weight:600; margin-bottom:8px">已添加的奖项（${awards.length}）</div>
        ${awards.length ? awards.map((a, i) => {
          const lv = group.levels.find(l => l.key === a.levelKey);
          const nm = group.extra && a.isExtra ? group.extra.name : (group.rankNames?.[a.rankIndex] ?? '');
          return `<div class="row item" style="padding:10px 0">
            <span style="flex:1; line-height:1.45">
              ${esc(lv?.name ?? '')} ${esc(nm)}
              ${a.competitionName ? `<br><span class="muted">${esc(a.competitionName)}</span>` : ''}
            </span>
            <span style="display:flex; align-items:center; gap:10px">
              <b class="num">${fmt(ptsOf(a))}</b>
              <button class="danger" data-del="${i}">删除</button>
            </span>
          </div>`;
        }).join('') : '<div class="muted">还没有添加奖项。点下面的「没有获奖」跳过，或按「添加」。</div>'}
      </div>

      <div class="card">
        <div class="muted" style="margin-bottom:8px">添加一个奖项</div>
        ${levelSelect(group, '__new_lv', null)}
        <div style="height:8px"></div>
        ${rankSelect(group, '__new_rk', null)}
        <div style="height:8px"></div>
        <input id="cname" type="text" placeholder="比赛名称（选填，会写进 PDF）" style="margin-bottom:10px">
        <button class="primary" id="add" style="width:100%">添加</button>
      </div>
      ${doneButton()}
    `;

    app.querySelector('#add').onclick = () => {
      const levelKey = app.querySelector('[data-lv="__new_lv"]').value;
      const rk = app.querySelector('[data-rk="__new_rk"]').value;
      const competitionName = app.querySelector('#cname').value.trim();
      // 必须显式选全，否则 Number('') === 0 会悄悄变成「一等奖」
      if (!levelKey) return toast('请先选择获奖级别');
      if (rk === '') return toast('请先选择获奖等次');
      const isExtra = rk === 'extra';
      const next = [...awards, {
        levelKey, isExtra, competitionName,
        rankIndex: isExtra ? 0 : Number(rk)
      }];
      state.answers[group.id] = next;
      save(); draw();
    };
    app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const next = [...awards];
      next.splice(Number(b.dataset.del), 1);
      if (next.length) state.answers[group.id] = next;
      else delete state.answers[group.id];
      save(); draw();
    });
    bindDone();
  };

  draw();
}

/* --- 具名比赛：单项选级别（问答流程里点「有」之后进这里）--- */
function openItemGradePicker(group, item) {
  const cur = state.answers[group.id] ?? {};
  const a = cur[item.id] ?? { levelKey: null, rankIndex: null, isExtra: false };

  const draw = () => {
    app.innerHTML = `
      ${conflictBanner(group.id)}
      <div class="card">
        <div class="row">
          <span class="tag">${YU[group.yu].name} · ${esc(group.title)}</span>
        </div>
        <div style="font-size:19px; font-weight:600; margin:12px 0 4px; line-height:1.45">
          ${esc(item.name)}
        </div>
        ${group.note ? `<div class="muted" style="margin-top:6px; line-height:1.55">${esc(group.note)}</div>` : ''}
        ${group.stampNote ? `<div class="warnbox" style="margin-top:10px">${esc(group.stampNote)}</div>` : ''}
        ${group.pickHint ? `<div class="muted" style="margin-top:10px; line-height:1.55">${esc(group.pickHint)}</div>` : ''}
      </div>

      <div class="card">
        <div class="muted" style="margin-bottom:8px">这个比赛拿的是什么奖？</div>
        ${levelSelect(group, item.id, a.levelKey)}
        <div style="height:8px"></div>
        ${rankSelect(group, item.id, a)}
        <div style="margin-top:12px; text-align:right">
          ${a.levelKey && a.rankIndex != null
            ? `本项计 <b class="num" style="color:var(--brand); font-size:19px">${fmt(scoreOf(group, a))}</b> 分`
            : '<span class="muted">级别和等次都选了才算分</span>'}
        </div>
      </div>

      <button class="primary huge" id="done" style="width:100%; margin-bottom:10px">完成，继续下一项</button>
      <button class="ghost" id="oops" style="width:100%">其实我没获奖，撤销这一项</button>
    `;

    app.querySelectorAll('[data-lv]').forEach(s => s.onchange = () => {
      a.levelKey = s.value || null;
      cur[item.id] = a; state.answers[group.id] = cur; save(); draw();
    });
    app.querySelectorAll('[data-rk]').forEach(s => s.onchange = () => {
      if (s.value === '') { a.isExtra = false; a.rankIndex = null; }
      else if (s.value === 'extra') { a.isExtra = true; a.rankIndex = 0; }
      else { a.isExtra = false; a.rankIndex = Number(s.value); }
      cur[item.id] = a; state.answers[group.id] = cur; save(); draw();
    });
    app.querySelector('#done').onclick = () => { advance(); };
    app.querySelector('#oops').onclick = () => {
      setAnswered(group, item, false);
      advance();
    };
  };

  draw();
}

function scoreOf(group, a) {
  const lv = group.levels.find(l => l.key === a.levelKey);
  if (!lv || a.rankIndex == null) return 0;
  return (lv.scores?.[a.rankIndex] ?? 0) + (a.isExtra && group.extra ? group.extra.bonus : 0);
}

/* --- 具名比赛：整组批量修改（从「本组清单」或结果页的告警进）--- */
function openItemsGradeForm(group, onDone = advance) {
  const draw = () => {
    // 必须在 draw 内重新读：整组清空时删掉的是 state 上的键，
    // 闭包外捕获的旧对象会让页面继续显示已经清掉的项
    const cur = state.answers[group.id] ?? {};
    app.innerHTML = `
      ${conflictBanner(group.id)}
      <div class="card">
        <div style="font-weight:600">${esc(group.title)}</div>
        ${group.note ? `<div class="muted" style="margin-top:6px; line-height:1.55">${esc(group.note)}</div>` : ''}
        ${group.stampNote ? `<div class="warnbox" style="margin-top:10px">${esc(group.stampNote)}</div>` : ''}
        ${group.pickHint ? `<div class="muted" style="margin-top:10px; line-height:1.55">${esc(group.pickHint)}</div>` : ''}
        ${group.doubleCountNote ? `<div class="warnbox" style="margin-top:10px">${esc(group.doubleCountNote)}</div>` : ''}
        <div class="muted" style="margin-top:8px">
          逐项确认。点「有」之后再按奖状落款章选级别和等次——<b>没选全的项不计分</b>。
        </div>
      </div>
      <div class="card">
        ${group.items.map(it => {
          const a = cur[it.id];
          const lv = a ? group.levels.find(l => l.key === a.levelKey) : null;
          const nm = a ? (a.isExtra && group.extra ? group.extra.name : group.rankNames[a.rankIndex]) : '';
          const ready = !!(a && lv && a.rankIndex != null);
          return `
          <div class="item" style="padding:10px 0">
            <div class="row">
              <span style="flex:1; padding-right:8px; line-height:1.45">${esc(it.name)}</span>
              <button data-toggle="${esc(it.id)}" style="min-height:40px; padding:8px 14px; font-size:14px"
                class="${a ? 'primary' : ''}">${a ? '有' : '没有'}</button>
            </div>
            ${a ? `
              <div class="${ready ? 'muted' : 'warnbox'}" style="margin:8px 0 4px; ${ready ? '' : 'font-size:13px'}">
                ${ready
                  ? `当前：${esc(lv.name)} ${esc(nm)} · <b class="num">${fmt(scoreOf(group, a))}</b> 分`
                  : '级别或等次未选全，<b>本项目暂不计分</b>。请按奖状落款章选择。'}
              </div>
              <div class="btnrow">
                ${levelSelect(group, it.id, a.levelKey)}
                ${rankSelect(group, it.id, a)}
              </div>` : ''}
          </div>`;
        }).join('')}
      </div>
      ${Object.keys(cur).length ? `
        <button class="ghost" id="clearAll" style="width:100%; margin-bottom:10px">
          本组均无获奖，全部清空
        </button>` : ''}
      ${doneButton(onDone === advance ? '完成，继续下一项' : '选好了，回结果页')}
    `;

    app.querySelector('#clearAll')?.addEventListener('click', () => {
      if (!confirm('确认本组均无获奖？已勾选的项目将全部清除。')) return;
      delete state.answers[group.id];
      save(); draw();
    });

    app.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
      const id = b.dataset.toggle;
      const next = { ...cur };
      if (next[id]) delete next[id];
      else next[id] = { levelKey: null, rankIndex: null, isExtra: false };
      if (Object.keys(next).length) state.answers[group.id] = next;
      else delete state.answers[group.id];
      save(); draw();
    });
    app.querySelectorAll('[data-lv]').forEach(s => s.onchange = () => {
      cur[s.dataset.lv].levelKey = s.value;
      state.answers[group.id] = cur; save(); draw();
    });
    app.querySelectorAll('[data-rk]').forEach(s => s.onchange = () => {
      const a = cur[s.dataset.rk];
      if (!a) return;
      if (s.value === '') { a.isExtra = false; a.rankIndex = null; }        // 退回未选
      else if (s.value === 'extra') { a.isExtra = true; a.rankIndex = 0; }
      else { a.isExtra = false; a.rankIndex = Number(s.value); }
      state.answers[group.id] = cur; save(); draw();
    });
    bindDone(onDone);
  };

  draw();
}

/* --- 荣誉 --- */
function openHonorForm(group) {
  const cur = state.answers[group.id] ?? {};
  const ROLES = [
    ['individual', '个人荣誉'],
    ['leader', '集体荣誉 · 负责人'],
    ['member', '集体荣誉 · 一般成员']
  ];

  const draw = () => {
    app.innerHTML = `
      ${conflictBanner(group.id)}
      <div class="card">
        <div style="font-weight:600">${esc(group.title)}</div>
        <div class="muted" style="margin-top:6px; line-height:1.55">
          同一个人获同一类型的多个级别荣誉，只按最高级别算一次。
        </div>
        ${group.examples ? `<div class="muted" style="margin-top:8px; line-height:1.55">${esc(group.examples)}</div>` : ''}
      </div>
      ${group.levels.map(l => `
        <div class="card">
          <div style="font-weight:600; margin-bottom:6px">${esc(l.name)}</div>
          ${ROLES.map(([k, label]) => {
            const has = (cur[l.key] ?? []).includes(k);
            return `
            <label class="chk">
              <span>${label}</span>
              <span style="display:flex; align-items:center; gap:10px">
                <span class="muted num">${l[k]} 分</span>
                <input type="checkbox" data-lv="${esc(l.key)}" data-role="${k}" ${has ? 'checked' : ''}>
              </span>
            </label>`;
          }).join('')}
        </div>
      `).join('')}
      ${doneButton()}
    `;

    app.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => {
      const lv = cb.dataset.lv, role = cb.dataset.role;
      const set = new Set(cur[lv] ?? []);
      cb.checked ? set.add(role) : set.delete(role);
      if (set.size) cur[lv] = [...set]; else delete cur[lv];
      if (Object.keys(cur).length) state.answers[group.id] = cur;
      else delete state.answers[group.id];
      save(); draw();
    });
    bindDone();
  };

  draw();
}

/* --- 认定项（range）--- */
function openRangeForm(group) {
  const cur = state.answers[group.id] ?? {};

  const draw = () => {
    app.innerHTML = `
      ${conflictBanner(group.id)}
      <div class="card">
        <div style="font-weight:600">${esc(group.title)}</div>
        ${group.note ? `<div class="muted" style="margin-top:6px; line-height:1.55">${esc(group.note)}</div>` : ''}
        <div class="warnbox" style="margin-top:10px">
          这些项目的分数由评审组根据实际工作情况认定，不是固定值。
          这里填你的<b>预期值</b>，最终以评审组为准。
        </div>
      </div>
      <div class="card">
        ${group.options.map(o => `
          <div class="item" style="padding:12px 0">
            <div style="margin-bottom:6px; line-height:1.45">${esc(o.name)}</div>
            <div class="muted" style="margin-bottom:8px">
              细则区间 ${o.min}–${o.max} 分${o.proofNote ? `　·　${esc(o.proofNote)}` : ''}
            </div>
            <input type="number" step="0.1" min="${o.min}" max="${o.max}"
                   data-opt="${esc(o.id)}" value="${cur[o.id] ?? ''}"
                   placeholder="留空表示没有">
          </div>
        `).join('')}
        ${group.cap != null ? `<div class="muted" style="margin-top:10px">本组累计不超过 ${group.cap} 分</div>` : ''}
      </div>
      ${doneButton()}
    `;

    app.querySelectorAll('input[data-opt]').forEach(inp => inp.oninput = () => {
      const v = Number(inp.value);
      if (v > 0) cur[inp.dataset.opt] = v; else delete cur[inp.dataset.opt];
      if (Object.keys(cur).length) state.answers[group.id] = cur;
      else delete state.answers[group.id];
      save();
    });
    bindDone();
  };

  draw();
}

/* --- 专业技能（pickmax）--- */
function openPickmaxForm(group) {
  const cur = state.answers[group.id] ?? {};

  const draw = () => {
    app.innerHTML = `
      <div class="card">
        <div style="font-weight:600">${esc(group.title)}</div>
        <div class="muted" style="margin-top:6px; line-height:1.55">${esc(group.note ?? '')}</div>
        <div class="warnbox" style="margin-top:10px">
          同一类里如果有多张证书（比如四级和六级都过了），<b>只按最高那张算分</b>。
        </div>
      </div>
      ${group.subgroups.map(sg => `
        <div class="card">
          <div style="font-weight:600; margin-bottom:6px">${esc(sg.name)}</div>
          ${sg.options.map(o => {
            const has = (cur[sg.id] ?? []).includes(o.id);
            return `
            <label class="chk">
              <span style="line-height:1.45">${esc(o.name)}</span>
              <span style="display:flex; align-items:center; gap:10px">
                <span class="muted num">${o.score} 分</span>
                <input type="checkbox" data-sg="${esc(sg.id)}" data-opt="${esc(o.id)}" ${has ? 'checked' : ''}>
              </span>
            </label>`;
          }).join('')}
        </div>
      `).join('')}
      ${doneButton()}
    `;

    app.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => {
      const sg = cb.dataset.sg, opt = cb.dataset.opt;
      const set = new Set(cur[sg] ?? []);
      cb.checked ? set.add(opt) : set.delete(opt);
      if (set.size) cur[sg] = [...set]; else delete cur[sg];
      if (Object.keys(cur).length) state.answers[group.id] = cur;
      else delete state.answers[group.id];
      save(); draw();
    });
    bindDone();
  };

  draw();
}

/* --- 志愿时长（tier）--- */
function openTierForm(group) {
  const cur = state.answers[group.id] ?? {};

  const draw = () => {
    app.innerHTML = `
      <div class="card">
        <div style="font-weight:600">${esc(group.title)}</div>
        <div class="warnbox" style="margin-top:10px">
          必须提供<b>完整的志愿时长截图</b>，要能看到总时长数字。只有单次活动的截图不算。
        </div>
        <input type="number" id="h" min="0" step="0.5" value="${cur.hours ?? ''}"
               placeholder="这一学期的志愿总时长（小时）">
        <div class="muted" style="margin-top:10px; line-height:1.6">
          10–20 小时（含 20）→ 0.1 分<br>
          20–30 小时（含 30）→ 0.2 分<br>
          30 小时以上 → 0.3 分<br>
          不足 10 小时 → 不得分
        </div>
      </div>
      ${doneButton()}
    `;

    app.querySelector('#h').oninput = (e) => {
      const v = Number(e.target.value);
      if (v > 0) state.answers[group.id] = { hours: v };
      else delete state.answers[group.id];
      save();
    };
    bindDone();
  };

  draw();
}

/* --- 德育扣分（penalty）--- */
function openPenaltyForm(group) {
  const cur = state.answers[group.id] ?? {};

  const draw = () => {
    app.innerHTML = `
      <div class="card">
        <div style="font-weight:600">${esc(group.title)}</div>
        <div class="muted" style="margin-top:6px; line-height:1.55">
          如实填写。本页只在你手机上计算，不会上传到任何地方。
        </div>
      </div>
      <div class="card">
        ${group.options.map(o => `
          <div class="item" style="padding:12px 0">
            <div style="margin-bottom:6px; line-height:1.45">${esc(o.name)}</div>
            <div class="muted" style="margin-bottom:8px">
              ${o.flat != null ? `一次扣 ${o.flat} 分` : `每次扣 ${o.unit} 分`}
            </div>
            <input type="number" min="0" step="1" data-opt="${esc(o.id)}" value="${cur[o.id] ?? ''}"
                   placeholder="${o.flat != null ? '填 1 表示有，留空表示没有' : '填次数'}">
          </div>
        `).join('')}
      </div>
      ${doneButton()}
    `;

    app.querySelectorAll('input[data-opt]').forEach(inp => inp.oninput = () => {
      const v = Number(inp.value);
      if (v > 0) cur[inp.dataset.opt] = v; else delete cur[inp.dataset.opt];
      if (Object.keys(cur).length) state.answers[group.id] = cur;
      else delete state.answers[group.id];
      save();
    });
    bindDone();
  };

  draw();
}

/* ------------------------------------------------------------------ *
 * 视图：结果页
 * ------------------------------------------------------------------ */

/** 把答案摊平成「要交哪些材料」的清单，PDF 和结果页共用 */
export function collectMaterialList() {
  const out = [];
  for (const group of CATALOG) {
    if (group.mode === 'penalty') continue;   // 扣分不需要交证明
    const payload = state.answers[group.id];
    if (!payload) continue;
    const bd = computeBreakdown({ [group.id]: payload }, [group]);
    const g = bd[group.yu]?.groups?.[0];
    if (!g) continue;
    for (const line of g.lines) {
      out.push({
        yu: group.yu, groupId: group.id, groupTitle: group.title,
        itemId: line.itemId, itemName: line.itemName, points: line.points
      });
    }
  }
  return out;
}

/**
 * 找出手动标了「有」但级别/等次没选全、因而没被计分的项。
 * 这类项如果不提示，学生会以为自己已经报了，其实是 0 分。
 */
export function unscoredSelections() {
  const out = [];
  for (const group of CATALOG) {
    const p = state.answers[group.id];
    if (!p) continue;
    if (group.mode === 'items-grade') {
      for (const it of (group.items ?? [])) {
        const a = p[it.id];
        if (a && (!a.levelKey || a.rankIndex == null)) {
          out.push({ groupId: group.id, groupTitle: group.title, name: it.name });
        }
      }
    } else if (group.mode === 'grade' && Array.isArray(p)) {
      p.forEach((a) => {
        if (!a?.levelKey || a.rankIndex == null) {
          out.push({ groupId: group.id, groupTitle: group.title,
                     name: a?.competitionName || '未命名的奖项' });
        }
      });
    }
  }
  return out;
}

function unscoredWarn() {
  const list = unscoredSelections();
  if (!list.length) return '';
  return `<div class="warnbox danger">
    <b>以下 ${list.length} 项级别或等次未选全，暂按 0 分计：</b>
    <div style="margin:8px 0">
      ${list.map((s) => `
        <div class="row" data-fix="${esc(s.groupId)}"
             style="padding:9px 0; border-bottom:1px solid rgba(0,0,0,.08); cursor:pointer">
          <span style="flex:1; padding-right:8px; line-height:1.45; font-size:14px">
            ${esc(s.name)}<br><span class="muted">${esc(s.groupTitle)}</span>
          </span>
          <span style="color:var(--brand); font-weight:600; flex:none">补选 →</span>
        </div>`).join('')}
    </div>
    <span class="muted">点击任一条进入补选，完成后自动返回。</span>
  </div>`;
}

/** 结果页/传材料页渲染完后调用，给「补选 →」绑上跳转 */
function bindUnscoredFix() {
  app.querySelectorAll('[data-fix]').forEach((row) => {
    row.onclick = () => {
      const group = CATALOG.find((g) => g.id === row.dataset.fix);
      if (!group) return;
      state.fixReturn = state.view;     // 记住从哪来的，补选完回去
      save();
      openItemsGradeForm(group, () => {
        state.view = state.fixReturn ?? 'result';
        save(); render();
      });
    };
  });
}

function laborDoubleCountWarn() {
  const hours = Number(state.answers['L-zhiyuan']?.hours ?? 0);
  const sj = state.answers['L-shijian'] ?? {};
  const hasSj = Object.keys(sj).some(k => k !== '__custom' && Number(sj[k]) > 0);
  if (hours > 0 && hasSj) {
    return `<div class="warnbox danger">
      <b>劳育可能重复：</b>你既填了志愿时长，又勾了社会实践活动。
      细则规定<b>已加志愿时长的社会实践不再加社会实践分</b>，
      同一件事不要两处都报。请核对这两块是不是同一次活动。
    </div>`;
  }
  return '';
}

function renderResult() {
  const scores = computeScores(state.answers);
  const bd = computeBreakdown(state.answers);
  const materials = collectMaterialList();

  app.innerHTML = `
    <div class="card">
      <div style="font-weight:600; font-size:18px; margin-bottom:4px">自评结果</div>
      <div class="muted">将下列五个数字填入收集表对应的「XX总加分」栏位</div>
    </div>

    ${Object.values(YU).map(y => {
      const groups = (bd[y.key]?.groups ?? []).filter(g => g.points !== 0 || g.truncated);
      return `
      <div class="card">
        <div class="row">
          <span style="font-weight:600">${y.name}总加分</span>
          <span class="big num" style="color:${scores[y.key] < 0 ? 'var(--bad)' : 'var(--brand)'}">
            ${fmt(scores[y.key])}
          </span>
        </div>
        ${groups.length ? groups.map(g => `
          <div class="muted" style="margin-top:8px; padding-left:10px; border-left:2px solid var(--line); line-height:1.55">
            ${esc(g.groupTitle)} <b class="num">${fmt(g.points)}</b> 分
            ${g.truncated ? `<br><span style="color:var(--warn)">原始 ${fmt(g.raw)} 分，已按上限 ${g.cap} 分封顶</span>` : ''}
          </div>
        `).join('') : '<div class="muted" style="margin-top:6px">没有加分项</div>'}
      </div>`;
    }).join('')}

    ${unscoredWarn()}
    ${laborDoubleCountWarn()}

    <div class="card">
      <div style="font-weight:600; margin-bottom:6px">待找材料清单（${materials.length} 项）</div>
      <div class="muted" style="margin-bottom:12px">可截图保存，对照查阅</div>
      ${Object.values(YU).map(y => {
        const list = materials.filter(m => m.yu === y.key);
        if (!list.length) return '';
        return `<div style="margin-bottom:12px">
          <div style="font-weight:600; margin-bottom:4px">【${y.name}】</div>
          ${list.map(m => `<div style="padding:3px 0 3px 12px; line-height:1.5">
            ☐ ${esc(m.itemName)}　<span class="muted num">${fmt(m.points)} 分</span>
          </div>`).join('')}
        </div>`;
      }).join('') || '<div class="muted">还没有任何加分项，回去把自评答完。</div>'}
    </div>

    <button class="primary huge" id="topdf" style="width:100%; margin-bottom:10px">
      下一步：传材料、生成 PDF
    </button>
    <button id="toReview" style="width:100%; margin-bottom:10px">修改已填内容</button>
    <button class="ghost" id="backask" style="width:100%">← 回去继续答题</button>
  `;

  app.querySelector('#backask').onclick = () => {
    state.editing = false; state.view = 'ask'; save(); render();
  };
  app.querySelector('#toReview').onclick = () => {
    state.editing = false; state.view = 'review'; save(); render();
  };
  app.querySelector('#topdf').onclick = () => { state.view = 'pdf'; save(); render(); };
  bindUnscoredFix();
}

/* ------------------------------------------------------------------ *
 * 图片压缩
 * ------------------------------------------------------------------ */

const MAX_EDGE = 1400;   // 手机原图 4000px 宽、4MB 一张；20 张就是 80MB，PDF 传不动
const JPEG_Q = 0.75;

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';           // 透明 PNG 转 JPEG 会变黑，先铺白底
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: cv.toDataURL('image/jpeg', JPEG_Q), w, h });
      } catch (e) {
        reject(new Error(`图片处理失败：${file.name}`));
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`图片读取失败：${file.name}`)); };
    img.src = url;
  });
}

/* ------------------------------------------------------------------ *
 * 视图：传材料 + 生成 PDF
 * ------------------------------------------------------------------ */

function renderPdfPicker() {
  const materials = collectMaterialList();

  if (!materials.length) {
    app.innerHTML = `
      <div class="card">
        <div style="font-weight:600">还没有任何加分项</div>
        <div class="muted" style="margin-top:6px">先回去把自评答完，或者确认你没有加分材料。</div>
      </div>
      <button class="ghost" id="back" style="width:100%">← 返回结果页</button>`;
    app.querySelector('#back').onclick = () => { state.view = 'result'; render(); };
    return;
  }

  const checked = state.checklist ?? {};
  const allChecked = CHECKLIST.every((_, i) => checked[i]);

  app.innerHTML = `
    <div class="card">
      <div style="font-weight:600">传材料</div>
      <div class="muted" style="margin-top:8px; line-height:1.6">
        每一项点「选图」从相册挑照片，可以一次选多张，自动压缩。
        照片只在你手机上处理，<b>不会上传到任何服务器</b>。<br><br>
        生成后：安卓直接下载到「下载」目录；
        苹果需要点右上角「分享」→「存储到文件」。
      </div>
      <div class="warnbox" style="margin-top:10px">
        刷新页面会丢失已选的图片（答题进度不会丢）。建议一个育一次做完。
      </div>
    </div>

    ${unscoredWarn()}

    ${Object.values(YU).map(y => {
      const list = materials.filter(m => m.yu === y.key);
      if (!list.length) return '';
      const got = list.filter(m => (state.proofs[m.itemId] ?? []).length).length;
      return `
      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <span style="font-weight:600">${y.name}</span>
          <span class="tag ${got === list.length ? 'ok' : ''}">${got}/${list.length} 已选图</span>
        </div>
        ${list.map(m => {
          const ps = state.proofs[m.itemId] ?? [];
          return `
          <div class="item" style="padding:10px 0">
            <div class="row">
              <span style="flex:1; padding-right:8px; font-size:14px; line-height:1.45">${esc(m.itemName)}</span>
              <span class="muted num" style="flex:none">${fmt(m.points)}</span>
            </div>
            <div class="row" style="justify-content:flex-start; gap:10px; margin-top:8px">
              <input type="file" accept="image/*" multiple data-item="${esc(m.itemId)}" style="display:none">
              <button data-pick="${esc(m.itemId)}" style="min-height:40px; padding:8px 16px; font-size:14px">
                ${ps.length ? '再加图' : '选图'}
              </button>
              <span class="muted num">${ps.length} 张</span>
            </div>
            ${ps.length ? `<div class="thumbs">
              ${ps.map((p, i) => `<img class="thumb" src="${p.dataUrl}"
                 data-del="${esc(m.itemId)}:${i}" alt="">`).join('')}
            </div>` : ''}
          </div>`;
        }).join('')}
        <button class="primary" data-gen="${y.key}" style="width:100%; margin-top:12px">
          生成 ${y.name} PDF
        </button>
      </div>`;
    }).join('')}

    <div class="card">
      <div style="font-weight:600; margin-bottom:10px">交表前逐条自查</div>
      ${CHECKLIST.map((t, i) => `
        <label class="chk" style="align-items:flex-start">
          <span style="flex:1; padding-right:10px; font-size:14px; line-height:1.5">${esc(t)}</span>
          <input type="checkbox" data-ck="${i}" ${checked[i] ? 'checked' : ''}>
        </label>
      `).join('')}
      ${allChecked
        ? `<div class="warnbox ok" style="margin-top:12px">
             都确认过了。现在去收集表：把 5 个数字填进「XX总加分」，
             把 5 个 PDF 上传到「XX（PDF）」。
           </div>`
        : `<div class="muted" style="margin-top:10px">全部勾上才算检查完。</div>`}
    </div>

    <button class="ghost" id="back" style="width:100%">← 返回结果页</button>
  `;

  app.querySelectorAll('[data-pick]').forEach(btn => btn.onclick = () => {
    app.querySelector(`input[data-item="${CSS.escape(btn.dataset.pick)}"]`)?.click();
  });

  app.querySelectorAll('input[type=file]').forEach(inp => inp.onchange = async () => {
    const id = inp.dataset.item;
    const files = [...inp.files];
    inp.value = '';
    if (!files.length) return;

    const btn = app.querySelector(`[data-pick="${CSS.escape(id)}"]`);
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> 处理中';
    }
    for (const f of files) {
      try {
        const c = await compressImage(f);
        (state.proofs[id] ??= []).push({ name: f.name, ...c });
      } catch (e) {
        alert(e.message);
      }
    }
    renderPdfPicker();
  });

  app.querySelectorAll('img[data-del]').forEach(img => img.onclick = () => {
    const [id, i] = img.dataset.del.split(':');
    const arr = state.proofs[id];
    if (!arr) return;
    arr.splice(Number(i), 1);
    if (!arr.length) delete state.proofs[id];
    renderPdfPicker();
  });

  app.querySelectorAll('[data-gen]').forEach(b => b.onclick = () => generateYuPdf(b.dataset.gen));

  app.querySelectorAll('[data-ck]').forEach(cb => cb.onchange = () => {
    state.checklist ??= {};
    state.checklist[cb.dataset.ck] = cb.checked;
    save(); renderPdfPicker();
  });

  app.querySelector('#back').onclick = () => { state.view = 'result'; save(); render(); };
  bindUnscoredFix();
}

/* ------------------------------------------------------------------ *
 * PDF 生成
 * ------------------------------------------------------------------ */

/**
 * 把一行（或折行后的多行）中文文字渲染成图片。
 *
 * 为什么不用 doc.text()：jsPDF 内置的 Helvetica 字体不含中文字形，
 * doc.text('德育加分') 输出的是乱码。嵌入中文字体要 5–10MB，
 * 而浏览器的 canvas 天生支持中文，贴成图片最省事也最可靠。
 */
function makeTextImage(text, { pt = 11, bold = false, align = 'left', maxWmm = 180 } = {}) {
  const PX_PER_MM = 8;                                   // ≈203 DPI，手机上放大看也清楚
  const FONT_STACK = '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",' +
                     '"Microsoft YaHei","Noto Sans CJK SC",sans-serif';
  const pxFont = Math.max(8, Math.round(pt / 72 * 25.4 * PX_PER_MM));
  const lineH = Math.round(pxFont * 1.45);
  const W = Math.max(1, Math.round(maxWmm * PX_PER_MM));
  const font = `${bold ? 'bold ' : ''}${pxFont}px ${FONT_STACK}`;

  const cv = document.createElement('canvas');
  let ctx = cv.getContext('2d');
  ctx.font = font;

  // 折行。有空格时优先在空格处断（公式那行是 "A（0.3） + B（0） + ..."，
  // 从中间劈开类目名很难看）；没有空格的中文长句再退化成逐字断。
  const lines = [];
  const pushChars = (s) => {
    let cur = '';
    for (const ch of s) {
      if (cur && ctx.measureText(cur + ch).width > W) { lines.push(cur); cur = ch; }
      else cur += ch;
    }
    return cur;
  };
  if (String(text).includes(' ')) {
    let cur = '';
    for (const token of String(text).split(' ')) {
      const cand = cur ? `${cur} ${token}` : token;
      if (cur && ctx.measureText(cand).width > W) {
        lines.push(cur);
        cur = ctx.measureText(token).width > W ? pushChars(token) : token;
      } else {
        cur = cand;
      }
    }
    if (cur) lines.push(cur);
  } else {
    const rest = pushChars(String(text));
    if (rest) lines.push(rest);
  }
  if (!lines.length) lines.push('');

  cv.width = W;
  cv.height = lineH * lines.length;
  ctx = cv.getContext('2d');
  ctx.font = font;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  const x = align === 'center' ? W / 2 : align === 'right' ? W : 0;
  lines.forEach((ln, i) => ctx.fillText(ln, x, lineH * (i + 0.5)));

  return { dataUrl: cv.toDataURL('image/png'), wMm: W / PX_PER_MM, hMm: cv.height / PX_PER_MM };
}

function generateYuPdf(yuKey) {
  const ctor = window.jspdf?.jsPDF;
  if (!ctor) {
    alert('PDF 库没加载出来。检查网络后刷新页面重试。');
    return;
  }

  const materials = collectMaterialList().filter(m => m.yu === yuKey);
  const withProofs = materials.filter(m => (state.proofs[m.itemId] ?? []).length);
  if (!withProofs.length) {
    alert('本育尚未选择任何图片，请先点击「选图」。');
    return;
  }

  const missing = materials.length - withProofs.length;
  if (missing > 0 && !confirm(`这一育还有 ${missing} 项没选图，这些不会出现在 PDF 里。\n继续生成吗？`)) return;

  const doc = new ctor({ unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 15, CW = PW - M * 2;
  const yuName = YU[yuKey].name;
  const scores = computeScores(state.answers);
  let y = M;

  const newPage = () => { doc.addPage(); y = M; };
  const needRoom = (h) => { if (y + h > PH - M) newPage(); };

  // 所有文字都走 canvas 转图片，否则中文会变乱码。
  // 必须传 'FAST'：jsPDF 不传这个参数时会把 PNG 解码成裸 RGB 塞进 PDF，
  // 一张 180×6mm 的说明图能从 1KB 膨胀到 200KB（实测 20 条说明差 250KB）。
  const putPng = (im, x, yy) =>
    doc.addImage(im.dataUrl, 'PNG', x, yy, im.wMm, im.hMm, undefined, 'FAST');

  const putText = (text, opts = {}) => {
    const im = makeTextImage(text, { maxWmm: CW, ...opts });
    needRoom(im.hMm + 1.5);
    putPng(im, M, y);
    y += im.hMm + 1.5;
  };

  // 顶行公式：每个类目后面直接跟它自己的分，末尾给总分。
  // 模板里的「（每项需写出来）」是写给学生的说明，不是要抄进 PDF 的文字。
  const bd = computeBreakdown(state.answers);
  const gScore = (gid) =>
    (bd[yuKey]?.groups ?? []).find(x => x.groupId === gid)?.points ?? 0;

  // 没分的类目里写「0」而不是「0.00」，读起来清爽些
  const nf = (n) => (Math.abs(n) < 1e-9 ? '0' : fmt(n));

  const formula = `${yuName}加分 = `
    + CATALOG.filter(g => g.yu === yuKey && g.mode !== 'penalty')
             .map(g => `${FORMULA_NAMES[g.id]}（${nf(gScore(g.id))}）`)
             .join(' + ')
    + ` = ${fmt(scores[yuKey])}`;
  putText(formula, { pt: 11, bold: true });
  y += 5;

  const groupOrder = [...new Set(withProofs.map(m => m.groupId))];

  for (const [si, gid] of groupOrder.entries()) {
    const list = withProofs.filter(m => m.groupId === gid);
    const gInfo = (bd[yuKey]?.groups ?? []).find(g => g.groupId === gid);

    needRoom(20);
    // 有内容的分组才编号列出，编号跟着实际出现的顺序走
    putText(`${si + 1}. ${FORMULA_NAMES[gid] ?? list[0].groupTitle}：`, { pt: 12, bold: true });
    if (gInfo?.truncated) {
      putText(`（本组原始 ${fmt(gInfo.raw)} 分，已按细则上限 ${gInfo.cap} 分封顶）`,
              { pt: 9, align: 'right' });
    }
    y += 2;

    for (const m of list) {
      for (const im of state.proofs[m.itemId]) {
        // 说明在图下面（模板的样子），所以先量好说明占多高，再决定图放多大、要不要翻页
        const cap = makeTextImage(`${m.itemName}，加 ${fmt(m.points)} 分`,
                                  { pt: 11, align: 'center', maxWmm: CW });
        const desiredH = CW * (im.h / im.w);        // 按整幅宽度摆需要多高
        let avail = PH - M - y - cap.hMm - 3;       // 当前页剩余可放高度

        // 剩余空间不够时缩小挤进去可以少留白，但缩太狠会变成看不清的邮票。
        // 只有当缩放后宽度仍有内容区 60% 时才挤，否则换页完整展示。
        if (desiredH > avail) {
          const shrunkenW = avail * (im.w / im.h);
          if (avail < 20 || shrunkenW < CW * 0.6) {
            newPage();
            avail = PH - M - y - cap.hMm - 3;
          }
        }
        let drawH = Math.min(desiredH, avail);
        let drawW = drawH * (im.w / im.h);

        doc.addImage(im.dataUrl, 'JPEG', M + (CW - drawW) / 2, y, drawW, drawH,
                     undefined, 'FAST');
        y += drawH + 2;
        putPng(cap, M, y);
        y += cap.hMm + 6;
      }
    }
    y += 3;
  }

  // 页脚：模板没要求，但审阅的人需要一眼看到这育总共多少分
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const foot = makeTextImage(
      `${yuName}加分材料 · 合计 ${fmt(scores[yuKey])} 分 · 第 ${p} / ${pages} 页`,
      { pt: 9, align: 'center', maxWmm: CW });
    putPng(foot, M, PH - 10);
  }

  doc.save(`${yuName}加分-${fmt(scores[yuKey])}.pdf`);
  toast(`${yuName} PDF 已生成`, 3000);
}

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */

/** 出错时的兜底页。给别人用必须有的：不能让人看到一片空白还不知道怎么办。 */
function renderCrash(err) {
  document.body.classList.remove('has-answerbar');
  app.innerHTML = `
    <div class="card">
      <h2 class="sec">页面出了点问题</h2>
      <p class="p">页面渲染时出现异常，工具未能正常显示。</p>
      <div class="warnbox">
        <b>请勿清空数据</b>，已填内容仍保存在本机。请截图本页，
        连同下方错误信息一并反馈给维护者。
      </div>
      <p class="p muted" style="word-break:break-all; font-size:12px">
        ${esc(String((err && err.message) || err))}
      </p>
    </div>
    <button class="primary" id="retry" style="width:100%; margin-bottom:10px">重新加载</button>
    <button class="danger" id="wipe" style="width:100%">清空数据并重试</button>
  `;
  app.querySelector('#retry').onclick = () => {
    state.view = 'overview';
    render();
  };
  app.querySelector('#wipe').onclick = () => {
    if (confirm('确定清空所有已填内容？此操作不可撤销。')) { reset(); render(); }
  };
}

export function render() {
  window.scrollTo(0, 0);
  // 问答页底部有固定作答栏，正文要留出等高的空，否则最后一行被挡住
  document.body.classList.toggle('has-answerbar', state.view === 'ask');

  if (banner) {
    banner.innerHTML = STORAGE_OK ? '' :
      '<b>你的浏览器禁用了本地存储</b>（可能是无痕/隐私模式）。' +
      '这个工具靠它记进度——现在填的东西<b>一刷新就没了</b>。' +
      '换回普通模式，或用手机自带的浏览器打开。';
  }

  try {
    switch (state.view) {
      case 'intro':  return renderIntro();
      case 'ask':    return renderAsk();
      case 'review': return renderReview();
      case 'result': return renderResult();
      case 'pdf':    return renderPdfPicker();
      default:       return renderOverview();
    }
  } catch (err) {
    console.error('渲染失败：', err);
    renderCrash(err);
  }
}

load();
// 没看过使用说明的新用户（同学）先看说明；自己人已经看过的直接进总览
if (!state.seenIntro && state.view === 'overview') state.view = 'intro';
render();
if (state.resumedAt != null && state.view === 'ask') {
  const n = state.resumedAt;
  state.resumedAt = null;
  setTimeout(() => toast(`已恢复至第 ${n + 1} 项`, 3000), 400);
}
