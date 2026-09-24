/**
 * 入口。
 *
 * 存在的意义：主流程（app.js）不 import 编辑器（editor.js），
 * 编辑器却要 import 主流程的共享设施（render / state / toast…）。
 * 两边在 app.js 的视图注册表里汇合，由这里负责接线，避免循环依赖。
 */

import { registerViews, boot, state } from './app.js';
import { editorViews } from './editor.js';

registerViews(editorViews);

// 支持直接打开 #catalogs 进细则管理（方便书签）
const hash = location.hash.replace('#', '');
if (hash && ['catalogs', 'import', 'editor'].includes(hash)) {
  state.view = hash;
  state.seenIntro = true;
}

boot();

window.addEventListener('hashchange', () => {
  const h = location.hash.replace('#', '');
  if (h && ['catalogs', 'import', 'editor'].includes(h)) {
    state.view = h;
    import('./app.js').then(m => m.render());
  }
});
