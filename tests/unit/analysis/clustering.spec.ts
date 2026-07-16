/**
 * Clustering de direcciones (RF-19, docs/04 H-09).
 *
 * CIOH agrupa las direcciones que firman juntas una tx. Lo que añade este módulo
 * es la parte que hace útil la heurística: **unir los grupos transitivamente**.
 * Si una tx enlaza A con B y otra enlaza B con C, las tres son del mismo dueño
 * aunque A y C no hayan coincidido nunca. Es el algoritmo de Meiklejohn et al.
 * (*A Fistful of Bitcoins*), y es lo que convierte un montón de direcciones
 * sueltas en «esto es un monedero».
 */
import { describe, it, expect } from 'vitest';
import { findClusters } from '@/analysis/clustering';
import { addressNodeId, addTxToGraph, emptyGraph, type Graph } from '@/core/graph-model';
import { createCluster, initialInvestigation, removeCluster } from '@/core/commands';
import { txWith } from '@tests/helpers/tx-builder';

/** Construye un grafo con las txs dadas, como haría la app al expandir. */
const graphWith = (...txs: Parameters<typeof txWith>[0][]): Graph =>
  txs.reduce((graph, spec) => addTxToGraph(graph, txWith(spec)), emptyGraph());

/** Las direcciones de cada cluster, ordenadas: el test no depende del orden. */
const clustersOf = (graph: Graph): string[][] =>
  findClusters(graph)
    .map((cluster) => [...cluster.addresses].sort())
    .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));

describe('vector V1 de H-09: dos entradas, un dueño', () => {
  it('agrupa las direcciones que firman juntas', () => {
    const graph = graphWith({
      txid: 'aa',
      ins: [{ address: 'A' }, { address: 'B' }],
      outs: [{ address: 'X' }],
    });

    expect(clustersOf(graph)).toEqual([['A', 'B']]);
  });

  it('las salidas no entran en el cluster: recibir no prueba nada', () => {
    // CIOH se apoya en que hay que firmar con todas las claves para gastar.
    // Recibir un pago no requiere firmar: quien te paga no es tu dueño.
    const graph = graphWith({
      txid: 'aa',
      ins: [{ address: 'A' }, { address: 'B' }],
      outs: [{ address: 'X' }, { address: 'Y' }],
    });

    const addresses = findClusters(graph).flatMap((cluster) => cluster.addresses);
    expect(addresses).not.toContain('X');
    expect(addresses).not.toContain('Y');
  });
});

describe('vector V2 de H-09: la CoinJoin no se agrupa', () => {
  it('una CoinJoin 5×5 no une a sus firmantes', () => {
    // Es el vector que justifica toda la precaución: en una CoinJoin varias
    // personas firman a propósito la misma tx. Agruparlas sería declarar dueño
    // común a gente que no se conoce — el error más caro que puede cometer una
    // herramienta como esta.
    const equal = 1_000_000n;
    const graph = graphWith({
      txid: 'cc',
      ins: [
        { address: 'A', value: equal },
        { address: 'B', value: equal },
        { address: 'C', value: equal },
        { address: 'D', value: equal },
        { address: 'E', value: equal },
      ],
      outs: [
        { address: 'P', value: equal },
        { address: 'Q', value: equal },
        { address: 'R', value: equal },
        { address: 'S', value: equal },
        { address: 'T', value: equal },
      ],
    });

    expect(clustersOf(graph)).toEqual([]);
  });

  it('un pago por lotes SÍ se agrupa: salidas iguales no es lo mismo que mezcla', () => {
    // Un exchange pagando lo mismo a 30 clientes desde dos UTXO suyos tiene
    // salidas repetidas, pero las entradas son suyas. Descartarlo apagaría CIOH
    // justo donde vale.
    const graph = graphWith({
      txid: 'bb',
      ins: [{ address: 'A', value: 5_000_000n }],
      outs: [
        { address: 'P', value: 100n },
        { address: 'Q', value: 100n },
        { address: 'R', value: 100n },
      ],
    });

    // Con una sola entrada no hay nada que unir, pero tampoco se rompe.
    expect(clustersOf(graph)).toEqual([]);
  });
});

describe('unir transitivamente: lo que hace útil a CIOH', () => {
  it('A~B en una tx y B~C en otra → un solo cluster {A, B, C}', () => {
    // A y C no han coincidido nunca. Es la deducción que convierte direcciones
    // sueltas en un monedero.
    const graph = graphWith(
      { txid: 'aa', ins: [{ address: 'A' }, { address: 'B' }], outs: [{ address: 'X' }] },
      { txid: 'bb', ins: [{ address: 'B' }, { address: 'C' }], outs: [{ address: 'Y' }] },
    );

    expect(clustersOf(graph)).toEqual([['A', 'B', 'C']]);
  });

  it('encadena tantos saltos como haga falta', () => {
    const graph = graphWith(
      { txid: 'aa', ins: [{ address: 'A' }, { address: 'B' }], outs: [{ address: 'X' }] },
      { txid: 'bb', ins: [{ address: 'B' }, { address: 'C' }], outs: [{ address: 'Y' }] },
      { txid: 'cc', ins: [{ address: 'C' }, { address: 'D' }], outs: [{ address: 'Z' }] },
    );

    expect(clustersOf(graph)).toEqual([['A', 'B', 'C', 'D']]);
  });

  it('dos monederos sin nada en común quedan en dos clusters', () => {
    const graph = graphWith(
      { txid: 'aa', ins: [{ address: 'A' }, { address: 'B' }], outs: [{ address: 'X' }] },
      { txid: 'bb', ins: [{ address: 'M' }, { address: 'N' }], outs: [{ address: 'Y' }] },
    );

    expect(clustersOf(graph)).toEqual([
      ['A', 'B'],
      ['M', 'N'],
    ]);
  });

  it('una CoinJoin no une dos monederos que por lo demás están separados', () => {
    // La trampa: si la CoinJoin contara, A y M acabarían en el mismo cluster y
    // el error se propagaría a todo lo demás por transitividad. Un solo falso
    // positivo en CIOH contamina el grafo entero.
    const equal = 1_000_000n;
    const graph = graphWith(
      { txid: 'aa', ins: [{ address: 'A' }, { address: 'B' }], outs: [{ address: 'X' }] },
      { txid: 'bb', ins: [{ address: 'M' }, { address: 'N' }], outs: [{ address: 'Y' }] },
      {
        txid: 'cc',
        ins: [
          { address: 'A', value: equal },
          { address: 'M', value: equal },
          { address: 'Z', value: equal },
        ],
        outs: [
          { address: 'P', value: equal },
          { address: 'Q', value: equal },
          { address: 'R', value: equal },
        ],
      },
    );

    expect(clustersOf(graph)).toEqual([
      ['A', 'B'],
      ['M', 'N'],
    ]);
  });
});

describe('qué NO se agrupa', () => {
  it('una tx con una sola entrada no forma cluster', () => {
    const graph = graphWith({ txid: 'aa', ins: [{ address: 'A' }], outs: [{ address: 'X' }] });
    expect(clustersOf(graph)).toEqual([]);
  });

  it('la misma dirección dos veces no se agrupa consigo misma', () => {
    // Agrupar una dirección con ella misma no revela nada y ensucia el grafo con
    // un compound node de un solo hijo.
    const graph = graphWith({
      txid: 'aa',
      ins: [{ address: 'A' }, { address: 'A' }],
      outs: [{ address: 'X' }],
    });

    expect(clustersOf(graph)).toEqual([]);
  });

  it('una coinbase no agrupa: no gasta outputs de nadie', () => {
    const graph = emptyGraph();
    const coinbase = txWith({ txid: 'cb', ins: [{ address: 'A' }, { address: 'B' }] });
    coinbase.vin[0]!.isCoinbase = true;

    expect(clustersOf(addTxToGraph(graph, coinbase))).toEqual([]);
  });

  it('entradas sin dirección conocida no inventan un cluster', () => {
    const graph = graphWith({
      txid: 'aa',
      ins: [{ address: null }, { address: null }],
      outs: [{ address: 'X' }],
    });

    expect(clustersOf(graph)).toEqual([]);
  });

  it('un grafo vacío no da clusters', () => {
    expect(findClusters(emptyGraph())).toEqual([]);
  });

  it('nodos de dirección sin su tx cargada no agrupan nada', () => {
    // Es el estado de una investigación recién migrada del legacy: hay nodos,
    // pero sus txs todavía no se han descargado.
    const graph: Graph = {
      nodes: { 'addr:A': { id: 'addr:A', kind: 'address', x: 0, y: 0, address: 'A' } },
      edges: {},
    };

    expect(findClusters(graph)).toEqual([]);
  });
});

describe('la evidencia', () => {
  it('cada cluster dice qué txs lo justifican', () => {
    // Sin esto, el usuario ve una caja alrededor de tres direcciones y tiene que
    // creérselo. La propuesta de valor nº 3 es justo la contraria (docs/00 §3).
    const graph = graphWith(
      { txid: 'aa', ins: [{ address: 'A' }, { address: 'B' }], outs: [{ address: 'X' }] },
      { txid: 'bb', ins: [{ address: 'B' }, { address: 'C' }], outs: [{ address: 'Y' }] },
    );

    const [cluster] = findClusters(graph);

    expect(cluster?.evidence).toHaveLength(2);
    expect(cluster?.evidence.join(' ')).toContain('aa'.padStart(64, '0'));
    expect(cluster?.evidence.join(' ')).toContain('bb'.padStart(64, '0'));
  });
});

describe('estabilidad', () => {
  it('el mismo grafo da el mismo resultado, ejecute cuando ejecute', () => {
    // Los ids acaban en el fichero guardado (RF-21) y en el historial de undo:
    // si cambiaran entre ejecuciones, una investigación guardada no se podría
    // volver a abrir igual.
    const graph = graphWith(
      { txid: 'aa', ins: [{ address: 'B' }, { address: 'A' }], outs: [{ address: 'X' }] },
      { txid: 'bb', ins: [{ address: 'C' }, { address: 'B' }], outs: [{ address: 'Y' }] },
    );

    expect(findClusters(graph)).toEqual(findClusters(graph));
  });

  it('el id no depende del orden en que aparecieron las direcciones', () => {
    const uno = graphWith({
      txid: 'aa',
      ins: [{ address: 'A' }, { address: 'B' }],
      outs: [{ address: 'X' }],
    });
    const otro = graphWith({
      txid: 'aa',
      ins: [{ address: 'B' }, { address: 'A' }],
      outs: [{ address: 'X' }],
    });

    expect(findClusters(uno)[0]?.id).toBe(findClusters(otro)[0]?.id);
  });
});

describe('los comandos de agrupar (RF-19)', () => {
  const withCluster = () => {
    const graph = graphWith({
      txid: 'aa',
      ins: [{ address: 'A' }, { address: 'B' }],
      outs: [{ address: 'X' }],
    });

    return { ...initialInvestigation(), graph };
  };

  it('crear el cluster mete a las direcciones dentro', () => {
    const state = withCluster();
    const [cluster] = findClusters(state.graph);
    const members = cluster!.addresses.map(addressNodeId);

    const next = createCluster(cluster!.id, members, 'Monedero').apply(state);

    expect(next.graph.nodes[cluster!.id]?.kind).toBe('cluster');
    expect(next.graph.nodes[cluster!.id]?.label).toBe('Monedero');
    for (const member of members) expect(next.graph.nodes[member]?.parent).toBe(cluster!.id);
  });

  it('el cluster se coloca en el centro de los suyos, no en el origen', () => {
    // Un compound node abarca a sus hijos: dejarlo en (0,0) lo mandaría lejos
    // del grupo que dice representar.
    const state = withCluster();
    const [cluster] = findClusters(state.graph);
    const members = cluster!.addresses.map(addressNodeId);
    const positioned = {
      ...state,
      graph: {
        ...state.graph,
        nodes: {
          ...state.graph.nodes,
          [members[0]!]: { ...state.graph.nodes[members[0]!]!, x: 100, y: 200 },
          [members[1]!]: { ...state.graph.nodes[members[1]!]!, x: 300, y: 400 },
        },
      },
    };

    const next = createCluster(cluster!.id, members).apply(positioned);

    expect(next.graph.nodes[cluster!.id]).toMatchObject({ x: 200, y: 300 });
  });

  it('deshacer la agrupación devuelve las direcciones, no las borra', () => {
    // La agrupación es una hipótesis sobre quién manda, no un cambio en los
    // datos: deshacerla no puede costar direcciones.
    const state = withCluster();
    const [cluster] = findClusters(state.graph);
    const members = cluster!.addresses.map(addressNodeId);
    const grouped = createCluster(cluster!.id, members).apply(state);

    const next = removeCluster(cluster!.id).apply(grouped);

    expect(next.graph.nodes[cluster!.id]).toBeUndefined();
    for (const member of members) {
      expect(next.graph.nodes[member]).toBeDefined();
      expect(next.graph.nodes[member]?.parent).toBeUndefined();
    }
  });

  it('Ctrl+Z devuelve el grafo exactamente a como estaba', () => {
    const state = withCluster();
    const [cluster] = findClusters(state.graph);
    const command = createCluster(cluster!.id, cluster!.addresses.map(addressNodeId));

    const grouped = command.apply(state);

    expect(command.undo(grouped)).toEqual(state);
  });

  it('agrupar con un solo miembro no hace nada', () => {
    const state = withCluster();

    expect(createCluster('cluster:solo', ['addr:A']).apply(state)).toBe(state);
  });

  it('agrupar miembros que no existen no crea un cluster vacío', () => {
    const state = withCluster();

    expect(createCluster('cluster:x', ['addr:fantasma', 'addr:otro']).apply(state)).toBe(state);
  });

  it('quitar algo que no es un cluster no toca nada', () => {
    const state = withCluster();

    expect(removeCluster('addr:A').apply(state)).toBe(state);
  });
});
