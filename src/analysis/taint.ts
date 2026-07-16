/**
 * Seguimiento de flujo de fondos (RF-18).
 *
 * ## El modelo: haircut, no poison
 *
 * Cuando una tx mezcla dinero marcado con dinero limpio, sus salidas salen
 * marcadas **en la proporción en que entró**: 1 BTC marcado de 4 totales → cada
 * salida al 25 %.
 *
 * La alternativa —*poison*: lo que toca fondos marcados queda marcado al 100 %—
 * es más fácil de escribir y miente más. A los dos o tres saltos tiñe medio
 * grafo y deja de distinguir nada. Con haircut, un CoinJoin 5×5 diluye el rastro
 * al 20 %, que es exactamente lo que hace en la realidad y lo que esta app
 * quiere enseñar (docs/00 §3: mostrar la incertidumbre en vez de esconderla
 * detrás de un veredicto).
 *
 * ## El rastro va hacia delante
 *
 * Solo se sigue el sentido del gasto: dirección → tx → dirección. Que otra
 * entrada alimente la misma tx no la marca — de ahí venía dinero, no iba.
 *
 * ## Por qué no es un simple recorrido
 *
 * Dos motivos:
 *
 * 1. **Los caminos se reencuentran.** En un diamante (el dinero se parte en dos
 *    ramas que acaban en la misma dirección), esa dirección recibe marcado por
 *    los dos lados y hay que **sumarlo**. Un BFS con «visitados» contaría uno.
 * 2. **Hay ciclos.** Una dirección reutilizada (H-07) puede entrar y salir de la
 *    misma tx. Un recorrido ingenuo se queda dando vueltas.
 *
 * Se resuelve con una *worklist*: un nodo se vuelve a encolar solo si su marcado
 * ha **crecido**. Como el marcado nunca disminuye y está acotado por el valor de
 * las aristas, converge; `maxHops` acota además la profundidad.
 */
import type { Graph, GraphEdge } from '../core/graph-model';

export interface TaintOptions {
  /** Nodo desde el que se sigue el dinero: una dirección o una tx. */
  source: string;
  /**
   * Saltos máximos, contando un salto por transacción atravesada.
   *
   * Por defecto 6: más allá, con haircut, lo que queda suele ser polvo y el
   * grafo ya no cabe en una pantalla. No es un límite técnico, es dónde el
   * rastro deja de decir algo.
   */
  maxHops?: number;
}

export interface TaintedNode {
  id: string;
  /** Satoshis procedentes del origen que llegan a este nodo. */
  amount: bigint;
  /** Transacciones atravesadas desde el origen, por el camino más corto. */
  hops: number;
  /** Fracción marcada de lo que este nodo recibe (0..1). Para pintar. */
  ratio: number;
}

const DEFAULT_MAX_HOPS = 6;

const sum = (values: bigint[]): bigint => values.reduce((total, value) => total + value, 0n);

/**
 * Sigue el dinero desde `source` y devuelve, por nodo, cuánto llega y en cuántos
 * saltos. El nodo origen incluido; los no alcanzados, ausentes.
 */
export function traceTaint(graph: Graph, options: TaintOptions): Map<string, TaintedNode> {
  const result = new Map<string, TaintedNode>();
  const source = graph.nodes[options.source];
  if (source === undefined) return result;

  const maxHops = options.maxHops ?? DEFAULT_MAX_HOPS;

  // Índices por nodo: recorrer todas las aristas en cada paso convertiría esto
  // en cuadrático, y un grafo de 300 nodos es lo normal aquí (RNF-01).
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  const index = (map: Map<string, GraphEdge[]>, key: string, edge: GraphEdge): void => {
    const list = map.get(key);
    if (list === undefined) map.set(key, [edge]);
    else list.push(edge);
  };
  for (const edge of Object.values(graph.edges)) {
    index(outgoing, edge.from, edge);
    index(incoming, edge.to, edge);
  }

  /** Satoshis marcados que lleva cada arista. */
  const tainted = new Map<string, bigint>();
  const hops = new Map<string, number>([[options.source, 0]]);

  const outOf = (id: string): GraphEdge[] => outgoing.get(id) ?? [];
  const inTo = (id: string): GraphEdge[] => incoming.get(id) ?? [];

  /**
   * Reparte `amount` entre las salidas de `node`, en proporción a su valor.
   *
   * Se reparte sobre lo que SALE, no sobre lo que entra: la diferencia entre una
   * cosa y otra es la comisión, y prorratear sobre las entradas evaporaría un
   * poco del rastro en cada salto por un motivo que no tiene nada que ver con
   * seguir el dinero.
   *
   * Pero el marcado que entra puede ser **mayor que todo lo que sale** —
   * justamente por esa comisión. Entonces se acota: una arista nunca lleva más
   * marcado que su propio valor. Lo que sobra se lo llevó el minero y por ahí no
   * hay rastro que seguir.
   */
  const spread = (node: string, amount: bigint): string[] => {
    const outs = outOf(node);
    const totalOut = sum(outs.map((edge) => edge.value));
    // Dinero parado (una UTXO) o aristas de valor cero: el rastro acaba aquí.
    if (totalOut === 0n) return [];

    const spreadable = amount > totalOut ? totalOut : amount;

    const touched: string[] = [];
    for (const edge of outs) {
      // División entera: si el reparto no es exacto se queda corto, nunca largo.
      // Preferimos perder un satoshi de rastro a inventarlo.
      const share = (spreadable * edge.value) / totalOut;
      if (share <= (tainted.get(edge.id) ?? 0n)) continue;

      tainted.set(edge.id, share);
      touched.push(edge.to);
    }

    return touched;
  };

  const sourceHops = 0;
  const queue: string[] = [];

  for (const next of spread(options.source, sum(outOf(options.source).map((edge) => edge.value)))) {
    // Una tx cuenta como salto; pasar por una dirección, no: es el mismo dinero
    // esperando a ser gastado.
    const nextHops = hopsOf(options.source, next);
    // El límite se mira ya en el primer paso: con `maxHops: 0` el rastro no sale
    // del origen, que es lo que dice pedir.
    if (nextHops > maxHops) {
      for (const edge of outOf(options.source)) tainted.delete(edge.id);
      break;
    }

    queue.push(next);
    hops.set(next, nextHops);
  }

  function hopsOf(from: string, to: string): number {
    const base = hops.get(from) ?? 0;
    const crossesTx = graph.nodes[to]?.kind === 'tx';

    return crossesTx ? base + 1 : base;
  }

  /*
   * `for…of` sobre una cola que crece: el iterador de un array relee su longitud
   * en cada vuelta, así que lo que se añade aquí dentro también se recorre.
   *
   * Un nodo solo entra en la cola desde `spread`, que ya comprueba las dos
   * cosas: que le llega marcado (si no, no lo devuelve) y que cabe en `maxHops`.
   * Así que aquí no hacen falta esas guardas — y ponerlas «por si acaso» sería
   * código que no se puede ejecutar ni, por tanto, probar.
   */
  for (const id of queue) {
    const taintedIn = sum(inTo(id).map((edge) => tainted.get(edge.id) ?? 0n));

    for (const next of spread(id, taintedIn)) {
      const nextHops = hopsOf(id, next);
      if (nextHops > maxHops) continue;

      // El camino más corto manda para los saltos; el marcado se acumula aparte.
      const known = hops.get(next);
      if (known === undefined || nextHops < known) hops.set(next, nextHops);
      queue.push(next);
    }
  }

  /* ---- Resultado: por nodo, lo que le llega marcado ---- */

  const totalOutOfSource = sum(outOf(options.source).map((edge) => edge.value));
  result.set(options.source, {
    id: options.source,
    amount: totalOutOfSource === 0n ? totalIn(graph, options.source) : totalOutOfSource,
    hops: sourceHops,
    ratio: 1,
  });

  for (const node of Object.keys(graph.nodes)) {
    if (node === options.source) continue;

    const ins = inTo(node);
    const taintedIn = sum(ins.map((edge) => tainted.get(edge.id) ?? 0n));
    if (taintedIn === 0n) continue;

    // Si algo marcado llega hasta aquí, alguna arista de entrada vale más que
    // cero: no hace falta protegerse de dividir entre cero, no puede pasar.
    const totalIn = sum(ins.map((edge) => edge.value));

    result.set(node, {
      id: node,
      amount: taintedIn,
      hops: hops.get(node) ?? 0,
      // `Number` sobre la división de dos bigint perdería los decimales, que es
      // justo lo que se quiere aquí: el ratio es para pintar, no para contar.
      ratio: Number(taintedIn) / Number(totalIn),
    });
  }

  return result;
}

/** Lo que recibe un nodo. Para el origen sin salidas: una UTXO, dinero parado. */
function totalIn(graph: Graph, id: string): bigint {
  return sum(
    Object.values(graph.edges)
      .filter((edge) => edge.to === id)
      .map((edge) => edge.value),
  );
}
