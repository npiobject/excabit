/**
 * Autosave en IndexedDB (RF-22).
 *
 * Contra una IndexedDB de verdad (`fake-indexeddb` implementa la spec, no la
 * finge): un mock de `put`/`get` probaría que llamamos a nuestro propio mock.
 * Aquí se abre la base, se escribe, se cierra y se vuelve a abrir.
 *
 * Lo que protege esto es sencillo de decir y caro de descubrir tarde: que el
 * trabajo de una sesión larga no se pierda porque se cerró la pestaña.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Autosave } from '@/persistence/autosave';
import { initialInvestigation, type InvestigationState } from '@/core/commands';
import { addTxToGraph, txNodeId } from '@/core/graph-model';
import { txWith } from '@tests/helpers/tx-builder';

const META = { network: 'mainnet' as const };

function stateWithTx(txid = 'abc'): InvestigationState {
  const state = initialInvestigation();

  return { ...state, graph: addTxToGraph(state.graph, txWith({ txid })) };
}

beforeEach(() => {
  // Base nueva por test: si no, el estado de uno se cuela en el siguiente y los
  // fallos aparecen según el orden de ejecución.
  globalThis.indexedDB = new IDBFactory();
});

describe('guardar y recuperar (RF-22)', () => {
  it('lo guardado se puede volver a leer', async () => {
    const autosave = new Autosave();
    await autosave.save(stateWithTx(), META);

    const snapshot = await autosave.read();

    expect(snapshot).not.toBeNull();
    expect(snapshot?.nodeCount).toBeGreaterThan(0);
  });

  it('restaurar es un round-trip: sale lo mismo que entró', async () => {
    const state = stateWithTx();
    const autosave = new Autosave();
    await autosave.save(state, META);

    const restored = await autosave.restore();

    expect(restored?.ok).toBe(true);
    if (restored?.ok !== true) return;

    expect(restored.investigation.state).toEqual(state);
  });

  it('sin nada guardado, no hay nada que restaurar (y no revienta)', async () => {
    expect(await new Autosave().read()).toBeNull();
    expect(await new Autosave().restore()).toBeNull();
  });

  it('guardar dos veces deja la última, no dos copias', async () => {
    // Es un autosave, no un historial: la sesión en curso es una.
    const autosave = new Autosave();
    await autosave.save(stateWithTx('aaa'), META);
    await autosave.save(stateWithTx('bbb'), META);

    const restored = await autosave.restore();
    expect(restored?.ok).toBe(true);
    if (restored?.ok !== true) return;

    const ids = Object.keys(restored.investigation.state.graph.nodes);
    expect(ids).toContain(txNodeId('bbb'.padStart(64, '0')));
    expect(ids).not.toContain(txNodeId('aaa'.padStart(64, '0')));
  });

  it('sobrevive a cerrar la app: otra instancia lee lo que dejó la anterior', async () => {
    // Esto es RF-22 entero. Una instancia nueva es lo que pasa al recargar.
    await new Autosave().save(stateWithTx(), META);

    const snapshot = await new Autosave().read();
    expect(snapshot).not.toBeNull();
  });

  it('guarda cuándo, para poder decírselo al usuario', async () => {
    const autosave = new Autosave();
    await autosave.save(stateWithTx(), META);

    const snapshot = await autosave.read();
    expect(snapshot?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('descartar borra: al usuario que dice «no restaures» no se le vuelve a preguntar', async () => {
    const autosave = new Autosave();
    await autosave.save(stateWithTx(), META);
    await autosave.clear();

    expect(await autosave.read()).toBeNull();
  });

  it('conserva el rootTxid y la red', async () => {
    const state: InvestigationState = { ...stateWithTx(), network: 'testnet' };
    const rootTxid = 'abc'.padStart(64, '0');
    const autosave = new Autosave();
    await autosave.save(state, { network: 'testnet', rootTxid });

    const restored = await autosave.restore();
    expect(restored?.ok).toBe(true);
    if (restored?.ok !== true) return;

    expect(restored.investigation.rootTxid).toBe(rootTxid);
    expect(restored.investigation.state.network).toBe('testnet');
  });
});

describe('debounce: guarda tras los comandos, no durante', () => {
  it('una ráfaga de cambios produce UNA escritura, no una por tecla', async () => {
    // Arrastrar un nodo dispara decenas de comandos por segundo. Escribir en
    // IndexedDB en cada uno competiría con el render por el hilo principal, que
    // es justo lo que RNF-01 no perdona.
    vi.useFakeTimers();
    try {
      const autosave = new Autosave({ debounceMs: 500 });
      const writes = vi.spyOn(autosave, 'save');

      for (let i = 0; i < 20; i++) autosave.schedule(stateWithTx(), META);

      expect(writes).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(500);
      expect(writes).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lo que se guarda es el ÚLTIMO estado de la ráfaga, no el primero', async () => {
    // Se fuerza con `flush()` en vez de dejar correr el timer: el disparo del
    // debounce no devuelve la promesa de la escritura (nadie la espera en
    // producción), así que esperar al reloj aquí sería una carrera. Que el timer
    // dispare una sola vez ya lo comprueba el test de arriba; esto comprueba lo
    // otro: que lo que queda pendiente es lo último que pasó.
    const autosave = new Autosave({ debounceMs: 500 });
    autosave.schedule(stateWithTx('aaa'), META);
    autosave.schedule(stateWithTx('bbb'), META);

    await autosave.flush();

    const restored = await autosave.restore();
    expect(restored?.ok).toBe(true);
    if (restored?.ok !== true) return;

    const ids = Object.keys(restored.investigation.state.graph.nodes);
    expect(ids).toContain(txNodeId('bbb'.padStart(64, '0')));
    expect(ids).not.toContain(txNodeId('aaa'.padStart(64, '0')));
  });

  it('flush() guarda ya: al cerrar la pestaña no hay 500 ms que esperar', async () => {
    vi.useFakeTimers();
    const autosave = new Autosave({ debounceMs: 500 });
    autosave.schedule(stateWithTx(), META);
    vi.useRealTimers();

    await autosave.flush();

    expect(await autosave.read()).not.toBeNull();
  });

  it('flush() sin nada pendiente no escribe nada', async () => {
    const autosave = new Autosave({ debounceMs: 500 });
    await autosave.flush();

    expect(await autosave.read()).toBeNull();
  });
});

describe('un autosave corrupto no secuestra el arranque', () => {
  it('si lo guardado no es válido, restore() lo dice en vez de romper la app', async () => {
    // Un autosave de una versión anterior, o a medio escribir por un cierre
    // brusco. La app tiene que arrancar igual: perder el autosave es malo, no
    // poder abrir la app es peor.
    const autosave = new Autosave();
    await autosave.writeRaw('{ no soy json');

    const restored = await autosave.restore();

    expect(restored?.ok).toBe(false);
  });

  it('y se puede limpiar para no tropezar dos veces', async () => {
    const autosave = new Autosave();
    await autosave.writeRaw('{ no soy json');
    await autosave.clear();

    expect(await autosave.read()).toBeNull();
  });
});
