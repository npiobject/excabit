/**
 * **La única frontera con Cytoscape** (ADR-001, docs/05 §2).
 *
 * Todo lo que sabe la app sobre Cytoscape vive aquí. El resto trabaja con
 * `Graph`, que es datos. Si algún día se revisa la ADR-001, se reescribe este
 * fichero y nada más — esa es la apuesta y este módulo es donde se cobra.
 *
 * Dirección del flujo (docs/05 §2):
 *
 *   store → `sync()` → escena          (los datos mandan)
 *   escena → `onXxx()` → **intención** → comando → store
 *
 * El adapter **nunca** muta el grafo: traduce gestos a intenciones y las emite.
 * Quien decide es el comando. Así el modelo no puede divergir de lo que se ve,
 * que es la enfermedad del legacy (BUG-013/BUG-020).
 */
import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape';
import type { Graph, GraphEdge, GraphNode } from '@/core/graph-model';
import type { NormalizedTx } from '@/core/types';
import { formatBtc, shortHash } from '@/i18n/format';
import { graphStylesheet, TOKENS } from './styles';

export interface CyAdapterOptions {
  container?: HTMLElement;
  /** Para tests: instancia sin DOM. */
  headless?: boolean;
  /** Id de la tx raíz, para destacarla (RF-05). */
  rootId?: string;
  /**
   * Score de privacidad de una tx, para el badge del nodo (RF-16).
   *
   * Se inyecta en vez de importarlo: `graph/` no puede depender de `analysis/`
   * (docs/05 §2), y el grafo no tiene por qué saber cómo se calcula un score —
   * solo cómo pintarlo.
   */
  scoreOf?: (tx: NormalizedTx) => { score: number; badge: string };
}

export type NodeMovedHandler = (id: string, position: { x: number; y: number }) => void;
export type ExpandHandler = (id: string) => void;
export type SelectionHandler = (ids: string[]) => void;

/**
 * Texto que se pinta DENTRO del nodo (docs/06 §3).
 *
 * Cytoscape dibuja en canvas: no hay HTML dentro del nodo, así que la "tarjeta"
 * del mock se compone como texto multilínea. La etiqueta del usuario (RF-10)
 * manda sobre el id corto: si se molestó en poner un nombre, es lo que quiere
 * leer.
 */
function displayOf(node: GraphNode, score: number | undefined): string {
  if (node.kind === 'cluster') return node.label ?? '';

  if (node.kind === 'address') {
    return node.label ?? shortHash(node.address ?? node.id, 6, 4);
  }

  const tx = node.tx;
  if (tx === undefined) return node.label ?? shortHash(node.id);

  const total = tx.vout.reduce((sum, out) => sum + out.value, 0n);
  // El badge de score va en la misma línea del id, como en el mock: es lo
  // primero que se mira y lo que resume la tx en un número.
  const head = `${node.label ?? shortHash(tx.txid)}${score === undefined ? '' : `   ${String(score)}`}`;
  const block = tx.blockHeight === null ? 'mempool' : `bloque ${tx.blockHeight.toLocaleString()}`;

  return [
    head,
    block,
    formatBtc(total),
    `${String(tx.vin.length)} in · ${String(tx.vout.length)} out`,
  ].join('\n');
}

function nodeData(
  node: GraphNode,
  rootId: string | undefined,
  scoreOf: CyAdapterOptions['scoreOf'],
): ElementDefinition['data'] {
  const analysis = node.tx !== undefined && scoreOf !== undefined ? scoreOf(node.tx) : undefined;

  return {
    id: node.id,
    kind: node.kind,
    label: node.label ?? '',
    display: displayOf(node, analysis?.score),
    ...(analysis === undefined ? {} : { score: analysis.score, scoreBadge: analysis.badge }),
    ...(node.color === undefined ? {} : { color: node.color }),
    ...(node.parent === undefined ? {} : { parent: node.parent }),
    ...(node.id === rootId ? { isRoot: true } : {}),
  };
}

/** La arista muestra el importe que mueve: es de lo que va la app. */
function edgeData(edge: GraphEdge): ElementDefinition['data'] {
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    kind: edge.kind,
    value: edge.value.toString(),
    display: formatBtc(edge.value).replace(' BTC', ''),
    ...(edge.isUtxo === undefined ? {} : { isUtxo: edge.isUtxo }),
  };
}

export class CyAdapter {
  readonly cy: Core;
  private rootId: string | undefined;
  private readonly scoreOf: CyAdapterOptions['scoreOf'];
  /** Evita que `sync()` dispare los handlers de interacción del usuario. */
  private syncing = false;

  constructor(options: CyAdapterOptions = {}) {
    this.rootId = options.rootId;
    this.scoreOf = options.scoreOf;
    this.cy = cytoscape({
      ...(options.container === undefined ? {} : { container: options.container }),
      headless: options.headless ?? false,
      style: graphStylesheet(),
      layout: { name: 'preset' },
      // Zoom y pan son transformación de vista: jamás tocan las posiciones del
      // modelo. Es lo que corrige BUG-015 de raíz, verificado en el spike.
      zoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: true,
      selectionType: 'additive',
      minZoom: 0.1,
      maxZoom: 4,
    });
  }

  setRoot(rootId: string): void {
    this.rootId = rootId;
  }

  /**
   * Lleva la escena al estado del grafo, por diferencias.
   *
   * Reconstruir de cero en cada cambio sería más simple, pero perdería la
   * selección, el zoom y las animaciones en curso, y haría parpadear el grafo
   * en cada expansión.
   */
  sync(graph: Graph): void {
    this.syncing = true;

    try {
      const wanted = new Set([...Object.keys(graph.nodes), ...Object.keys(graph.edges)]);

      // 1. Fuera lo que ya no está.
      this.cy
        .elements()
        .filter((element) => !wanted.has(element.id()))
        .remove();

      // 2. Alta o actualización de nodos. Los clusters primero: Cytoscape
      // exige que el padre exista antes que el hijo que lo referencia.
      const nodes = Object.values(graph.nodes);
      const ordered = [
        ...nodes.filter((n) => n.kind === 'cluster'),
        ...nodes.filter((n) => n.kind !== 'cluster'),
      ];

      for (const node of ordered) {
        const existing = this.cy.getElementById(node.id);

        if (existing.empty()) {
          this.cy.add({
            group: 'nodes',
            data: nodeData(node, this.rootId, this.scoreOf),
            position: { x: node.x, y: node.y },
          });
          continue;
        }

        // En un nodo que ya existe, cambiar `data.parent` no lo reubica: la
        // jerarquía se mueve con `move()`.
        const currentParent = existing.parent().first().id() as string | undefined;
        if (currentParent !== node.parent) {
          existing.move({ parent: node.parent ?? null });
        }

        existing.data(nodeData(node, this.rootId, this.scoreOf));
        const position = existing.position();
        // Escribir la posición siempre reiniciaría un drag en curso.
        if (position.x !== node.x || position.y !== node.y) {
          existing.position({ x: node.x, y: node.y });
        }
      }

      // 3. Aristas (después de los nodos: necesitan sus extremos).
      for (const edge of Object.values(graph.edges)) {
        const existing = this.cy.getElementById(edge.id);
        const data = edgeData(edge);

        if (existing.empty()) this.cy.add({ group: 'edges', data });
        else existing.data(data);
      }

      // 4. Marcas que dependen del conjunto, no del nodo suelto: una dirección
      // es "reutilizada" si toca la misma tx por los dos lados (H-07), y es UTXO
      // si solo la alimenta una salida sin gastar.
      this.markAddressRoles(graph);
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Roles visuales de las direcciones (docs/06 §3).
   *
   * - **UTXO** (diamante azul): solo la alimenta una salida sin gastar y no
   *   gasta en ninguna tx del grafo. Es dinero parado.
   * - **Reutilizada** (borde ámbar): entra y sale de la misma tx — la señal de
   *   H-07, la heurística de más confianza.
   */
  private markAddressRoles(graph: Graph): void {
    for (const node of Object.values(graph.nodes)) {
      if (node.kind !== 'address') continue;

      const incoming = Object.values(graph.edges).filter((edge) => edge.to === node.id);
      const outgoing = Object.values(graph.edges).filter((edge) => edge.from === node.id);

      const isUtxo = outgoing.length === 0 && incoming.some((edge) => edge.isUtxo === true);
      const reused = incoming.some((incomingEdge) =>
        outgoing.some((outgoingEdge) => outgoingEdge.to === incomingEdge.from),
      );

      const element = this.cy.getElementById(node.id);
      if (element.empty()) continue;

      element.data('isUtxo', isUtxo);
      element.data('reused', reused);
    }
  }

  /** Refleja la selección del store (RF-09). */
  syncSelection(ids: readonly string[]): void {
    this.syncing = true;

    try {
      const selected = new Set(ids);
      this.cy.nodes().forEach((node) => {
        if (selected.has(node.id())) node.select();
        else node.unselect();
      });
    } finally {
      this.syncing = false;
    }
  }

  /** El usuario soltó un nodo tras arrastrarlo (RF-07). */
  onNodeMoved(handler: NodeMovedHandler): void {
    this.cy.on('dragfree', 'node', (event) => {
      if (this.syncing) return;

      const node = event.target as NodeSingular;
      handler(node.id(), { ...node.position() });
    });
  }

  /** Doble click sobre una tx: expandir (RF-06). */
  onExpandRequested(handler: ExpandHandler): void {
    this.cy.on('dbltap', 'node', (event) => {
      if (this.syncing) return;

      handler((event.target as NodeSingular).id());
    });
  }

  /** La selección cambió por gesto del usuario (RF-09). */
  onSelectionChanged(handler: SelectionHandler): void {
    const emit = (): void => {
      if (this.syncing) return;

      handler(this.cy.$(':selected').map((element) => element.id()));
    };

    this.cy.on('select unselect', emit);
  }

  /**
   * Encaja el grafo en la vista (RF-08). Viewport, no modelo.
   *
   * Con tope al 100%: `fit()` a secas amplía hasta llenar la pantalla, y con
   * una sola tx el grafo aparecía al 211% — enorme y desconcertante. Ajustar
   * puede alejar cuanto haga falta, pero nunca acercar más de lo natural.
   */
  fit(): void {
    this.cy.fit(undefined, 48);
    if (this.cy.zoom() > 1) {
      this.cy.zoom({
        level: 1,
        renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 },
      });
      this.cy.center();
    }
  }

  /**
   * PNG del grafo (RF-23). Data URL.
   *
   * El único export que vive aquí y no en `persistence/`: un PNG es una foto de
   * **lo que se ve**, y quién sabe qué se ve es el motor. El CSV y el SVG salen
   * de los datos y no necesitan pedirle permiso a nadie.
   *
   * `full: true` = el grafo entero aunque no quepa en pantalla; `false` = solo
   * lo que hay a la vista. Las dos cosas de RF-23, y la que se espera al pulsar
   * «exportar» es la primera: se exporta la investigación, no la ventana.
   *
   * `scale: 2` porque estas imágenes acaban en un informe o en una pantalla
   * grande, y un PNG a 1× de un grafo con texto pequeño se lee mal.
   */
  toPng(options: { full?: boolean; scale?: number } = {}): string {
    return this.cy.png({
      full: options.full ?? true,
      scale: options.scale ?? 2,
      bg: TOKENS.bg,
    });
  }

  destroy(): void {
    this.cy.destroy();
  }
}
