/**
 * Export de datos e imagen vectorial (RF-23/24).
 *
 * CSV y SVG se generan **de los datos**, no del lienzo: `persistence/` no conoce
 * Cytoscape ni el DOM (docs/05 §2). El PNG sí necesita el motor —es una foto de
 * lo que se ve— y por eso vive en `graph/` y se prueba en el E2E.
 */
import { describe, it, expect } from 'vitest';
import { toEdgesCsv, toNodesCsv, toSvg, type SvgTheme } from '@/persistence/export';
import type { Graph } from '@/core/graph-model';
import { addTxToGraph, emptyGraph } from '@/core/graph-model';
import { txWith } from '@tests/helpers/tx-builder';

const graphWithTx = (): Graph => addTxToGraph(emptyGraph(), txWith({ txid: 'abc' }));

/** El tema se inyecta (ver `SvgTheme`); el test usa uno propio a propósito. */
const THEME: SvgTheme = {
  background: '#0d1117',
  edge: '#2d333b',
  text: '#e6edf3',
  tx: '#1f2630',
  address: '#58a6ff',
};

/** Filas no vacías, que es lo que cuenta una hoja de cálculo. */
const rows = (csv: string): string[] => csv.trim().split('\n');

describe('CSV de nodos (RF-24)', () => {
  it('lleva cabecera', () => {
    const csv = toNodesCsv(graphWithTx());
    expect(rows(csv)[0]).toMatch(/^Id,Label,Kind/);
  });

  it('una fila por nodo, más la cabecera', () => {
    const graph = graphWithTx();
    const csv = toNodesCsv(graph);

    expect(rows(csv).length).toBe(Object.keys(graph.nodes).length + 1);
  });

  it('usa las cabeceras que Gephi espera (Id, Label)', () => {
    // RF-24 dice «para Excel/Gephi». Gephi importa por nombre de columna: si la
    // primera no se llama `Id`, hay que mapear a mano en un diálogo. Ponerlo
    // bien aquí cuesta cero.
    expect(toNodesCsv(graphWithTx())).toContain('Id,Label');
  });

  it('un grafo vacío da solo la cabecera, no un fichero vacío', () => {
    // Un CSV sin cabecera no se puede importar: hay que saber qué son las
    // columnas aunque no haya filas.
    expect(rows(toNodesCsv(emptyGraph())).length).toBe(1);
  });
});

describe('CSV de aristas (RF-24)', () => {
  it('usa Source/Target/Weight, que es lo que Gephi lee', () => {
    expect(rows(toEdgesCsv(graphWithTx()))[0]).toMatch(/^Source,Target/);
  });

  it('una fila por arista, más la cabecera', () => {
    const graph = graphWithTx();
    expect(rows(toEdgesCsv(graph)).length).toBe(Object.keys(graph.edges).length + 1);
  });

  it('el importe va en satoshis enteros: sin comas ni notación científica', () => {
    // Un `Number(1e21)` en la columna de peso convierte una hoja de cálculo en
    // una fuente de datos falsos.
    const graph = addTxToGraph(
      emptyGraph(),
      txWith({ txid: 'abc', outs: [{ value: 12_345_678_901n }] }),
    );

    expect(toEdgesCsv(graph)).toContain('12345678901');
    expect(toEdgesCsv(graph)).not.toMatch(/e\+/i);
  });
});

describe('escapado del CSV', () => {
  const withLabel = (label: string): Graph => {
    const graph = graphWithTx();
    const id = Object.keys(graph.nodes)[0]!;

    return { ...graph, nodes: { ...graph.nodes, [id]: { ...graph.nodes[id]!, label } } };
  };

  it('una etiqueta con coma no parte la fila en dos', () => {
    const csv = toNodesCsv(withLabel('Exchange, sede en Malta'));

    expect(csv).toContain('"Exchange, sede en Malta"');
    expect(rows(csv).length).toBe(rows(toNodesCsv(graphWithTx())).length);
  });

  it('una etiqueta con comillas las duplica, como manda el RFC 4180', () => {
    expect(toNodesCsv(withLabel('El "banco"'))).toContain('"El ""banco"""');
  });

  it('una etiqueta con salto de línea no rompe el fichero', () => {
    const csv = toNodesCsv(withLabel('Primera\nSegunda'));

    // Va entre comillas: dentro de comillas el salto es dato, no fin de fila.
    expect(csv).toContain('"Primera\nSegunda"');
  });

  it('una etiqueta que empieza por = no se ejecuta al abrir el CSV', () => {
    // Inyección de fórmulas: Excel y Sheets evalúan una celda que empieza por
    // = + - @. `=1+1` es inofensivo; `=HYPERLINK(...)` o `=cmd|...` no lo son, y
    // aquí las etiquetas las escribe quien te pasa la investigación. Se antepone
    // un apóstrofo, que es la marca de «esto es texto».
    const csv = toNodesCsv(withLabel('=1+1'));

    expect(csv).not.toMatch(/,"?=1\+1/);
    expect(csv).toContain("'=1+1");
  });

  it('lo mismo con + - @ y tabulador', () => {
    for (const dangerous of ['+1', '-1', '@SUM(A1)', '\t=1']) {
      const csv = toNodesCsv(withLabel(dangerous));
      expect(csv, `debería neutralizar ${JSON.stringify(dangerous)}`).toContain(`'${dangerous}`);
    }
  });

  it('un guion normal en el texto no se toca: no vale pasarse de listo', () => {
    // «-» solo es peligroso al principio. Neutralizar de más estropearía las
    // etiquetas de todo el mundo.
    expect(toNodesCsv(withLabel('Pago 2-3 BTC'))).toContain('Pago 2-3 BTC');
  });
});

describe('SVG (RF-23)', () => {
  it('es un SVG con sus dimensiones declaradas', () => {
    const svg = toSvg(graphWithTx(), THEME);

    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('</svg>');
    expect(svg).toMatch(/width="\d+"/);
    expect(svg).toMatch(/height="\d+"/);
    expect(svg).toMatch(/viewBox="/);
  });

  it('dibuja un elemento por nodo y por arista', () => {
    const graph = graphWithTx();
    const svg = toSvg(graph, THEME);

    const nodeCount = (svg.match(/<rect /g) ?? []).length;
    const edgeCount = (svg.match(/<line /g) ?? []).length;

    // Un rect de fondo, más uno por nodo.
    expect(nodeCount).toBe(Object.keys(graph.nodes).length + 1);
    expect(edgeCount).toBe(Object.keys(graph.edges).length);
  });

  it('las dimensiones salen del grafo, no de un tamaño fijo', () => {
    const graph = graphWithTx();
    const id = Object.keys(graph.nodes)[0]!;
    const spread: Graph = {
      ...graph,
      nodes: { ...graph.nodes, [id]: { ...graph.nodes[id]!, x: 5000, y: 4000 } },
    };

    const width = Number(/width="(\d+)"/.exec(toSvg(spread, THEME))?.[1]);
    expect(width).toBeGreaterThan(4000);
  });

  it('escapa el texto: una etiqueta con < no rompe el XML', () => {
    const graph = graphWithTx();
    const id = Object.keys(graph.nodes)[0]!;
    const evil: Graph = {
      ...graph,
      nodes: { ...graph.nodes, [id]: { ...graph.nodes[id]!, label: '<script>alert(1)</script>' } },
    };

    const svg = toSvg(evil, THEME);

    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('un grafo vacío da un SVG válido, no una cadena rota', () => {
    const svg = toSvg(emptyGraph(), THEME);

    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('</svg>');
  });

  it('lleva fondo: un SVG transparente se ve negro sobre negro al pegarlo', () => {
    expect(toSvg(graphWithTx(), THEME)).toContain('<rect');
  });
});
