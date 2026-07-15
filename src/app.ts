/**
 * Wiring de la aplicación (docs/05 §2): el único sitio donde se conocen todas
 * las capas.
 *
 * El flujo, en un sentido y sin atajos:
 *
 *   gesto → intención (cy-adapter) → **comando** → History → store
 *                                                              ↓ evento
 *                                                       sync → escena
 *
 * La red nunca escribe en el store: los fetch resuelven y su resultado se
 * despacha como `AddTxData`. El shell completo (toolbar, panel, palette) llega
 * en la Fase 4; esto es lo mínimo para explorar y para poder probarlo E2E.
 */
import type { ApiClient } from './data/api-client';
import { isApiError } from './data/errors';
import { Store } from './core/store';
import { History } from './core/undo';
import {
  initialInvestigation,
  addTxData,
  moveNode,
  setSelection,
  deleteSelection,
  type InvestigationState,
} from './core/commands';
import { txNodeId, type Graph } from './core/graph-model';
import { normalizeTxid } from './core/validators';
import { CyAdapter } from './graph/cy-adapter';
import { layoutRadial } from './graph/layout-radial';
import type { NormalizedTx, Txid } from './core/types';

export interface AppOptions {
  container: HTMLElement;
  client: ApiClient;
  /** Se llama con los mensajes de error (RF-29). La Fase 4 los hará toasts. */
  onError?: (message: string) => void;
  onStatus?: (status: 'idle' | 'loading') => void;
}

/** Cuántas txs vecinas se traen al expandir. Acotado para no abusar de la API. */
const MAX_NEIGHBOURS = 12;

/** Separación entre una tx y sus vecinas: dos radios más aire. */
const NEIGHBOUR_GAP_X = 620;
const NEIGHBOUR_GAP_Y = 560;

export class App {
  readonly store: Store<InvestigationState>;
  readonly history = new History();
  /** Público: lo necesitan el minimapa (RF-13) y los E2E de viewport. */
  readonly adapter: CyAdapter;
  private readonly client: ApiClient;
  private readonly onError: (message: string) => void;
  private readonly onStatus: (status: 'idle' | 'loading') => void;
  private rootTxid: Txid | undefined;

  constructor(options: AppOptions) {
    this.client = options.client;
    this.onError = options.onError ?? (() => undefined);
    this.onStatus = options.onStatus ?? (() => undefined);

    this.store = new Store(initialInvestigation(), {
      // El grafo puede tener cientos de nodos y se sincroniza en cada cambio:
      // congelarlo entero en cada dispatch se paga en cada frame (RNF-01).
      freeze: false,
    });
    this.adapter = new CyAdapter({ container: options.container });

    this.store.subscribe((event) => {
      this.adapter.sync(event.state.graph);
      this.adapter.syncSelection(event.state.selection);
    });

    // Gestos → comandos. El adapter avisa; quien decide es el comando.
    this.adapter.onNodeMoved((id, position) => {
      // Un drag = un comando (ADR-004): sin la clave, deshacerlo costaría
      // tantos Ctrl+Z como frames tuvo el arrastre.
      this.dispatch(moveNode(id, position), { coalesceKey: `move:${id}` });
    });
    this.adapter.onSelectionChanged((ids) => {
      this.dispatch(setSelection(ids));
    });
    this.adapter.onExpandRequested((id) => {
      void this.expand(id);
    });
  }

  private dispatch(
    command: ReturnType<typeof moveNode>,
    options: { coalesceKey?: string } = {},
  ): void {
    const next = this.history.execute(command, this.store.getState(), options);
    this.store.dispatch({ type: command.type, apply: () => next });
  }

  /** Carga la tx y la coloca en el centro del radial (RF-01, RF-05). */
  async search(input: string): Promise<void> {
    const txid = normalizeTxid(input);
    if (txid === null) {
      // Error inline, nunca un popup (RF-01, BUG-003).
      this.onError('Introduce un txid válido de 64 caracteres hexadecimales.');
      return;
    }

    await this.load(txid, { asRoot: true });
    this.adapter.fit();
  }

  private async load(
    txid: Txid,
    options: { asRoot?: boolean; center?: { x: number; y: number } } = {},
  ): Promise<NormalizedTx | null> {
    this.onStatus('loading');

    try {
      const tx = await this.client.getTx(txid);
      const spends = await this.client.getOutspends(txid).catch(() => []);
      const withSpends: NormalizedTx = {
        ...tx,
        vout: tx.vout.map((vout, n) => {
          const spend = spends[n];
          if (spend === undefined) return vout;

          return spend.spent
            ? { ...vout, spent: true, spentBy: spend.txid }
            : { ...vout, spent: false };
        }),
      };

      this.dispatch(addTxData(withSpends));

      if (options.asRoot === true) {
        this.rootTxid = txid;
        this.adapter.setRoot(txNodeId(txid));
      }
      this.relayout(txid, options.center ?? { x: 0, y: 0 });

      return withSpends;
    } catch (error) {
      // Los errores son datos tipados que suben a la UI (BUG-003).
      this.onError(isApiError(error) ? error.message : 'Error inesperado al cargar la tx.');
      return null;
    } finally {
      this.onStatus('idle');
    }
  }

  /** Coloca el radial de una tx, respetando lo que ya tenía sitio. */
  private relayout(txid: Txid, center: { x: number; y: number }): void {
    const graph: Graph = layoutRadial(this.store.getState().graph, txNodeId(txid), { center });

    this.store.dispatch({ type: 'Layout', apply: (current) => ({ ...current, graph }) });
  }

  /**
   * Expande una tx: trae las txs de las que vienen sus entradas y las que
   * gastan sus salidas (RF-06). Idempotente por construcción — `AddTxData` no
   * duplica.
   */
  async expand(nodeId: string): Promise<void> {
    const node = this.store.getState().graph.nodes[nodeId];
    if (node?.kind !== 'tx' || node.tx === undefined) return;

    const previous = [
      ...new Set(node.tx.vin.map((vin) => vin.txid).filter((txid): txid is Txid => txid !== null)),
    ];
    const next = [
      ...new Set(
        node.tx.vout.map((vout) => vout.spentBy).filter((txid): txid is Txid => txid !== undefined),
      ),
    ];

    // Cada vecina necesita SU sitio. Con un centro común aterrizarían todas
    // encima de la tx de origen y el grafo se vería como un solo nodo.
    // De dónde vino el dinero va a la izquierda; a dónde fue, a la derecha
    // (RF-05: el flujo se lee de izquierda a derecha).
    const origin = { x: node.x, y: node.y };
    const plan = [
      ...previous.map((txid, i) => ({ txid, side: -1, index: i, total: previous.length })),
      ...next.map((txid, i) => ({ txid, side: 1, index: i, total: next.length })),
    ].slice(0, MAX_NEIGHBOURS);

    for (const { txid, side, index, total } of plan) {
      const center = {
        x: origin.x + side * NEIGHBOUR_GAP_X,
        y: origin.y + (index - (total - 1) / 2) * NEIGHBOUR_GAP_Y,
      };
      await this.load(txid, { center });
    }
  }

  undo(): void {
    const next = this.history.undo(this.store.getState());
    this.store.dispatch({ type: 'Undo', apply: () => next });
  }

  redo(): void {
    const next = this.history.redo(this.store.getState());
    this.store.dispatch({ type: 'Redo', apply: () => next });
  }

  /** Elimina la selección con sus aristas huérfanas (RF-12). */
  deleteSelected(): void {
    const { selection } = this.store.getState();
    if (selection.length === 0) return;

    this.dispatch(deleteSelection(selection));
  }

  get rootId(): string | undefined {
    return this.rootTxid === undefined ? undefined : txNodeId(this.rootTxid);
  }

  destroy(): void {
    this.adapter.destroy();
  }
}
