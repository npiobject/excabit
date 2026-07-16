/**
 * Qué se puede plegar sin perder información (RF-36.3 y RF-36.4).
 *
 * El grafo está dominado por nodos que no llevan a ningún sitio: medido en la
 * app, el 96-97 % son direcciones y el 98-100 % de ellas aparecen **una sola
 * vez**. Plegarlas deja ver la estructura — qué txs hay y cómo se conectan —, que
 * es lo que se mira cuando se mira el grafo entero.
 *
 * Lo que NO se pliega es tan importante como lo que sí: una dirección que une dos
 * txs **es** la conexión, y esconderla rompería el grafo en trozos sueltos.
 */
import { describe, it, expect } from 'vitest';
import { foldableOf } from '@/analysis/folding';
import { addTxToGraph, addressNodeId, emptyGraph, txNodeId, type Graph } from '@/core/graph-model';
import { txFixture } from '@tests/helpers/tx-fixture';

const tx = (txid: string, ins: string[], outs: string[]) =>
  txFixture({
    txid: txid.padStart(64, '0'),
    vin: ins.map((address, i) => ({
      txid: 'f'.repeat(64),
      vout: i,
      value: 1000n,
      address,
      scriptType: 'p2wpkh' as const,
      sequence: 0xffffffff,
      isCoinbase: false,
    })),
    vout: outs.map((address, n) => ({ n, value: 900n, address, scriptType: 'p2wpkh' as const })),
  });

const graphOf = (...txs: ReturnType<typeof tx>[]): Graph =>
  txs.reduce((graph, t) => addTxToGraph(graph, t), emptyGraph());

describe('direcciones que no llevan a ningún sitio (RF-36.4)', () => {
  it('una dirección que solo toca una tx se pliega', () => {
    const graph = graphOf(tx('aa', ['in1'], ['out1']));

    const foldable = foldableOf(graph);

    expect(foldable.has(addressNodeId('in1'))).toBe(true);
    expect(foldable.has(addressNodeId('out1'))).toBe(true);
  });

  it('una dirección que UNE dos txs NO se pliega: es la conexión', () => {
    // Esconderla partiría el grafo en dos trozos sin relación aparente — justo
    // lo contrario de lo que la app viene a enseñar.
    const graph = graphOf(tx('aa', ['in1'], ['puente']), tx('bb', ['puente'], ['out1']));

    const foldable = foldableOf(graph);

    expect(foldable.has(addressNodeId('puente'))).toBe(false);
    expect(foldable.has(addressNodeId('in1'))).toBe(true);
  });

  it('una dirección reutilizada por la misma tx tampoco: es H-07 en pantalla', () => {
    // Entra y sale de la misma tx: es la señal de privacidad más fuerte que hay
    // (docs/04 H-07). Plegarla escondería justo el hallazgo.
    const graph = graphOf(tx('aa', ['reusada'], ['reusada', 'out1']));

    expect(foldableOf(graph).has(addressNodeId('reusada'))).toBe(false);
  });

  it('las txs no se pliegan nunca: son el esqueleto', () => {
    const graph = graphOf(tx('aa', ['in1'], ['out1']));

    expect(foldableOf(graph).has(txNodeId('aa'.padStart(64, '0')))).toBe(false);
  });

  it('una dirección con etiqueta del usuario no se pliega', () => {
    // Si se molestó en nombrarla, le importa. Esconder lo que alguien marcó a
    // mano es la clase de listeza que hace desconfiar de una herramienta.
    const base = graphOf(tx('aa', ['in1'], ['out1']));
    const id = addressNodeId('in1');
    const graph: Graph = {
      ...base,
      nodes: { ...base.nodes, [id]: { ...base.nodes[id]!, label: 'Mi monedero' } },
    };

    expect(foldableOf(graph).has(id)).toBe(false);
  });

  it('ni una con color, ni una con nota', () => {
    const base = graphOf(tx('aa', ['in1', 'in2'], ['out1']));
    const graph: Graph = {
      ...base,
      nodes: {
        ...base.nodes,
        [addressNodeId('in1')]: { ...base.nodes[addressNodeId('in1')]!, color: '#f7931a' },
        [addressNodeId('in2')]: { ...base.nodes[addressNodeId('in2')]!, note: 'sospechosa' },
      },
    };

    const foldable = foldableOf(graph);
    expect(foldable.has(addressNodeId('in1'))).toBe(false);
    expect(foldable.has(addressNodeId('in2'))).toBe(false);
  });

  it('un UTXO no se pliega: es dinero parado y se marca a propósito (RF-05)', () => {
    const base = graphOf(tx('aa', ['in1'], ['out1']));
    const edge = Object.values(base.edges).find((e) => e.to === addressNodeId('out1'))!;
    const graph: Graph = {
      ...base,
      edges: { ...base.edges, [edge.id]: { ...edge, isUtxo: true } },
    };

    expect(foldableOf(graph).has(addressNodeId('out1'))).toBe(false);
  });
});

describe('clusters (RF-36.3)', () => {
  it('las direcciones de un cluster se pliegan: la caja las representa', () => {
    const base = graphOf(tx('aa', ['in1', 'in2'], ['out1']));
    const graph: Graph = {
      ...base,
      nodes: {
        ...base.nodes,
        'cluster:c1': { id: 'cluster:c1', kind: 'cluster', x: 0, y: 0, label: 'Monedero' },
        [addressNodeId('in1')]: { ...base.nodes[addressNodeId('in1')]!, parent: 'cluster:c1' },
        [addressNodeId('in2')]: { ...base.nodes[addressNodeId('in2')]!, parent: 'cluster:c1' },
      },
    };

    const foldable = foldableOf(graph);

    expect(foldable.has(addressNodeId('in1'))).toBe(true);
    expect(foldable.has(addressNodeId('in2'))).toBe(true);
    // La caja se queda: es lo que dice que ahí hay algo.
    expect(foldable.has('cluster:c1')).toBe(false);
  });

  it('una dirección de un cluster que además une dos txs SÍ se pliega con él', () => {
    // Dentro de un cluster la conexión no se pierde: la caja sigue conectada al
    // grafo por las aristas de sus hijas, y sigue viéndose de dónde a dónde va.
    const base = graphOf(tx('aa', ['in1'], ['puente']), tx('bb', ['puente'], ['out1']));
    const graph: Graph = {
      ...base,
      nodes: {
        ...base.nodes,
        'cluster:c1': { id: 'cluster:c1', kind: 'cluster', x: 0, y: 0 },
        [addressNodeId('puente')]: {
          ...base.nodes[addressNodeId('puente')]!,
          parent: 'cluster:c1',
        },
      },
    };

    expect(foldableOf(graph).has(addressNodeId('puente'))).toBe(true);
  });
});

describe('casos límite', () => {
  it('un grafo vacío no pliega nada', () => {
    expect(foldableOf(emptyGraph()).size).toBe(0);
  });

  it('una dirección suelta, sin aristas, no se pliega', () => {
    // Grado 0: no está de paso en ningún sitio, está sola. Si alguien la trajo
    // al grafo, es que quería verla.
    const graph: Graph = {
      nodes: { 'addr:sola': { id: 'addr:sola', kind: 'address', x: 0, y: 0, address: 'sola' } },
      edges: {},
    };

    expect(foldableOf(graph).size).toBe(0);
  });
});
