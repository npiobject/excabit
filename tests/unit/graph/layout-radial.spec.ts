import { describe, it, expect } from 'vitest';
import { layoutRadial, DEFAULT_RADIUS } from '@/graph/layout-radial';
import {
  addTxToGraph,
  emptyGraph,
  txNodeId,
  addressNodeId,
  nodesOf,
  type Graph,
} from '@/core/graph-model';
import { txWith } from '@tests/helpers/tx-builder';

const CENTER = { x: 500, y: 300 };

function graphOf(inputs: string[], outputs: string[]) {
  const tx = txWith({
    txid: 'aa1',
    ins: inputs.map((address) => ({ address })),
    outs: outputs.map((address) => ({ address })),
  });

  return { graph: addTxToGraph(emptyGraph(), tx), rootId: txNodeId(tx.txid) };
}

/** Distancia del nodo al centro: todos los satélites deben estar en el radio. */
const distance = (node: { x: number; y: number }) =>
  Math.hypot(node.x - CENTER.x, node.y - CENTER.y);

/** Ángulo del satélite respecto al centro, en grados (−180, 180]. */
const angleOf = (node: { x: number; y: number }) =>
  (Math.atan2(node.y - CENTER.y, node.x - CENTER.x) * 180) / Math.PI;

describe('RF-05 — layout radial', () => {
  it('la tx raíz queda en el centro', () => {
    const { graph, rootId } = graphOf(['A'], ['C']);
    const laid = layoutRadial(graph, rootId, { center: CENTER });

    expect(laid.nodes[rootId]?.x).toBe(CENTER.x);
    expect(laid.nodes[rootId]?.y).toBe(CENTER.y);
  });

  it('los inputs caen en el semiplano izquierdo y los outputs en el derecho', () => {
    const { graph, rootId } = graphOf(['A', 'B'], ['C', 'D']);
    const laid = layoutRadial(graph, rootId, { center: CENTER });

    for (const address of ['A', 'B']) {
      expect(laid.nodes[addressNodeId(address)]!.x).toBeLessThan(CENTER.x);
    }
    for (const address of ['C', 'D']) {
      expect(laid.nodes[addressNodeId(address)]!.x).toBeGreaterThan(CENTER.x);
    }
  });

  it('un único input queda a la izquierda y a la altura del centro', () => {
    const { graph, rootId } = graphOf(['A'], ['C']);
    const laid = layoutRadial(graph, rootId, { center: CENTER, radius: 200 });

    expect(laid.nodes[addressNodeId('A')]!.x).toBeCloseTo(CENTER.x - 200, 6);
    expect(laid.nodes[addressNodeId('A')]!.y).toBeCloseTo(CENTER.y, 6);
  });

  it('un único output queda a la derecha y a la altura del centro', () => {
    const { graph, rootId } = graphOf(['A'], ['C']);
    const laid = layoutRadial(graph, rootId, { center: CENTER, radius: 200 });

    expect(laid.nodes[addressNodeId('C')]!.x).toBeCloseTo(CENTER.x + 200, 6);
    expect(laid.nodes[addressNodeId('C')]!.y).toBeCloseTo(CENTER.y, 6);
  });

  it('todos los satélites quedan sobre el radio pedido', () => {
    const { graph, rootId } = graphOf(['A', 'B', 'E'], ['C', 'D']);
    const laid = layoutRadial(graph, rootId, { center: CENTER, radius: 250 });

    for (const node of nodesOf(laid).filter((n) => n.kind === 'address')) {
      expect(distance(node)).toBeCloseTo(250, 6);
    }
  });

  it('N satélites quedan equiespaciados en su semicírculo', () => {
    const { graph, rootId } = graphOf([], ['C', 'D', 'E']);
    const laid = layoutRadial(graph, rootId, { center: CENTER });

    const angles = ['C', 'D', 'E']
      .map((a) => angleOf(laid.nodes[addressNodeId(a)]!))
      .sort((x, y) => x - y);

    const gaps = angles.slice(1).map((angle, i) => angle - angles[i]!);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 6);
  });

  it('con 2 inputs, uno queda arriba-izquierda y otro abajo-izquierda', () => {
    const { graph, rootId } = graphOf(['A', 'B'], ['C']);
    const laid = layoutRadial(graph, rootId, { center: CENTER });

    const ys = ['A', 'B'].map((a) => laid.nodes[addressNodeId(a)]!.y).sort((x, y) => x - y);

    expect(ys[0]).toBeLessThan(CENTER.y);
    expect(ys[1]).toBeGreaterThan(CENTER.y);
  });

  it('usa un radio por defecto si no se le da ninguno', () => {
    const { graph, rootId } = graphOf(['A'], ['C']);
    const laid = layoutRadial(graph, rootId, { center: CENTER });

    expect(distance(laid.nodes[addressNodeId('A')]!)).toBeCloseTo(DEFAULT_RADIUS, 6);
  });

  it('RF-06: los nodos que el usuario ya movió NO se recolocan', () => {
    const { graph, rootId } = graphOf(['A'], ['C']);
    const moved = {
      ...graph,
      nodes: {
        ...graph.nodes,
        [addressNodeId('A')]: {
          ...graph.nodes[addressNodeId('A')]!,
          x: 42,
          y: 99,
          pinned: true,
        },
      },
    };

    const laid = layoutRadial(moved, rootId, { center: CENTER });

    expect(laid.nodes[addressNodeId('A')]?.x).toBe(42);
    expect(laid.nodes[addressNodeId('A')]?.y).toBe(99);
    // El resto sí se coloca.
    expect(laid.nodes[addressNodeId('C')]?.x).toBeGreaterThan(CENTER.x);
  });

  it('una raíz fijada por el usuario tampoco se recoloca', () => {
    const { graph, rootId } = graphOf(['A'], ['C']);
    const moved = {
      ...graph,
      nodes: { ...graph.nodes, [rootId]: { ...graph.nodes[rootId]!, x: 10, y: 20, pinned: true } },
    };

    const laid = layoutRadial(moved, rootId, { center: CENTER });

    expect(laid.nodes[rootId]?.x).toBe(10);
    expect(laid.nodes[rootId]?.y).toBe(20);
  });

  it('el layout se ancla a la raíz aunque el usuario la haya movido', () => {
    const { graph, rootId } = graphOf(['A'], ['C']);
    const moved = {
      ...graph,
      nodes: { ...graph.nodes, [rootId]: { ...graph.nodes[rootId]!, x: 0, y: 0, pinned: true } },
    };

    const laid = layoutRadial(moved, rootId, { center: CENTER, radius: 100 });

    // Los satélites orbitan donde está la raíz, no donde estaba el centro.
    expect(laid.nodes[addressNodeId('A')]?.x).toBeCloseTo(-100, 6);
    expect(laid.nodes[addressNodeId('C')]?.x).toBeCloseTo(100, 6);
  });

  it('una raíz inexistente deja el grafo intacto', () => {
    const { graph } = graphOf(['A'], ['C']);

    expect(layoutRadial(graph, 'tx:no-existe', { center: CENTER })).toEqual(graph);
  });

  it('es puro: no muta el grafo de entrada', () => {
    const { graph, rootId } = graphOf(['A'], ['C']);
    const before = structuredClone(graph);

    layoutRadial(graph, rootId, { center: CENTER });

    expect(graph).toEqual(before);
  });

  it('no toca nodos ajenos a la tx raíz', () => {
    const tx1 = txWith({ txid: 'aa1', ins: [{ address: 'A' }], outs: [{ address: 'C' }] });
    const tx2 = txWith({ txid: 'bb2', ins: [{ address: 'X' }], outs: [{ address: 'Y' }] });
    const graph = addTxToGraph(addTxToGraph(emptyGraph(), tx1), tx2);

    const laid = layoutRadial(graph, txNodeId(tx1.txid), { center: CENTER });

    expect(laid.nodes[addressNodeId('X')]).toEqual(graph.nodes[addressNodeId('X')]);
  });
});

describe('una DIRECCIÓN en el centro (RF-02/RF-31)', () => {
  /** Una dirección con `count` txs que le pagan y una donde gasta. */
  const addressGraph = (count: number): Graph => {
    const addr = addressNodeId('A');
    const nodes: Graph['nodes'] = {
      [addr]: { id: addr, kind: 'address', x: 0, y: 0, address: 'A' },
    };
    const edges: Graph['edges'] = {};

    for (let i = 0; i < count; i++) {
      const tx = `tx:${String(i).padStart(64, '0')}`;
      nodes[tx] = { id: tx, kind: 'tx', x: 0, y: 0 };
      // La tx paga a la dirección: `output`, y llega AL centro.
      edges[`${tx}->${addr}`] = {
        id: `${tx}->${addr}`,
        from: tx,
        to: addr,
        kind: 'output',
        value: 1n,
      };
    }

    const spend = 'tx:' + 'f'.repeat(64);
    nodes[spend] = { id: spend, kind: 'tx', x: 0, y: 0 };
    // La dirección gasta: `input`, y sale DEL centro.
    edges[`${addr}->${spend}`] = {
      id: `${addr}->${spend}`,
      from: addr,
      to: spend,
      kind: 'input',
      value: 1n,
    };

    return { nodes, edges };
  };

  it('coloca las txs alrededor de la dirección, no todas en el mismo punto', () => {
    // El layout se escribió para una tx en el centro y buscaba las aristas por su
    // `kind`. Con una dirección en el centro no encontraba ninguna y dejaba los
    // 25 nodos apilados en (0,0): el status decía «51 nodos» y se veía uno.
    const laid = layoutRadial(addressGraph(5), addressNodeId('A'), { center: CENTER });

    const positions = Object.values(laid.nodes)
      .filter((node) => node.kind === 'tx')
      .map((node) => `${String(node.x)},${String(node.y)}`);

    expect(new Set(positions).size).toBe(positions.length);
  });

  it('las txs que PAGAN van a la izquierda; donde GASTA, a la derecha', () => {
    // El flujo se lee de izquierda a derecha: de dónde vino el dinero, a dónde
    // fue. Da igual que el centro sea una tx o una dirección.
    const laid = layoutRadial(addressGraph(3), addressNodeId('A'), { center: CENTER });

    const paying = Object.values(laid.nodes).filter(
      (node) => node.kind === 'tx' && !node.id.includes('ffff'),
    );
    const spending = laid.nodes['tx:' + 'f'.repeat(64)];

    for (const node of paying) expect(node.x).toBeLessThan(CENTER.x);
    expect(spending!.x).toBeGreaterThan(CENTER.x);
  });

  it('con 25 txs el radio crece: en un semicírculo de 235 px no caben', () => {
    // 25 satélites en 180° son 6,9° entre vecinos. A radio 235 quedan a 28 px
    // unos de otros y un nodo mide 180: se solaparían en un amasijo ilegible.
    const laid = layoutRadial(addressGraph(25), addressNodeId('A'), { center: CENTER });

    const txs = Object.values(laid.nodes).filter(
      (node) => node.kind === 'tx' && !node.id.includes('ffff'),
    );
    const gaps = txs
      .map((node) => Math.hypot(node.x - CENTER.x, node.y - CENTER.y))
      .map((distance) => distance);

    for (const distance of gaps) expect(distance).toBeGreaterThan(DEFAULT_RADIUS);
  });

  it('con 25 txs, dos vecinas nunca quedan encima', () => {
    const laid = layoutRadial(addressGraph(25), addressNodeId('A'), { center: CENTER });
    const txs = Object.values(laid.nodes).filter(
      (node) => node.kind === 'tx' && !node.id.includes('ffff'),
    );

    const sorted = [...txs].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) {
      const gap = Math.hypot(sorted[i]!.x - sorted[i - 1]!.x, sorted[i]!.y - sorted[i - 1]!.y);
      expect(gap, `${sorted[i - 1]!.id} y ${sorted[i]!.id}`).toBeGreaterThan(100);
    }
  });
});
