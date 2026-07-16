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

/**
 * Cambia de red y **vacía la investigación** (RF-04).
 *
 * Una investigación es de una sola red. Los txids de mainnet y de testnet no
 * tienen nada que ver entre sí: un grafo con las dos no significa nada, y
 * guardado afirma algo falso —el fichero lleva **una** red, así que las txs de la
 * otra quedarían etiquetadas con la que no es—.
 *
 * Por eso el vaciado va en el mismo comando que el cambio: son la misma decisión,
 * y separarlos dejaría abierta la puerta a hacer uno sin el otro, que es
 * exactamente el estado del que venimos.
 */
export function setNetwork(network: Network): UndoableCommand {
  return reversible('SetNetwork', (state) =>
    state.network === network ? state : { network, graph: emptyGraph(), selection: [] },
  );
}

/** Vuelca los datos de una tx en el grafo (RF-06, idempotente). */
export function addTxData(tx: NormalizedTx): UndoableCommand {
  return reversible('AddTxData', (state) => ({ ...state, graph: addTxToGraph(state.graph, tx) }));
}

/**
 * Vuelca una página entera de txs de una vez (RF-31).
 *
 * No es azúcar sobre `addTxData`: cada despacho sincroniza el grafo **completo**
 * con el motor, así que 25 despachos por página cuestan 25 sincronizaciones de un
 * grafo que además va creciendo — cuadrático, y con la cuarta página la UI ya se
 * arrastra. Justo lo que RF-31 prohíbe.
 *
 * De paso arregla el undo: deshacer una página es deshacer *la página*, no
 * veinticinco veces la misma tecla.
 */
export function addTxsData(txs: readonly NormalizedTx[]): UndoableCommand {
  return reversible('AddTxsData', (state) => ({
    ...state,
    graph: txs.reduce((graph, tx) => addTxToGraph(graph, tx), state.graph),
  }));
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
 * Agrupa direcciones en un cluster (RF-19).
 *
 * El cluster es un nodo más, de `kind: 'cluster'`, y las direcciones pasan a ser
 * sus hijas (`parent`). Que sea un nodo y no una estructura aparte es lo que le
 * da gratis todo lo demás: se etiqueta con RF-10, se colorea con RF-11, se
 * guarda con RF-21 y se deshace como cualquier otro cambio.
 *
 * Se coloca en el centro de sus hijas: un compound node abarca a los suyos, y
 * dejarlo en (0,0) lo mandaría lejos del grupo que representa.
 */
export function createCluster(
  id: string,
  members: readonly string[],
  label?: string,
): UndoableCommand {
  return reversible('CreateCluster', (state) => {
    const inside = members
      .map((member) => state.graph.nodes[member])
      .filter((node): node is GraphNode => node !== undefined);
    // Agrupar una cosa sola no agrupa nada.
    if (inside.length < 2) return state;

    const x = inside.reduce((total, node) => total + node.x, 0) / inside.length;
    const y = inside.reduce((total, node) => total + node.y, 0) / inside.length;

    const nodes: Record<string, GraphNode> = {
      ...state.graph.nodes,
      [id]: { id, kind: 'cluster', x, y, placed: true, ...(label === undefined ? {} : { label }) },
    };
    for (const node of inside) nodes[node.id] = { ...node, parent: id };

    return { ...state, graph: { ...state.graph, nodes } };
  });
}

/**
 * Deshace una agrupación (RF-19): quita el cluster y libera a sus hijas.
 *
 * Las direcciones no se borran nunca — la agrupación es una hipótesis sobre
 * quién manda, no un cambio en los datos. Deshacerla devuelve las direcciones,
 * no las pierde.
 */
export function removeCluster(id: string): UndoableCommand {
  return reversible('RemoveCluster', (state) => {
    if (state.graph.nodes[id]?.kind !== 'cluster') return state;

    const nodes: Record<string, GraphNode> = {};
    for (const [nodeId, node] of Object.entries(state.graph.nodes)) {
      if (nodeId === id) continue;

      if (node.parent === id) {
        const { parent: _drop, ...orphan } = node;
        nodes[nodeId] = orphan;
      } else nodes[nodeId] = node;
    }

    return {
      ...state,
      graph: { ...state.graph, nodes },
      selection: state.selection.filter((selected) => selected !== id),
    };
  });
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
