import { describe, it, expect } from 'vitest';
import {
  initialInvestigation,
  addTxData,
  moveNode,
  setLabel,
  setColor,
  setNote,
  deleteSelection,
  groupCluster,
  setSelection,
} from '@/core/commands';
import { txNodeId, addressNodeId, edgesOf, nodesOf } from '@/core/graph-model';
import type { InvestigationState, UndoableCommand } from '@/core/commands';
import { txWith } from '@tests/helpers/tx-builder';

const TX = txWith({
  txid: 'aa1',
  ins: [{ address: 'A' }],
  outs: [{ address: 'C' }, { address: 'D' }],
});
const TX_ID = txNodeId(TX.txid);

/** Estado con una tx ya cargada: punto de partida de casi todos los casos. */
function loaded(): InvestigationState {
  return addTxData(TX).apply(initialInvestigation());
}

/**
 * Todo comando debe cumplir esto: `undo()` devuelve EXACTAMENTE el estado
 * anterior. Es la garantía que sostiene RF-28 y la que el legacy no tenía
 * (BUG-013: repintaba una imagen y los datos quedaban desincronizados).
 */
function expectSymmetric(before: InvestigationState, command: UndoableCommand): void {
  const after = command.apply(before);
  const undone = command.undo(after);

  expect(undone).toEqual(before);
}

describe('AddTxData', () => {
  it('do() añade la tx al grafo', () => {
    const state = loaded();

    expect(nodesOf(state.graph).filter((n) => n.kind === 'tx')).toHaveLength(1);
    expect(nodesOf(state.graph).filter((n) => n.kind === 'address')).toHaveLength(3);
  });

  it('undo() restaura el estado exacto anterior', () => {
    expectSymmetric(initialInvestigation(), addTxData(TX));
  });

  it('RF-06: AddTxData dos veces con la misma tx no duplica nodos ni aristas', () => {
    const once = loaded();
    const twice = addTxData(TX).apply(once);

    expect(nodesOf(twice.graph)).toHaveLength(nodesOf(once.graph).length);
    expect(edgesOf(twice.graph)).toHaveLength(edgesOf(once.graph).length);
  });

  it('undo() de una tx re-añadida devuelve el grafo previo, sin borrar de más', () => {
    const once = loaded();

    expectSymmetric(once, addTxData(TX));
  });
});

describe('MoveNode (RF-07)', () => {
  it('do() cambia la posición', () => {
    const state = moveNode(TX_ID, { x: 100, y: 200 }).apply(loaded());

    expect(state.graph.nodes[TX_ID]?.x).toBe(100);
    expect(state.graph.nodes[TX_ID]?.y).toBe(200);
  });

  it('marca el nodo como fijado: el layout ya no lo recolocará (RF-06)', () => {
    const state = moveNode(TX_ID, { x: 100, y: 200 }).apply(loaded());

    expect(state.graph.nodes[TX_ID]?.pinned).toBe(true);
  });

  it('undo() restaura el estado exacto anterior', () => {
    expectSymmetric(loaded(), moveNode(TX_ID, { x: 100, y: 200 }));
  });

  it('mover no toca los datos de dominio, solo posiciones (RF-07)', () => {
    const before = loaded();
    const after = moveNode(TX_ID, { x: 100, y: 200 }).apply(before);

    expect(after.graph.nodes[TX_ID]?.tx).toEqual(before.graph.nodes[TX_ID]?.tx);
  });

  it('mover un nodo inexistente no rompe ni inventa nodos', () => {
    const before = loaded();
    const after = moveNode('tx:no-existe', { x: 1, y: 2 }).apply(before);

    expect(after).toEqual(before);
  });
});

describe('SetLabel (RF-10)', () => {
  it('do() pone la etiqueta', () => {
    const state = setLabel(TX_ID, 'exchange').apply(loaded());

    expect(state.graph.nodes[TX_ID]?.label).toBe('exchange');
  });

  it('undo() restaura el estado exacto anterior', () => {
    expectSymmetric(loaded(), setLabel(TX_ID, 'exchange'));
  });

  it('undo() sobre una etiqueta previa devuelve la anterior, no la borra', () => {
    const withLabel = setLabel(TX_ID, 'primera').apply(loaded());

    expectSymmetric(withLabel, setLabel(TX_ID, 'segunda'));
  });

  it('etiqueta vacía la elimina en vez de dejar una cadena vacía', () => {
    const withLabel = setLabel(TX_ID, 'algo').apply(loaded());
    const cleared = setLabel(TX_ID, '').apply(withLabel);

    expect(cleared.graph.nodes[TX_ID]?.label).toBeUndefined();
  });
});

describe('SetColor (RF-11) y SetNote', () => {
  it('do() aplica color y undo() lo revierte', () => {
    const state = setColor(TX_ID, '#d29922').apply(loaded());

    expect(state.graph.nodes[TX_ID]?.color).toBe('#d29922');
    expectSymmetric(loaded(), setColor(TX_ID, '#d29922'));
  });

  it('do() aplica nota y undo() la revierte', () => {
    const state = setNote(TX_ID, 'sospechosa').apply(loaded());

    expect(state.graph.nodes[TX_ID]?.note).toBe('sospechosa');
    expectSymmetric(loaded(), setNote(TX_ID, 'sospechosa'));
  });
});

describe('DeleteSelection (RF-12)', () => {
  it('do() elimina los nodos seleccionados', () => {
    const state = deleteSelection([addressNodeId('C')]).apply(loaded());

    expect(state.graph.nodes[addressNodeId('C')]).toBeUndefined();
  });

  it('RF-12: elimina las aristas huérfanas', () => {
    const before = loaded();
    const after = deleteSelection([addressNodeId('C')]).apply(before);
    const orphans = edgesOf(after.graph).filter(
      (e) => e.from === addressNodeId('C') || e.to === addressNodeId('C'),
    );

    expect(orphans).toHaveLength(0);
    expect(edgesOf(after.graph).length).toBeLessThan(edgesOf(before.graph).length);
  });

  it('undo() restaura nodos Y aristas huérfanas', () => {
    expectSymmetric(loaded(), deleteSelection([addressNodeId('C')]));
  });

  it('borrar la tx se lleva todas sus aristas', () => {
    const after = deleteSelection([TX_ID]).apply(loaded());

    expect(edgesOf(after.graph)).toHaveLength(0);
  });

  it('borrar quita también los nodos de la selección activa', () => {
    const selected = setSelection([addressNodeId('C')]).apply(loaded());
    const after = deleteSelection([addressNodeId('C')]).apply(selected);

    expect(after.selection).not.toContain(addressNodeId('C'));
  });

  it('borrar una selección vacía no cambia nada', () => {
    const before = loaded();

    expect(deleteSelection([]).apply(before)).toEqual(before);
  });
});

describe('GroupCluster (RF-19)', () => {
  it('do() crea el cluster y mete dentro a los nodos', () => {
    const ids = [addressNodeId('C'), addressNodeId('D')];
    const state = groupCluster('c1', ids, 'Exchange').apply(loaded());

    expect(state.graph.nodes['cluster:c1']?.kind).toBe('cluster');
    expect(state.graph.nodes['cluster:c1']?.label).toBe('Exchange');
    for (const id of ids) expect(state.graph.nodes[id]?.parent).toBe('cluster:c1');
  });

  it('undo() restaura el estado exacto anterior', () => {
    expectSymmetric(loaded(), groupCluster('c1', [addressNodeId('C')], 'Exchange'));
  });
});

describe('SetSelection (RF-09)', () => {
  it('do() fija la selección y undo() la revierte', () => {
    const state = setSelection([TX_ID]).apply(loaded());

    expect(state.selection).toEqual([TX_ID]);
    expectSymmetric(loaded(), setSelection([TX_ID]));
  });
});

describe('todos los comandos son puros', () => {
  it('ninguno muta el estado que recibe', () => {
    const state = loaded();
    const snapshot = structuredClone(state);
    const commands = [
      addTxData(TX),
      moveNode(TX_ID, { x: 9, y: 9 }),
      setLabel(TX_ID, 'x'),
      setColor(TX_ID, '#fff'),
      setNote(TX_ID, 'n'),
      setSelection([TX_ID]),
      groupCluster('c1', [TX_ID], 'g'),
      deleteSelection([TX_ID]),
    ];

    for (const command of commands) command.apply(state);

    expect(state).toEqual(snapshot);
  });

  it('cada comando declara un type legible para el historial', () => {
    expect(addTxData(TX).type).toBe('AddTxData');
    expect(moveNode(TX_ID, { x: 0, y: 0 }).type).toBe('MoveNode');
    expect(deleteSelection([]).type).toBe('DeleteSelection');
  });
});
