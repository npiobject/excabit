/**
 * Seguimiento de flujo de fondos (RF-18).
 *
 * Modelo **haircut**: cuando una tx mezcla dinero marcado con dinero limpio, sus
 * salidas salen marcadas en la proporción que entró. La alternativa (poison:
 * todo lo que toca queda marcado al 100 %) es más fácil de implementar y miente
 * más — a los dos o tres saltos tiñe medio grafo y deja de decir nada. Con
 * haircut, un CoinJoin diluye el rastro, que es exactamente lo que hace en la
 * realidad y lo que esta app quiere enseñar.
 *
 * Los grafos son sintéticos y se construyen a mano: aquí se prueba la
 * aritmética de la propagación, no el normalizador.
 */
import { describe, it, expect } from 'vitest';
import { traceTaint } from '@/analysis/taint';
import type { Graph, GraphEdge, GraphNode } from '@/core/graph-model';

/* ------------------------------------------------------------------ *
 * Constructor de grafos legible: 'A -> B: 100' es una arista.
 * ------------------------------------------------------------------ */

function graphOf(spec: string[]): Graph {
  const nodes: Record<string, GraphNode> = {};
  const edges: Record<string, GraphEdge> = {};

  const ensure = (id: string): void => {
    // 'tx1' → tx; 'a1' → address. El prefijo dice el tipo, como en la app.
    nodes[id] ??= { id, kind: id.startsWith('tx') ? 'tx' : 'address', x: 0, y: 0 };
  };

  for (const line of spec) {
    const match = /^(\S+)\s*->\s*(\S+)\s*:\s*(\d+)$/.exec(line.trim());
    if (match === null) throw new Error(`spec ilegible: ${line}`);

    const [, from, to, value] = match as unknown as [string, string, string, string];
    ensure(from);
    ensure(to);

    const id = `${from}->${to}`;
    edges[id] = {
      id,
      from,
      to,
      kind: from.startsWith('tx') ? 'output' : 'input',
      value: BigInt(value),
    };
  }

  return { nodes, edges };
}

const amountAt = (graph: Graph, source: string, id: string): bigint | undefined =>
  traceTaint(graph, { source }).get(id)?.amount;

describe('propagación básica (RF-18)', () => {
  it('el origen se marca con lo que sale de él', () => {
    const graph = graphOf(['a1 -> tx1: 100', 'tx1 -> a2: 100']);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.get('a1')?.amount).toBe(100n);
    expect(result.get('a1')?.hops).toBe(0);
  });

  it('sigue el dinero a través de una tx', () => {
    const graph = graphOf(['a1 -> tx1: 100', 'tx1 -> a2: 100']);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.get('tx1')?.amount).toBe(100n);
    expect(result.get('a2')?.amount).toBe(100n);
  });

  it('cuenta los saltos: un salto es una transacción', () => {
    const graph = graphOf(['a1 -> tx1: 100', 'tx1 -> a2: 100', 'a2 -> tx2: 100', 'tx2 -> a3: 100']);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.get('tx1')?.hops).toBe(1);
    expect(result.get('a2')?.hops).toBe(1);
    expect(result.get('tx2')?.hops).toBe(2);
    expect(result.get('a3')?.hops).toBe(2);
  });

  it('no cruza a ramas que no están conectadas', () => {
    const graph = graphOf([
      'a1 -> tx1: 100',
      'tx1 -> a2: 100',
      // Otra investigación en el mismo lienzo, sin relación con la primera.
      'a9 -> tx9: 500',
      'tx9 -> a8: 500',
    ]);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.has('tx9')).toBe(false);
    expect(result.has('a8')).toBe(false);
  });

  it('no va hacia atrás: el dinero fluye en un sentido', () => {
    // a0 alimenta tx1 igual que a1, pero a0 no está marcada: seguir los fondos
    // de a1 no puede «subir» por la entrada de a0 y bajar por otro lado.
    const graph = graphOf(['a0 -> tx1: 100', 'a1 -> tx1: 100', 'tx1 -> a2: 200']);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.has('a0')).toBe(false);
  });
});

describe('haircut: mezclar diluye', () => {
  it('1 marcado de 4 totales → cada salida sale al 25 %', () => {
    const graph = graphOf([
      'a1 -> tx1: 100', // marcado
      'a2 -> tx1: 300', // limpio
      'tx1 -> b1: 200',
      'tx1 -> b2: 200',
    ]);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.get('b1')?.amount).toBe(50n);
    expect(result.get('b2')?.amount).toBe(50n);
    expect(result.get('b1')?.ratio).toBeCloseTo(0.25);
  });

  it('el marcado se conserva: lo que entra marcado sale marcado', () => {
    const graph = graphOf(['a1 -> tx1: 100', 'a2 -> tx1: 300', 'tx1 -> b1: 200', 'tx1 -> b2: 200']);

    const result = traceTaint(graph, { source: 'a1' });
    const salidas = (result.get('b1')?.amount ?? 0n) + (result.get('b2')?.amount ?? 0n);

    expect(salidas).toBe(100n);
  });

  it('una salida más grande se lleva más marcado, en proporción', () => {
    const graph = graphOf(['a1 -> tx1: 100', 'tx1 -> b1: 75', 'tx1 -> b2: 25']);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.get('b1')?.amount).toBe(75n);
    expect(result.get('b2')?.amount).toBe(25n);
  });

  it('un CoinJoin 5×5 diluye el rastro al 20 % en cada salida', () => {
    // El caso que justifica el modelo: con poison, las cinco salidas quedarían
    // marcadas al 100 % y la mezcla no habría servido de nada — que es
    // justamente lo contrario de lo que hace un CoinJoin.
    const graph = graphOf([
      'a1 -> tx1: 1000', // el marcado
      'a2 -> tx1: 1000',
      'a3 -> tx1: 1000',
      'a4 -> tx1: 1000',
      'a5 -> tx1: 1000',
      'tx1 -> b1: 1000',
      'tx1 -> b2: 1000',
      'tx1 -> b3: 1000',
      'tx1 -> b4: 1000',
      'tx1 -> b5: 1000',
    ]);

    const result = traceTaint(graph, { source: 'a1' });

    for (const out of ['b1', 'b2', 'b3', 'b4', 'b5']) {
      expect(result.get(out)?.amount, out).toBe(200n);
      expect(result.get(out)?.ratio, out).toBeCloseTo(0.2);
    }
  });

  it('el reparto ignora la comisión: el dinero se sigue, no se pierde en el fee', () => {
    // Entran 100 marcados y salen 90 (10 de fee). El marcado se reparte sobre lo
    // que SALE: si se repartiera sobre lo que entra, el rastro se evaporaría un
    // poco en cada salto por una razón que no tiene que ver con la privacidad.
    const graph = graphOf(['a1 -> tx1: 100', 'tx1 -> b1: 90']);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.get('b1')?.amount).toBe(90n);
    expect(result.get('b1')?.ratio).toBeCloseTo(1);
  });
});

describe('el diamante: dos caminos que se reencuentran', () => {
  const diamond = () =>
    graphOf([
      'a1 -> tx1: 100',
      // tx1 parte el dinero en dos ramas…
      'tx1 -> b1: 60',
      'tx1 -> b2: 40',
      'b1 -> tx2: 60',
      'b2 -> tx3: 40',
      // …y las dos acaban en la misma dirección.
      'tx2 -> d1: 60',
      'tx3 -> d1: 40',
    ]);

  it('la suma acumulada en el reencuentro suma los dos caminos', () => {
    const result = traceTaint(diamond(), { source: 'a1' });

    // 60 por una rama + 40 por la otra: los 100 del origen, enteros.
    expect(result.get('d1')?.amount).toBe(100n);
  });

  it('cada rama lleva lo suyo', () => {
    const result = traceTaint(diamond(), { source: 'a1' });

    expect(result.get('b1')?.amount).toBe(60n);
    expect(result.get('b2')?.amount).toBe(40n);
  });

  it('los saltos son los del camino más corto', () => {
    const result = traceTaint(diamond(), { source: 'a1' });

    expect(result.get('d1')?.hops).toBe(2);
  });
});

describe('el grafo real no siempre es un árbol', () => {
  it('una dirección reutilizada crea un ciclo y no cuelga', () => {
    // H-07: la misma dirección entra y sale de la misma tx. Es un ciclo real en
    // el grafo, y un recorrido ingenuo se queda dando vueltas.
    const graph = graphOf(['a1 -> tx1: 100', 'tx1 -> a1: 100']);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.get('tx1')?.amount).toBe(100n);
  });

  it('un ciclo largo tampoco cuelga', () => {
    const graph = graphOf([
      'a1 -> tx1: 100',
      'tx1 -> a2: 100',
      'a2 -> tx2: 100',
      'tx2 -> a1: 100', // vuelve al origen
    ]);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.size).toBeGreaterThan(0);
  });
});

describe('límites', () => {
  it('maxHops corta el rastro donde se le dice', () => {
    const graph = graphOf([
      'a1 -> tx1: 100',
      'tx1 -> a2: 100',
      'a2 -> tx2: 100',
      'tx2 -> a3: 100',
      'a3 -> tx3: 100',
      'tx3 -> a4: 100',
    ]);

    const result = traceTaint(graph, { source: 'a1', maxHops: 2 });

    expect(result.has('a2')).toBe(true);
    expect(result.has('a3')).toBe(true);
    expect(result.has('a4')).toBe(false);
  });

  it('un origen que no existe da un rastro vacío, no un error', () => {
    expect(traceTaint(graphOf(['a1 -> tx1: 100']), { source: 'fantasma' }).size).toBe(0);
  });

  it('un origen sin salidas se marca a sí mismo y para ahí', () => {
    // Una UTXO: dinero parado. Es el final del rastro, no un fallo.
    const graph = graphOf(['tx1 -> a1: 100']);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.get('a1')?.amount).toBe(100n);
    expect(result.size).toBe(1);
  });

  it('un grafo vacío no rompe nada', () => {
    expect(traceTaint({ nodes: {}, edges: {} }, { source: 'a1' }).size).toBe(0);
  });

  it('maxHops 0: el rastro no sale del origen', () => {
    const graph = graphOf(['a1 -> tx1: 100', 'tx1 -> a2: 100']);

    const result = traceTaint(graph, { source: 'a1', maxHops: 0 });

    expect(result.has('a1')).toBe(true);
    expect(result.has('tx1')).toBe(false);
  });

  it('una salida de valor 0 (OP_RETURN) no entra en el rastro ni divide entre cero', () => {
    // `fa0e80b4` en los fixtures reales: un OP_RETURN es una salida de 0 sats,
    // dato quemado en la cadena. No le llega ni un satoshi, así que no forma
    // parte del rastro — el rastro son los sitios a donde va el dinero.
    const graph = graphOf(['a1 -> tx1: 100', 'tx1 -> op: 0', 'tx1 -> a2: 100']);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.has('op')).toBe(false);
    // Y el dinero entero se va por donde sí vale algo.
    expect(result.get('a2')?.amount).toBe(100n);
  });

  it('seguir desde una tx marca todas sus salidas', () => {
    const graph = graphOf(['a1 -> tx1: 100', 'tx1 -> b1: 60', 'tx1 -> b2: 40']);

    const result = traceTaint(graph, { source: 'tx1' });

    expect(result.get('b1')?.amount).toBe(60n);
    expect(result.get('b2')?.amount).toBe(40n);
    // Y no marca lo que la alimentó: los fondos van hacia delante.
    expect(result.has('a1')).toBe(false);
  });
});

describe('la aritmética no miente', () => {
  it('importes enormes no pierden precisión', () => {
    const huge = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2
    const graph: Graph = graphOf(['a1 -> tx1: 1', 'tx1 -> b1: 1']);
    graph.edges['a1->tx1']!.value = huge;
    graph.edges['tx1->b1']!.value = huge;

    expect(amountAt(graph, 'a1', 'b1')).toBe(huge);
  });

  it('un reparto que no es exacto no inventa satoshis de más', () => {
    // 100 marcados entre 3 salidas iguales: 33 + 33 + 33 = 99. Falta 1 satoshi
    // por el redondeo de la división entera. Se prefiere quedarse corto a
    // repartir un satoshi que no existe: el rastro no puede crecer solo.
    const graph = graphOf(['a1 -> tx1: 100', 'tx1 -> b1: 100', 'tx1 -> b2: 100', 'tx1 -> b3: 100']);

    const result = traceTaint(graph, { source: 'a1' });
    const total =
      (result.get('b1')?.amount ?? 0n) +
      (result.get('b2')?.amount ?? 0n) +
      (result.get('b3')?.amount ?? 0n);

    expect(total).toBeLessThanOrEqual(100n);
    expect(total).toBeGreaterThanOrEqual(99n);
  });

  it('el ratio de un nodo es la fracción marcada de lo que recibe', () => {
    const graph = graphOf(['a1 -> tx1: 25', 'a2 -> tx1: 75', 'tx1 -> b1: 100']);

    const result = traceTaint(graph, { source: 'a1' });

    expect(result.get('tx1')?.ratio).toBeCloseTo(0.25);
  });
});
