/**
 * Bootstrap: conecta el DOM con la app (docs/05 §2).
 *
 * Shell mínimo de la Fase 3 — lo justo para buscar, explorar y poder probarlo
 * de punta a punta. La Fase 4 trae toolbar, panel lateral, command palette,
 * i18n y tour (RF-26: toda acción alcanzable por ratón, atajo y palette).
 */
import { App } from './app';
import { MempoolProvider } from './data/providers/mempool';
import './ui/theme.css';

const EXAMPLE_TXID = '85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2';

/** Falla pronto y claro si el HTML y el bootstrap se desincronizan. */
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
  }
}

function boot(): void {
  const container = requireElement('graph');
  const search = requireInput('search');
  const status = requireElement('status');
  const error = requireElement('error');

  const app = new App({
    container,
    client: new MempoolProvider(),
    onError: (message) => {
      // Error inline, nunca alert() (RF-01, RF-29, BUG-003).
      error.textContent = message;
      error.hidden = false;
    },
    onStatus: (state) => {
      status.dataset['state'] = state;
      status.textContent = state === 'loading' ? 'Cargando…' : '';
    },
  });

  window.excabit = app;

  const run = (): void => {
    error.hidden = true;
    void app.search(search.value.trim());
  };

  requireElement('searchBtn').addEventListener('click', run);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') run();
  });

  requireElement('exampleBtn').addEventListener('click', () => {
    // RF-03: ejemplo clicable, se carga sin teclear nada.
    search.value = EXAMPLE_TXID;
    run();
  });

  document.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLInputElement;
    if (typing) return;

    // RF-28. La Fase 4 centraliza los atajos en ui/shortcuts.ts.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      app.undo();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))
    ) {
      event.preventDefault();
      app.redo();
      return;
    }
    // RF-12: sin "modo eliminar" de círculos rojos, la tecla basta.
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      app.deleteSelected();
    }
  });
}

boot();
