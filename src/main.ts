/**
 * Bootstrap: conecta el DOM con la app (docs/05 §2).
 *
 * Aquí converge RF-26: ratón, atajo y palette llaman al **mismo** despachador
 * (`run`), así que una acción no puede funcionar por una vía y no por otra. El
 * legacy tenía 12 listeners con guardas solapadas y funciones escondidas tras
 * teclas mantenidas sin documentar (BUG-017, docs/06 §4).
 */
import { App } from './app';
import { MempoolProvider } from './data/providers/mempool';
import type { Network } from './core/types';
import { detectLocale, setLocale, t, tPlural, translateDom, type Locale } from './i18n/i18n';
import { formatBtc, formatNumber } from './i18n/format';
import { ACTIONS, shortcutOf, type ActionId } from './ui/actions';
import { Toolbar } from './ui/toolbar';
import { SidePanel } from './ui/side-panel';
import { Palette } from './ui/palette';
import { ShortcutsOverlay } from './ui/shortcuts-overlay';
import { Toasts } from './ui/toasts';
import { Tour } from './ui/tour';
import { Minimap } from './graph/minimap';
import { traceTaint } from './analysis/taint';
import { TOKENS } from './graph/styles';
import { loadInvestigation, saveInvestigation } from './persistence/investigation';
import { Autosave } from './persistence/autosave';
import { toEdgesCsv, toNodesCsv, toSvg } from './persistence/export';
import { downloadDataUrl, downloadText, pickTextFile, timestampedName } from './ui/file-io';
import { askRestore } from './ui/restore-prompt';
import './ui/theme.css';

const EXAMPLE_TXID = '85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2';

declare global {
  interface Window {
    /**
     * La app, expuesta a propósito.
     *
     * Los E2E comprueban el MODELO, no los píxeles: que Ctrl+Z revierte datos
     * (BUG-013) y que 20 ruedas de zoom no mueven una posición (BUG-015) solo
     * se puede afirmar mirando aquí. De paso, hace la app inspeccionable desde
     * la consola — es software libre sin secretos que esconder.
     */
    excabit?: App;
    /**
     * El minimapa (RF-13). Lo monta el shell, no `App`: necesita un hueco del
     * DOM y `App` no sabe de layout.
     *
     * Se expone por lo mismo que `excabit`: sus contadores de repintado son la
     * única forma de afirmar que un pan no rehace el grafo en miniatura, que es
     * de lo que dependen los 60 fps de RNF-01.
     */
    excabitMinimap?: Minimap;
    /**
     * El autosave (RF-22). Expuesto por lo mismo que los anteriores: comprobar
     * que «al volver se ofrece restaurar» exige saber que algo se guardó, y eso
     * no se ve desde fuera hasta que ya has recargado.
     */
    excabitAutosave?: Autosave;
  }
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Falta el elemento #${id} en index.html`);

  return element;
}

function requireInput(id: string): HTMLInputElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`#${id} no es un input`);

  return element;
}

function boot(): void {
  setLocale(detectLocale());
  translateDom();

  const search = requireInput('search');
  const searchWrap = requireElement('searchWrap');
  const empty = requireElement('empty');
  const panelRoot = requireElement('panel');
  const networkSelect = requireElement('network') as HTMLSelectElement;

  const toasts = new Toasts(requireElement('toasts'));
  const panel = new SidePanel(panelRoot);
  const palette = new Palette({
    container: requireElement('overlays'),
    onAction: (id) => {
      run(id);
    },
  });
  const shortcutsOverlay = new ShortcutsOverlay(requireElement('overlays'));
  const tour = new Tour(requireElement('overlays'));

  let network: Network = 'mainnet';
  let lastSearch: string | null = null;

  const searchError = requireElement('searchError');

  const app = new App({
    container: requireElement('graph'),
    client: new MempoolProvider({ network }),
    onError: (message) => {
      // RF-29: aviso no bloqueante con reintento. Jamás alert() (BUG-003).
      toasts.show({
        message,
        ...(lastSearch === null ? {} : { onRetry: () => void app.search(lastSearch ?? '') }),
      });
    },
    onInvalidInput: (message) => {
      // RF-01: inline, pegado al input que hay que corregir.
      searchError.textContent = message;
      searchError.hidden = false;
      searchWrap.classList.add('invalid');
      search.setAttribute('aria-invalid', 'true');
    },
    onStatus: (state) => {
      statusMessage.textContent = state === 'loading' ? t('status.loading') : '';
    },
  });
  window.excabit = app;

  const toolbar = new Toolbar({
    container: requireElement('toolbar'),
    onAction: (id) => {
      run(id);
    },
  });
  const minimap = new Minimap(requireElement('minimapBody'), app.adapter.cy);
  window.excabitMinimap = minimap;

  const statusCounts = requireElement('statusCounts');
  const statusMessage = requireElement('statusMessage');
  const statusZoom = requireElement('statusZoom');

  /* ---------- Render derivado del estado ---------- */

  const refresh = (): void => {
    const state = app.store.getState();
    const nodes = Object.values(state.graph.nodes);

    empty.hidden = nodes.length > 0;
    statusCounts.textContent = `${formatNumber(nodes.length)} ${t('status.nodes')} · ${formatNumber(
      Object.keys(state.graph.edges).length,
    )} ${t('status.edges')}`;

    toolbar.setSelectionCount(state.selection.length);
    // El panel muestra el último seleccionado: con varios, lo último que tocó
    // el usuario es lo que está mirando.
    const selectedId = state.selection.at(-1);
    panel.setSelection(selectedId === undefined ? undefined : state.graph.nodes[selectedId]);
    panel.renderInvestigation(
      nodes.filter((node) => node.label !== undefined || node.note !== undefined),
    );
  };

  app.store.subscribe(refresh);
  app.adapter.cy.on('zoom', () => {
    statusZoom.textContent = `${t('status.zoom')} ${String(Math.round(app.adapter.cy.zoom() * 100))}%`;
  });

  /* ---------- Autosave (RF-22) ---------- */

  const autosave = new Autosave();
  window.excabitAutosave = autosave;

  app.store.subscribe(() => {
    // Un grafo vacío no se guarda: sobrescribiría el autosave anterior con la
    // nada justo cuando el usuario todavía no ha decidido si restaurarlo.
    if (isEmpty()) return;

    autosave.schedule(app.store.getState(), metaNow());
  });

  // Cerrar la pestaña no puede costar los últimos cambios por 800 ms de debounce.
  window.addEventListener('beforeunload', () => {
    void autosave.flush();
  });

  /* ---------- Acciones: un único despachador (RF-26) ---------- */

  const doSearch = (): void => {
    const value = search.value.trim();
    lastSearch = value;
    searchError.hidden = true;
    searchWrap.classList.remove('invalid');
    search.removeAttribute('aria-invalid');
    void app.search(value);
  };

  function run(id: ActionId): void {
    const state = app.store.getState();

    switch (id) {
      case 'search':
        search.focus();
        search.select();
        break;
      case 'expand':
        for (const nodeId of state.selection) void app.expand(nodeId);
        break;
      case 'label': {
        const target = state.selection.at(-1);
        if (target === undefined) break;
        const current = state.graph.nodes[target]?.label ?? '';
        const value = prompt(t('investigation.labelPlaceholder'), current);
        if (value !== null) app.setLabel(target, value);
        break;
      }
      case 'color': {
        const target = state.selection.at(-1);
        if (target === undefined) break;
        app.setColor(target, nextColor(state.graph.nodes[target]?.color));
        break;
      }
      case 'delete':
        app.deleteSelected();
        break;
      case 'undo':
        app.undo();
        break;
      case 'redo':
        app.redo();
        break;
      case 'fit':
        app.adapter.fit();
        break;
      case 'zoomIn':
        app.adapter.cy.zoom(app.adapter.cy.zoom() * 1.2);
        break;
      case 'zoomOut':
        app.adapter.cy.zoom(app.adapter.cy.zoom() / 1.2);
        break;
      case 'palette':
        palette.toggle();
        break;
      case 'shortcuts':
        shortcutsOverlay.toggle();
        break;
      case 'togglePanel':
        panelRoot.classList.toggle('collapsed');
        requireElement('panelToggle').setAttribute(
          'aria-expanded',
          String(!panelRoot.classList.contains('collapsed')),
        );
        break;
      case 'toggleMinimap':
        toggleMinimap();
        break;
      case 'toggleLanguage':
        switchLanguage();
        break;
      case 'save':
        saveToFile();
        break;
      case 'open':
        void openFromFile();
        break;
      case 'export':
        exportPng();
        break;
      case 'exportSvg':
        exportSvg();
        break;
      case 'exportCsv':
        exportCsv();
        break;
      case 'followFunds':
        toggleTaint();
        break;
      case 'cluster':
        groupOrUngroup();
        break;
    }
  }

  /* ---------- Clustering de direcciones (RF-19) ---------- */

  /**
   * La misma acción agrupa y desagrupa, según lo que haya seleccionado.
   *
   * Con un cluster seleccionado, `g` lo deshace; si no, agrupa lo que CIOH
   * encuentre. Dos acciones distintas para «hacer» y «deshacer esto concreto»
   * obligarían a recordar cuál es cuál, y la segunda solo tiene sentido con un
   * cluster delante.
   */
  function groupOrUngroup(): void {
    const state = app.store.getState();
    const selected = state.selection.at(-1);

    if (selected !== undefined && state.graph.nodes[selected]?.kind === 'cluster') {
      app.ungroup(selected);
      toasts.show({ message: t('cluster.ungrouped'), timeout: 2500 });

      return;
    }

    const created = app.cluster();

    if (created === 0) {
      toasts.show({ message: t('cluster.none'), timeout: 5000 });

      return;
    }

    toasts.show({
      message: tPlural(created, 'cluster.created.one', 'cluster.created.other', {
        count: formatNumber(created),
      }),
      timeout: 4000,
    });
  }

  /* ---------- Seguimiento de flujo de fondos (RF-18) ---------- */

  /** Hay un rastro pintado. La misma acción lo quita: es un modo de ver, no un cambio. */
  let tracing = false;

  function toggleTaint(): void {
    if (tracing) {
      app.adapter.highlightTaint(null);
      tracing = false;
      statusMessage.textContent = '';

      return;
    }

    const source = app.store.getState().selection.at(-1);
    if (source === undefined) return;

    const trace = traceTaint(app.store.getState().graph, { source });

    // El origen siempre está en el rastro; con solo él, no hay nada que seguir.
    if (trace.size <= 1) {
      toasts.show({ message: t('taint.nowhere'), timeout: 4000 });

      return;
    }

    app.adapter.highlightTaint(new Map([...trace].map(([id, node]) => [id, node.ratio])));
    tracing = true;

    // Lo que RF-18 pide enseñar: cuánto llega y en cuántos saltos. Se cuenta
    // sobre los finales del rastro (lo que no vuelve a gastarse), no sobre todos
    // los nodos: sumar cada paso contaría el mismo dinero varias veces.
    const graph = app.store.getState().graph;
    const spent = new Set(Object.values(graph.edges).map((edge) => edge.from));
    const ends = [...trace.values()].filter((node) => node.id !== source && !spent.has(node.id));
    const total = ends.reduce((sum, node) => sum + node.amount, 0n);
    const hops = Math.max(...[...trace.values()].map((node) => node.hops));

    // Los plurales se componen: «1 saltos» delata que nadie lo miró.
    const reached = trace.size - 1;
    statusMessage.textContent = t('taint.summary', {
      nodes: tPlural(reached, 'taint.nodes.one', 'taint.nodes.other', {
        count: formatNumber(reached),
      }),
      amount: formatBtc(total),
      hops: tPlural(hops, 'taint.hops.one', 'taint.hops.other', { count: formatNumber(hops) }),
    });
  }

  // El rastro es de una selección concreta: si cambia, lo pintado ya no
  // corresponde a lo que hay seleccionado y engañaría más que ayudaría.
  app.store.subscribe(() => {
    if (!tracing) return;

    app.adapter.highlightTaint(null);
    tracing = false;
    statusMessage.textContent = '';
  });

  /* ---------- Persistencia y export (RF-21/22/23/24) ---------- */

  const metaNow = () => ({
    network,
    ...(app.root === undefined ? {} : { rootTxid: app.root }),
    viewport: {
      zoom: app.adapter.cy.zoom(),
      panX: app.adapter.cy.pan().x,
      panY: app.adapter.cy.pan().y,
    },
  });

  const isEmpty = (): boolean => Object.keys(app.store.getState().graph.nodes).length === 0;

  /** Un export vacío es un fichero que decepciona al abrirlo. */
  function requireGraph(): boolean {
    if (!isEmpty()) return true;

    toasts.show({ message: t('persistence.nothingToExport'), timeout: 3000 });

    return false;
  }

  function saveToFile(): void {
    if (!requireGraph()) return;

    downloadText(
      timestampedName('excabit', 'excabit.json'),
      'application/json',
      saveInvestigation(app.store.getState(), metaNow()),
    );
    toasts.show({ message: t('persistence.saved'), timeout: 2500 });
  }

  async function openFromFile(): Promise<void> {
    const file = await pickTextFile('.json,.excabit.json,application/json');
    if (file === null) return;

    const result = loadInvestigation(file.text);
    if (!result.ok) {
      toasts.show({ message: describeLoadError(result.error), timeout: 8000 });
      return;
    }

    app.restore(result.investigation.state, result.investigation.rootTxid);

    const viewport = result.investigation.viewport;
    if (viewport === undefined) app.adapter.fit();
    else {
      app.adapter.cy.zoom(viewport.zoom);
      app.adapter.cy.pan({ x: viewport.panX, y: viewport.panY });
    }

    toasts.show({ message: t('persistence.opened'), timeout: 2500 });
    // Los avisos del migrador se enseñan de uno en uno: un toast con cinco
    // frases no lo lee nadie.
    for (const warning of result.warnings) toasts.show({ message: warning, timeout: 10_000 });
  }

  function describeLoadError(
    error: ReturnType<typeof loadInvestigation> extends { ok: true }
      ? never
      : { kind: string; found?: unknown; issues?: string[] },
  ): string {
    switch (error.kind) {
      case 'not-json':
        return t('persistence.notJson');
      case 'unknown-schema-version':
        return t('persistence.unknownVersion', { found: String(error.found) });
      default:
        // Solo el primer problema: la lista entera abruma y con arreglar el
        // primero suele caer el resto.
        return t('persistence.invalid', { detail: error.issues?.[0] ?? '' });
    }
  }

  function exportPng(): void {
    if (!requireGraph()) return;

    const name = timestampedName('excabit', 'png');
    downloadDataUrl(name, app.adapter.toPng());
    toasts.show({ message: t('persistence.exported', { name }), timeout: 2500 });
  }

  function exportSvg(): void {
    if (!requireGraph()) return;

    const name = timestampedName('excabit', 'svg');
    // El tema se inyecta: `persistence/` no conoce `graph/styles` (docs/05 §2).
    downloadText(
      name,
      'image/svg+xml',
      toSvg(app.store.getState().graph, {
        background: TOKENS.bg,
        edge: TOKENS.border,
        text: TOKENS.text,
        tx: TOKENS.surface2,
        address: TOKENS.utxo,
      }),
    );
    toasts.show({ message: t('persistence.exported', { name }), timeout: 2500 });
  }

  function exportCsv(): void {
    if (!requireGraph()) return;

    // Dos ficheros y no uno: Gephi importa nodos y aristas por separado, y
    // meterlos en el mismo CSV obligaría a partirlo a mano (RF-24).
    const graph = app.store.getState().graph;
    downloadText(timestampedName('excabit-nodos', 'csv'), 'text/csv', toNodesCsv(graph));
    downloadText(timestampedName('excabit-aristas', 'csv'), 'text/csv', toEdgesCsv(graph));
    toasts.show({ message: t('persistence.exported', { name: 'CSV' }), timeout: 2500 });
  }

  /* ---------- Teclado: un único punto de decisión (BUG-017) ---------- */

  document.addEventListener('keydown', (event) => {
    const typing =
      event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

    if (event.key === 'Escape') {
      if (palette.isOpen) palette.close();
      else if (shortcutsOverlay.isOpen) shortcutsOverlay.close();
      else app.clearSelection();
      return;
    }

    const shortcut = shortcutOf(event);
    // Ctrl+K debe funcionar también escribiendo en la búsqueda; una letra
    // suelta, no: se estaría tecleando.
    const isCombo = shortcut.includes('ctrl+');
    if (typing && !isCombo) return;

    const action = ACTIONS.find((candidate) => candidate.shortcut === shortcut);
    if (action === undefined) return;
    if (action.needsSelection === true && app.store.getState().selection.length === 0) return;

    event.preventDefault();
    run(action.id);
  });

  /* ---------- Eventos del shell ---------- */

  requireElement('searchBtn').addEventListener('click', doSearch);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') doSearch();
  });
  requireElement('exampleBtn').addEventListener('click', () => {
    // RF-03: ejemplo clicable, se carga sin teclear nada.
    search.value = EXAMPLE_TXID;
    doSearch();
  });

  for (const id of [
    'paletteBtn',
    'shortcutsBtn',
    'langBtn',
    'panelToggle',
    'zoomInBtn',
    'zoomOutBtn',
    'fitBtn',
  ]) {
    const element = requireElement(id);
    const action = element.dataset['action'] as ActionId | undefined;
    if (action !== undefined) {
      element.addEventListener('click', () => {
        run(action);
      });
    }
  }

  requireElement('minimapHead').addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.tagName !== 'BUTTON') toggleMinimap();
  });
  requireElement('minimapToggle').addEventListener('click', toggleMinimap);

  networkSelect.addEventListener('change', () => {
    network = networkSelect.value as Network;
    requireElement('statusNetwork').textContent = network;
    app.setClient(new MempoolProvider({ network }));
    toasts.show({ message: `${t('network.label')}: ${network}`, timeout: 1800 });
  });

  function toggleMinimap(): void {
    const box = requireElement('minimap');
    box.classList.toggle('collapsed');
    requireElement('minimapToggle').setAttribute(
      'aria-expanded',
      String(!box.classList.contains('collapsed')),
    );
    requireElement('minimapToggle').textContent = box.classList.contains('collapsed') ? '+' : '−';
  }

  function switchLanguage(): void {
    const next: Locale = requireElement('langBtn').textContent === 'ES' ? 'en' : 'es';
    setLocale(next);
    requireElement('langBtn').textContent = next === 'es' ? 'ES' : 'EN';
    translateDom();
    toolbar.render();
    refresh();
  }

  refresh();
  statusZoom.textContent = `${t('status.zoom')} 100%`;
  void offerRestore();

  /**
   * Al arrancar, si quedó algo a medias, se ofrece seguir (RF-22).
   *
   * Va antes que el tour y lo sustituye si aparece: quien tiene una
   * investigación sin terminar no es un usuario nuevo, y encadenarle cinco pasos
   * de bienvenida delante de su trabajo sería una broma pesada.
   */
  async function offerRestore(): Promise<void> {
    const snapshot = await autosave.read().catch(() => null);

    if (snapshot === null || snapshot.nodeCount === 0) {
      tour.startIfFirstRun();
      return;
    }

    const wants = await askRestore(requireElement('overlays'), {
      updatedAt: snapshot.updatedAt,
      nodeCount: snapshot.nodeCount,
    });

    if (!wants) {
      // Descartar es descartar: si se quedara ahí, volveríamos a preguntar en la
      // siguiente carga por algo que el usuario ya dijo que no quería.
      await autosave.clear().catch(() => undefined);
      tour.startIfFirstRun();
      return;
    }

    const result = await autosave.restore();
    if (result === null || !result.ok) {
      // Un autosave a medio escribir por un cierre brusco no puede secuestrar el
      // arranque: se avisa, se tira y la app sigue.
      await autosave.clear().catch(() => undefined);
      toasts.show({ message: t('restore.corrupt'), timeout: 6000 });
      return;
    }

    app.restore(result.investigation.state, result.investigation.rootTxid);

    const viewport = result.investigation.viewport;
    if (viewport === undefined) app.adapter.fit();
    else {
      app.adapter.cy.zoom(viewport.zoom);
      app.adapter.cy.pan({ x: viewport.panX, y: viewport.panY });
    }

    toasts.show({ message: t('restore.restored'), timeout: 2500 });
  }
}

/** Paleta de colores del mock, en ciclo (RF-11). */
const COLOR_CYCLE = ['#f7931a', '#3fb950', '#58a6ff', '#d29922', '#f85149', '#bc8cff'] as const;

function nextColor(current: string | undefined): string {
  const index = current === undefined ? -1 : COLOR_CYCLE.indexOf(current as never);

  return COLOR_CYCLE[(index + 1) % COLOR_CYCLE.length] ?? COLOR_CYCLE[0];
}

boot();
