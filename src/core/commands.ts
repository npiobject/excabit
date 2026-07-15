/**
 * Comandos de la investigación (ADR-004, docs/05 §2).
 *
 * Toda mutación del estado pasa por un comando con `apply()`/`undo()`
 * simétricos. La pila de undo (`core/undo.ts`) solo los apila.
 *
 * **BUG-013**: el legacy hacía `saveState()` en CADA click guardando una imagen
 * completa del canvas (`get()`) en un array sin límite: la memoria crecía sin
 * techo en sesiones largas. Y al deshacer solo repintaba la imagen, sin
 * revertir los datos, así que el siguiente redibujado restauraba lo "deshecho".
 *
 * Aquí `undo()` devuelve el estado anterior, que es un objeto **inmutable ya
 * existente**: guardarlo cuesta una referencia, no una copia, porque los
 * comandos comparten estructura (structural sharing). Deshacer revierte datos,
 * no píxeles, así que el modelo y lo que se ve no pueden divergir.
 */
import type { Command } from './store';
import type { Graph, GraphNode } from './graph-model';
import { addTxToGraph, emptyGraph } from './graph-model';
import type { Network, NormalizedTx } from './types';

export interface InvestigationState {
  network: Network;
  graph: Graph;
  /** Ids de los nodos seleccionados (RF-09). */
  selection: string[];
}

/** Un comando que sabe deshacerse. */
export interface UndoableCommand extends Command<InvestigationState> {
  undo(state: InvestigationState): InvestigationState;
}

export const initialInvestigation = (): InvestigationState => ({
  network: 'mainnet',
  graph: emptyGraph(),
  selection: [],
});

/**
 * Construye un comando reversible.
 *
 * `apply` recuerda el estado que recibió para que `undo` lo devuelva tal cual:
 * simetría exacta por construcción, sin que cada comando tenga que calcular su
 * propio inverso (y equivocarse). El comando es de un solo uso, como manda el
 * patrón Command: se crea, se despacha y se apila.
 */
function reversible(
  type: string,
  apply: (state: InvestigationState) => InvestigationState,
): UndoableCommand {
  let previous: InvestigationState | undefined;

  return {
    type,
    apply(state) {
      previous = state;
      return apply(state);
    },
    undo(state) {
      // Sin `apply` previo no hay nada que deshacer: no se inventa un estado.
      return previous ?? state;
    },
  };
}

/** Reemplaza un nodo aplicándole un parche. Si no existe, el estado no cambia. */
function patchNode(
  state: InvestigationState,
  id: string,
  patch: (node: GraphNode) => GraphNode,
): InvestigationState {
  const node = state.graph.nodes[id];
  if (node === undefined) return state;

  return {
    ...state,
    graph: { ...state.graph, nodes: { ...state.graph.nodes, [id]: patch(node) } },
  };
}

/** Vuelca los datos de una tx en el grafo (RF-06, idempotente). */
export function addTxData(tx: NormalizedTx): UndoableCommand {
  return reversible('AddTxData', (state) => ({ ...state, graph: addTxToGraph(state.graph, tx) }));
}

/**
 * Mueve un nodo (RF-07). Solo toca posiciones, nunca datos de dominio.
 * Lo marca como `pinned`: a partir de aquí el layout respeta dónde lo dejó el
 * usuario (RF-06).
 */
export function moveNode(id: string, to: { x: number; y: number }): UndoableCommand {
  return reversible('MoveNode', (state) =>
    patchNode(state, id, (node) => ({ ...node, x: to.x, y: to.y, pinned: true })),
  );
}

/** Etiqueta un nodo (RF-10). Una etiqueta vacía se elimina, no se guarda vacía. */
export function setLabel(id: string, label: string): UndoableCommand {
  return reversible('SetLabel', (state) =>
    patchNode(state, id, ({ label: _drop, ...node }) => (label === '' ? node : { ...node, label })),
  );
}

/** Colorea un nodo (RF-11). */
export function setColor(id: string, color: string): UndoableCommand {
  return reversible('SetColor', (state) =>
    patchNode(state, id, ({ color: _drop, ...node }) => (color === '' ? node : { ...node, color })),
  );
}

/** Anota un nodo. */
export function setNote(id: string, note: string): UndoableCommand {
  return reversible('SetNote', (state) =>
    patchNode(state, id, ({ note: _drop, ...node }) => (note === '' ? node : { ...node, note })),
  );
}

export function setSelection(ids: readonly string[]): UndoableCommand {
  return reversible('SetSelection', (state) => ({ ...state, selection: [...ids] }));
}

/**
 * Elimina nodos y sus aristas huérfanas (RF-12).
 *
 * Dejar una arista apuntando a un nodo que ya no existe corrompería el grafo:
 * por eso se van juntas.
 */
export function deleteSelection(ids: readonly string[]): UndoableCommand {
  return reversible('DeleteSelection', (state) => {
    if (ids.length === 0) return state;

    const doomed = new Set(ids);
    const nodes: Record<string, GraphNode> = {};
    for (const [id, node] of Object.entries(state.graph.nodes)) {
      if (!doomed.has(id)) nodes[id] = node;
    }

    const edges: Graph['edges'] = {};
    for (const [id, edge] of Object.entries(state.graph.edges)) {
      if (!doomed.has(edge.from) && !doomed.has(edge.to)) edges[id] = edge;
    }

    return {
      ...state,
      graph: { nodes, edges },
      selection: state.selection.filter((id) => !doomed.has(id)),
    };
  });
}

/** Agrupa nodos en un cluster (RF-19, compound node). */
export function groupCluster(
  clusterId: string,
  ids: readonly string[],
  label: string,
): UndoableCommand {
  const id = `cluster:${clusterId}`;

  return reversible('GroupCluster', (state) => {
    const nodes: Record<string, GraphNode> = {
      ...state.graph.nodes,
      [id]: { id, kind: 'cluster', x: 0, y: 0, label },
    };

    for (const child of ids) {
      const node = nodes[child];
      if (node !== undefined) nodes[child] = { ...node, parent: id };
    }

    return { ...state, graph: { ...state.graph, nodes } };
  });
}
