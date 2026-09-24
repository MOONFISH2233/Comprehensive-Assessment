/**
 * 细则编辑器
 *
 * 这个模块回答一个产品问题：工具本身不该认识任何学校的规则 ——
 * 它读的是「细则」这份数据。所以只要能编辑这份数据，就能给任何学院/学校用。
 *
 * 三个页面：
 *   catalogs  细则管理（选用 / 编辑 / 复制 / 导入导出 / 删除）
 *   editor    一份细则的基本信息 + 分组列表
 *   group     单个分组（名称、模式、封顶、以及该模式专属的数据）
 *   import    从粘贴文本或 PDF 生成草稿
 *
 * 编辑的是内存里的草稿副本，点「保存」才写盘 —— 这样误操作可以直接放弃。
 */

import {
  app, state, render, esc, toast, refreshCatalog
} from './app.js';
import {
  listCatalogs, getCatalog, getActiveId, setActiveId,
  saveCatalog, deleteCatalog, duplicateCatalog, exportJSON, importJSON
} from './catalog-store.js';
import {
  MODES, MODE_LABEL, normalizeCatalog, validateCatalog, countQuestions,
  makeEmptyCatalog, makeEmptyGroup, genId
} from './catalog-schema.js';
import { parseDraft } from './draft-parser.js';
import { extractPdfText } from './pdf-text.js';

/* ------------------------------------------------------------------ *
 * 编辑器自己的状态（不进 localStorage，刷新就丢，符合「草稿」语义）
 * ------------------------------------------------------------------ */
const ed = {
  draft: null,
  dirty: false,
  sourceId: null,     // 草稿是从哪份细则来的（保存时用来判断是新增还是覆盖）
  groupId: null,
  importText: '',
  importPreview: null,
};

function openCatalogs() { state.view = 'catalogs'; render(); }
function openEditor(catalogId) {
  const c = getCatalog(catalogId);
  if (!c) return toast('找不到这份细则');
  ed.draft = JSON.parse(JSON.stringify(c));
  delete ed.draft.builtin;
  ed.sourceId = catalogId;
  ed.dirty = false;
  state.view = 'editor';
  render();
}
function openGroup(groupId) {
  ed.groupId = groupId;
  state.view = 'group';
  render();
}
function backToEditor() { state.view = 'editor'; ed.groupId = null; render(); }

/* ------------------------------------------------------------------ *
 * 视图：细则管理
 * ------------------------------------------------------------------ */

function renderCatalogs() {
  const list = listCatalogs();
  const activeId = getActiveId();

  app.innerHTML = `
    <div class="card">
      <h2 class="sec">细则管理</h2>
      <p class="p">工具本身不认识任何学校的规则，它读的是「细则」这份数据。
         导入别人做好的、或自己编一份，就能给别的学院用。</p>
      <p class="p muted">没有后端，所以「分享」= 导出成一个 JSON 文件发出去，对方导入即可。</p>
    </div>

    ${list.map(c => {
      const used = c.id === activeId;
      const n = countQuestions(c);
      const bad = validateCatalog(c).errors.length;
      return `
      <div class="card">
        <div class="row" style="align-items:flex-start">
          <div style="flex:1; min-width:0">
            <div style="font-weight:600; line-height:1.4">${esc(c.name)}</div>
            <div class="muted">${esc([c.school, c.college, c.term].filter(Boolean).join(' · ')) || '未填学校信息'}</div>
            <div class="muted">${c.groups.length} 组 · ${n} 屏${c.builtin ? ' · 内置' : ''}</div>
          </div>
          ${used ? '<span class="tag ok">使用中</span>' : ''}
          ${bad ? '<span class="tag" style="background:var(--bad-weak);color:var(--bad)">有问题</span>' : ''}
        </div>
        <div class="btnrow" style="margin-top:12px">
          ${used ? '' : `<button data-use="${esc(c.id)}">启用</button>`}
          <button data-edit="${esc(c.id)}">编辑</button>
          <button data-dup="${esc(c.id)}">复制一份</button>
        </div>
        <div class="btnrow" style="margin-top:8px">
          <button class="ghost" data-exp="${esc(c.id)}">导出 JSON</button>
          ${c.builtin ? '' : `<button class="danger" data-del="${esc(c.id)}">删除</button>`}
        </div>
      </div>`;
    }).join('')}

    <div class="card">
      <button class="primary" id="toImport" style="width:100%; margin-bottom:10px">从文本 / PDF 导入细则</button>
      <button id="newBlank" style="width:100%">新建空白细则</button>
    </div>

    <button class="ghost" id="back" style="width:100%">← 返回自评</button>
  `;

  app.querySelector('#back').onclick = () => { state.view = 'overview'; render(); };

  app.querySelectorAll('[data-use]').forEach(b => b.onclick = () => {
    setActiveId(b.dataset.use);
    refreshCatalog();          // 必须通知主流程，否则页头/算分还用着旧细则
    toast('已切换细则');
    renderCatalogs();
  });
  app.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openEditor(b.dataset.edit));
  app.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => {
    const r = duplicateCatalog(b.dataset.dup);
    if (!r.ok) return toast(r.error);
    toast('已复制，可以开始改了');
    renderCatalogs();
  });
  app.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => {
    const c = getCatalog(b.dataset.exp);
    if (!c) return;
    downloadJSON(exportJSON(c), `${safeName(c.name)}.json`);
  });
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const c = getCatalog(b.dataset.del);
    if (!confirm(`删除「${c?.name ?? ''}」？此操作不可撤销。`)) return;
    const r = deleteCatalog(b.dataset.del);
    if (!r.ok) return toast(r.error);
    toast('已删除');
    renderCatalogs();
  });

  app.querySelector('#toImport').onclick = () => { state.view = 'import'; render(); };
  app.querySelector('#newBlank').onclick = () => {
    ed.draft = makeEmptyCatalog('新细则');
    ed.sourceId = null;
    ed.dirty = true;
    state.view = 'editor';
    render();
  };
}

function safeName(s) {
  return String(s).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'catalog';
}

function downloadJSON(text, filename) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ------------------------------------------------------------------ *
 * 视图：一份细则
 * ------------------------------------------------------------------ */

/** 输入框：不触发重绘，避免打字时焦点丢失 */
function bindField(sel, apply, evt = 'oninput') {
  const el = app.querySelector(sel);
  if (!el) return;
  el[evt] = () => {
    apply(el.value);
    ed.dirty = true;
    const badge = app.querySelector('#dirty');
    if (badge) badge.textContent = '有未保存的改动';
  };
}

function renderEditor() {
  const d = ed.draft;
  if (!d) { openCatalogs(); return; }
  const total = countQuestions(d);
  const byYu = {};
  for (const g of d.groups) (byYu[g.yu] ??= []).push(g);

  app.innerHTML = `
    <div class="card">
      <div class="row">
        <h2 class="sec" style="margin:0">细则信息</h2>
        <span class="tag ${ed.dirty ? '' : 'ok'}" id="dirty">${ed.dirty ? '有未保存的改动' : '已保存'}</span>
      </div>
    </div>

    <div class="card">
      ${textField('名称', 'f-name', d.name)}
      ${textField('学校', 'f-school', d.school)}
      ${textField('学院', 'f-college', d.college)}
      ${textField('学期', 'f-term', d.term)}
      ${textField('截止时间', 'f-deadline', d.deadline)}
      ${textField('材料区间', 'f-range', d.materialRange)}
      <label class="chk" style="display:block">
        <div class="muted" style="margin-bottom:6px">注意事项（一行一条）</div>
        <textarea id="f-notes" rows="4" style="width:100%;font:inherit;font-size:15px;padding:12px;
          border-radius:var(--r);border:1px solid var(--line)">${esc((d.notes ?? []).join('\n'))}</textarea>
      </label>
    </div>

    <div class="card">
      <div class="row" style="margin-bottom:6px">
        <h2 class="sec" style="margin:0">加分分组</h2>
        <span class="muted">${d.groups.length} 组 · 会问出 ${total} 屏</span>
      </div>
      ${Object.entries(d.yu).map(([k, y]) => {
        const gs = byYu[k] ?? [];
        if (!gs.length) return '';
        return `
        <div style="margin-top:10px">
          <div style="font-weight:600; margin-bottom:2px">${esc(y.name)}</div>
          ${gs.map(g => {
            const n = (g.mode === 'count' || g.mode === 'items-grade') ? (g.items ?? []).length : 1;
            return `
            <div class="row item" data-g="${esc(g.id)}" style="padding:12px 0; cursor:pointer">
              <span style="flex:1; padding-right:8px; line-height:1.45">
                ${esc(g.title)}
                <br><span class="muted">${esc(MODE_LABEL[g.mode] ?? g.mode)} ·
                  ${n} ${(g.mode === 'count' || g.mode === 'items-grade') ? '项' : '屏'} ·
                  ${g.cap == null ? '不限分' : `上限 ${g.cap} 分`}</span>
              </span>
              <span class="chev">修改 →</span>
            </div>`;
          }).join('')}
        </div>`;
      }).join('') || '<div class="muted" style="margin-top:10px">还没有任何分组</div>'}
    </div>

    <div class="card">
      <div class="muted" style="margin-bottom:8px">新增分组</div>
      <select id="newYu" style="margin-bottom:8px">
        ${Object.entries(d.yu).map(([k, y]) => `<option value="${k}">${esc(y.name)}</option>`).join('')}
      </select>
      <select id="newMode" style="margin-bottom:8px">
        ${MODES.map(m => `<option value="${m}">${esc(MODE_LABEL[m])}</option>`).join('')}
      </select>
      <button class="primary" id="addGroup" style="width:100%">添加</button>
    </div>

    <button class="primary huge" id="save" style="width:100%; margin-bottom:10px">保存细则</button>
    <div class="btnrow" style="margin-bottom:10px">
      <button id="exp">导出 JSON</button>
      <button class="danger" id="discard">放弃改动</button>
    </div>
    <button class="ghost" id="back" style="width:100%">← 返回细则列表</button>
  `;

  bindField('#f-name', v => { d.name = v; });
  bindField('#f-school', v => { d.school = v; });
  bindField('#f-college', v => { d.college = v; });
  bindField('#f-term', v => { d.term = v; });
  bindField('#f-deadline', v => { d.deadline = v; });
  bindField('#f-range', v => { d.materialRange = v; });
  bindField('#f-notes', v => { d.notes = v.split('\n').map(s => s.trim()).filter(Boolean); });

  app.querySelectorAll('[data-g]').forEach(row => row.onclick = () => openGroup(row.dataset.g));

  app.querySelector('#addGroup').onclick = () => {
    const yu = app.querySelector('#newYu').value;
    const mode = app.querySelector('#newMode').value;
    const g = makeEmptyGroup(yu, mode);
    d.groups.push(g);
    d.formulaNames[g.id] = `${g.title}加分`;
    ed.dirty = true;
    openGroup(g.id);
  };

  app.querySelector('#back').onclick = () => {
    if (ed.dirty && !confirm('有未保存的改动，确定离开？')) return;
    openCatalogs();
  };
  app.querySelector('#discard').onclick = () => {
    if (!confirm('放弃所有未保存的改动？')) return;
    if (ed.sourceId) openEditor(ed.sourceId);
    else openCatalogs();
  };
  app.querySelector('#exp').onclick = () => {
    const { catalog } = normalizeCatalog(d);
    downloadJSON(exportJSON(catalog), `${safeName(catalog.name)}.json`);
  };
  app.querySelector('#save').onclick = () => {
    const { catalog, dropped } = normalizeCatalog(d);
    const { errors, warnings } = validateCatalog(catalog);
    if (errors.length) {
      alert('还有问题要修：\n\n' + errors.join('\n'));
      return;
    }
    const r = saveCatalog(catalog);
    if (!r.ok) return alert(r.error);
    ed.draft = catalog;
    ed.sourceId = catalog.id;
    ed.dirty = false;
    // 如果改的正是当前启用的那份，热更新到自评流程
    if (getActiveId() === catalog.id) refreshCatalog();
    toast(dropped.length ? `已保存（丢弃了 ${dropped.length} 项无效数据）` : '已保存');
    if (warnings.length) {
      setTimeout(() => alert('保存成功，但有几处建议复核：\n\n' + warnings.slice(0, 8).join('\n')), 300);
    }
    renderEditor();
  };
}

function textField(label, id, value) {
  return `
    <label style="display:block; margin-bottom:12px">
      <div class="muted" style="margin-bottom:6px">${esc(label)}</div>
      <input id="${id}" type="text" value="${esc(value ?? '')}">
    </label>`;
}

/* ------------------------------------------------------------------ *
 * 视图：单个分组
 * ------------------------------------------------------------------ */

function numInput(label, id, value, opts = {}) {
  return `
    <label style="display:block; margin-bottom:12px">
      <div class="muted" style="margin-bottom:6px">${esc(label)}</div>
      <input id="${id}" type="number" step="${opts.step ?? '0.05'}"
             value="${value == null ? '' : value}" placeholder="${esc(opts.placeholder ?? '')}">
    </label>`;
}

function renderGroupEditor() {
  const d = ed.draft;
  const g = d?.groups.find(x => x.id === ed.groupId);
  if (!g) { backToEditor(); return; }

  app.innerHTML = `
    <div class="card">
      <h2 class="sec">分组设置</h2>
      ${textField('分组名称', 'g-title', g.title)}
      <label style="display:block; margin-bottom:12px">
        <div class="muted" style="margin-bottom:6px">属于哪一育</div>
        <select id="g-yu">${Object.entries(d.yu).map(([k, y]) =>
          `<option value="${k}" ${g.yu === k ? 'selected' : ''}>${esc(y.name)}</option>`).join('')}</select>
      </label>
      <label style="display:block; margin-bottom:12px">
        <div class="muted" style="margin-bottom:6px">计分方式</div>
        <select id="g-mode">${MODES.map(m =>
          `<option value="${m}" ${g.mode === m ? 'selected' : ''}>${esc(MODE_LABEL[m])}</option>`).join('')}</select>
      </label>
      ${numInput('封顶分值（留空 = 不限分）', 'g-cap', g.cap, { step: '0.1', placeholder: '如 0.6' })}
      ${textField('PDF 顶行的名称', 'g-formula', d.formulaNames[g.id] ?? '')}
      <label style="display:block">
        <div class="muted" style="margin-bottom:6px">说明（显示在题目下方）</div>
        <textarea id="g-note" rows="3" style="width:100%;font:inherit;font-size:15px;padding:12px;
          border-radius:var(--r);border:1px solid var(--line)">${esc(g.note ?? '')}</textarea>
      </label>
    </div>

    <div id="modeBody"></div>

    <button class="primary huge" id="done" style="width:100%; margin-bottom:10px">完成</button>
    <button class="danger" id="del" style="width:100%">删除这个分组</button>
  `;

  bindField('#g-title', v => { g.title = v; });
  bindField('#g-note', v => { g.note = v; });
  bindField('#g-formula', v => { d.formulaNames[g.id] = v; });
  app.querySelector('#g-yu').onchange = (e) => { g.yu = e.target.value; ed.dirty = true; };
  app.querySelector('#g-mode').onchange = (e) => {
    // 换模式时把该模式缺的字段补上，免得一进表单就报错
    g.mode = e.target.value;
    const fresh = makeEmptyGroup(g.yu, g.mode);
    for (const k of ['items', 'levels', 'rankNames', 'subgroups', 'options', 'tiers', 'extra', 'unit']) {
      if (fresh[k] !== undefined && g[k] === undefined) g[k] = fresh[k];
    }
    ed.dirty = true;
    renderGroupEditor();
  };
  bindField('#g-cap', v => {
    const n = Number(v);
    g.cap = (v.trim() === '' || !Number.isFinite(n)) ? null : n;
  });

  renderModeBody(g, d);

  app.querySelector('#done').onclick = backToEditor;
  app.querySelector('#del').onclick = () => {
    if (!confirm(`删除分组「${g.title}」？`)) return;
    d.groups = d.groups.filter(x => x.id !== g.id);
    delete d.formulaNames[g.id];
    ed.dirty = true;
    backToEditor();
  };
}

/** 各计分模式专属的编辑区 */
function renderModeBody(g, d) {
  const host = app.querySelector('#modeBody');
  const rerender = () => { ed.dirty = true; renderGroupEditor(); };

  if (g.mode === 'count' || g.mode === 'items-grade') {
    host.innerHTML = `
      <div class="card">
        ${numInput('每项默认分值', 'g-unit', g.unit, { step: '0.05' })}
        <div class="muted" style="margin-bottom:8px">说明：单项可以单独设分值，留空就用默认值。</div>
      </div>
      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <span style="font-weight:600">项目（${(g.items ?? []).length}）</span>
          <button id="addItem" style="min-height:38px;padding:6px 14px;font-size:14px">+ 添加</button>
        </div>
        ${(g.items ?? []).map((it, i) => `
          <div class="item" style="padding:10px 0">
            <div class="row" style="gap:8px">
              <input type="text" data-iname="${esc(it.id)}" value="${esc(it.name)}"
                     style="flex:1; min-width:0">
              <button class="danger" data-idel="${i}" style="min-height:40px;padding:8px 12px">删</button>
            </div>
            <div style="margin-top:6px">
              <input type="number" step="0.05" data-iunit="${esc(it.id)}"
                     value="${it.unit ?? ''}" placeholder="默认 ${g.unit}"
                     style="width:130px">
            </div>
          </div>`).join('') || '<div class="muted">还没有项目</div>'}
      </div>
      ${g.mode === 'items-grade' ? '<div id="lvBody"></div>' : ''}
    `;
    app.querySelectorAll('[data-iname]').forEach(inp => inp.oninput = () => {
      const it = g.items.find(x => x.id === inp.dataset.iname);
      if (it) { it.name = inp.value; ed.dirty = true; }
    });
    app.querySelectorAll('[data-iunit]').forEach(inp => inp.oninput = () => {
      const it = g.items.find(x => x.id === inp.dataset.iunit);
      if (!it) return;
      const v = inp.value.trim();
      if (v === '') delete it.unit;
      else if (Number.isFinite(Number(v))) it.unit = Number(v);
      ed.dirty = true;
    });
    app.querySelectorAll('[data-idel]').forEach(b => b.onclick = () => {
      g.items.splice(Number(b.dataset.idel), 1);
      rerender();
    });
    app.querySelector('#addItem').onclick = () => {
      g.items.push({ id: genId('i'), name: '' });
      rerender();
    };
    bindField('#g-unit', v => {
      const n = Number(v);
      if (Number.isFinite(n)) g.unit = n;
    });

    if (g.mode === 'items-grade') renderLevels(host.querySelector('#lvBody'), g, rerender);
    return;
  }

  if (g.mode === 'grade' || g.mode === 'honor') {
    host.innerHTML = '<div id="lvBody"></div>';
    renderLevels(host.querySelector('#lvBody'), g, rerender);
    return;
  }

  if (g.mode === 'pickmax') {
    host.innerHTML = `
      <div class="muted" style="margin-bottom:8px">同一子类里只算最高分的一项（如四级和六级都过，只算六级）。</div>
      ${(g.subgroups ?? []).map((sg, si) => `
        <div class="card">
          <div class="row" style="gap:8px; margin-bottom:8px">
            <input type="text" data-sgname="${esc(sg.id)}" value="${esc(sg.name)}" style="flex:1">
            <button class="danger" data-sgdel="${si}" style="min-height:40px;padding:8px 12px">删</button>
          </div>
          ${sg.options.map((o, oi) => `
            <div class="row" style="gap:8px; margin-bottom:8px">
              <input type="text" data-oname="${esc(o.id)}" value="${esc(o.name)}" style="flex:2; min-width:0">
              <input type="number" step="0.05" data-oscore="${esc(o.id)}" value="${o.score ?? ''}" style="flex:1">
              <button class="danger" data-odel="${si}:${oi}" style="min-height:40px;padding:8px 12px">删</button>
            </div>`).join('')}
          <button data-oadd="${si}" style="width:100%; margin-top:4px">+ 添加一项</button>
        </div>`).join('')}
      <button class="primary" id="sgAdd" style="width:100%">+ 添加子类</button>
    `;
    app.querySelectorAll('[data-sgname]').forEach(i => i.oninput = () => {
      const sg = g.subgroups.find(x => x.id === i.dataset.sgname);
      if (sg) { sg.name = i.value; ed.dirty = true; }
    });
    app.querySelectorAll('[data-sgdel]').forEach(b => b.onclick = () => {
      g.subgroups.splice(Number(b.dataset.sgdel), 1); rerender();
    });
    app.querySelectorAll('[data-oname]').forEach(i => i.oninput = () => {
      for (const sg of g.subgroups) {
        const o = sg.options.find(x => x.id === i.dataset.oname);
        if (o) { o.name = i.value; ed.dirty = true; return; }
      }
    });
    app.querySelectorAll('[data-oscore]').forEach(i => i.oninput = () => {
      const v = Number(i.value);
      for (const sg of g.subgroups) {
        const o = sg.options.find(x => x.id === i.dataset.oscore);
        if (o) { o.score = Number.isFinite(v) ? v : 0; ed.dirty = true; return; }
      }
    });
    app.querySelectorAll('[data-odel]').forEach(b => b.onclick = () => {
      const [si, oi] = b.dataset.odel.split(':').map(Number);
      g.subgroups[si].options.splice(oi, 1); rerender();
    });
    app.querySelectorAll('[data-oadd]').forEach(b => b.onclick = () => {
      g.subgroups[Number(b.dataset.oadd)].options.push({ id: genId('o'), name: '', score: 0 });
      rerender();
    });
    app.querySelector('#sgAdd').onclick = () => {
      g.subgroups.push({ id: genId('sg'), name: '新子类', options: [] });
      rerender();
    };
    return;
  }

  if (g.mode === 'range' || g.mode === 'penalty') {
    const isPenalty = g.mode === 'penalty';
    host.innerHTML = `
      <div class="card">
        <div class="muted" style="margin-bottom:8px">
          ${isPenalty ? '扣分项：固定扣分填「一次扣多少」，按次数的填「每次扣多少」。'
                      : '认定项：填细则给的分数区间，学生自己填预期值。'}
        </div>
        ${(g.options ?? []).map((o, i) => `
          <div class="item" style="padding:10px 0">
            <div class="row" style="gap:8px; margin-bottom:6px">
              <input type="text" data-oname="${esc(o.id)}" value="${esc(o.name)}" style="flex:1; min-width:0">
              <button class="danger" data-odel="${i}" style="min-height:40px;padding:8px 12px">删</button>
            </div>
            <div class="row" style="gap:8px">
              <input type="number" step="0.05" data-omin="${esc(o.id)}" value="${o.min ?? ''}" placeholder="下限">
              <input type="number" step="0.05" data-omax="${esc(o.id)}" value="${o.max ?? ''}" placeholder="上限">
              <input type="number" step="0.05" data-oflat="${esc(o.id)}" value="${o.flat ?? ''}" placeholder="一次扣">
              <input type="number" step="0.05" data-ounit="${esc(o.id)}" value="${o.unit ?? ''}" placeholder="每次扣">
            </div>
          </div>`).join('') || '<div class="muted">还没有选项</div>'}
        <button id="addOpt" style="width:100%; margin-top:8px">+ 添加选项</button>
      </div>
    `;
    app.querySelectorAll('[data-oname]').forEach(i => i.oninput = () => {
      const o = g.options.find(x => x.id === i.dataset.oname);
      if (o) { o.name = i.value; ed.dirty = true; }
    });
    const numField = (attr, key) => app.querySelectorAll(`[data-${attr}]`).forEach(i => i.oninput = () => {
      const o = g.options.find(x => x.id === i.dataset[attr]);
      if (!o) return;
      const v = i.value.trim();
      if (v === '') delete o[key];
      else if (Number.isFinite(Number(v))) o[key] = Number(v);
      ed.dirty = true;
    });
    numField('omin', 'min'); numField('omax', 'max');
    numField('oflat', 'flat'); numField('ounit', 'unit');
    app.querySelectorAll('[data-odel]').forEach(b => b.onclick = () => {
      g.options.splice(Number(b.dataset.odel), 1); rerender();
    });
    app.querySelector('#addOpt').onclick = () => {
      g.options.push({ id: genId('o'), name: '' });
      rerender();
    };
    return;
  }

  if (g.mode === 'tier') {
    host.innerHTML = `
      <div class="card">
        ${textField('计量单位', 'g-tunit', g.unit ?? '小时')}
        <div class="muted" style="margin-bottom:8px">按区间归档。「上限」留空表示无穷大（最后一档）。</div>
        ${(g.tiers ?? []).map((t, i) => `
          <div class="item" style="padding:10px 0">
            <div class="row" style="gap:8px; margin-bottom:6px">
              <input type="text" data-tlabel="${i}" value="${esc(t.label ?? '')}" placeholder="档位说明" style="flex:1">
              <button class="danger" data-tdel="${i}" style="min-height:40px;padding:8px 12px">删</button>
            </div>
            <div class="row" style="gap:8px">
              <input type="number" step="0.5" data-tmin="${i}" value="${t.min ?? ''}" placeholder="下限">
              <input type="number" step="0.5" data-tmax="${i}" value="${t.max === Infinity ? '' : (t.max ?? '')}" placeholder="上限(空=∞)">
              <input type="number" step="0.05" data-tscore="${i}" value="${t.score ?? ''}" placeholder="得分">
            </div>
          </div>`).join('') || '<div class="muted">还没有档位</div>'}
        <button id="addTier" style="width:100%; margin-top:8px">+ 添加档位</button>
      </div>
    `;
    app.querySelector('#g-tunit').oninput = (e) => { g.unit = e.target.value; ed.dirty = true; };
    app.querySelectorAll('[data-tlabel]').forEach(i => i.oninput = () => {
      g.tiers[Number(i.dataset.tlabel)].label = i.value; ed.dirty = true;
    });
    const tnum = (attr, key, emptyAs) => app.querySelectorAll(`[data-${attr}]`).forEach(i => i.oninput = () => {
      const t = g.tiers[Number(i.dataset[attr])];
      const v = i.value.trim();
      if (v === '') { if (emptyAs !== undefined) t[key] = emptyAs; return; }
      if (Number.isFinite(Number(v))) t[key] = Number(v);
      ed.dirty = true;
    });
    tnum('tmin', 'min'); tnum('tmax', 'max', Infinity); tnum('tscore', 'score');
    app.querySelectorAll('[data-tdel]').forEach(b => b.onclick = () => {
      g.tiers.splice(Number(b.dataset.tdel), 1); rerender();
    });
    app.querySelector('#addTier').onclick = () => {
      g.tiers.push({ min: 0, max: Infinity, score: 0, label: '' });
      rerender();
    };
    return;
  }

  host.innerHTML = '<div class="card"><div class="muted">这个模式没有额外设置。</div></div>';
}

/** 级别 × 等次 的分值矩阵（grade / items-grade / honor 共用） */
function renderLevels(host, g, rerender) {
  if (!host) return;
  const isHonor = g.mode === 'honor';

  if (isHonor) {
    host.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <span style="font-weight:600">级别与分值</span>
          <button id="addLv" style="min-height:38px;padding:6px 14px;font-size:14px">+ 添加级别</button>
        </div>
        <div class="muted" style="margin-bottom:8px">集体荣誉分「负责人」和「一般成员」，个人荣誉单独一列。</div>
        ${(g.levels ?? []).map((l, i) => `
          <div class="item" style="padding:10px 0">
            <div class="row" style="gap:8px; margin-bottom:6px">
              <input type="text" data-lvname="${esc(l.key)}" value="${esc(l.name)}" style="flex:1">
              <button class="danger" data-lvdel="${i}" style="min-height:40px;padding:8px 12px">删</button>
            </div>
            <div class="row" style="gap:6px">
              <input type="number" step="0.5" data-lvind="${esc(l.key)}" value="${l.individual ?? ''}" placeholder="个人">
              <input type="number" step="0.5" data-lvldr="${esc(l.key)}" value="${l.leader ?? ''}" placeholder="负责人">
              <input type="number" step="0.5" data-lvmbr="${esc(l.key)}" value="${l.member ?? ''}" placeholder="成员">
            </div>
          </div>`).join('') || '<div class="muted">还没有级别</div>'}
      </div>
    `;
    app.querySelectorAll('[data-lvname]').forEach(i => i.oninput = () => {
      const l = g.levels.find(x => x.key === i.dataset.lvname);
      if (l) { l.name = i.value; ed.dirty = true; }
    });
    const lnum = (attr, key) => app.querySelectorAll(`[data-${attr}]`).forEach(i => i.oninput = () => {
      const l = g.levels.find(x => x.key === i.dataset[attr]);
      if (!l) return;
      const v = i.value.trim();
      if (v === '') delete l[key];
      else if (Number.isFinite(Number(v))) l[key] = Number(v);
      ed.dirty = true;
    });
    lnum('lvind', 'individual'); lnum('lvldr', 'leader'); lnum('lvmbr', 'member');
    app.querySelectorAll('[data-lvdel]').forEach(b => b.onclick = () => {
      g.levels.splice(Number(b.dataset.lvdel), 1); rerender();
    });
    app.querySelector('#addLv').onclick = () => {
      g.levels.push({ key: genId('lv'), name: '新级别', leader: 0, member: 0, individual: 0 });
      rerender();
    };
    return;
  }

  const ranks = g.rankNames ?? [];
  host.innerHTML = `
    <div class="card">
      <div class="row" style="margin-bottom:8px">
        <span style="font-weight:600">级别 × 等次 分值表</span>
        <button id="addLv" style="min-height:38px;padding:6px 14px;font-size:14px">+ 级别</button>
      </div>
      <label style="display:block; margin-bottom:12px">
        <div class="muted" style="margin-bottom:6px">等次名称（用顿号或逗号分隔，按顺序对应下面的分值）</div>
        <input id="lvRanks" type="text" value="${esc(ranks.join('、'))}">
      </label>
      ${(g.levels ?? []).map((l, i) => `
        <div class="item" style="padding:10px 0">
          <div class="row" style="gap:8px; margin-bottom:6px">
            <input type="text" data-lvname="${esc(l.key)}" value="${esc(l.name)}" style="flex:1">
            <button class="danger" data-lvdel="${i}" style="min-height:40px;padding:8px 12px">删</button>
          </div>
          <div class="row" style="gap:6px; flex-wrap:wrap">
            ${ranks.map((r, ri) => `
              <input type="number" step="0.05" data-lvsc="${esc(l.key)}:${ri}"
                     value="${l.scores?.[ri] ?? ''}" placeholder="${esc(r)}" style="width:88px">`).join('')}
          </div>
        </div>`).join('') || '<div class="muted">还没有级别</div>'}
      <div style="margin-top:12px">
        <label class="chk" style="padding:8px 0">
          <span>${esc(g.extra?.name ?? '特等奖')} 在一等奖基础上加分</span>
          <input type="number" step="0.5" id="lvExtra" value="${g.extra?.bonus ?? 0}" style="width:88px">
        </label>
      </div>
    </div>
  `;

  app.querySelector('#lvRanks').oninput = (e) => {
    const arr = e.target.value.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean);
    g.rankNames = arr.length ? arr : ['一等奖'];
    ed.dirty = true;
  };
  app.querySelectorAll('[data-lvname]').forEach(i => i.oninput = () => {
    const l = g.levels.find(x => x.key === i.dataset.lvname);
    if (l) { l.name = i.value; ed.dirty = true; }
  });
  app.querySelectorAll('[data-lvsc]').forEach(i => i.oninput = () => {
    const [key, ri] = i.dataset.lvsc.split(':');
    const l = g.levels.find(x => x.key === key);
    if (!l) return;
    if (!Array.isArray(l.scores)) l.scores = [];
    const v = i.value.trim();
    if (v === '') delete l.scores[Number(ri)];
    else if (Number.isFinite(Number(v))) l.scores[Number(ri)] = Number(v);
    ed.dirty = true;
  });
  app.querySelector('#lvExtra').oninput = (e) => {
    const v = Number(e.target.value);
    g.extra = { name: g.extra?.name ?? '特等奖', bonus: Number.isFinite(v) ? v : 0 };
    ed.dirty = true;
  };
  app.querySelectorAll('[data-lvdel]').forEach(b => b.onclick = () => {
    g.levels.splice(Number(b.dataset.lvdel), 1); rerender();
  });
  app.querySelector('#addLv').onclick = () => {
    g.levels.push({ key: genId('lv'), name: '新级别', scores: [] });
    rerender();
  };
}

/* ------------------------------------------------------------------ *
 * 视图：从文本 / PDF 导入
 * ------------------------------------------------------------------ */

function renderImport() {
  const pv = ed.importPreview;

  app.innerHTML = `
    <div class="card">
      <h2 class="sec">从细则文本生成草稿</h2>
      <p class="p">把细则的内容复制粘贴到下面，或者上传 PDF。工具会按文本特征
         （「一、德育」「（1）xxx」「上限 0.6 分」这类）切分出一个草稿。</p>
      <div class="warnbox">
        <b>草稿不是成品。</b>不同格式的细则解析效果差别很大 ——
        结构规整的可能认出七八成，格式乱的只有三四成。
        生成后<b>必须逐条复核</b>才能用。
      </div>
    </div>

    <div class="card">
      <label style="display:block; margin-bottom:12px">
        <div class="muted" style="margin-bottom:6px">粘贴细则文本</div>
        <textarea id="imp-text" rows="8" style="width:100%;font:inherit;font-size:15px;padding:12px;
          border-radius:var(--r);border:1px solid var(--line)"
          placeholder="把细则内容粘到这里…">${esc(ed.importText)}</textarea>
      </label>
      <input type="file" accept="application/pdf,.pdf" id="imp-pdf" style="display:none">
      <div class="btnrow">
        <button id="pickPdf">上传 PDF</button>
        <button class="primary" id="parse">生成草稿</button>
      </div>
    </div>

    ${pv ? `
    <div class="card">
      <h2 class="sec">解析结果</h2>
      <div class="row"><span>识别到育</span><b>${pv.yuCount}</b></div>
      <div class="row"><span>识别到分组</span><b>${pv.groupCount}</b></div>
      <div class="row"><span>识别到项目</span><b>${pv.itemCount}</b></div>
      <div class="row"><span>会问出</span><b>${pv.questions} 屏</b></div>
      ${pv.lowConfidence ? `<div class="muted" style="margin-top:6px">
        其中 ${pv.lowConfidence} 组把握不大（分值多半是猜的），进编辑器后请优先复核。</div>` : ''}
      <div style="margin-top:12px" class="muted">
        ${pv.groupCount === 0
          ? '一个分组都没认出来 —— 多半是文本格式和解析规则对不上。可以换个来源重试（比如从 Word 里复制），或者直接新建空白细则手动录。'
          : '接下来进编辑器逐条核对。分值、封顶、计分方式这些最容易错。'}
      </div>
      <button class="primary" id="apply" style="width:100%; margin-top:12px"
        ${pv.groupCount === 0 ? 'disabled' : ''}>用它新建一份细则</button>
    </div>` : ''}

    <button class="ghost" id="back" style="width:100%">← 返回细则列表</button>
  `;

  bindField('#imp-text', v => { ed.importText = v; });

  /** 解析当前文本并生成草稿。两条入口（粘贴 / PDF）共用，避免只存预览不存草稿。 */
  const runParse = () => {
    const draft = parseDraft(ed.importText);
    ed.importDraft = draft;
    ed.importPreview = summarize(draft);
    renderImport();
  };

  app.querySelector('#pickPdf').onclick = () => app.querySelector('#imp-pdf').click();
  app.querySelector('#imp-pdf').onchange = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const btn = app.querySelector('#pickPdf');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> 读取中';
    try {
      ed.importText = await extractPdfText(f);
      ed.importPreview = null;
      ed.importDraft = null;
      renderImport();
      runParse();
      toast(`已读取 ${ed.importText.length} 个字符`);
    } catch (err) {
      alert('读取 PDF 失败：' + err.message);
      btn.disabled = false;
      btn.textContent = '上传 PDF';
    }
  };

  app.querySelector('#parse').onclick = () => {
    if (!ed.importText.trim()) return toast('先粘贴文本或上传 PDF');
    runParse();
  };

  app.querySelector('#apply')?.addEventListener('click', () => {
    if (!ed.importDraft) return;
    ed.draft = ed.importDraft;
    ed.sourceId = null;
    ed.dirty = true;
    ed.importPreview = null;
    ed.importDraft = null;
    state.view = 'editor';
    render();
  });

  app.querySelector('#back').onclick = openCatalogs;
}

function summarize(draft) {
  const groups = draft.groups ?? [];
  return {
    yuCount: new Set(groups.map(g => g.yu)).size,
    groupCount: groups.length,
    itemCount: groups.reduce((s, g) => s + (g.items?.length ?? 0), 0),
    questions: countQuestions(draft),
    lowConfidence: groups.filter(g => (g.confidence ?? 1) < 0.5).length
  };
}

/* ------------------------------------------------------------------ *
 * 注册
 * ------------------------------------------------------------------ */

export const editorViews = {
  catalogs: renderCatalogs,
  editor: renderEditor,
  group: renderGroupEditor,
  import: renderImport
};

/** 给主流程一个入口（总览页上的按钮用） */
export function openCatalogManager() {
  state.view = 'catalogs';
  render();
}
