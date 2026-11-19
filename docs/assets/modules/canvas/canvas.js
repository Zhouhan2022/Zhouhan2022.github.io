/*! 跳波老鱼缸 · 画布模块（独立：删掉本模块不影响全站其他功能） */
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
    var src = root.querySelector('script[type="application/json"]');
    var items;
    try { items = JSON.parse(src && src.textContent ? src.textContent : '[]') || []; }
    catch (e) { console.warn('canvas: JSON 解析失败', e); items = []; }

    var state = { items: items, mode: 'flow', edit: false, zoom: 1, panX: 0, panY: 0, seq: items.length };

    var bar = el('div', 'cv-bar');
    var title = el('span', 'cv-title', root.getAttribute('data-title') || '画布');
    var bFlow = el('button', 'cv-btn', '📄 行文');
    var bCanvas = el('button', 'cv-btn', '🖼 画布');
    var bEdit = el('button', 'cv-btn', '✏️ 编辑模式');
    var bAdd = el('button', 'cv-btn', '＋ 便签');
    var bExport = el('button', 'cv-btn', '⬇ 导出JSON');
    [title, bFlow, bCanvas, bEdit, bAdd, bExport].forEach(function (n) { bar.appendChild(n); });

    var flow = el('div', 'cv-flow');
    var viewport = el('div', 'cv-viewport');
    var world = el('div', 'cv-world');
    viewport.appendChild(world);
    root.appendChild(bar);
    root.appendChild(flow);
    root.appendChild(viewport);

    function applyTransform() {
      world.style.transform = 'translate(' + state.panX + 'px,' + state.panY + 'px) scale(' + state.zoom + ')';
    }

    function render() {
      flow.innerHTML = '';
      if (!state.items.length) flow.appendChild(el('p', 'cv-empty', '（空白画布：点“画布”查看，编辑模式里可＋便签）'));
      state.items.forEach(function (it) {
        var p = el('p', 'cv-flow-item');
        p.appendChild(el('strong', null, firstLine(it.text)));
        var rest = restText(it.text);
        if (rest) p.appendChild(document.createTextNode(' — ' + rest));
        flow.appendChild(p);
      });

      world.innerHTML = '';
      applyTransform();
      state.items.forEach(function (it) {
        var b = el('div', 'cv-block' + (state.edit ? ' cv-editing' : ''));
        b.style.left = (it.x || 0) + 'px';
        b.style.top = (it.y || 0) + 'px';
        b.style.width = (it.w || 160) + 'px';
        var txt = el('div', 'cv-text');
        txt.textContent = it.text || '';
        b.appendChild(txt);
        if (state.edit) {
          var del = el('button', 'cv-del', '×');
          del.title = '删除便签';
          del.addEventListener('click', function (ev) {
            ev.stopPropagation();
            state.items = state.items.filter(function (x) { return x !== it; });
            render();
          });
          b.appendChild(del);
          var rz = el('div', 'cv-resize');
          rz.title = '拖动调整大小';
          rz.addEventListener('pointerdown', function (ev) { startResize(ev, it, b); });
          b.appendChild(rz);
          b.addEventListener('pointerdown', function (ev) {
            if (ev.target === b || ev.target === txt) startDrag(ev, it, b);
          });
          txt.addEventListener('dblclick', function (ev) {
            ev.stopPropagation();
            txt.contentEditable = 'true';
            txt.focus();
            var r = document.createRange();
            r.selectNodeContents(txt);
            var s = window.getSelection();
            s.removeAllRanges(); s.addRange(r);
            txt.addEventListener('blur', function () {
              txt.contentEditable = 'false';
              it.text = txt.textContent;
            }, { once: true });
          });
        }
        world.appendChild(b);
      });
    }

    function startDrag(ev, it, b) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      var sx = ev.clientX, sy = ev.clientY, ix = it.x || 0, iy = it.y || 0;
      function move(e) {
        it.x = Math.round(ix + (e.clientX - sx) / state.zoom);
        it.y = Math.round(iy + (e.clientY - sy) / state.zoom);
        b.style.left = it.x + 'px';
        b.style.top = it.y + 'px';
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    function startResize(ev, it, b) {
      ev.preventDefault();
      ev.stopPropagation();
      var sx = ev.clientX, iw = it.w || 160;
      function move(e) {
        it.w = Math.max(90, Math.round(iw + (e.clientX - sx) / state.zoom));
        b.style.width = it.w + 'px';
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    viewport.addEventListener('pointerdown', function (ev) {
      if (ev.target !== viewport && ev.target !== world) return;
      var sx = ev.clientX, sy = ev.clientY, px = state.panX, py = state.panY;
      function move(e) {
        state.panX = px + (e.clientX - sx);
        state.panY = py + (e.clientY - sy);
        applyTransform();
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
      state.zoom = clamp(state.zoom * (ev.deltaY < 0 ? 1.08 : 0.93), 0.4, 2.5);
      applyTransform();
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
    bEdit.addEventListener('click', function () {
      state.edit = !state.edit;
      bEdit.textContent = state.edit ? '✅ 完成编辑' : '✏️ 编辑模式';
      if (state.edit) setMode('canvas');
      render();
    });
    bAdd.addEventListener('click', function () {
      state.seq += 1;
      state.items.push({ id: 'b' + state.seq, x: 30 + (state.items.length % 3) * 30, y: 30 + (state.items.length % 4) * 24, w: 160, text: '新便签' });
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
