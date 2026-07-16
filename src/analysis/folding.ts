/**
 * Qué se puede plegar sin perder información (RF-36.3, RF-36.4).
 *
 * ## Por qué hace falta
 *
 * Medido en la app con datos reales: **el 96-97 % de los nodos son direcciones y
 * el 98-100 % de ellas aparecen una sola vez**. Una dirección que solo toca una
 * tx no lleva a ningún sitio — es el «de dónde vino» o el «a dónde fue», que la
 * propia tx ya cuenta («28 in · 2 out»). Plegarlas deja ver la estructura: qué
 * transacciones hay y cómo se enlazan.
 *
 * ## Plegar no es esconder
 *
 * Los datos no se tocan y el usuario sabe cuántos nodos hay plegados y los abre
 * con una tecla. «El grafo es la interfaz» (docs/00) sigue en pie: un grafo
 * ilegible tampoco enseñaba esas direcciones — solo fingía que sí.
 *
 * ## Lo que NO se pliega importa más que lo que sí
 *
 * Se queda todo lo que **significa algo**: las conexiones entre txs, las señales
 * de privacidad (H-07, UTXO) y cualquier cosa que el usuario haya marcado a mano.
 * Esconder el hallazgo, o lo que alguien se molestó en etiquetar, es la clase de
 * listeza que hace desconfiar de una herramienta.
 */
import type { Graph, GraphNode } from '../core/graph-model';

/**
 * Ids de los nodos que se pueden plegar.
 *
 * Una dirección se pliega si es «de paso»: toca **una sola** transacción y no
 * lleva ninguna marca del usuario. Y si está dentro de un cluster, se pliega con
 * él — ahí la conexión no se pierde, porque la caja sigue enlazada al grafo por
 * las aristas de sus hijas.
 */
export function foldableOf(graph: Graph): Set<string> {
  const foldable = new Set<string>();

  /** Cuántas txs distintas toca cada dirección, y si alguna la reutiliza. */
  const touched = new Map<string, Set<string>>();
  const utxo = new Set<string>();

  const link = (address: string, tx: string): void => {
    const seen = touched.get(address);
    if (seen === undefined) touched.set(address, new Set([tx]));
    else seen.add(tx);
  };

  for (const edge of Object.values(graph.edges)) {
    const from = graph.nodes[edge.from];
    const to = graph.nodes[edge.to];

    if (from?.kind === 'address' && to?.kind === 'tx') link(from.id, to.id);
    if (to?.kind === 'address' && from?.kind === 'tx') {
      link(to.id, from.id);
      // Dinero sin gastar: se marca a propósito en el grafo (RF-05).
      if (edge.isUtxo === true) utxo.add(to.id);
    }
  }

  const marked = (node: GraphNode): boolean =>
    node.label !== undefined || node.color !== undefined || node.note !== undefined;

  for (const node of Object.values(graph.nodes)) {
    if (node.kind !== 'address') continue;
    // Marcado a mano: se queda. Si se molestó en nombrarlo, le importa.
    if (marked(node)) continue;

    // Dentro de un cluster: se pliega con la caja, que lo representa (RF-36.3).
    if (node.parent !== undefined) {
      foldable.add(node.id);
      continue;
    }

    if (utxo.has(node.id)) continue;

    const txs = touched.get(node.id);
    // Grado 0 (nadie la trajo por una arista) o grado ≥ 2 (une txs: **es** la
    // conexión, y esconderla partiría el grafo en trozos sueltos).
    if (txs === undefined || txs.size !== 1) continue;

    // Reutilizada por la misma tx —entra y sale— es H-07 en pantalla: el
    // hallazgo, no el ruido.
    const reused = Object.values(graph.edges).filter(
      (edge) => edge.from === node.id || edge.to === node.id,
    );
    if (reused.length > 1) continue;

    foldable.add(node.id);
  }

  return foldable;
}
