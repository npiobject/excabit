import { describe, it, expect, vi } from 'vitest';
import { CyAdapter } from '@/graph/cy-adapter';
import { addTxToGraph, emptyGraph, txNodeId, addressNodeId } from '@/core/graph-model';
import type { Graph } from '@/core/graph-model';
import { txWith } from '@tests/helpers/tx-builder';

const TX = txWith({ txid: 'aa1', ins: [{ address: 'A' }], outs: [{ address: 'C' }] });
const TX_ID = txNodeId(TX.txid);

const graphWithTx = (): Graph => addTxToGraph(emptyGraph(), TX);

/** El adapter corre headless en tests: sin DOM, como el resto del dominio. */
const makeAdapter = () => new CyAdapter({ headless: true });

describe('CyAdapter — sincronización store → escena', () => {
  it('vuelca los nodos y aristas del grafo', () => {
    const adapter = makeAdapter();

    adapter.sync(graphWithTx());

    expect(adapter.cy.nodes()).toHaveLength(3);
    expect(adapter.cy.edges()).toHaveLength(2);
    expect(adapter.cy.getElementById(TX_ID).data('kind')).toBe('tx');
  });

  it('sincronizar dos veces el mismo grafo no duplica nada (idempotente)', () => {
    const adapter = makeAdapter();
    const graph = graphWithTx();

    adapter.sync(graph);
    adapter.sync(graph);

    expect(adapter.cy.nodes()).toHaveLength(3);
    expect(adapter.cy.edges()).toHaveLength(2);
  });

  it('añade los nodos nuevos al expandir sin recrear los que ya estaban', () => {
    const adapter = makeAdapter();
    adapter.sync(graphWithTx());
    const before = adapter.cy.getElementById(TX_ID);

    const expanded = addTxToGraph(
      graphWithTx(),
      txWith({ txid: 'bb2', ins: [{ address: 'C' }], outs: [{ address: 'Z' }] }),
    );
    adapter.sync(expanded);

    expect(adapter.cy.nodes()).toHaveLength(5);
    // Misma instancia: no se recrea, así no parpadea ni pierde su estado.
    expect(adapter.cy.getElementById(TX_ID)).toStrictEqual(before);
  });

  it('elimina de la escena lo que ya no está en el grafo', () => {
    const adapter = makeAdapter();
    adapter.sync(graphWithTx());

    const graph = graphWithTx();
    const pruned: Graph = {
      nodes: Object.fromEntries(
        Object.entries(graph.nodes).filter(([id]) => id !== addressNodeId('C')),
      ),
      edges: Object.fromEntries(
        Object.entries(graph.edges).filter(([, e]) => e.to !== addressNodeId('C')),
      ),
    };
    adapter.sync(pruned);

    expect(adapter.cy.getElementById(addressNodeId('C')).empty()).toBe(true);
    expect(adapter.cy.edges()).toHaveLength(1);
  });

  it('actualiza posiciones sin recrear el nodo (RF-07)', () => {
    const adapter = makeAdapter();
    const graph = graphWithTx();
    adapter.sync(graph);

    const moved: Graph = {
      ...graph,
      nodes: { ...graph.nodes, [TX_ID]: { ...graph.nodes[TX_ID]!, x: 400, y: 250 } },
    };
    adapter.sync(moved);

    expect(adapter.cy.getElementById(TX_ID).position()).toEqual({ x: 400, y: 250 });
  });

  it('propaga etiqueta y color a los datos del nodo (RF-10/RF-11)', () => {
    const adapter = makeAdapter();
    const graph = graphWithTx();

    adapter.sync({
      ...graph,
      nodes: {
        ...graph.nodes,
        [TX_ID]: { ...graph.nodes[TX_ID]!, label: 'exchange', color: '#d29922' },
      },
    });

    expect(adapter.cy.getElementById(TX_ID).data('label')).toBe('exchange');
    expect(adapter.cy.getElementById(TX_ID).data('color')).toBe('#d29922');
  });

  it('marca las aristas UTXO para poder estilarlas (RF-05)', () => {
    const adapter = makeAdapter();
    const graph = graphWithTx();
    const [edgeId, edge] = Object.entries(graph.edges).find(([, e]) => e.kind === 'output')!;

    adapter.sync({ ...graph, edges: { ...graph.edges, [edgeId]: { ...edge, isUtxo: true } } });

    expect(adapter.cy.getElementById(edgeId).data('isUtxo')).toBe(true);
  });

  it('refleja la selección del store en la escena (RF-09)', () => {
    const adapter = makeAdapter();
    adapter.sync(graphWithTx());

    adapter.syncSelection([TX_ID]);

    expect(adapter.cy.$(':selected').map((n) => n.id())).toEqual([TX_ID]);
  });

  it('deseleccionar en el store deselecciona en la escena', () => {
    const adapter = makeAdapter();
    adapter.sync(graphWithTx());
    adapter.syncSelection([TX_ID]);

    adapter.syncSelection([]);

    expect(adapter.cy.$(':selected')).toHaveLength(0);
  });

  it('los clusters se montan como compound nodes (RF-19)', () => {
    const adapter = makeAdapter();
    const graph = graphWithTx();

    adapter.sync({
      ...graph,
      nodes: {
        ...graph.nodes,
        'cluster:c1': { id: 'cluster:c1', kind: 'cluster', x: 0, y: 0, label: 'Exchange' },
        [addressNodeId('C')]: { ...graph.nodes[addressNodeId('C')]!, parent: 'cluster:c1' },
      },
    });

    expect(adapter.cy.getElementById(addressNodeId('C')).parent().first().id()).toBe('cluster:c1');
  });

  it('destroy() libera la instancia', () => {
    const adapter = makeAdapter();
    adapter.sync(graphWithTx());

    adapter.destroy();

    expect(adapter.cy.destroyed()).toBe(true);
  });
});

describe('CyAdapter — interacciones → intención (nunca muta el grafo)', () => {
  it('mover un nodo emite la intención con la posición final', () => {
    const adapter = makeAdapter();
    adapter.sync(graphWithTx());
    const onMove = vi.fn();
    adapter.onNodeMoved(onMove);

    const node = adapter.cy.getElementById(TX_ID);
    node.position({ x: 111, y: 222 });
    node.emit('dragfree');

    expect(onMove).toHaveBeenCalledWith(TX_ID, { x: 111, y: 222 });
  });

  it('el doble click sobre una tx emite la intención de expandir (RF-06)', () => {
    const adapter = makeAdapter();
    adapter.sync(graphWithTx());
    const onExpand = vi.fn();
    adapter.onExpandRequested(onExpand);

    adapter.cy.getElementById(TX_ID).emit('dbltap');

    expect(onExpand).toHaveBeenCalledWith(TX_ID);
  });

  it('el adapter NO decide: solo avisa. El grafo lo cambia el comando', () => {
    const adapter = makeAdapter();
    const graph = graphWithTx();
    adapter.sync(graph);
    const before = structuredClone(graph);
    adapter.onNodeMoved(() => undefined);

    adapter.cy.getElementById(TX_ID).emit('dragfree');

    // Sincronizar no puede haber tocado el grafo del store.
    expect(graph).toEqual(before);
  });
});
