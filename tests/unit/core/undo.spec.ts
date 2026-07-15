import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { History, UNDO_LIMIT } from '@/core/undo';
import {
  initialInvestigation,
  addTxData,
  moveNode,
  setLabel,
  setColor,
  deleteSelection,
  setSelection,
} from '@/core/commands';
import type { InvestigationState, UndoableCommand } from '@/core/commands';
import { txNodeId } from '@/core/graph-model';
import { txWith } from '@tests/helpers/tx-builder';

const TX = txWith({ txid: 'aa1', ins: [{ address: 'A' }], outs: [{ address: 'C' }] });
const TX_ID = txNodeId(TX.txid);

const loaded = (): InvestigationState => addTxData(TX).apply(initialInvestigation());

/** Fábricas de comandos aleatorios para las propiedades. */
const anyCommand: fc.Arbitrary<() => UndoableCommand> = fc.oneof(
  fc.tuple(fc.integer({ min: -500, max: 500 }), fc.integer({ min: -500, max: 500 })).map(
    ([x, y]) =>
      () =>
        moveNode(TX_ID, { x, y }),
  ),
  fc.string({ maxLength: 12 }).map((label) => () => setLabel(TX_ID, label)),
  fc.constantFrom('#fff', '#d29922', '#3fb950').map((color) => () => setColor(TX_ID, color)),
  fc.constant(() => setSelection([TX_ID])),
  fc.constant(() => deleteSelection([TX_ID])),
  fc.constant(() => addTxData(TX)),
);

describe('RF-28 — propiedades de undo/redo', () => {
  it('propiedad: N comandos aleatorios + N undos ⇒ estado inicial (deep-equal)', () => {
    fc.assert(
      fc.property(fc.array(anyCommand, { minLength: 1, maxLength: 30 }), (factories) => {
        const history = new History();
        const start = loaded();
        let state = start;

        for (const make of factories) state = history.execute(make(), state);
        for (let i = 0; i < factories.length; i++) state = history.undo(state);

        expect(state).toEqual(start);
      }),
      { numRuns: 200 },
    );
  });

  it('propiedad: undo×k + redo×k ⇒ mismo estado que antes de deshacer', () => {
    fc.assert(
      fc.property(
        fc.array(anyCommand, { minLength: 1, maxLength: 20 }),
        fc.nat({ max: 20 }),
        (factories, rawK) => {
          const history = new History();
          let state = loaded();

          for (const make of factories) state = history.execute(make(), state);
          const afterAll = state;

          const k = Math.min(rawK, factories.length);
          for (let i = 0; i < k; i++) state = history.undo(state);
          for (let i = 0; i < k; i++) state = history.redo(state);

          expect(state).toEqual(afterAll);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('propiedad: deshacer más veces de las que hay comandos no rompe nada', () => {
    fc.assert(
      fc.property(fc.array(anyCommand, { maxLength: 10 }), (factories) => {
        const history = new History();
        const start = loaded();
        let state = start;

        for (const make of factories) state = history.execute(make(), state);
        for (let i = 0; i < factories.length + 5; i++) state = history.undo(state);

        expect(state).toEqual(start);
      }),
      { numRuns: 100 },
    );
  });
});

describe('History — comportamiento básico', () => {
  it('execute aplica el comando', () => {
    const history = new History();
    const state = history.execute(setLabel(TX_ID, 'hola'), loaded());

    expect(state.graph.nodes[TX_ID]?.label).toBe('hola');
  });

  it('undo revierte y redo rehace', () => {
    const history = new History();
    const start = loaded();

    const labeled = history.execute(setLabel(TX_ID, 'hola'), start);
    const undone = history.undo(labeled);
    const redone = history.redo(undone);

    expect(undone).toEqual(start);
    expect(redone.graph.nodes[TX_ID]?.label).toBe('hola');
  });

  it('canUndo/canRedo reflejan el estado del historial (para habilitar la UI)', () => {
    const history = new History();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);

    const state = history.execute(setLabel(TX_ID, 'x'), loaded());
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    history.undo(state);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
  });

  it('un comando nuevo tras deshacer descarta el redo (rama abandonada)', () => {
    const history = new History();
    let state = history.execute(setLabel(TX_ID, 'primera'), loaded());
    state = history.undo(state);

    state = history.execute(setLabel(TX_ID, 'otra'), state);

    expect(history.canRedo).toBe(false);
    expect(state.graph.nodes[TX_ID]?.label).toBe('otra');
  });

  it('redo sin nada que rehacer devuelve el mismo estado', () => {
    const history = new History();
    const state = loaded();

    expect(history.redo(state)).toBe(state);
  });
});

describe('BUG-013 — memoria acotada', () => {
  it(`la pila se limita a ${String(UNDO_LIMIT)} entradas`, () => {
    const history = new History();
    let state = loaded();

    for (let i = 0; i < UNDO_LIMIT + 50; i++) {
      state = history.execute(moveNode(TX_ID, { x: i, y: i }), state);
    }

    expect(history.size).toBe(UNDO_LIMIT);
  });

  it('el legacy guardaba una imagen del canvas por click; aquí 1.000 comandos no crecen sin techo', () => {
    const history = new History();
    let state = loaded();

    for (let i = 0; i < 1000; i++) {
      state = history.execute(moveNode(TX_ID, { x: i, y: i }), state);
    }

    expect(history.size).toBe(UNDO_LIMIT);
    // Y el estado sigue siendo coherente: deshacer revierte DATOS.
    state = history.undo(state);
    expect(state.graph.nodes[TX_ID]?.x).toBe(998);
  });

  it('deshacer revierte los datos, no una imagen: el redibujado no puede resucitar lo deshecho', () => {
    const history = new History();
    const start = loaded();
    const moved = history.execute(moveNode(TX_ID, { x: 999, y: 999 }), start);

    const undone = history.undo(moved);

    // El legacy repintaba la imagen previa pero dejaba posiTxs con el valor
    // nuevo, así que el siguiente frame volvía a pintar el estado "deshecho".
    expect(undone.graph.nodes[TX_ID]?.x).toBe(start.graph.nodes[TX_ID]?.x);
    expect(undone.graph.nodes[TX_ID]?.pinned).toBeUndefined();
  });
});

describe('coalescing de drags (ADR-004)', () => {
  it('un drag continuo del mismo nodo cuenta como UN solo comando', () => {
    const history = new History();
    let state = loaded();

    // Un drag emite decenas de posiciones intermedias; deshacer debe volver al
    // punto de partida, no ir píxel a píxel hacia atrás.
    for (let x = 1; x <= 20; x++) {
      state = history.execute(moveNode(TX_ID, { x, y: 0 }), state, {
        coalesceKey: `move:${TX_ID}`,
      });
    }

    expect(history.size).toBe(1);
    expect(state.graph.nodes[TX_ID]?.x).toBe(20);

    state = history.undo(state);
    expect(state.graph.nodes[TX_ID]?.x).toBe(0);
  });

  it('drags de nodos distintos no se fusionan entre sí', () => {
    const history = new History();
    let state = loaded();

    state = history.execute(moveNode(TX_ID, { x: 5, y: 5 }), state, {
      coalesceKey: `move:${TX_ID}`,
    });
    state = history.execute(moveNode('addr:C', { x: 9, y: 9 }), state, {
      coalesceKey: 'move:addr:C',
    });

    expect(history.size).toBe(2);
    expect(state.graph.nodes[TX_ID]?.x).toBe(5);
    expect(state.graph.nodes['addr:C']?.x).toBe(9);
  });

  it('un comando distinto rompe la fusión: el siguiente drag es otro comando', () => {
    const history = new History();
    let state = loaded();

    state = history.execute(moveNode(TX_ID, { x: 5, y: 5 }), state, {
      coalesceKey: `move:${TX_ID}`,
    });
    state = history.execute(setLabel(TX_ID, 'etiqueta'), state);
    state = history.execute(moveNode(TX_ID, { x: 7, y: 7 }), state, {
      coalesceKey: `move:${TX_ID}`,
    });

    expect(history.size).toBe(3);
    expect(state.graph.nodes[TX_ID]?.label).toBe('etiqueta');
    expect(state.graph.nodes[TX_ID]?.x).toBe(7);
  });

  it('tras fusionar, un undo deja el estado anterior a TODO el drag', () => {
    const history = new History();
    const start = loaded();
    let state = start;

    for (let x = 1; x <= 10; x++) {
      state = history.execute(moveNode(TX_ID, { x, y: 0 }), state, {
        coalesceKey: `move:${TX_ID}`,
      });
    }

    expect(history.undo(state)).toEqual(start);
  });
});
