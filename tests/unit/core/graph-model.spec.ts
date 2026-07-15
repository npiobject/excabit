import { describe, it, expect } from 'vitest';
import {
  emptyGraph,
  addTxToGraph,
  txNodeId,
  addressNodeId,
  nodesOf,
  edgesOf,
  edgeId,
} from '@/core/graph-model';
import { txFixture } from '@tests/helpers/tx-fixture';
import { txWith } from '@tests/helpers/tx-builder';

describe('identificadores de nodo', () => {
  it('una tx y una dirección nunca colisionan aunque compartan cadena', () => {
    expect(txNodeId('abc')).not.toBe(addressNodeId('abc'));
    expect(txNodeId('abc')).toBe('tx:abc');
    expect(addressNodeId('abc')).toBe('addr:abc');
  });

  it('el id de arista incluye sentido: entrada y salida no colisionan', () => {
    expect(edgeId('addr:A', 'tx:1')).not.toBe(edgeId('tx:1', 'addr:A'));
  });
});

describe('addTxToGraph (RF-05)', () => {
  it('añade la tx y una dirección por cada entrada y salida', () => {
    const tx = txWith({
      ins: [{ address: 'A' }, { address: 'B' }],
      outs: [{ address: 'C' }, { address: 'D' }],
    });

    const graph = addTxToGraph(emptyGraph(), tx);
    const nodes = nodesOf(graph);

    expect(nodes.filter((n) => n.kind === 'tx')).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === 'address')).toHaveLength(4);
  });

  it('las aristas van entrada → tx → salida (el sentido es el flujo del dinero)', () => {
    const tx = txWith({ ins: [{ address: 'A' }], outs: [{ address: 'C' }] });
    const graph = addTxToGraph(emptyGraph(), tx);
    const edges = edgesOf(graph);

    expect(edges).toContainEqual(
      expect.objectContaining({ from: 'addr:A', to: `tx:${tx.txid}`, kind: 'input' }),
    );
    expect(edges).toContainEqual(
      expect.objectContaining({ from: `tx:${tx.txid}`, to: 'addr:C', kind: 'output' }),
    );
  });

  it('la arista lleva el importe en bigint', () => {
    const tx = txWith({ ins: [{ address: 'A', value: 500_000n }], outs: [{ address: 'C' }] });
    const graph = addTxToGraph(emptyGraph(), tx);
    const input = edgesOf(graph).find((e) => e.kind === 'input');

    expect(input?.value).toBe(500_000n);
  });

  it('RF-06: añadir dos veces la misma tx no duplica nodos ni aristas (idempotente)', () => {
    const tx = txFixture();
    const once = addTxToGraph(emptyGraph(), tx);
    const twice = addTxToGraph(once, tx);

    expect(nodesOf(twice)).toHaveLength(nodesOf(once).length);
    expect(edgesOf(twice)).toHaveLength(edgesOf(once).length);
  });

  it('una dirección compartida por dos txs es UN solo nodo (así se ve el flujo)', () => {
    const tx1 = txWith({ txid: 'aa1', ins: [{ address: 'A' }], outs: [{ address: 'SHARED' }] });
    const tx2 = txWith({ txid: 'bb2', ins: [{ address: 'SHARED' }], outs: [{ address: 'B' }] });

    const graph = addTxToGraph(addTxToGraph(emptyGraph(), tx1), tx2);
    const shared = nodesOf(graph).filter((n) => n.id === 'addr:SHARED');

    expect(shared).toHaveLength(1);
    expect(nodesOf(graph).filter((n) => n.kind === 'tx')).toHaveLength(2);
  });

  it('una salida sin dirección (OP_RETURN) no crea nodo dirección', () => {
    const tx = txWith({ ins: [{ address: 'A' }], outs: [{ address: null }, { address: 'C' }] });
    const graph = addTxToGraph(emptyGraph(), tx);

    expect(nodesOf(graph).filter((n) => n.kind === 'address')).toHaveLength(2);
  });

  it('coinbase: la entrada sin dirección no crea nodo ni arista colgando', () => {
    const tx = txWith({ ins: [{ address: null }], outs: [{ address: 'C' }] });
    const coinbase = { ...tx, vin: [{ ...tx.vin[0]!, isCoinbase: true }] };

    const graph = addTxToGraph(emptyGraph(), coinbase);

    expect(edgesOf(graph).filter((e) => e.kind === 'input')).toHaveLength(0);
    expect(nodesOf(graph).filter((n) => n.kind === 'address')).toHaveLength(1);
  });

  it('el nodo tx guarda los datos de la tx para el panel de detalles (RF-15)', () => {
    const tx = txFixture();
    const graph = addTxToGraph(emptyGraph(), tx);
    const node = nodesOf(graph).find((n) => n.kind === 'tx');

    expect(node?.tx?.txid).toBe(tx.txid);
    expect(node?.tx?.fee).toBe(tx.fee);
  });

  it('marca como UTXO las salidas sin gastar (RF-05)', () => {
    const tx = txWith({ outs: [{ address: 'C' }, { address: 'D' }] });
    const withSpends = {
      ...tx,
      vout: [
        { ...tx.vout[0]!, spent: false },
        { ...tx.vout[1]!, spent: true },
      ],
    };

    const graph = addTxToGraph(emptyGraph(), withSpends);
    const edges = edgesOf(graph).filter((e) => e.kind === 'output');

    expect(edges[0]?.isUtxo).toBe(true);
    expect(edges[1]?.isUtxo).toBe(false);
  });

  it('es puro: no muta el grafo anterior ni la tx', () => {
    const graph = emptyGraph();
    const tx = txFixture();
    const txBefore = structuredClone(tx);

    addTxToGraph(graph, tx);

    expect(nodesOf(graph)).toHaveLength(0);
    expect(tx).toEqual(txBefore);
  });
});
