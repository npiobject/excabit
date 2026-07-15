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
import type { Graph, GraphNode } from '@/core/graph-model';
import { graphStylesheet } from './styles';

export interface CyAdapterOptions {
  container?: HTMLElement;
  /** Para tests: instancia sin DOM. */
  headless?: boolean;
  /** Id de la tx raíz, para destacarla (RF-05). */
  rootId?: string;
}

export type NodeMovedHandler = (id: string, position: { x: number; y: number }) => void;
export type ExpandHandler = (id: string) => void;
export type SelectionHandler = (ids: string[]) => void;

function nodeData(node: GraphNode, rootId: string | undefined): ElementDefinition['data'] {
  return {
    id: node.id,
    kind: node.kind,
    label: node.label ?? '',
    ...(node.color === undefined ? {} : { color: node.color }),
    ...(node.parent === undefined ? {} : { parent: node.parent }),
    ...(node.id === rootId ? { isRoot: true } : {}),
  };
}

export class CyAdapter {
  readonly cy: Core;
  private rootId: string | undefined;
  /** Evita que `sync()` dispare los handlers de interacción del usuario. */
  private syncing = false;

  constructor(options: CyAdapterOptions = {}) {
    this.rootId = options.rootId;
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
            data: nodeData(node, this.rootId),
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

        existing.data(nodeData(node, this.rootId));
        const position = existing.position();
        // Escribir la posición siempre reiniciaría un drag en curso.
        if (position.x !== node.x || position.y !== node.y) {
          existing.position({ x: node.x, y: node.y });
        }
      }

      // 3. Aristas (después de los nodos: necesitan sus extremos).
      for (const edge of Object.values(graph.edges)) {
        const existing = this.cy.getElementById(edge.id);
        const data = {
          id: edge.id,
          source: edge.from,
          target: edge.to,
          kind: edge.kind,
          value: edge.value.toString(),
          ...(edge.isUtxo === undefined ? {} : { isUtxo: edge.isUtxo }),
        };

        if (existing.empty()) this.cy.add({ group: 'edges', data });
        else existing.data(data);
      }
    } finally {
      this.syncing = false;
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

  /** Encaja el grafo en la vista (RF-08). Viewport, no modelo. */
  fit(): void {
    this.cy.fit(undefined, 40);
  }

  destroy(): void {
    this.cy.destroy();
  }
}
