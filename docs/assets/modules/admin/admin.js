/* 站内管理面板：新建/删除页面、编辑正文，直接提交到 GitHub 仓库并触发自动部署。
 * 只在浏览器本地使用；GitHub 令牌保存在本浏览器的 localStorage。
 * 新增功能，不修改站点原有编辑器与任何其他模块。 */
(function () {
  'use strict';

  var OWNER = 'Zhouhan2022';
  var REPO = 'Zhouhan2022.github.io';
  var BRANCH = 'main';
  var API = 'https://api.github.com';
  var TOKEN_KEY = 'zsite-admin-token-v1';
  var NAV_ANCHOR = '闲杂';
  var COURSE_DIR = 'course';

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(v) { try { localStorage.setItem(TOKEN_KEY, v); } catch (e) { } }

  function b64encodeUtf8(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }
  function b64decodeUtf8(b64) {
    return decodeURIComponent(escape(atob(String(b64 || '').replace(/\s+/g, ''))));
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token()) headers['Authorization'] = 'Bearer ' + token();
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var msg = (data && (data.message || data.error)) || ('HTTP ' + res.status);
          if (res.status === 401) msg = '令牌无效或已过期，请重新粘贴 GitHub 令牌。';
          if (res.status === 403) msg = '权限不足（' + msg + '）。请确认令牌已勾选本仓库的 Contents: Read and write。';
          if (res.status === 404) msg = '找不到文件/仓库（' + msg + '）。请确认令牌有本仓库权限。';
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  /* ---------- 导航（mkdocs.yml nav）处理 ---------- */
  function splitLines(text) { return String(text).replace(/\r\n/g, '\n').split('\n'); }

  function navRange(lines) {
    var start = -1;
    for (var i = 0; i < lines.length; i++) {
      if (/^nav:\s*$/.test(lines[i]) || /^nav:\s*#/.test(lines[i])) { start = i; break; }
    }
    if (start < 0) return null;
    var end = lines.length;
    for (var j = start + 1; j < lines.length; j++) {
      var line = lines[j];
      if (line.trim() === '') continue;
      if (/^\S/.test(line) && !/^\s*-\s/.test(line)) { end = j; break; }
    }
    return { start: start, end: end };
  }

  function navIndentLevel(line) {
    var m = /^(\s*)-\s/.exec(line);
    return m ? m[1].length : -1;
  }

  function navTitlePath(line) {
    var m = /^\s*-\s*([^:]+):\s*(.+?)\s*$/.exec(line);
    if (!m) return null;
    return { title: m[1].trim(), path: m[2].trim() };
  }

  function insertTopNav(lines, title, path) {
    var range = navRange(lines);
    if (!range) throw new Error('mkdocs.yml 里没有找到 nav 段');
    var lastTop = range.start;
    for (var i = range.start + 1; i < range.end; i++) {
      if (navIndentLevel(lines[i]) === 2) lastTop = i;
    }
    lines.splice(lastTop + 1, 0, '  - ' + title + ': ' + path);
    return lines;
  }

  function insertChildNav(lines, anchorTitle, title, path) {
    var range = navRange(lines);
    if (!range) throw new Error('mkdocs.yml 里没有找到 nav 段');
    var anchor = -1;
    for (var i = range.start + 1; i < range.end; i++) {
      if (navIndentLevel(lines[i]) !== 2) continue;
      var tp = navTitlePath(lines[i]);
      if (tp && tp.title === anchorTitle) { anchor = i; break; }
    }
    if (anchor < 0) throw new Error('mkdocs.yml 里没有找到「' + anchorTitle + '」栏目');
    var lastChild = anchor;
    for (var j = anchor + 1; j < range.end; j++) {
      if (navIndentLevel(lines[j]) === 4) lastChild = j;
      else if (navIndentLevel(lines[j]) === 2) break;
    }
    lines.splice(lastChild + 1, 0, '    - ' + title + ': ' + path);
    return lines;
  }

  function removeNavByPath(lines, path) {
    for (var i = lines.length - 1; i >= 0; i--) {
      var tp = navTitlePath(lines[i]);
      if (tp && tp.path === path) { lines.splice(i, 1); return lines; }
    }
    return lines;
  }

  function joinLines(lines) { return lines.join('\n'); }

  /* ---------- GitHub 读写 ---------- */
  function getFile(path) {
    return api('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURI(path) + '?ref=' + BRANCH)
      .then(function (data) {
        return { content: b64decodeUtf8(data.content), sha: data.sha, path: data.path };
      });
  }

  function putFile(path, text, message, sha) {
    var body = { message: message, content: b64encodeUtf8(text), branch: BRANCH };
    if (sha) body.sha = sha;
    return api('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURI(path), { method: 'PUT', body: body });
  }

  function deleteFile(path, message, sha) {
    return api('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURI(path), {
      method: 'DELETE', body: { message: message, sha: sha, branch: BRANCH }
    });
  }

  function listMarkdown() {
    return api('/repos/' + OWNER + '/' + REPO + '/git/trees/' + BRANCH + '?recursive=1').then(function (data) {
      var out = [];
      (data.tree || []).forEach(function (node) {
        if (node.type !== 'blob') return;
        if (node.path.indexOf('docs/') !== 0) return;
        if (!/\.md$/.test(node.path)) return;
        if (node.path.indexOf('docs/assets/') === 0) return;
        out.push(node.path);
      });
      out.sort();
      return out;
    });
  }

  function navTitleFor(navLines, path) {
    for (var i = 0; i < navLines.length; i++) {
      var tp = navTitlePath(navLines[i]);
      if (tp && tp.path === path) return tp.title;
    }
    return '';
  }

  /* ---------- UI ---------- */
  var statusEl, panelEl, fabEl;

  function status(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'zsa-status' + (kind ? ' zsa-' + kind : '');
    statusEl.style.display = msg ? 'block' : 'none';
  }

  function buildPanel() {
    var wrap = document.createElement('div');
    wrap.id = 'zsa-root';
    wrap.innerHTML =
      '<button id="zsa-fab" type="button" title="站点管理">⚙<span>管理</span></button>' +
      '<div id="zsa-panel" aria-hidden="true">' +
      '  <div class="zsa-head"><strong>站点管理（点按钮即可发布）</strong>' +
      '    <button id="zsa-close" type="button" title="关闭">✕</button></div>' +
      '  <div id="zsa-status" class="zsa-status"></div>' +
      '  <div class="zsa-sec">' +
      '    <div class="zsa-sec-title">① GitHub 令牌</div>' +
      '    <div class="zsa-note">只在首次使用时粘贴一次；仅保存在本浏览器。需勾选本仓库 Contents: Read and write。</div>' +
      '    <input id="zsa-token" type="password" placeholder="github_pat_..." autocomplete="off">' +
      '    <div class="zsa-row"><button id="zsa-token-save" type="button">保存令牌</button>' +
      '      <button id="zsa-token-test" type="button">测试连接</button>' +
      '      <button id="zsa-token-clear" type="button" class="zsa-danger">清除</button></div>' +
      '  </div>' +
      '  <div class="zsa-sec">' +
      '    <div class="zsa-sec-title">② 新建页面</div>' +
      '    <input id="zsa-title" type="text" placeholder="页面标题（如：实验室）">' +
      '    <input id="zsa-slug" type="text" placeholder="英文路径（如 lab，仅小写字母/数字/-）">' +
      '    <select id="zsa-pos">' +
      '      <option value="top">与「闲杂」同级（新栏目）</option>' +
      '      <option value="course">放进「闲杂」里（子页面）</option>' +
      '    </select>' +
      '    <textarea id="zsa-new-body" rows="4" placeholder="正文（可留空，之后再用编辑器写）"></textarea>' +
      '    <button id="zsa-create" type="button" class="zsa-primary">创建并发布</button>' +
      '  </div>' +
      '  <div class="zsa-sec">' +
      '    <div class="zsa-sec-title">③ 页面列表（编辑 / 删除）</div>' +
      '    <div class="zsa-row"><button id="zsa-refresh" type="button">刷新列表</button></div>' +
      '    <div id="zsa-list" class="zsa-list"></div>' +
      '  </div>' +
      '  <div class="zsa-sec" id="zsa-edit-sec" style="display:none">' +
      '    <div class="zsa-sec-title">编辑正文：<span id="zsa-edit-path"></span></div>' +
      '    <textarea id="zsa-edit-body" rows="10"></textarea>' +
      '    <div class="zsa-row"><button id="zsa-save-body" type="button" class="zsa-primary">保存并发布</button>' +
      '      <button id="zsa-cancel-edit" type="button">取消</button></div>' +
      '  </div>' +
      '  <div class="zsa-foot">提交后 GitHub Actions 约 1–2 分钟自动重新部署。</div>' +
      '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  function renderList(files, navLines) {
    var list = qs('#zsa-list');
    list.innerHTML = '';
    if (!files.length) { list.innerHTML = '<div class="zsa-note">没有找到页面</div>'; return; }
    files.forEach(function (path) {
      var title = navTitleFor(navLines, path);
      var row = document.createElement('div');
      row.className = 'zsa-item';
      row.innerHTML = '<div class="zsa-item-info"><div class="zsa-item-title">' + esc(title || '(未在导航中)') + '</div>' +
        '<div class="zsa-item-path">' + esc(path) + '</div></div>' +
        '<div class="zsa-item-btns"><button type="button" data-act="edit">编辑</button>' +
        '<button type="button" data-act="del" class="zsa-danger">删除</button></div>';
      row.querySelector('[data-act="edit"]').addEventListener('click', function () { startEdit(path); });
      row.querySelector('[data-act="del"]').addEventListener('click', function () { removePage(path, title); });
      list.appendChild(row);
    });
  }

  var currentNavLines = [];

  function loadList() {
    status('正在读取页面列表…');
    return Promise.all([listMarkdown(), getFile('mkdocs.yml')]).then(function (res) {
      currentNavLines = splitLines(res[1].content);
      renderList(res[0], currentNavLines);
      status('已连接仓库，共 ' + res[0].length + ' 个页面。');
    }).catch(function (err) { status(err.message, 'error'); });
  }

  function validateSlug(slug) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('英文路径只能用小写字母、数字和 -（例如 lab 或 my-lab）');
  }

  function createPage() {
    var title = (qs('#zsa-title').value || '').trim();
    var slug = (qs('#zsa-slug').value || '').trim().toLowerCase();
    var pos = qs('#zsa-pos').value;
    var body = qs('#zsa-new-body').value;
    if (!title) { status('请填写页面标题', 'error'); return; }
    try { validateSlug(slug); } catch (e) { status(e.message, 'error'); return; }
    var isTop = pos === 'top';
    var pagePath = isTop ? ('docs/' + slug + '/index.md') : ('docs/' + COURSE_DIR + '/' + slug + '.md');
    var navPath = isTop ? (slug + '/index.md') : (COURSE_DIR + '/' + slug + '.md');
    var content = body && body.trim() ? body : ('# ' + title + '\n\n（在这里写内容）\n');
    status('正在创建页面…');
    getFile('mkdocs.yml').then(function (navFile) {
      var lines = splitLines(navFile.content);
      var exists = false;
      for (var i = 0; i < lines.length; i++) {
        var tp = navTitlePath(lines[i]);
        if (tp && tp.path === navPath) { exists = true; break; }
      }
      if (exists) throw new Error('导航里已存在 ' + navPath + '，换一个英文路径');
      if (isTop) insertTopNav(lines, title, navPath);
      else insertChildNav(lines, NAV_ANCHOR, title, navPath);
      return putFile(pagePath, content, '新增页面：' + title).then(function () {
        return putFile('mkdocs.yml', joinLines(lines), '新增导航：' + title, navFile.sha);
      });
    }).then(function () {
      status('✅ 已创建「' + title + '」，约 1–2 分钟后自动上线。', 'ok');
      qs('#zsa-title').value = ''; qs('#zsa-slug').value = ''; qs('#zsa-new-body').value = '';
      loadList();
    }).catch(function (err) { status(err.message, 'error'); });
  }

  function removePage(path, title) {
    if (!window.confirm('确定要删除页面吗？\n' + path)) return;
    if (!window.confirm('⚠️ 删除后无法恢复（没有回收站）。\n真的要彻底删除「' + (title || path) + '」吗？')) return;
    status('正在删除…');
    getFile(path).then(function (file) {
      return deleteFile(path, '删除页面：' + (title || path), file.sha);
    }).then(function () {
      return getFile('mkdocs.yml');
    }).then(function (navFile) {
      var lines = removeNavByPath(splitLines(navFile.content), navRelPath(path));
      return putFile('mkdocs.yml', joinLines(lines), '删除导航：' + (title || path), navFile.sha);
    }).then(function () {
      status('✅ 已删除「' + (title || path) + '」，约 1–2 分钟后自动上线。', 'ok');
      loadList();
    }).catch(function (err) { status(err.message, 'error'); });
  }

  function navRelPath(docsPath) { return String(docsPath).replace(/^docs\//, ''); }

  function startEdit(path) {
    status('正在读取正文…');
    getFile(path).then(function (file) {
      qs('#zsa-edit-sec').style.display = 'block';
      qs('#zsa-edit-path').textContent = path;
      qs('#zsa-edit-body').value = file.content;
      qs('#zsa-edit-sec').setAttribute('data-sha', file.sha);
      qs('#zsa-edit-sec').setAttribute('data-path', path);
      status('已载入 ' + path);
      qs('#zsa-edit-sec').scrollIntoView({ behavior: 'smooth' });
    }).catch(function (err) { status(err.message, 'error'); });
  }

  function saveBody() {
    var sec = qs('#zsa-edit-sec');
    var path = sec.getAttribute('data-path');
    var sha = sec.getAttribute('data-sha');
    var body = qs('#zsa-edit-body').value;
    status('正在保存…');
    putFile(path, body, '编辑正文：' + path, sha).then(function () {
      status('✅ 已保存 ' + path + '，约 1–2 分钟后自动上线。', 'ok');
      startEdit(path);
    }).catch(function (err) { status(err.message, 'error'); });
  }

  function bind() {
    qs('#zsa-token').value = token();
    qs('#zsa-fab').addEventListener('click', function () {
      var panel = qs('#zsa-panel');
      var open = panel.getAttribute('aria-hidden') === 'false';
      panel.setAttribute('aria-hidden', open ? 'true' : 'false');
      if (!open && token()) loadList();
    });
    qs('#zsa-close').addEventListener('click', function () { qs('#zsa-panel').setAttribute('aria-hidden', 'true'); });
    qs('#zsa-token-save').addEventListener('click', function () {
      var v = (qs('#zsa-token').value || '').trim();
      if (!v) { status('请粘贴令牌', 'error'); return; }
      setToken(v);
      status('令牌已保存到本浏览器', 'ok');
      loadList();
    });
    qs('#zsa-token-clear').addEventListener('click', function () {
      setToken('');
      qs('#zsa-token').value = '';
      status('已清除本浏览器保存的令牌');
      qs('#zsa-list').innerHTML = '';
    });
    qs('#zsa-token-test').addEventListener('click', function () {
      var v = (qs('#zsa-token').value || '').trim();
      if (v) setToken(v);
      status('正在测试…');
      Promise.all([api('/repos/' + OWNER + '/' + REPO), getFile('mkdocs.yml')]).then(function () {
        status('✅ 连接正常、可读取仓库（写入权限会在第一次保存时验证）', 'ok');
        loadList();
      }).catch(function (err) { status(err.message, 'error'); });
    });
    qs('#zsa-create').addEventListener('click', createPage);
    qs('#zsa-refresh').addEventListener('click', loadList);
    qs('#zsa-save-body').addEventListener('click', saveBody);
    qs('#zsa-cancel-edit').addEventListener('click', function () { qs('#zsa-edit-sec').style.display = 'none'; });
  }

  function init() {
    if (qs('#zsa-root')) return;
    buildPanel();
    statusEl = qs('#zsa-status');
    bind();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
