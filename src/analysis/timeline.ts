/**
 * Línea temporal (RF-35): qué se movió entre dos fechas.
 *
 * Es un **filtro de vista**, no una edición: dice qué mirar, no cambia el grafo.
 * Por eso vive en `analysis/` y devuelve un conjunto de ids — pintar es cosa de
 * `graph/`, y el modelo ni se entera (no entra en el historial, Ctrl+Z no lo
 * deshace).
 */
import type { Graph } from '../core/graph-model';

export interface TimeRange {
  /** Epoch en segundos, inclusive. */
  from: number;
  /** Epoch en segundos, inclusive. */
  to: number;
}

/**
 * El rango que abarca la investigación, o `null` si no hay nada que filtrar.
 *
 * `null` con menos de dos fechas distintas: un tirador que solo puede estar en un
 * sitio no es un filtro, es un adorno. La barra no debe ni aparecer.
 */
export function timeRangeOf(graph: Graph): TimeRange | null {
  const times = Object.values(graph.nodes)
    .map((node) => node.tx?.blockTime)
    // Las txs sin confirmar no tienen fecha. No es que valgan 0: es que no la
    // tienen, y meter un 0 pondría el extremo del rango en 1970.
    .filter((time): time is number => time !== undefined && time !== null);

  if (times.length === 0) return null;

  const from = Math.min(...times);
  const to = Math.max(...times);

  return from === to ? null : { from, to };
}

/**
 * Los nodos que se ven con este rango.
 *
 * Las reglas de quién entra no son evidentes y cada una tiene su motivo:
 *
 * - **Una tx** entra si su fecha cae dentro (extremos incluidos).
 * - **Una tx sin confirmar** entra **siempre**: no tiene fecha, y filtrarla por
 *   una fecha sería inventársela. Está en el mempool, que es «ahora», y «ahora»
 *   cae dentro de cualquier rango que se esté mirando.
 * - **Una dirección** no tiene fecha propia: entra si entra alguna de sus txs.
 *   Esconderla siempre dejaría aristas colgando de la nada; mostrarla siempre
 *   llenaría la pantalla de direcciones huérfanas de sus txs.
 * - **Un cluster** entra si entra alguna de sus hijas, o sería una caja vacía.
 */
export function nodesInRange(graph: Graph, range: TimeRange): Set<string> {
  const visible = new Set<string>();

  const inRange = (time: number | null | undefined): boolean => {
    if (time === undefined || time === null) return true;

    return time >= range.from && time <= range.to;
  };

  for (const node of Object.values(graph.nodes)) {
    if (node.kind !== 'tx') continue;
    // Un nodo de tx sin datos (una investigación recién migrada del legacy) no
    // tiene fecha que mirar: se trata como el resto de lo que no la tiene.
    if (inRange(node.tx?.blockTime)) visible.add(node.id);
  }

  /*
   * Las direcciones heredan de SUS txs, y solo de ellas.
   *
   * Propagar por las aristas a secas (si un extremo se ve, el otro también)
   * contagia en cadena: dos txs que comparten una dirección de entrada —lo más
   * normal del mundo, es H-07— se arrastrarían la una a la otra, y una tx de
   * marzo acabaría visible con el rango puesto en enero. El salto va en un solo
   * sentido: de tx visible a su dirección, y ahí se para.
   */
  for (const edge of Object.values(graph.edges)) {
    const from = graph.nodes[edge.from];
    const to = graph.nodes[edge.to];

    if (from?.kind === 'tx' && to?.kind === 'address' && visible.has(from.id)) visible.add(to.id);
    if (to?.kind === 'tx' && from?.kind === 'address' && visible.has(to.id)) visible.add(from.id);
  }

  // Los clusters, de sus hijas.
  for (const node of Object.values(graph.nodes)) {
    if (node.parent === undefined) continue;
    if (visible.has(node.id)) visible.add(node.parent);
  }

  return visible;
}
