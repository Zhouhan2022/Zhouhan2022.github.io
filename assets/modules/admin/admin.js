/* 站内管理：侧边栏「➕ 新建页面」（通用层级：可放一级/任意已有栏目下）+ 右下角 ⚙ 管理。
 * 新增功能，不修改站点原有编辑器与任何其他模块。 */
(function () {
  'use strict';

  var OWNER = 'Zhouhan2022';
  var REPO = 'Zhouhan2022.github.io';
  var BRANCH = 'main';
  var API = 'https://api.github.com';
  var TOKEN_KEY = 'zsite-admin-token-v1';

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function saveToken(v) { try { localStorage.setItem(TOKEN_KEY, v); } catch (e) { } }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) { } }
  function b64enc(text) { return btoa(unescape(encodeURIComponent(text))); }
  function b64dec(b64) { return decodeURIComponent(escape(atob(String(b64 || '').replace(/\s+/g, '')))); }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    var tok = getToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, {
      method: opts.method || 'GET', headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (res.ok) return data;
        var msg = (data && (data.message || data.error)) || ('HTTP ' + res.status);
        if (res.status === 401) msg = '令牌无效或已过期：请在 ⚙ 里粘贴一次新的 GitHub 令牌。';
        else if (res.status === 403) msg = '权限不足（' + msg + '）：请到 GitHub 令牌设置里，把本仓库的 Contents 改成 Read and write，并点 Update token 保存。';
        else if (res.status === 404) msg = '找不到仓库或文件（' + msg + '）：请确认令牌的 Repository access 已勾选本仓库。';
        throw new Error(msg);
      });
    });
  }

  /* ---------- nav 解析与修改 ---------- */
  function lines(text) { return String(text).replace(/\r\n/g, '\n').split('\n'); }
  function navRange(arr) {
    var start = -1;
    for (var i = 0; i < arr.length; i++) if (/^nav:\s*$/.test(arr[i])) { start = i; break; }
    if (start < 0) return null;
    var end = arr.length;
    for (var j = start + 1; j < arr.length; j++) {
      if (arr[j].trim() === '') continue;
      if (/^\S/.test(arr[j]) && !/^\s*-\s/.test(arr[j])) { end = j; break; }
    }
    return { start: start, end: end };
  }
  function navIndent(line) { var m = /^(\s*)-\s/.exec(line); return m ? m[1].length : -1; }
  function navTP(line) {
    var m = /^\s*-\s*([^:]+):\s*(.+?)\s*$/.exec(line);
    if (!m) return null;
    return { title: m[1].trim().replace(/^["']|["']$/g, ''), path: m[2].trim().replace(/^["']|["']$/g, '') };
  }

  /** 把 nav 解析为树：{ title, path|null, indent, line, children[] } */
  function parseNavTree(arr) {
    var r = navRange(arr);
    if (!r) throw new Error('mkdocs.yml 里没有 nav 段');
    var root = { title: '', path: null, indent: -2, line: r.start, children: [] };
    var stack = [root];
    for (var i = r.start + 1; i < r.end; i++) {
      var ind = navIndent(arr[i]);
      if (ind < 0) continue;
      var tp = navTP(arr[i]);
      if (!tp) continue;
      var node = { title: tp.title, path: tp.path || null, indent: ind, line: i, children: [] };
      while (stack.length > 1 && stack[stack.length - 1].indent >= ind) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
    return { root: root, range: r };
  }

  function insertTopLevel(arr, title, path) {
    var r = navRange(arr);
    if (!r) throw new Error('mkdocs.yml 里没有 nav 段');
    var last = r.start;
    for (var i = r.start + 1; i < r.end; i++) if (navIndent(arr[i]) === 2) last = i;
    arr.splice(last + 1, 0, '  - ' + title + ': ' + path);
    return arr;
  }

  /** 在指定栏目节点下追加子项（自动缩进与位置） */
  function insertUnder(arr, parentNode, title, path) {
    var last = parentNode.line;
    for (var i = parentNode.line + 1; i < arr.length; i++) {
      var ind = navIndent(arr[i]);
      if (ind < 0) {
        if (arr[i].trim() === '') continue;
        break;
      }
      if (ind > parentNode.indent) last = i;
      else break;
    }
    var prefix = new Array(parentNode.indent + 2 + 1).join(' ');
    arr.splice(last + 1, 0, prefix + '- ' + title + ': ' + path);
    return arr;
  }

  function removeNav(arr, path) {
    for (var i = arr.length - 1; i >= 0; i--) {
      var tp = navTP(arr[i]);
      if (tp && tp.path === path) { arr.splice(i, 1); return arr; }
    }
    return arr;
  }

  /** 栏目节点对应的目录（取所有后代路径的最长公共目录） */
  function sectionDir(node) {
    if (node.path) {
      var d0 = node.path.split('/').slice(0, -1).join('/');
      if (d0) return d0;
    }
    var dirs = [];
    (function walk(n) {
      if (n.path) dirs.push(n.path.split('/').slice(0, -1).join('/'));
      (n.children || []).forEach(walk);
    })(node);
    dirs = dirs.filter(function (d) { return d !== ''; });
    if (!dirs.length) return '';
    var common = dirs[0].split('/');
    for (var i = 1; i < dirs.length; i++) {
      var parts = dirs[i].split('/');
      common = common.filter(function (p, idx) { return parts[idx] === p; });
    }
    return common.join('/');
  }

  function findNodeByTitlePath(root, titlePath) {
    var cur = root;
    for (var i = 0; i < titlePath.length; i++) {
      var found = null;
      for (var j = 0; j < cur.children.length; j++) {
        if (cur.children[j].title === titlePath[i]) { found = cur.children[j]; break; }
      }
      if (!found) return null;
      cur = found;
    }
    return cur;
  }

  /** 生成位置下拉选项：一级 + 任意已有栏目（二级/三级…） */
  function positionOptions(root) {
    var out = [{ value: '', label: '放到左侧栏顶层（一级目录）', depth: 0 }];
    (function walk(nodes, chain, depth) {
      nodes.forEach(function (node) {
        var isSection = !node.path || (node.children && node.children.length > 0);
        if (!isSection) return;
        var label = (depth === 1 ? '放进「' : '放进「') + (chain.concat(node.title).join(' / ')) + '」下' + (depth === 1 ? '（二级）' : depth === 2 ? '（三级）' : '');
        out.push({ value: (chain.concat(node.title)).join('\u0001'), label: label, depth: depth });
        if (node.children && node.children.length) walk(node.children, chain.concat(node.title), depth + 1);
      });
    })(root.children, [], 1);
    return out;
  }

  /* ---------- GitHub ---------- */
  function getFile(path) {
    return api('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURI(path) + '?ref=' + BRANCH)
      .then(function (d) { return { content: b64dec(d.content), sha: d.sha }; });
  }
  function putFile(path, text, message, sha) {
    var body = { message: message, content: b64enc(text), branch: BRANCH };
    if (sha) body.sha = sha;
    return api('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURI(path), { method: 'PUT', body: body });
  }
  function delFile(path, message, sha) {
    return api('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURI(path), {
      method: 'DELETE', body: { message: message, sha: sha, branch: BRANCH }
    });
  }
  function listMd() {
    return api('/repos/' + OWNER + '/' + REPO + '/git/trees/' + BRANCH + '?recursive=1').then(function (d) {
      var out = [];
      (d.tree || []).forEach(function (n) {
        if (n.type !== 'blob') return;
        if (n.path.indexOf('docs/') !== 0) return;
        if (!/\.md$/.test(n.path)) return;
        if (n.path.indexOf('docs/assets/') === 0) return;
        out.push(n.path);
      });
      return out.sort();
    });
  }
  function fileExists(path) {
    return api('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURI(path) + '?ref=' + BRANCH)
      .then(function () { return true; })
      .catch(function (err) {
        if (String(err.message).indexOf('找不到') >= 0) return false;
        throw err;
      });
  }

  /* ---------- 状态提示 ---------- */
  var statusEl = null;
  function status(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'zsa-status' + (kind ? ' zsa-' + kind : '');
    statusEl.style.display = msg ? 'block' : 'none';
  }
  function toast(msg, kind) {
    var el = qs('#zsa-toast');
    if (!el) { el = document.createElement('div'); el.id = 'zsa-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.className = 'zsa-toast ' + (kind || '');
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.display = 'none'; }, 4200);
  }

  function autoSlug(title) {
    var ascii = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (ascii.length >= 2) return ascii.slice(0, 32);
    return 'page-' + Date.now().toString(36);
  }

  /* ---------- 新建弹窗 ---------- */
  var modalTree = null;

  function openCreateModal() {
    if (!getToken()) { toast('先点右下角 ⚙，粘贴一次 GitHub 令牌', 'error'); return; }
    var m = qs('#zsa-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'zsa-modal';
      m.innerHTML =
        '<div class="zsa-modal-card">' +
        '  <div class="zsa-modal-title">新建页面</div>' +
        '  <input id="zsa-m-title" type="text" placeholder="页面标题（如：实验室）" autocomplete="off">' +
        '  <select id="zsa-m-pos"></select>' +
        '  <div class="zsa-modal-btns">' +
        '    <button id="zsa-m-create" type="button" class="zsa-primary">创建并发布</button>' +
        '    <button id="zsa-m-cancel" type="button">取消</button>' +
        '  </div>' +
        '  <div class="zsa-modal-note">位置可选：一级目录，或任意已有栏目（二级/三级）下。创建后约 1–2 分钟自动上线。</div>' +
        '</div>';
      document.body.appendChild(m);
      qs('#zsa-m-cancel').addEventListener('click', closeCreateModal);
      qs('#zsa-m-create').addEventListener('click', doCreate);
      qs('#zsa-m-title').addEventListener('keydown', function (e) { if (e.key === 'Enter') doCreate(); });
      m.addEventListener('click', function (e) { if (e.target === m) closeCreateModal(); });
    }
    m.style.display = 'flex';
    qs('#zsa-m-title').value = '';
    qs('#zsa-m-pos').innerHTML = '<option value="">加载中…</option>';
    setTimeout(function () { qs('#zsa-m-title').focus(); }, 30);
    getFile('mkdocs.yml').then(function (nav) {
      modalTree = parseNavTree(lines(nav.content));
      var opts = positionOptions(modalTree.root);
      var sel = qs('#zsa-m-pos');
      sel.innerHTML = opts.map(function (o) {
        var pad = o.depth > 0 ? new Array(o.depth + 1).join('　') : '';
        return '<option value="' + esc(o.value) + '">' + pad + esc(o.label) + '</option>';
      }).join('');
      sel.value = '';
    }).catch(function (err) {
      qs('#zsa-m-pos').innerHTML = '<option value="">（读取栏目失败）</option>';
      toast(err.message, 'error');
    });
  }
  function closeCreateModal() { var m = qs('#zsa-modal'); if (m) m.style.display = 'none'; }

  function doCreate() {
    var title = (qs('#zsa-m-title').value || '').trim();
    if (!title) { toast('先写个标题', 'error'); return; }
    var targetVal = qs('#zsa-m-pos').value;
    var targetChain = targetVal ? targetVal.split('\u0001') : null;
    qs('#zsa-m-create').disabled = true;
    toast('正在创建…');
    getFile('mkdocs.yml').then(function (nav) {
      var tree = parseNavTree(lines(nav.content));
      var arr = nav.content.replace(/\r\n/g, '\n').split('\n');
      var navPath, pagePath;
      if (!targetChain) {
        var slug = autoSlug(title);
        pagePath = 'docs/' + slug + '/index.md';
        navPath = slug + '/index.md';
        insertTopLevel(arr, title, navPath);
      } else {
        var parent = findNodeByTitlePath(tree.root, targetChain);
        if (!parent) throw new Error('找不到栏目「' + targetChain.join(' / ') + '」，请刷新页面重试');
        var dir = sectionDir(parent);
        if (!dir) throw new Error('栏目「' + parent.title + '」下还没有页面，请先放到顶层或已有栏目下');
        var slug2 = autoSlug(title);
        pagePath = 'docs/' + dir + '/' + slug2 + '.md';
        navPath = dir + '/' + slug2 + '.md';
        insertUnder(arr, parent, title, navPath);
      }
      return putFile(pagePath, '# ' + title + '\n\n（内容待写）\n', '新增页面：' + title).then(function () {
        return putFile('mkdocs.yml', arr.join('\n'), '新增导航：' + title, nav.sha);
      });
    }).then(function () {
      closeCreateModal();
      toast('✅ 已创建「' + title + '」，约 1–2 分钟后出现在左侧栏', 'ok');
      loadPanels();
    }).catch(function (err) { toast(err.message, 'error'); })
      .then(function () { qs('#zsa-m-create').disabled = false; });
  }

  /* ---------- 管理面板 ---------- */
  function buildPanel() {
    var wrap = document.createElement('div');
    wrap.id = 'zsa-root';
    wrap.innerHTML =
      '<button id="zsa-fab" type="button" title="管理">⚙</button>' +
      '<div id="zsa-panel" aria-hidden="true">' +
      ' <div class="zsa-head"><strong>管理</strong><button id="zsa-close" type="button">✕</button></div>' +
      ' <div id="zsa-status" class="zsa-status"></div>' +
      ' <div class="zsa-sec">' +
      '  <div class="zsa-sec-title">页面（删除需二次确认）</div>' +
      '  <div class="zsa-row"><button id="zsa-refresh" type="button">刷新</button>' +
      '   <button id="zsa-token-toggle" type="button">GitHub 令牌</button></div>' +
      '  <div id="zsa-list" class="zsa-list"></div>' +
      ' </div>' +
      ' <div class="zsa-sec" id="zsa-token-sec" style="display:none">' +
      '  <div class="zsa-note">令牌只保存在本浏览器。GitHub → 设置 → Developer settings → Fine-grained tokens → 该令牌 → Repository permissions → Contents 选 Read and write → Update token。</div>' +
      '  <input id="zsa-token-input" type="password" placeholder="github_pat_..." autocomplete="off">' +
      '  <div class="zsa-row"><button id="zsa-token-save" type="button" class="zsa-primary">保存令牌</button>' +
      '   <button id="zsa-token-clear" type="button" class="zsa-danger">清除</button></div>' +
      ' </div>' +
      ' <div class="zsa-sec" id="zsa-edit-sec" style="display:none">' +
      '  <div class="zsa-sec-title">编辑：<span id="zsa-edit-path"></span></div>' +
      '  <textarea id="zsa-edit-body" rows="10"></textarea>' +
      '  <div class="zsa-row"><button id="zsa-save-body" type="button" class="zsa-primary">保存并发布</button>' +
      '   <button id="zsa-cancel-edit" type="button">取消</button></div>' +
      ' </div>' +
      ' <div class="zsa-foot">提交后 GitHub Actions 约 1–2 分钟自动部署。</div>' +
      '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  function renderList(files, navArr) {
    var list = qs('#zsa-list');
    list.innerHTML = '';
    if (!files.length) { list.innerHTML = '<div class="zsa-note">还没有页面</div>'; return; }
    files.forEach(function (path) {
      var title = '';
      for (var i = 0; i < navArr.length; i++) {
        var tp = navTP(navArr[i]);
        if (tp && tp.path === path.replace(/^docs\//, '')) { title = tp.title; break; }
      }
      var row = document.createElement('div');
      row.className = 'zsa-item';
      row.innerHTML = '<div class="zsa-item-info"><div class="zsa-item-title">' + esc(title || '(未在导航)') + '</div>' +
        '<div class="zsa-item-path">' + esc(path) + '</div></div>' +
        '<div class="zsa-item-btns"><button type="button" data-act="edit">编辑</button>' +
        '<button type="button" data-act="del" class="zsa-danger">删除</button></div>';
      row.querySelector('[data-act="edit"]').addEventListener('click', function () { startEdit(path); });
      row.querySelector('[data-act="del"]').addEventListener('click', function () { removePage(path, title); });
      list.appendChild(row);
    });
  }

  var navLines = [];
  function loadPanels() {
    if (!getToken()) { status('先点「GitHub 令牌」粘贴一次密钥。', 'error'); return; }
    status('读取页面列表…');
    Promise.all([listMd(), getFile('mkdocs.yml')]).then(function (res) {
      navLines = lines(res[1].content);
      renderList(res[0], navLines);
      status('已连接仓库，共 ' + res[0].length + ' 个页面。');
    }).catch(function (err) { status(err.message, 'error'); });
  }

  function removePage(path, title) {
    if (!window.confirm('确定删除「' + (title || path) + '」吗？')) return;
    if (!window.confirm('⚠️ 彻底删除，无法恢复。继续？')) return;
    status('正在删除…');
    getFile(path).then(function (f) { return delFile(path, '删除页面：' + (title || path), f.sha); })
      .then(function () { return getFile('mkdocs.yml'); })
      .then(function (nav) {
        var arr = removeNav(lines(nav.content), path.replace(/^docs\//, ''));
        return putFile('mkdocs.yml', arr.join('\n'), '删除导航：' + (title || path), nav.sha);
      })
      .then(function () { status('✅ 已删除，约 1–2 分钟后生效', 'ok'); loadPanels(); })
      .catch(function (err) { status(err.message, 'error'); });
  }

  function startEdit(path) {
    status('读取正文…');
    getFile(path).then(function (f) {
      qs('#zsa-edit-sec').style.display = 'block';
      qs('#zsa-edit-path').textContent = path;
      qs('#zsa-edit-body').value = f.content;
      qs('#zsa-edit-sec').setAttribute('data-sha', f.sha);
      qs('#zsa-edit-sec').setAttribute('data-path', path);
      status('');
      qs('#zsa-edit-sec').scrollIntoView({ behavior: 'smooth' });
    }).catch(function (err) { status(err.message, 'error'); });
  }
  function saveBody() {
    var sec = qs('#zsa-edit-sec');
    var path = sec.getAttribute('data-path'), sha = sec.getAttribute('data-sha');
    status('保存中…');
    putFile(path, qs('#zsa-edit-body').value, '编辑：' + path, sha).then(function () {
      status('✅ 已保存，约 1–2 分钟后生效', 'ok');
      startEdit(path);
    }).catch(function (err) { status(err.message, 'error'); });
  }

  /* ---------- 侧边栏按钮 ---------- */
  function injectSidebarButton() {
    var nav = qs('.md-sidebar--primary .md-nav__list') || qs('.md-nav--primary .md-nav__list');
    if (!nav) return;
    if (nav.querySelector('.zsa-new-item')) return;
    var li = document.createElement('li');
    li.className = 'md-nav__item zsa-new-item';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-nav__link zsa-new-btn';
    btn.textContent = '➕ 新建页面';
    btn.addEventListener('click', openCreateModal);
    li.appendChild(btn);
    nav.appendChild(li);
  }
  function watchSidebar() {
    injectSidebarButton();
    var obs = new MutationObserver(function () { injectSidebarButton(); });
    obs.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', function () { setTimeout(injectSidebarButton, 80); }, true);
  }

  function bind() {
    qs('#zsa-fab').addEventListener('click', function () {
      var p = qs('#zsa-panel');
      var open = p.getAttribute('aria-hidden') === 'false';
      p.setAttribute('aria-hidden', open ? 'true' : 'false');
      if (!open) loadPanels();
    });
    qs('#zsa-close').addEventListener('click', function () { qs('#zsa-panel').setAttribute('aria-hidden', 'true'); });
    qs('#zsa-refresh').addEventListener('click', loadPanels);
    qs('#zsa-token-toggle').addEventListener('click', function () {
      var sec = qs('#zsa-token-sec');
      sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
      qs('#zsa-token-input').value = '';
    });
    qs('#zsa-token-save').addEventListener('click', function () {
      var v = (qs('#zsa-token-input').value || '').trim();
      if (!v) return;
      saveToken(v);
      qs('#zsa-token-input').value = '';
      status('令牌已保存，正在验证…');
      loadPanels();
    });
    qs('#zsa-token-clear').addEventListener('click', function () {
      clearToken(); status('已清除令牌'); qs('#zsa-list').innerHTML = '';
    });
    qs('#zsa-save-body').addEventListener('click', saveBody);
    qs('#zsa-cancel-edit').addEventListener('click', function () { qs('#zsa-edit-sec').style.display = 'none'; });
  }

  function init() {
    if (qs('#zsa-root')) return;
    buildPanel();
    statusEl = qs('#zsa-status');
    bind();
    watchSidebar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
