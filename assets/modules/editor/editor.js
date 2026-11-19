/*! 跳波老鱼缸 · 站内 Markdown 编辑器（独立模块：删掉本模块不影响文章阅读） */
(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function rawCandidates() {
    var p = location.pathname;
    p = p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    var base = p.replace(/\/+$/, '');
    if (!base) return ['/raw/index.md'];
    return ['/raw' + base + '.md', '/raw' + base + '/index.md'];
  }

  function fetchRaw() {
    var cands = rawCandidates();
    return new Promise(function (resolve, reject) {
      var i = 0;
      function next() {
        if (i >= cands.length) return reject(new Error('找不到本页原文'));
        var cand = cands[i++];
        fetch(cand).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text().then(function (t) { resolve({ text: t, path: cand }); });
        }).catch(next);
      }
      next();
    });
  }

  function mdToHtml(src) {
    var lines = src.replace(/\r\n/g, '\n').split('\n');
    var out = [];
    var i = 0;
    function inline(t) {
      t = esc(t);
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%">');
      t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, text, url) {
        if (/^(javascript|data):/i.test(url)) return text;
        return '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>';
      });
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      return t;
    }
    while (i < lines.length) {
      var l = lines[i];
      if (/^```/.test(l)) {
        i++;
        var buf = [];
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }
      if (/^#{1,6}\s/.test(l)) {
        var m = l.match(/^(#{1,6})\s+(.*)/);
        out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>');
        i++;
        continue;
      }
      if (/^\s*---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(l)) {
        var b = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) b.push(lines[i++].replace(/^>\s?/, ''));
        out.push('<blockquote>' + b.map(inline).join('<br>') + '</blockquote>');
        continue;
      }
      if (/^\s*[-*]\s+/.test(l)) {
        var items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(inline(lines[i++].replace(/^\s*[-*]\s+/, '')));
        out.push('<ul>' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>');
        continue;
      }
      if (/^\s*\d+\.\s+/.test(l)) {
        var its = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) its.push(inline(lines[i++].replace(/^\s*\d+\.\s+/, '')));
        out.push('<ol>' + its.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>');
        continue;
      }
      if (/^\s*$/.test(l)) { i++; continue; }
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|>|\s*[-*]\s|\s*\d+\.\s|---)/.test(lines[i])) para.push(lines[i++]);
      out.push('<p>' + inline(para.join(' ')) + '</p>');
    }
    return out.join('\n');
  }

  var ui = null;

  function ensureUI() {
    if (ui) return ui;
    var overlay = document.createElement('div');
    overlay.className = 'mde-overlay';
    overlay.style.display = 'none';

    var panel = document.createElement('div');
    panel.className = 'mde-panel';

    var head = document.createElement('div');
    head.className = 'mde-head';
    var title = document.createElement('span');
    title.className = 'mde-title';
    title.textContent = '站内编辑 · Markdown';
    var status = document.createElement('span');
    status.className = 'mde-status';

    function btn(label, titleText) {
      var b = document.createElement('button');
      b.className = 'mde-btn';
      b.textContent = label;
      if (titleText) b.title = titleText;
      return b;
    }

    var bPreview = btn('👁 预览：关', '开关预览（默认关闭，打开才实时渲染）');
    var bCopy = btn('📋 复制');
    var bDownload = btn('⬇ 下载');
    var bGithub = btn('↗ GitHub 编辑页');
    var bReload = btn('↻ 重新加载原文');
    var bClose = btn('✕ 关闭');

    [title, status, bPreview, bCopy, bDownload, bGithub, bReload, bClose].forEach(function (n) { head.appendChild(n); });

    var body = document.createElement('div');
    body.className = 'mde-body';
    var ta = document.createElement('textarea');
    ta.className = 'mde-ta';
    ta.spellcheck = false;
    var pv = document.createElement('div');
    pv.className = 'mde-preview';
    pv.style.display = 'none';
    body.appendChild(ta);
    body.appendChild(pv);

    panel.appendChild(head);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var previewOn = false;
    var rawPath = '';
    var githubHref = '';

    function setStatus(t) { status.textContent = t; }

    function renderPreview() {
      if (previewOn) {
        pv.innerHTML = mdToHtml(ta.value);
      }
    }

    bPreview.addEventListener('click', function () {
      previewOn = !previewOn;
      bPreview.textContent = previewOn ? '👁 预览：开' : '👁 预览：关';
      pv.style.display = previewOn ? '' : 'none';
      if (previewOn) renderPreview();
    });

    ta.addEventListener('input', renderPreview);

    function load() {
      setStatus('加载中…');
      fetchRaw().then(function (res) {
        ta.value = res.text;
        rawPath = res.path;
        var docsPath = rawPath.replace(/^\/raw\//, '');
        githubHref = 'https://github.com/Zhouhan2022/Zhouhan2022.github.io/edit/main/docs/' + docsPath;
        var pencil = document.querySelector('a[rel="edit"]');
        if (pencil && pencil.href) githubHref = pencil.href;
        setStatus('已加载 ' + docsPath);
        renderPreview();
      }).catch(function (e) {
        setStatus('加载失败：' + e.message);
        ta.value = '';
      });
    }

    bCopy.addEventListener('click', function () {
      var done = function () { setStatus('已复制到剪贴板，去 GitHub 粘贴提交'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(done, function () { fallbackCopy(); done(); });
      } else {
        fallbackCopy();
        done();
      }
    });
    function fallbackCopy() {
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    }

    bDownload.addEventListener('click', function () {
      var blob = new Blob([ta.value], { type: 'text/markdown' });
      var a = document.createElement('a');
      var name = rawPath ? rawPath.split('/').pop() : 'page.md';
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      setStatus('已下载 ' + name);
    });

    bGithub.addEventListener('click', function () {
      if (githubHref) window.open(githubHref, '_blank', 'noopener');
    });

    bReload.addEventListener('click', load);

    bClose.addEventListener('click', function () {
      overlay.style.display = 'none';
    });
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) overlay.style.display = 'none';
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && overlay.style.display !== 'none') overlay.style.display = 'none';
    });

    ui = { overlay: overlay, ta: ta, load: load };
    return ui;
  }

  function openPanel() {
    var u = ensureUI();
    u.overlay.style.display = 'flex';
    u.load();
  }

  function injectButton() {
    if (document.querySelector('.mde-open')) return;
    var btn = document.createElement('button');
    btn.className = 'mde-open';
    btn.title = '站内编辑本页 Markdown';
    btn.textContent = '✏️ 站内编辑';
    btn.addEventListener('click', openPanel);
    var pencil = document.querySelector('a[rel="edit"]');
    if (pencil && pencil.parentNode) {
      pencil.parentNode.insertBefore(btn, pencil.nextSibling);
    } else {
      var article = document.querySelector('.md-content__inner');
      var h1 = article ? article.querySelector('h1') : null;
      if (h1) h1.insertAdjacentElement('afterend', btn);
      else if (article) article.prepend(btn);
      else {
        btn.classList.add('mde-float');
        document.body.appendChild(btn);
      }
    }
  }

  function boot() { injectButton(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
