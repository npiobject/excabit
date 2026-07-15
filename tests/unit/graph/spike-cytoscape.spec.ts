import { describe, it, expect } from 'vitest';
import cytoscape from 'cytoscape';

/**
 * SPIKE de la ADR-001 (docs/05, docs/08 Fase 3).
 *
 * La ADR-001 eligió Cytoscape con una válvula explícita: «el layout radial
 * `preset` es el único punto que podría reabrir esta decisión; spike al inicio
 * de la Fase 3». Esto es ese spike.
 *
 * Comprueba, contra Cytoscape real en headless, los supuestos de los que
 * depende toda la Fase 3. Si alguno fallase, habría que reabrir la ADR ANTES
 * de construir tres semanas encima.
 */

const positions = {
  root: { x: 565, y: 340 },
  addrIn1: { x: 330, y: 180 },
  addrIn2: { x: 330, y: 505 },
  addrOut1: { x: 800, y: 180 },
  addrOut2: { x: 800, y: 505 },
};

function makeGraph() {
  return cytoscape({
    headless: true,
    elements: [
      ...Object.keys(positions).map((id) => ({
        data: { id },
        position: { ...positions[id as keyof typeof positions] },
      })),
      { data: { id: 'e1', source: 'addrIn1', target: 'root' } },
      { data: { id: 'e2', source: 'addrIn2', target: 'root' } },
      { data: { id: 'e3', source: 'root', target: 'addrOut1' } },
      { data: { id: 'e4', source: 'root', target: 'addrOut2' } },
    ],
    layout: { name: 'preset' },
  });
}

describe('SPIKE ADR-001 — layout radial preset', () => {
  it('el layout preset respeta las posiciones exactas que le damos', () => {
    const cy = makeGraph();

    for (const [id, expected] of Object.entries(positions)) {
      expect(cy.getElementById(id).position()).toEqual(expected);
    }
  });

  it('reproduce el radial del legacy: raíz al centro, entradas a la izquierda, salidas a la derecha', () => {
    const cy = makeGraph();
    const rootX = cy.getElementById('root').position('x');

    expect(cy.getElementById('addrIn1').position('x')).toBeLessThan(rootX);
    expect(cy.getElementById('addrIn2').position('x')).toBeLessThan(rootX);
    expect(cy.getElementById('addrOut1').position('x')).toBeGreaterThan(rootX);
    expect(cy.getElementById('addrOut2').position('x')).toBeGreaterThan(rootX);
  });

  it('añadir nodos después NO recoloca los existentes (RF-06: expansión incremental)', () => {
    const cy = makeGraph();
    const before = cy.getElementById('addrIn1').position();

    cy.add([
      { data: { id: 'ntx1' }, position: { x: 1035, y: 180 } },
      { data: { id: 'e5', source: 'addrOut1', target: 'ntx1' } },
    ]);

    expect(cy.getElementById('addrIn1').position()).toEqual(before);
    expect(cy.getElementById('ntx1').position()).toEqual({ x: 1035, y: 180 });
  });
});

describe('SPIKE ADR-001 — BUG-015: zoom/pan no tocan el modelo', () => {
  it('20 zooms seguidos no mueven ni un píxel las posiciones del modelo', () => {
    const cy = makeGraph();
    const before = Object.fromEntries(
      Object.keys(positions).map((id) => [id, { ...cy.getElementById(id).position() }]),
    );

    // El legacy reescalaba TODAS las posiciones con int() en cada rueda, así
    // que acumulaba error de redondeo y el layout derivaba (BUG-015).
    for (let i = 0; i < 20; i++) cy.zoom(cy.zoom() * 1.1);
    for (let i = 0; i < 20; i++) cy.zoom(cy.zoom() / 1.1);

    for (const id of Object.keys(positions)) {
      expect(cy.getElementById(id).position()).toEqual(before[id]);
    }
  });

  it('el pan tampoco altera las posiciones: es transformación de vista', () => {
    const cy = makeGraph();
    const before = { ...cy.getElementById('root').position() };

    cy.pan({ x: 250, y: -80 });

    expect(cy.getElementById('root').position()).toEqual(before);
    expect(cy.pan()).toEqual({ x: 250, y: -80 });
  });

  it('zoom y pan son reversibles sin deriva', () => {
    const cy = makeGraph();

    cy.zoom(2.5);
    cy.pan({ x: 100, y: 100 });
    cy.zoom(1);
    cy.pan({ x: 0, y: 0 });

    expect(cy.zoom()).toBe(1);
    expect(cy.pan()).toEqual({ x: 0, y: 0 });
    expect(cy.getElementById('root').position()).toEqual(positions.root);
  });
});

describe('SPIKE ADR-001 — capacidades que la Fase 3 da por hechas', () => {
  it('mover un nodo cambia su posición y solo la suya (RF-07)', () => {
    const cy = makeGraph();

    cy.getElementById('root').position({ x: 600, y: 400 });

    expect(cy.getElementById('root').position()).toEqual({ x: 600, y: 400 });
    expect(cy.getElementById('addrIn1').position()).toEqual(positions.addrIn1);
  });

  it('mover una selección múltiple desplaza a todos por igual (RF-07)', () => {
    const cy = makeGraph();
    const selection = cy.$('#addrIn1, #addrIn2');

    selection.shift({ x: 30, y: 10 });

    expect(cy.getElementById('addrIn1').position()).toEqual({ x: 360, y: 190 });
    expect(cy.getElementById('addrIn2').position()).toEqual({ x: 360, y: 515 });
  });

  it('la selección es estado del motor, acumulable (RF-09)', () => {
    const cy = makeGraph();

    cy.getElementById('addrIn1').select();
    cy.getElementById('addrOut1').select();

    expect(
      cy
        .$(':selected')
        .map((n) => n.id())
        .sort(),
    ).toEqual(['addrIn1', 'addrOut1']);

    cy.$(':selected').unselect();
    expect(cy.$(':selected')).toHaveLength(0);
  });

  it('eliminar un nodo se lleva sus aristas huérfanas (RF-12)', () => {
    const cy = makeGraph();

    cy.getElementById('addrIn1').remove();

    expect(cy.getElementById('e1').empty()).toBe(true);
    expect(cy.edges()).toHaveLength(3);
  });

  it('soporta compound nodes para los clusters (RF-19)', () => {
    const cy = makeGraph();

    cy.add({ data: { id: 'cluster1' } });
    cy.getElementById('addrIn1').move({ parent: 'cluster1' });

    expect(cy.getElementById('addrIn1').parent().first().id()).toBe('cluster1');
    expect(cy.getElementById('cluster1').children()).toHaveLength(1);
  });

  it('los datos por nodo permiten estilar por tipo/etiqueta/color (RF-10/RF-11)', () => {
    const cy = makeGraph();

    cy.getElementById('root').data({ kind: 'tx', label: 'mi etiqueta', color: '#d29922' });

    expect(cy.getElementById('root').data('label')).toBe('mi etiqueta');
    expect(cy.$('[kind = "tx"]')).toHaveLength(1);
  });
});
