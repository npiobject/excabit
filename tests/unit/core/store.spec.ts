import { describe, it, expect, vi } from 'vitest';
import { Store, type Command, type StoreEvent } from '@/core/store';
import { txFixture } from '@tests/helpers/tx-fixture';
import type { NormalizedTx } from '@/core/types';

interface TestState {
  count: number;
  txs: Record<string, NormalizedTx>;
}

const initial = (): TestState => ({ count: 0, txs: {} });

const increment: Command<TestState> = {
  type: 'Increment',
  apply: (state) => ({ ...state, count: state.count + 1 }),
};

const addTx = (tx: NormalizedTx): Command<TestState> => ({
  type: 'AddTxData',
  apply: (state) => ({ ...state, txs: { ...state.txs, [tx.txid]: tx } }),
});

describe('Store — mutación solo vía comandos', () => {
  it('el estado inicial es el que se le dio', () => {
    const store = new Store(initial());

    expect(store.getState()).toEqual({ count: 0, txs: {} });
  });

  it('un comando produce el nuevo estado', () => {
    const store = new Store(initial());

    store.dispatch(increment);

    expect(store.getState().count).toBe(1);
  });

  it('los comandos son puros: no mutan el estado anterior', () => {
    const store = new Store(initial());
    const before = store.getState();

    store.dispatch(increment);

    expect(before.count).toBe(0);
    expect(store.getState()).not.toBe(before);
  });

  it('BUG-020: el estado no se puede mutar por fuera (getState está congelado)', () => {
    const store = new Store(initial());
    const state = store.getState();

    // El legacy tenía ~60 globales mutables como única arquitectura de estado.
    expect(() => {
      (state as { count: number }).count = 99;
    }).toThrow(TypeError);

    expect(store.getState().count).toBe(0);
  });

  it('el congelado alcanza a los objetos anidados', () => {
    const store = new Store(initial());
    store.dispatch(addTx(txFixture()));

    const state = store.getState();

    expect(Object.isFrozen(state.txs)).toBe(true);
    expect(() => {
      (state.txs as Record<string, unknown>)['nuevo'] = {};
    }).toThrow(TypeError);
  });

  it('se puede desactivar el congelado (coste en grafos grandes)', () => {
    const store = new Store(initial(), { freeze: false });

    expect(Object.isFrozen(store.getState())).toBe(false);
  });
});

describe('Store — eventos', () => {
  it('emite un evento tipado por cada cambio', () => {
    const store = new Store(initial());
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch(increment);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Increment',
        state: expect.objectContaining({ count: 1 }),
        previous: expect.objectContaining({ count: 0 }),
      }),
    );
  });

  it('dos suscriptores reciben exactamente el mismo estado', () => {
    const store = new Store(initial());
    const a = vi.fn<(event: StoreEvent<TestState>) => void>();
    const b = vi.fn<(event: StoreEvent<TestState>) => void>();
    store.subscribe(a);
    store.subscribe(b);

    store.dispatch(addTx(txFixture()));

    const stateA = a.mock.calls[0]?.[0].state;
    const stateB = b.mock.calls[0]?.[0].state;

    expect(stateA).toBe(stateB);
    expect(stateA).toBe(store.getState());
  });

  it('el evento lleva el estado ya actualizado', () => {
    const store = new Store(initial());
    let seen = -1;
    store.subscribe((event) => {
      seen = event.state.count;
    });

    store.dispatch(increment);

    expect(seen).toBe(1);
  });

  it('unsubscribe deja de notificar', () => {
    const store = new Store(initial());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.dispatch(increment);
    unsubscribe();
    store.dispatch(increment);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().count).toBe(2);
  });

  it('un suscriptor que lanza no impide que los demás reciban el evento', () => {
    const store = new Store(initial());
    const onError = vi.fn();
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('listener roto');
    });

    const quiet = new Store(initial(), { onListenerError: onError });
    quiet.subscribe(bad);
    quiet.subscribe(good);

    expect(() => {
      quiet.dispatch(increment);
    }).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(store.getState().count).toBe(0);
  });

  it('sin onListenerError, un suscriptor que lanza se ignora en silencio', () => {
    const store = new Store(initial());
    const good = vi.fn();
    store.subscribe(() => {
      throw new Error('listener roto');
    });
    store.subscribe(good);

    expect(() => {
      store.dispatch(increment);
    }).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    expect(store.getState().count).toBe(1);
  });

  it('suscribirse dos veces con la misma función notifica dos veces', () => {
    const store = new Store(initial());
    const listener = vi.fn();
    store.subscribe(listener);
    store.subscribe(listener);

    store.dispatch(increment);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('no emite si el comando devuelve el mismo estado (no hubo cambio)', () => {
    const store = new Store(initial());
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch({ type: 'NoOp', apply: (state) => state });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('Store — la red no muta el store directamente (docs/05 §2)', () => {
  it('los datos de red entran como comando, no por asignación', () => {
    const store = new Store(initial());
    const tx = txFixture();

    // Así es como el api-client alimentará el grafo: el fetch resuelve y su
    // resultado se despacha. La capa data/ nunca toca el store.
    store.dispatch(addTx(tx));

    expect(store.getState().txs[tx.txid]).toEqual(tx);
  });
});
