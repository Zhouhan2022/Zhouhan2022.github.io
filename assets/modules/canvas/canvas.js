/*! 跳波老鱼缸 · 画布模块 v2（页面式：像一张纸/PDF，可自由摆放文字与图片） */
(function () {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function firstLine(s) { return (s || '').split('\n')[0]; }
  function restText(s) { return (s || '').split('\n').slice(1).join(' '); }

  function initEmbed(root) {
    var srcEl = root.querySelector('script[type="application/json"]');
    var items;
    try { items = JSON.parse(srcEl && srcEl.textContent ? srcEl.textContent : '[]') || []; }
    catch (e) { console.warn('canvas: JSON 解析失败', e); items = []; }

    var state = { items: items, mode: 'flow', edit: false, zoom: 0.5, panX: 30, panY: 20, seq: items.length };

    var bar = el('div', 'cv-bar');
    var title = el('span', 'cv-title', root.getAttribute('data-title') || '画布');
    var bFlow = el('button', 'cv-btn', '📄 行文');
    var bCanvas = el('button', 'cv-btn', '🖼 画布');
    var bSort = el('button', 'cv-btn', '📍 按位置排序');
    var bEdit = el('button', 'cv-btn', '✏️ 编辑模式');
    var bAddText = el('button', 'cv-btn', '＋文字');
    var bAddImg = el('button', 'cv-btn', '＋图片');
    var bExport = el('button', 'cv-btn', '⬇ 导出JSON');
    [title, bFlow, bCanvas, bSort, bEdit, bAddText, bAddImg, bExport].forEach(function (n) { bar.appendChild(n); });

    var flow = el('div', 'cv-flow');
    var viewport = el('div', 'cv-viewport');
    var page = el('div', 'cv-page');
    viewport.appendChild(page);
    root.appendChild(bar);
    root.appendChild(flow);
    root.appendChild(viewport);

    function applyView() {
      page.style.transform = 'translate(' + state.panX + 'px,' + state.panY + 'px) scale(' + state.zoom + ')';
    }

    function render() {
      // 行文视图
      flow.innerHTML = '';
      if (!state.items.length) flow.appendChild(el('p', 'cv-empty', '（空白页：点“画布”查看，编辑模式里可加文字/图片）'));
      state.items.forEach(function (it) {
        var p = el('p', 'cv-flow-item');
        if (it.type === 'image') {
          p.appendChild(el('strong', null, '🖼 图片'));
          if (it.src) p.appendChild(document.createTextNode(' — ' + it.src));
        } else {
          p.appendChild(el('strong', null, firstLine(it.text)));
          var rest = restText(it.text);
          if (rest) p.appendChild(document.createTextNode(' — ' + rest));
        }
        flow.appendChild(p);
      });

      // 画布页
      page.innerHTML = '';
      applyView();
      state.items.forEach(function (it) {
        var node = el('div', 'cv-el');
        var content;
        if (it.type === 'image') {
          content = el('img', 'cv-img');
          content.src = it.src || '';
          content.alt = '';
          content.draggable = false;
          node.appendChild(content);
        } else {
          content = el('div', 'cv-txt');
          content.textContent = it.text || '';
          if (it.box) node.classList.add('cv-boxed');
          content.style.fontSize = (Math.max(0.6, Number(it.scale) || 1) * 14) + 'px';
          node.appendChild(content);
        }
        node.style.left = (it.x || 0) + 'px';
        node.style.top = (it.y || 0) + 'px';
        node.style.width = (it.w || (it.type === 'image' ? 180 : 240)) + 'px';

        if (state.edit) {
          node.classList.add('cv-editing');
          var del = el('button', 'cv-del', '×');
          del.title = '删除';
          del.addEventListener('click', function (ev) {
            ev.stopPropagation();
            state.items = state.items.filter(function (x) { return x !== it; });
            render();
          });
          node.appendChild(del);
          var rz = el('div', 'cv-resize');
          rz.title = '拖动调整大小';
          rz.addEventListener('pointerdown', function (ev) { startResize(ev, it, node); });
          node.appendChild(rz);
          node.addEventListener('pointerdown', function (ev) {
            if (content.isContentEditable) return;
            if (ev.target === node || ev.target === content) startDrag(ev, it, node);
          });
          if (it.type !== 'image') {
            content.addEventListener('dblclick', function (ev) {
              ev.stopPropagation();
              content.contentEditable = 'true';
              content.focus();
              var r = document.createRange();
              r.selectNodeContents(content);
              var s = window.getSelection();
              s.removeAllRanges(); s.addRange(r);
              content.addEventListener('blur', function () {
                content.contentEditable = 'false';
                it.text = content.textContent;
              }, { once: true });
            });
          }
        }
        page.appendChild(node);
      });
    }

    function startDrag(ev, it, node) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      var sx = ev.clientX, sy = ev.clientY, ix = it.x || 0, iy = it.y || 0;
      function move(e) {
        it.x = Math.round(ix + (e.clientX - sx) / state.zoom);
        it.y = Math.round(iy + (e.clientY - sy) / state.zoom);
        node.style.left = it.x + 'px';
        node.style.top = it.y + 'px';
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    function startResize(ev, it, node) {
      ev.preventDefault();
      ev.stopPropagation();
      var sx = ev.clientX, iw = it.w || (it.type === 'image' ? 180 : 240);
      function move(e) {
        it.w = Math.max(60, Math.round(iw + (e.clientX - sx) / state.zoom));
        node.style.width = it.w + 'px';
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    viewport.addEventListener('pointerdown', function (ev) {
      if (ev.target !== viewport && ev.target !== page) return;
      var sx = ev.clientX, sy = ev.clientY, px = state.panX, py = state.panY;
      function move(e) {
        state.panX = px + (e.clientX - sx);
        state.panY = py + (e.clientY - sy);
        applyView();
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    viewport.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      state.zoom = clamp(state.zoom * (ev.deltaY < 0 ? 1.08 : 0.93), 0.25, 1.6);
      applyView();
    }, { passive: false });

    function setMode(mode) {
      state.mode = mode;
      flow.style.display = mode === 'flow' ? '' : 'none';
      viewport.style.display = mode === 'canvas' ? '' : 'none';
      bFlow.disabled = mode === 'flow';
      bCanvas.disabled = mode === 'canvas';
    }

    bFlow.addEventListener('click', function () { setMode('flow'); });
    bCanvas.addEventListener('click', function () { setMode('canvas'); });
    bSort.addEventListener('click', function () {
      state.items.sort(function (a, b) {
        return (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0);
      });
      render();
    });
    bEdit.addEventListener('click', function () {
      state.edit = !state.edit;
      bEdit.textContent = state.edit ? '✅ 完成编辑' : '✏️ 编辑模式';
      if (state.edit) setMode('canvas');
      render();
    });
    bAddText.addEventListener('click', function () {
      state.seq += 1;
      state.items.push({ type: 'text', x: 60 + (state.items.length % 3) * 40, y: 60 + (state.items.length % 4) * 30, w: 240, scale: 1, text: '新文字' });
      state.edit = true;
      bEdit.textContent = '✅ 完成编辑';
      setMode('canvas');
      render();
    });
    bAddImg.addEventListener('click', function () {
      var url = window.prompt('图片地址（例如 ../assets/images/favicon.png 或 https://...）');
      if (!url) return;
      state.seq += 1;
      state.items.push({ type: 'image', src: url, x: 60 + (state.items.length % 3) * 40, y: 60 + (state.items.length % 4) * 30, w: 180 });
      state.edit = true;
      bEdit.textContent = '✅ 完成编辑';
      setMode('canvas');
      render();
    });
    bExport.addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(state.items, null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'canvas-data.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });

    setMode('flow');
    render();
  }

  function boot() {
    var nodes = document.querySelectorAll('.canvas-embed');
    Array.prototype.forEach.call(nodes, initEmbed);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
