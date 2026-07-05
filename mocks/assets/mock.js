/* ============================================================
   excabit v2 — mock.js
   Interacción SIMULADA del mock (sin lógica real):
   drag de nodos, zoom/pan, tooltips, panel, palette, atajos.
   ============================================================ */
(() => {
  'use strict';

  const svg   = document.getElementById('graph');
  const world = document.getElementById('world');

  /* ---------- datos de ejemplo (tx real del bloque 300.000) ---------- */
  const NODE_INFO = {
    root:     { id: '85e72c08…4b70f2', rows: [['Tipo', 'Transacción (raíz)'], ['Importe', '533.9998 BTC'], ['Fee', '10 000 sats · 26,7 sat/vB'], ['I/O', '2 entradas · 2 salidas'], ['Score', '52 / 100 ⚠']] },
    ptx1:     { id: '12d3b2c6…f1ac',   rows: [['Tipo', 'Tx anterior (colapsada)'], ['Aporta', '456.0 BTC']], hint: 'doble click para expandir' },
    ptx2:     { id: 'ae66178f…d471',   rows: [['Tipo', 'Tx anterior (colapsada)'], ['Aporta', '77.9999 BTC']], hint: 'doble click para expandir' },
    addrIn1:  { id: '122BNo…gNKt',     rows: [['Tipo', 'Dirección p2pkh (entrada)'], ['Valor', '456.0 BTC'], ['⚠', 'Reutilizada como cambio']] },
    addrIn2:  { id: '122BNo…gNKt',     rows: [['Tipo', 'Dirección p2pkh (entrada)'], ['Valor', '77.9999 BTC'], ['⚠', 'Reutilizada como cambio']] },
    addrOut1: { id: '14o7zM…WF86',     rows: [['Tipo', 'Dirección p2pkh (salida #1)'], ['Valor', '500.0 BTC'], ['Análisis', 'pago probable (redondo)']] },
    addrOut2: { id: '122BNo…gNKt',     rows: [['Tipo', 'Dirección p2pkh (salida #2)'], ['Valor', '33.9998 BTC'], ['Análisis', 'cambio (3 heurísticas)']] },
    ntx1:     { id: 'b7f04a…21c9',     rows: [['Tipo', 'Tx siguiente (colapsada)'], ['Gasta', '500.0 BTC']], hint: 'doble click para expandir' },
    utxo1:    { id: 'UTXO',            rows: [['Tipo', 'Salida sin gastar'], ['Valor', '33.9998 BTC']] },
  };

  /* ---------- posiciones de nodos (fuente de verdad del mock) ---------- */
  const pos = {};
  document.querySelectorAll('.node').forEach(n => {
    const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(n.getAttribute('transform'));
    pos[n.dataset.id] = { x: +m[1], y: +m[2], el: n };
  });

  /* ---------- aristas: curvas bezier entre centros ---------- */
  const edges = [...document.querySelectorAll('.edge')];
  function routeEdges() {
    for (const e of edges) {
      const a = pos[e.dataset.from], b = pos[e.dataset.to];
      const dx = Math.max(40, Math.abs(b.x - a.x) * 0.45);
      e.setAttribute('d', `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`);
    }
    renderMinimap();
  }

  /* ---------- viewport (zoom + pan) ---------- */
  const view = { s: 1, tx: 0, ty: 0 };
  const stZoom = document.getElementById('stZoom');
  function applyView() {
    world.setAttribute('transform', `translate(${view.tx},${view.ty}) scale(${view.s})`);
    stZoom.textContent = `zoom ${Math.round(view.s * 100)}%`;
    renderMinimap();
  }
  function zoomAt(factor, cx, cy) {
    const ns = Math.min(3, Math.max(0.3, view.s * factor));
    const k = ns / view.s;
    // mantener el punto (cx,cy) del mundo bajo el cursor
    view.tx = cx - k * (cx - view.tx);
    view.ty = cy - k * (cy - view.ty);
    view.s = ns;
    applyView();
  }
  function clientToViewBox(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());  // coords del viewBox (pre-world)
  }
  function clientToWorld(evt) {
    const p = clientToViewBox(evt);
    return { x: (p.x - view.tx) / view.s, y: (p.y - view.ty) / view.s };
  }

  svg.addEventListener('wheel', evt => {
    evt.preventDefault();
    const p = clientToViewBox(evt);
    zoomAt(evt.deltaY < 0 ? 1.12 : 0.89, p.x, p.y);
  }, { passive: false });

  document.getElementById('zoomIn').onclick  = () => zoomAt(1.2, 600, 350);
  document.getElementById('zoomOut').onclick = () => zoomAt(0.83, 600, 350);
  const fit = () => { view.s = 1; view.tx = 0; view.ty = 0; applyView(); };
  document.getElementById('zoomFit').onclick = fit;
  document.getElementById('btnFit').onclick  = fit;

  /* ---------- drag de nodos + pan de fondo ---------- */
  let drag = null; // {kind:'node'|'pan', ...}
  svg.addEventListener('pointerdown', evt => {
    const nodeEl = evt.target.closest('.node');
    if (nodeEl) {
      const w = clientToWorld(evt);
      const p = pos[nodeEl.dataset.id];
      drag = { kind: 'node', id: nodeEl.dataset.id, offX: w.x - p.x, offY: w.y - p.y };
      selectNode(nodeEl);
    } else {
      const p = clientToViewBox(evt);
      drag = { kind: 'pan', startX: p.x - view.tx, startY: p.y - view.ty };
    }
    svg.setPointerCapture(evt.pointerId);
  });
  svg.addEventListener('pointermove', evt => {
    if (!drag) { hoverTooltip(evt); return; }
    hideTooltip();
    if (drag.kind === 'node') {
      const w = clientToWorld(evt);
      const p = pos[drag.id];
      p.x = w.x - drag.offX; p.y = w.y - drag.offY;
      p.el.setAttribute('transform', `translate(${p.x},${p.y})`);
      routeEdges();
    } else {
      const p = clientToViewBox(evt);
      view.tx = p.x - drag.startX; view.ty = p.y - drag.startY;
      applyView();
    }
  });
  svg.addEventListener('pointerup', () => { drag = null; });

  /* ---------- selección ---------- */
  function selectNode(el) {
    document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
    el.classList.add('selected');
  }

  /* doble click = expandir (simulado) */
  svg.addEventListener('dblclick', evt => {
    const nodeEl = evt.target.closest('.node');
    if (nodeEl && NODE_INFO[nodeEl.dataset.id]?.hint) {
      toast(`Mock: aquí se expandiría ${NODE_INFO[nodeEl.dataset.id].id} (RF-06) descargando sus vecinos.`);
    }
  });

  /* ---------- tooltip de nodos ---------- */
  const tt = document.getElementById('nodeTooltip');
  let ttFor = null;
  function hoverTooltip(evt) {
    const nodeEl = evt.target.closest('.node');
    if (!nodeEl) { hideTooltip(); return; }
    const info = NODE_INFO[nodeEl.dataset.id];
    if (!info) return;
    if (ttFor !== nodeEl.dataset.id) {
      ttFor = nodeEl.dataset.id;
      tt.innerHTML = `<div class="tt-id">${info.id}</div>` +
        info.rows.map(r => `<div class="tt-row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('') +
        (info.hint ? `<div class="tt-hint">${info.hint}</div>` : '');
    }
    tt.style.left = Math.min(window.innerWidth - 260, evt.clientX + 16) + 'px';
    tt.style.top  = Math.min(window.innerHeight - 160, evt.clientY + 14) + 'px';
    tt.classList.add('show');
  }
  function hideTooltip() { tt.classList.remove('show'); ttFor = null; }

  /* ---------- minimapa ---------- */
  const mini = document.getElementById('minimapSvg');
  function renderMinimap() {
    let s = '';
    for (const e of edges) {
      const a = pos[e.dataset.from], b = pos[e.dataset.to];
      s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#3a424d" stroke-width="4"/>`;
    }
    for (const id in pos) {
      const p = pos[id];
      const c = id === 'root' ? '#f7931a' : (id.startsWith('addr') ? '#8b949e' : (id === 'utxo1' ? '#58a6ff' : '#c9d1d9'));
      s += `<rect x="${p.x - 22}" y="${p.y - 14}" width="44" height="28" rx="7" fill="${c}"/>`;
    }
    // rectángulo del viewport actual (área del viewBox visible en coords de mundo)
    const vx = -view.tx / view.s, vy = -view.ty / view.s, vw = 1200 / view.s, vh = 700 / view.s;
    s += `<rect class="viewport-rect" x="${vx}" y="${vy}" width="${vw}" height="${vh}"/>`;
    mini.innerHTML = s;
  }

  /* ---------- pestañas del panel ---------- */
  document.querySelectorAll('.panel-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.panel-tabs button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  /* ---------- copy txid ---------- */
  document.getElementById('copyTxid').addEventListener('click', () => {
    const full = '85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2';
    (navigator.clipboard?.writeText(full) || Promise.reject()).then(
      () => toast('txid copiado al portapapeles'),
      () => toast('txid: ' + full)
    );
  });

  /* ---------- command palette ---------- */
  const palOverlay = document.getElementById('paletteOverlay');
  const palInput   = document.getElementById('paletteInput');
  const palItems   = [...document.querySelectorAll('#paletteList li')];
  const palEmpty   = document.getElementById('paletteEmpty');
  let palSel = 0;

  function openPalette() { palOverlay.classList.add('open'); palInput.value = ''; filterPalette(); palInput.focus(); }
  function closeOverlays() {
    palOverlay.classList.remove('open');
    scOverlay.classList.remove('open');
    palInput.blur();   // devolver los atajos globales al cerrar
  }
  function filterPalette() {
    const q = palInput.value.trim().toLowerCase();
    let visible = [];
    palItems.forEach(li => {
      const show = !q || li.dataset.act.toLowerCase().includes(q) || li.textContent.toLowerCase().includes(q);
      li.classList.toggle('hidden', !show);
      if (show) visible.push(li);
    });
    palEmpty.style.display = visible.length ? 'none' : 'block';
    palSel = 0;
    palItems.forEach(li => li.classList.remove('sel'));
    if (visible[0]) visible[0].classList.add('sel');
  }
  function paletteVisible() { return palItems.filter(li => !li.classList.contains('hidden')); }
  function movePalSel(d) {
    const vis = paletteVisible(); if (!vis.length) return;
    palSel = (palSel + d + vis.length) % vis.length;
    palItems.forEach(li => li.classList.remove('sel'));
    vis[palSel].classList.add('sel');
    vis[palSel].scrollIntoView({ block: 'nearest' });
  }
  function runPalette(li) {
    closeOverlays();
    if (li.dataset.act === 'Mostrar/ocultar panel lateral') { togglePanel(); return; }
    if (li.dataset.act === 'Minimizar/restaurar minimapa') { toggleMinimap(); return; }
    toast(`Mock: ejecutaría «${li.dataset.act}»`);
  }
  palInput.addEventListener('input', filterPalette);
  palItems.forEach(li => li.addEventListener('click', () => runPalette(li)));
  document.getElementById('btnPalette').addEventListener('click', openPalette);

  /* ---------- overlay de atajos ---------- */
  const scOverlay = document.getElementById('shortcutsOverlay');
  document.getElementById('btnShortcuts').addEventListener('click', () => scOverlay.classList.add('open'));
  [palOverlay, scOverlay].forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) closeOverlays(); }));

  /* ---------- teclado global ---------- */
  window.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.key === 'Escape') { closeOverlays(); document.activeElement.blur?.(); return; }
    if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openPalette(); return; }
    if (palOverlay.classList.contains('open')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); movePalSel(1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); movePalSel(-1); }
      if (e.key === 'Enter')     { const s = paletteVisible()[palSel]; if (s) runPalette(s); }
      return;
    }
    if (typing) return;
    if (e.key === '?') { scOverlay.classList.add('open'); }
    if (e.key === '/') { e.preventDefault(); document.getElementById('topSearch').focus(); }
    if (e.key === '0') fit();
    if (e.key === ']') togglePanel();
    if (e.key.toLowerCase() === 'm') toggleMinimap();
    if (e.key.toLowerCase() === 'e') toast('Mock: exportaría PNG del grafo (RF-23)');
    if (e.key.toLowerCase() === 't') toast('Mock: abriría el editor de etiqueta (RF-10)');
    if (e.key.toLowerCase() === 'f') toast('Mock: resaltaría el flujo de fondos (RF-18)');
    if (e.key === 'Delete') toast('Mock: eliminaría la selección con undo disponible (RF-12/28)');
    if (e.ctrlKey && e.key.toLowerCase() === 'z') toast('Mock: deshacer por comandos, no por imágenes (RF-28)');
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); toast('Mock: guardaría .excabit.json (RF-21)'); }
  });

  /* ---------- colapsar/expandir panel lateral ---------- */
  const panel = document.getElementById('sidePanel');
  const btnPanel = document.getElementById('btnPanel');
  function togglePanel() {
    const hidden = panel.classList.toggle('collapsed');
    btnPanel.classList.toggle('panel-hidden', hidden);
    btnPanel.setAttribute('data-tip', hidden ? 'Mostrar panel  ·  ]' : 'Ocultar panel  ·  ]');
  }
  btnPanel.addEventListener('click', togglePanel);

  /* ---------- minimizar/restaurar minimapa ---------- */
  const minimap = document.getElementById('minimap');
  function toggleMinimap() { minimap.classList.toggle('minimized'); }
  document.getElementById('miniToggle').addEventListener('click', toggleMinimap);

  /* ---------- botones toolbar demo ---------- */
  document.getElementById('btnExport').addEventListener('click', () => toast('Mock: menú Exportar → PNG / SVG / CSV'));
  document.getElementById('btnDelete').addEventListener('click', () => toast('Mock: eliminaría la selección (undo disponible)'));
  const wrap = document.getElementById('canvasWrap');
  document.getElementById('btnGrid').addEventListener('click', function () {
    const off = wrap.style.backgroundImage === 'none';
    wrap.style.backgroundImage = off ? '' : 'none';
    this.classList.toggle('active', off);
  });

  /* ---------- toasts ---------- */
  const zone = document.getElementById('toastZone');
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    zone.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 2600);
  }

  /* ---------- init ---------- */
  routeEdges();
  applyView();
  toast('Mock interactivo: arrastra nodos, rueda = zoom, Ctrl+K = palette, ? = atajos');
})();
