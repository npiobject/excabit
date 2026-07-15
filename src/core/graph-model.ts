/**
 * Modelo del grafo de la investigación (docs/05 §2).
 *
 * Agnóstico del render: no sabe que existe Cytoscape. `graph/cy-adapter.ts` lo
 * traduce a la escena; cualquier otro motor podría hacerlo igual. Esa frontera
 * es lo que permite revisar la ADR-001 sin tocar el dominio.
 *
 * El grafo es **datos**, no píxeles: es la lección de BUG-013 (el legacy
 * deshacía repintando imágenes, así que los datos y lo que se veía divergían).
 */
import type { AddressId, NormalizedTx, Txid } from './types';

export type NodeKind = 'tx' | 'address' | 'cluster';
export type EdgeKind = 'input' | 'output';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  /** Posición en el lienzo. La fija el layout y la cambia el usuario (RF-07). */
  x: number;
  y: number;
  /** Anotaciones del usuario, parte de la investigación (RF-10/RF-11). */
  label?: string;
  color?: string;
  note?: string;
  /** Cluster al que pertenece (RF-19). */
  parent?: string;
  /** Datos de la tx, para el panel de detalles (RF-15). Solo en `kind: 'tx'`. */
  tx?: NormalizedTx;
  /** Dirección, solo en `kind: 'address'`. */
  address?: AddressId;
  /** `true` si el usuario la ha movido: el layout ya no la recoloca (RF-06). */
  pinned?: boolean;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  value: bigint;
  /** Salida sin gastar: se marca visualmente (RF-05). */
  isUtxo?: boolean;
}

export interface Graph {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
}

/** Prefijos distintos: una tx y una dirección jamás comparten id de nodo. */
export const txNodeId = (txid: Txid): string => `tx:${txid}`;
export const addressNodeId = (address: AddressId): string => `addr:${address}`;
export const edgeId = (from: string, to: string): string => `${from}->${to}`;

export const emptyGraph = (): Graph => ({ nodes: {}, edges: {} });

export const nodesOf = (graph: Graph): GraphNode[] => Object.values(graph.nodes);
export const edgesOf = (graph: Graph): GraphEdge[] => Object.values(graph.edges);

/**
 * Vuelca una tx normalizada en el grafo: el nodo de la tx, un nodo por cada
 * dirección implicada y las aristas dirección→tx→dirección.
 *
 * **Idempotente** (RF-06): volver a añadir la misma tx no duplica nada. Una
 * dirección que ya existe se reutiliza — es justo lo que hace visible el flujo
 * de fondos cuando dos txs tocan la misma dirección.
 *
 * Puro: devuelve un grafo nuevo.
 */
export function addTxToGraph(graph: Graph, tx: NormalizedTx): Graph {
  const nodes: Record<string, GraphNode> = { ...graph.nodes };
  const edges: Record<string, GraphEdge> = { ...graph.edges };

  const id = txNodeId(tx.txid);
  // Si el nodo ya estaba, se conservan sus anotaciones y su posición: el
  // usuario ya trabajó sobre él.
  nodes[id] = { ...nodes[id], id, kind: 'tx', x: nodes[id]?.x ?? 0, y: nodes[id]?.y ?? 0, tx };

  const ensureAddress = (address: AddressId): string => {
    const addrId = addressNodeId(address);
    nodes[addrId] = {
      ...nodes[addrId],
      id: addrId,
      kind: 'address',
      x: nodes[addrId]?.x ?? 0,
      y: nodes[addrId]?.y ?? 0,
      address,
    };

    return addrId;
  };

  for (const vin of tx.vin) {
    // La coinbase no viene de ninguna dirección: no hay arista que dibujar.
    if (vin.isCoinbase || vin.address === undefined) continue;

    const from = ensureAddress(vin.address);
    const edge = edgeId(from, id);
    edges[edge] = { id: edge, from, to: id, kind: 'input', value: vin.value };
  }

  for (const vout of tx.vout) {
    if (vout.address === undefined) continue;

    const to = ensureAddress(vout.address);
    const edge = edgeId(id, to);
    edges[edge] = {
      id: edge,
      from: id,
      to,
      kind: 'output',
      value: vout.value,
      // `spent === undefined` = aún no consultado; no se afirma que sea UTXO.
      ...(vout.spent === undefined ? {} : { isUtxo: !vout.spent }),
    };
  }

  return { nodes, edges };
}
