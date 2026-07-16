/**
 * Guardar y cargar una investigación (RF-21, BUG-019).
 *
 * El legacy volcaba cualquier JSON con `type == "application"` directamente a
 * sus estructuras internas: un fichero con campos de menos no fallaba al
 * cargarse, fallaba **después**, en un `draw()` cualquiera, con el usuario
 * mirando (BUG-019). De ahí la forma de la API: cargar devuelve un resultado que
 * hay que mirar, no lanza ni deja a medias. Un fichero inválido no toca el
 * estado.
 */
import { describe, it, expect } from 'vitest';
import { loadInvestigation, saveInvestigation, SCHEMA_VERSION } from '@/persistence/investigation';
import { addTxData, initialInvestigation, type InvestigationState } from '@/core/commands';
import { addTxToGraph, txNodeId } from '@/core/graph-model';
import { txWith } from '@tests/helpers/tx-builder';

const META = {
  network: 'mainnet' as const,
  createdAt: '2026-07-16T10:00:00.000Z',
  updatedAt: '2026-07-16T11:00:00.000Z',
};

/** Un estado con una tx real dentro, como el que produce buscar y expandir. */
function stateWithTx(): InvestigationState {
  const tx = txWith({ txid: 'abc', ins: [{ value: 500_000n }], outs: [{ value: 300_000n }] });
  const state = initialInvestigation();

  return { ...state, graph: addTxToGraph(state.graph, tx) };
}

describe('round-trip (RF-21)', () => {
  it('save → load devuelve exactamente el mismo estado', () => {
    const state = stateWithTx();

    const text = saveInvestigation(state, META);
    const result = loadInvestigation(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.investigation.state).toEqual(state);
  });

  it('los bigint sobreviven al viaje: se guardan como string y vuelven bigint', () => {
    const state = stateWithTx();

    const text = saveInvestigation(state, META);

    // En el fichero son strings: JSON no tiene bigint y `JSON.stringify` de uno
    // lanza. Que el test mire el TEXTO y no solo el round-trip es a propósito:
    // el fichero es un contrato con otras herramientas, no un detalle interno.
    const raw = JSON.parse(text) as { edges: { value: unknown }[] };
    expect(typeof raw.edges[0]?.value).toBe('string');

    const result = loadInvestigation(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const edge = Object.values(result.investigation.state.graph.edges)[0];
    expect(typeof edge?.value).toBe('bigint');
  });

  it('un importe que no cabe en un number sobrevive intacto', () => {
    // 21 millones de BTC en sats caben en un number, pero la suma de un grafo
    // grande no tiene por qué: el dominio usa bigint y el fichero no puede ser
    // el eslabón que pierda precisión.
    const huge = 9_007_199_254_740_993n; // Number.MAX_SAFE_INTEGER + 2
    const state = initialInvestigation();
    const tx = txWith({ txid: 'beef', ins: [{ value: huge }], outs: [{ value: huge }] });
    const withTx: InvestigationState = { ...state, graph: addTxToGraph(state.graph, tx) };

    const result = loadInvestigation(saveInvestigation(withTx, META));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const node = result.investigation.state.graph.nodes[txNodeId(tx.txid)];
    expect(node?.tx?.vin[0]?.value).toBe(huge);
  });

  it('conserva las anotaciones del usuario: etiqueta, color y nota', () => {
    const state = stateWithTx();
    const id = Object.keys(state.graph.nodes)[0]!;
    const annotated: InvestigationState = {
      ...state,
      graph: {
        ...state.graph,
        nodes: {
          ...state.graph.nodes,
          [id]: {
            ...state.graph.nodes[id]!,
            label: 'Exchange',
            color: '#f7931a',
            note: 'Sospechoso',
          },
        },
      },
    };

    const result = loadInvestigation(saveInvestigation(annotated, META));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const node = result.investigation.state.graph.nodes[id];
    expect(node?.label).toBe('Exchange');
    expect(node?.color).toBe('#f7931a');
    expect(node?.note).toBe('Sospechoso');
  });

  it('conserva las posiciones: una investigación es CÓMO quedó colocada', () => {
    const state = stateWithTx();
    const id = Object.keys(state.graph.nodes)[0]!;
    const moved: InvestigationState = {
      ...state,
      graph: {
        ...state.graph,
        nodes: {
          ...state.graph.nodes,
          [id]: { ...state.graph.nodes[id]!, x: 123.5, y: -87.25, pinned: true },
        },
      },
    };

    const result = loadInvestigation(saveInvestigation(moved, META));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.investigation.state.graph.nodes[id]).toMatchObject({
      x: 123.5,
      y: -87.25,
      pinned: true,
    });
  });

  it('guarda y restaura el viewport', () => {
    const state = stateWithTx();
    const viewport = { zoom: 1.5, panX: 40, panY: -20 };

    const result = loadInvestigation(saveInvestigation(state, { ...META, viewport }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.investigation.viewport).toEqual(viewport);
  });

  it('guarda la red y el rootTxid', () => {
    const state: InvestigationState = { ...stateWithTx(), network: 'testnet' };
    const rootTxid = 'abc'.padStart(64, '0');

    const result = loadInvestigation(
      saveInvestigation(state, { ...META, network: 'testnet', rootTxid }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.investigation.state.network).toBe('testnet');
    expect(result.investigation.rootTxid).toBe(rootTxid);
  });

  it('el fichero declara su versión de schema', () => {
    const raw = JSON.parse(saveInvestigation(stateWithTx(), META)) as { schemaVersion: number };
    expect(raw.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('un grafo vacío también va y vuelve', () => {
    const result = loadInvestigation(saveInvestigation(initialInvestigation(), META));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.investigation.state.graph).toEqual({ nodes: {}, edges: {} });
  });

  it('la selección no se guarda: es del momento, no de la investigación', () => {
    // Guardar qué había seleccionado al cerrar sería restaurar un accidente.
    const state: InvestigationState = { ...stateWithTx(), selection: ['tx:abc'] };

    const result = loadInvestigation(saveInvestigation(state, META));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.investigation.state.selection).toEqual([]);
  });

  it('el texto guardado es JSON legible por una persona', () => {
    // El fichero es el formato de intercambio de la app: si hay que abrirlo
    // para entender un bug o para que otra herramienta lo lea, tiene que dejarse.
    const text = saveInvestigation(stateWithTx(), META);
    expect(text).toContain('\n');
    expect(text).toContain('  ');
  });
});

describe('BUG-019: un fichero inválido se rechaza, nunca corrompe el estado', () => {
  it('texto que no es JSON → error claro', () => {
    const result = loadInvestigation('no soy json {{{');
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe('not-json');
  });

  it('JSON válido que no es un objeto → rechazo', () => {
    for (const text of ['42', '"hola"', 'null', '[1,2,3]']) {
      const result = loadInvestigation(text);
      expect(result.ok, `debería rechazar ${text}`).toBe(false);
    }
  });

  it('el JSON arbitrario del legacy (type: application) ya no cuela', () => {
    // Esto es literalmente lo que el legacy aceptaba como investigación válida.
    const result = loadInvestigation(JSON.stringify({ type: 'application', cualquier: 'cosa' }));
    expect(result.ok).toBe(false);
  });

  it('schemaVersion desconocida → error claro, no un crash', () => {
    const text = JSON.stringify({
      ...JSON.parse(saveInvestigation(stateWithTx(), META)),
      schemaVersion: 99,
    });

    const result = loadInvestigation(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe('unknown-schema-version');
    if (result.error.kind !== 'unknown-schema-version') return;
    expect(result.error.found).toBe(99);
  });

  it('campos que faltan → rechazo con la ruta del campo, no un fallo diferido', () => {
    const raw = JSON.parse(saveInvestigation(stateWithTx(), META)) as Record<string, unknown>;
    delete raw['nodes'];

    const result = loadInvestigation(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe('invalid');
    if (result.error.kind !== 'invalid') return;
    // El mensaje tiene que decir QUÉ está mal: es lo único que el usuario puede
    // usar para arreglar su fichero.
    expect(result.error.issues.join(' ')).toContain('nodes');
  });

  it('un tipo cambiado (x como texto) → rechazo', () => {
    const raw = JSON.parse(saveInvestigation(stateWithTx(), META)) as { nodes: { x: unknown }[] };
    raw.nodes[0]!.x = 'no soy un número';

    const result = loadInvestigation(JSON.stringify(raw));
    expect(result.ok).toBe(false);
  });

  it('un value que no es un entero en texto → rechazo, no un NaN silencioso', () => {
    const raw = JSON.parse(saveInvestigation(stateWithTx(), META)) as {
      edges: { value: unknown }[];
    };
    raw.edges[0]!.value = 'doscientos';

    const result = loadInvestigation(JSON.stringify(raw));
    expect(result.ok).toBe(false);
  });

  it('una arista que apunta a un nodo inexistente → rechazo', () => {
    // Un grafo con aristas colgando es exactamente el «estado corrupto» que
    // BUG-019 producía: carga bien y revienta al dibujar.
    const raw = JSON.parse(saveInvestigation(stateWithTx(), META)) as {
      edges: { from: string; to: string }[];
    };
    raw.edges[0]!.to = 'tx:fantasma';

    const result = loadInvestigation(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe('invalid');
  });

  it('un txid inválido en un nodo tx → rechazo', () => {
    const raw = JSON.parse(saveInvestigation(stateWithTx(), META)) as {
      nodes: { id: string; tx?: { txid: string } }[];
    };
    const node = raw.nodes.find((n) => n.tx !== undefined);
    if (node?.tx !== undefined) node.tx.txid = 'no-es-un-txid';

    const result = loadInvestigation(JSON.stringify(raw));
    expect(result.ok).toBe(false);
  });

  it('un fichero enorme de basura no cuelga ni corrompe: solo se rechaza', () => {
    const junk = JSON.stringify({
      schemaVersion: 2,
      nodes: Array.from({ length: 5000 }, () => ({ nope: 1 })),
    });

    const result = loadInvestigation(junk);
    expect(result.ok).toBe(false);
  });
});

describe('el estado cargado es usable de verdad', () => {
  it('sobre un estado cargado se pueden seguir despachando comandos', () => {
    // Cargar y que el grafo se vea no basta: la investigación sigue viva. Si el
    // estado cargado no encaja con los comandos, esto explota aquí y no en
    // producción tres clicks después.
    const result = loadInvestigation(saveInvestigation(stateWithTx(), META));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const otra = txWith({ txid: 'def' });
    const next = addTxData(otra).apply(result.investigation.state);

    expect(Object.keys(next.graph.nodes).length).toBeGreaterThan(
      Object.keys(result.investigation.state.graph.nodes).length,
    );
  });
});
