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
import { detectLocale, setLocale, t, translateDom, type Locale } from './i18n/i18n';
import { formatNumber } from './i18n/format';
import { ACTIONS, shortcutOf, type ActionId } from './ui/actions';
import { Toolbar } from './ui/toolbar';
import { SidePanel } from './ui/side-panel';
import { Palette } from './ui/palette';
import { ShortcutsOverlay } from './ui/shortcuts-overlay';
import { Toasts } from './ui/toasts';
import { Tour } from './ui/tour';
import { Minimap } from './graph/minimap';
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
  const palette = new Palette({ container: requireElement('overlays'), onAction: (id) => { run(id); } });
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
      // Fase 5 y 6: persistencia, export, taint y clustering. Se declaran en el
      // registro para que aparezcan en la palette con su atajo desde ya, pero
      // avisan en vez de fingir que funcionan.
      case 'save':
      case 'open':
      case 'export':
      case 'followFunds':
      case 'cluster':
        toasts.show({ message: `${t(actionName(id))} — Fase 5/6`, timeout: 2500 });
        break;
    }
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
  tour.startIfFirstRun();
}

/** Paleta de colores del mock, en ciclo (RF-11). */
const COLOR_CYCLE = ['#f7931a', '#3fb950', '#58a6ff', '#d29922', '#f85149', '#bc8cff'] as const;

function nextColor(current: string | undefined): string {
  const index = current === undefined ? -1 : COLOR_CYCLE.indexOf(current as never);

  return COLOR_CYCLE[(index + 1) % COLOR_CYCLE.length] ?? COLOR_CYCLE[0];
}

const actionName = (id: ActionId) =>
  ACTIONS.find((action) => action.id === id)?.i18nKey ?? 'app.name';

boot();
