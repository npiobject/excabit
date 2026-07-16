/**
 * Línea temporal (RF-35).
 *
 * Filtra el grafo por fecha: lo que cae fuera del rango se atenúa, no se borra.
 * Aquí se prueba la aritmética del rango; que se vea, en el E2E.
 */
import { describe, it, expect } from 'vitest';
import { nodesInRange, timeRangeOf } from '@/analysis/timeline';
import { addTxToGraph, emptyGraph, txNodeId, type Graph } from '@/core/graph-model';
import { txWith } from '@tests/helpers/tx-builder';
import { txFixture } from '@tests/helpers/tx-fixture';

/** Un grafo con txs en las fechas dadas (epoch en segundos). */
const TX_IDS = ['aa0', 'aa1', 'aa2'];
/** El txid completo de la tx `i` de `graphAt`. */
const idAt = (index: number): string => txNodeId(TX_IDS[index]!.padStart(64, '0'));

function graphAt(...times: (number | null)[]): Graph {
  return times.reduce<Graph>((graph, time, index) => {
    const tx = txWith({ txid: TX_IDS[index]! });

    return addTxToGraph(graph, {
      ...tx,
      blockTime: time,
      blockHeight: time === null ? null : 800_000 + index,
    });
  }, emptyGraph());
}

const ENERO = 1_704_067_200; // 2024-01-01
const FEBRERO = 1_706_745_600; // 2024-02-01
const MARZO = 1_709_251_200; // 2024-03-01

describe('el rango de la investigación', () => {
  it('va de la tx más antigua a la más reciente', () => {
    expect(timeRangeOf(graphAt(FEBRERO, ENERO, MARZO))).toEqual({ from: ENERO, to: MARZO });
  });

  it('sin txs no hay rango', () => {
    expect(timeRangeOf(emptyGraph())).toBeNull();
  });

  it('con una sola tx no hay rango que elegir', () => {
    // Un tirador de un solo punto no filtra nada: la barra no debe salir.
    expect(timeRangeOf(graphAt(ENERO))).toBeNull();
  });

  it('con todas en la misma fecha tampoco', () => {
    expect(timeRangeOf(graphAt(ENERO, ENERO))).toBeNull();
  });

  it('las txs sin confirmar no cuentan para el rango: no tienen fecha', () => {
    expect(timeRangeOf(graphAt(ENERO, null, MARZO))).toEqual({ from: ENERO, to: MARZO });
  });

  it('solo txs sin confirmar → no hay rango', () => {
    expect(timeRangeOf(graphAt(null, null))).toBeNull();
  });
});

describe('qué queda dentro del rango', () => {
  it('incluye los extremos: un rango que excluye su propio límite confunde', () => {
    const graph = graphAt(ENERO, FEBRERO, MARZO);

    const inside = nodesInRange(graph, { from: ENERO, to: MARZO });
    const txs = [...inside].filter((id) => id.startsWith('tx:'));

    expect(txs).toHaveLength(3);
  });

  it('deja fuera lo anterior y lo posterior', () => {
    const graph = graphAt(ENERO, FEBRERO, MARZO);

    const inside = nodesInRange(graph, { from: FEBRERO, to: FEBRERO });

    expect(inside.has(idAt(1))).toBe(true);
    expect(inside.has(idAt(0))).toBe(false);
    expect(inside.has(idAt(2))).toBe(false);
  });

  it('una tx SIN CONFIRMAR nunca se filtra', () => {
    // No tiene fecha: filtrarla por una fecha sería inventársela. Está en el
    // mempool, que es «ahora» — y «ahora» siempre entra en cualquier rango que
    // el usuario esté mirando.
    const graph = graphAt(ENERO, null);

    const inside = nodesInRange(graph, { from: MARZO, to: MARZO });

    expect(inside.has(idAt(1))).toBe(true);
    expect(inside.has(idAt(0))).toBe(false);
  });

  it('las direcciones siguen a sus txs: la de una tx fuera de rango se va con ella', () => {
    // Una dirección no tiene fecha propia. Esconderla siempre dejaría las aristas
    // de las txs visibles colgando de la nada; mostrarla siempre llenaría la
    // pantalla de direcciones huérfanas. Sigue a las suyas.
    //
    // Cada tx con SU dirección: `txWith` reparte los mismos `in-0`/`out-0` a
    // todas, y con las direcciones compartidas no se vería la diferencia.
    const enero = txFixture({
      txid: 'a'.repeat(64),
      blockTime: ENERO,
      vout: [{ n: 0, value: 1000n, address: 'solo-enero', scriptType: 'p2wpkh' }],
    });
    const marzo = txFixture({
      txid: 'b'.repeat(64),
      blockTime: MARZO,
      vout: [{ n: 0, value: 1000n, address: 'solo-marzo', scriptType: 'p2wpkh' }],
    });
    const graph = addTxToGraph(addTxToGraph(emptyGraph(), enero), marzo);

    const inside = nodesInRange(graph, { from: ENERO, to: ENERO });

    expect(inside.has('addr:solo-enero')).toBe(true);
    expect(inside.has('addr:solo-marzo')).toBe(false);
  });

  it('una dirección compartida por dos txs se ve si UNA de ellas está dentro', () => {
    const compartida = 'bc1qcompartida';
    const enero = txFixture({
      txid: 'a'.repeat(64),
      blockTime: ENERO,
      vout: [{ n: 0, value: 1000n, address: compartida, scriptType: 'p2wpkh' }],
    });
    const marzo = txFixture({
      txid: 'b'.repeat(64),
      blockTime: MARZO,
      vout: [{ n: 0, value: 1000n, address: compartida, scriptType: 'p2wpkh' }],
    });
    const graph = addTxToGraph(addTxToGraph(emptyGraph(), enero), marzo);

    const inside = nodesInRange(graph, { from: ENERO, to: ENERO });

    expect(inside.has(`addr:${compartida}`)).toBe(true);
  });

  it('un rango que no coge nada devuelve un conjunto vacío, no todo', () => {
    const graph = graphAt(ENERO, FEBRERO);

    expect(nodesInRange(graph, { from: MARZO, to: MARZO }).size).toBe(0);
  });

  it('un rango del revés (from > to) no coge nada, y no revienta', () => {
    const graph = graphAt(ENERO, FEBRERO, MARZO);

    expect(nodesInRange(graph, { from: MARZO, to: ENERO }).size).toBe(0);
  });

  it('un grafo vacío no rompe nada', () => {
    expect(nodesInRange(emptyGraph(), { from: ENERO, to: MARZO }).size).toBe(0);
  });

  it('los clusters siguen a sus hijas', () => {
    // Un cluster es una caja alrededor de direcciones: si alguna se ve, la caja
    // tiene que verse, o quedaría un compound node vacío.
    const graph = graphAt(ENERO);
    const address = Object.values(graph.nodes).find((node) => node.kind === 'address');
    const withCluster: Graph = {
      ...graph,
      nodes: {
        ...graph.nodes,
        'cluster:c1': { id: 'cluster:c1', kind: 'cluster', x: 0, y: 0 },
        [address!.id]: { ...address!, parent: 'cluster:c1' },
      },
    };

    const inside = nodesInRange(withCluster, { from: ENERO, to: ENERO });

    expect(inside.has('cluster:c1')).toBe(true);
  });
});
