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
  addTxsData,
  moveNode,
  setSelection,
  setLabel,
  setColor,
  createCluster,
  removeCluster,
  deleteSelection,
  type InvestigationState,
  type UndoableCommand,
} from './core/commands';
import { addressNodeId, txNodeId, type Graph } from './core/graph-model';
import { detectSearchKind, normalizeTxid } from './core/validators';
import { CyAdapter } from './graph/cy-adapter';
import { layoutRadial } from './graph/layout-radial';
import type { AddressId, NormalizedTx, Txid } from './core/types';
import { t, type MessageKey } from './i18n/i18n';
import { analyzeTx } from './analysis/score';
import { findClusters } from './analysis/clustering';

export interface AppOptions {
  container: HTMLElement;
  client: ApiClient;
  /**
   * Error de red o del proveedor → toast con reintento (RF-29).
   */
  onError?: (message: string) => void;
  /**
   * Entrada del usuario mal formada → mensaje **inline** junto a la búsqueda
   * (RF-01). No es un toast: el error está en lo que acaba de escribir y se
   * corrige ahí mismo, no en una esquina de la pantalla.
   */
  onInvalidInput?: (message: string) => void;
  onStatus?: (status: 'idle' | 'loading') => void;
}

/** Traduce el error tipado al mensaje que lee la persona (RF-29). */
function messageKeyFor(error: unknown): MessageKey {
  if (!isApiError(error)) return 'error.unexpected';

  switch (error.kind) {
    case 'not-found':
      return 'error.notFound';
    case 'rate-limited':
      return 'error.rateLimited';
    case 'network':
      return 'error.network';
    default:
      return 'error.unexpected';
  }
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
  private client: ApiClient;
  private readonly onError: (message: string) => void;
  private readonly onInvalidInput: (message: string) => void;
  private readonly onStatus: (status: 'idle' | 'loading') => void;
  private rootTxid: Txid | undefined;
  /**
   * Paginación por dirección (RF-31): cuántas txs se han traído y por dónde
   * seguir.
   *
   * Vive aquí y no en el store a propósito: es estado de la sesión, no de la
   * investigación. Un cursor de Esplora guardado en el fichero caducaría, y al
   * reabrirlo un año después apuntaría a un sitio que ya no significa nada.
   */
  private readonly pages = new Map<AddressId, { loaded: number; cursor?: string }>();

  constructor(options: AppOptions) {
    this.client = options.client;
    this.onError = options.onError ?? (() => undefined);
    this.onInvalidInput = options.onInvalidInput ?? (() => undefined);
    this.onStatus = options.onStatus ?? (() => undefined);

    this.store = new Store(initialInvestigation(), {
      // El grafo puede tener cientos de nodos y se sincroniza en cada cambio:
      // congelarlo entero en cada dispatch se paga en cada frame (RNF-01).
      freeze: false,
    });
    // El score se inyecta: `graph/` no conoce `analysis/` (docs/05 §2).
    this.adapter = new CyAdapter({
      container: options.container,
      scoreOf: (tx) => {
        const analysis = analyzeTx(tx);

        return { score: analysis.score, badge: analysis.badge };
      },
    });

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

  private dispatch(command: UndoableCommand, options: { coalesceKey?: string } = {}): void {
    const next = this.history.execute(command, this.store.getState(), options);
    this.store.dispatch({ type: command.type, apply: () => next });
  }

  /** Cambia de proveedor sin perder la investigación (RF-04). */
  setClient(client: ApiClient): void {
    this.client = client;
  }

  /**
   * Busca lo que sea que hayan escrito (RF-01, RF-02).
   *
   * La caja es una sola porque el usuario no tiene por qué clasificar lo que pega:
   * un txid y una dirección no se pueden confundir entre sí (64 hex no encaja en
   * base58 ni en bech32), así que la app lo averigua.
   */
  async search(input: string): Promise<void> {
    switch (detectSearchKind(input)) {
      case 'txid': {
        const txid = normalizeTxid(input);
        if (txid === null) break;

        await this.load(txid, { asRoot: true });
        this.adapter.fit();

        return;
      }
      case 'address':
        await this.searchAddress(input.trim());

        return;
      default:
        break;
    }

    // Inline junto al input, nunca un popup (RF-01, BUG-003).
    this.onInvalidInput(t('search.invalid'));
  }

  /**
   * Carga las transacciones de una dirección, por páginas (RF-02, RF-31).
   *
   * **Nunca se traen todas.** Una dirección de un exchange tiene decenas de miles
   * de txs: pedirlas enteras son cientos de peticiones y un grafo que no cabe en
   * la pantalla ni en la memoria. Se traen las 25 más recientes y se ofrece
   * seguir. Es el sustituto del «Multi Tx» del legacy (BUG-016), que se quedó a
   * medias precisamente porque intentaba resolver esto de una vez.
   */
  async searchAddress(address: AddressId): Promise<void> {
    this.pages.delete(address);
    const added = await this.loadAddressPage(address);
    if (added === null) return;

    this.adapter.fit();
  }

  /** Trae la siguiente página de una dirección ya cargada (RF-31). */
  async loadMore(address: AddressId): Promise<void> {
    if (this.pages.get(address)?.cursor === undefined) return;

    await this.loadAddressPage(address);
  }

  /** ¿Quedan más txs por traer de esta dirección? Lo pregunta la UI (RF-31). */
  pageInfo(address: AddressId): { loaded: number; hasMore: boolean } | undefined {
    const page = this.pages.get(address);
    if (page === undefined) return undefined;

    return { loaded: page.loaded, hasMore: page.cursor !== undefined };
  }

  private async loadAddressPage(address: AddressId): Promise<number | null> {
    this.onStatus('loading');

    try {
      const known = this.pages.get(address);
      const page = await this.client.getAddressTxs(
        address,
        ...(known?.cursor === undefined ? [] : [known.cursor]),
      );

      // Una página, un comando: 25 despachos serían 25 sincronizaciones del
      // grafo entero con el motor (RF-31 pide no congelar la UI).
      this.dispatch(addTxsData(page.items));

      this.pages.set(address, {
        loaded: (known?.loaded ?? 0) + page.items.length,
        ...(page.cursor === undefined ? {} : { cursor: page.cursor }),
      });

      /*
       * Dos vueltas, y las dos hacen falta.
       *
       * La primera coloca las txs alrededor de la dirección. La segunda deja que
       * cada tx coloque **lo suyo** (las direcciones a las que paga) alrededor de
       * donde ha caído: son vecinas de la tx, no de la dirección buscada, así que
       * el primer radial ni las mira y se quedarían las 25 apiladas en el origen.
       * Es el mismo fallo que las vecinas de la Fase 3, y se ve igual: el
       * contador dice «51 nodos» y en pantalla hay uno.
       *
       * Se encadenan sobre el mismo grafo y se despacha **una vez**, por lo mismo
       * de arriba.
       */
      let graph = layoutRadial(this.store.getState().graph, addressNodeId(address), {
        center: { x: 0, y: 0 },
      });
      for (const tx of page.items) {
        // La tx ya tiene sitio del paso anterior; `layoutRadial` respeta a los
        // `placed` y orbita alrededor de donde están.
        graph = layoutRadial(graph, txNodeId(tx.txid), { center: { x: 0, y: 0 } });
      }
      this.store.dispatch({ type: 'Layout', apply: (current) => ({ ...current, graph }) });

      return page.items.length;
    } catch (error) {
      this.onError(t(messageKeyFor(error)));

      return null;
    } finally {
      this.onStatus('idle');
    }
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
      // Los errores son datos tipados que suben a la UI (BUG-003). Cada tipo
      // tiene su mensaje: «no existe» y «no hay red» piden cosas distintas.
      this.onError(t(messageKeyFor(error)));
      return null;
    } finally {
      this.onStatus('idle');
    }
  }

  /** Coloca el radial de una tx, respetando lo que ya tenía sitio. */
  private relayout(txid: Txid, center: { x: number; y: number }): void {
    this.relayoutAround(txNodeId(txid), center);
  }

  /** Ídem, para cualquier nodo: el centro puede ser una tx o una dirección. */
  private relayoutAround(nodeId: string, center: { x: number; y: number }): void {
    const graph: Graph = layoutRadial(this.store.getState().graph, nodeId, { center });

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

  /** Etiqueta un nodo (RF-10). Deshacible como cualquier otro cambio. */
  setLabel(nodeId: string, label: string): void {
    this.dispatch(setLabel(nodeId, label));
  }

  /** Colorea un nodo (RF-11). */
  setColor(nodeId: string, color: string): void {
    this.dispatch(setColor(nodeId, color));
  }

  /**
   * Agrupa direcciones por dueño presunto (RF-19). Devuelve cuántos grupos salen.
   *
   * Si un cluster ya existe se deja como está: puede llevar el nombre que le puso
   * el usuario, y rehacerlo lo perdería. La hipótesis no cambia por volver a
   * calcularla.
   */
  cluster(): number {
    const state = this.store.getState();
    const clusters = findClusters(state.graph);
    const nuevos = clusters.filter((cluster) => state.graph.nodes[cluster.id] === undefined);

    for (const cluster of nuevos) {
      this.dispatch(createCluster(cluster.id, cluster.addresses.map(addressNodeId)));
    }

    return nuevos.length;
  }

  /** Deshace una agrupación (RF-19). Las direcciones se quedan. */
  ungroup(clusterId: string): void {
    this.dispatch(removeCluster(clusterId));
  }

  clearSelection(): void {
    if (this.store.getState().selection.length === 0) return;

    this.dispatch(setSelection([]));
  }

  get rootId(): string | undefined {
    return this.rootTxid === undefined ? undefined : txNodeId(this.rootTxid);
  }

  /** El txid raíz, para guardarlo en el fichero (RF-21). */
  get root(): Txid | undefined {
    return this.rootTxid;
  }

  /**
   * Sustituye la investigación entera por una cargada (RF-21/22).
   *
   * **El historial se vacía**: abrir un fichero no es un cambio que se deshaga.
   * Un Ctrl+Z que devolviera al grafo anterior mezclaría dos investigaciones
   * distintas en una pila y dejaría al usuario en un estado que no es ni lo que
   * abrió ni lo que tenía. Cerrar un documento y abrir otro son cosas distintas
   * de editarlo.
   */
  restore(state: InvestigationState, rootTxid: Txid | undefined): void {
    this.rootTxid = rootTxid;
    this.history.clear();
    this.adapter.setRoot(rootTxid === undefined ? '' : txNodeId(rootTxid));
    this.store.dispatch({ type: 'investigation:restore', apply: () => state });
  }

  destroy(): void {
    this.adapter.destroy();
  }
}
