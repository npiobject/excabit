import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TtlLruCache, TTL } from '@/data/cache';
import { txFixture } from '@tests/helpers/tx-fixture';

const isThenable = (value: unknown): boolean =>
  typeof (value as { then?: unknown } | null | undefined)?.then === 'function';

describe('BUG-002 — la caché guarda datos, no promesas', () => {
  it('lo cacheado nunca es thenable', async () => {
    const cache = new TtlLruCache();
    const tx = txFixture();

    await cache.through('tx:abc', () => Promise.resolve(tx), TTL.CONFIRMED);

    const stored = cache.peek('tx:abc');
    expect(stored).toBeDefined();
    expect(isThenable(stored)).toBe(false);
    expect(stored).toEqual(tx);
  });

  it('un lector síncrono de la caché recibe el dato, no una Promise', async () => {
    const cache = new TtlLruCache();
    await cache.through('tx:abc', () => Promise.resolve(txFixture()), TTL.CONFIRMED);

    // Justo lo que el legacy rompía: `datos = response.json()` sin await
    // dejaba una Promise en la caché y solo funcionaba porque los lectores
    // hacían await sobre el valor devuelto.
    const value = cache.get<{ txid: string }>('tx:abc');

    expect(isThenable(value)).toBe(false);
    expect(value?.txid).toBe(txFixture().txid);
  });

  it('dos gets concurrentes de la misma tx → un solo fetch', async () => {
    const cache = new TtlLruCache();
    const loader = vi.fn(() => Promise.resolve(txFixture()));

    const [a, b] = await Promise.all([
      cache.through('tx:abc', loader, TTL.CONFIRMED),
      cache.through('tx:abc', loader, TTL.CONFIRMED),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('un fetch fallido no se cachea y no envenena las peticiones siguientes', async () => {
    const cache = new TtlLruCache();
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('red caída'))
      .mockResolvedValueOnce(txFixture());

    await expect(cache.through('tx:abc', loader, TTL.CONFIRMED)).rejects.toThrow('red caída');
    expect(cache.peek('tx:abc')).toBeUndefined();

    const retry = await cache.through('tx:abc', loader, TTL.CONFIRMED);
    expect(retry).toEqual(txFixture());
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('los concurrentes comparten el fallo sin dejar la entrada in-flight colgada', async () => {
    const cache = new TtlLruCache();
    const loader = vi.fn(() => Promise.reject(new Error('boom')));

    const results = await Promise.allSettled([
      cache.through('tx:abc', loader, TTL.CONFIRMED),
      cache.through('tx:abc', loader, TTL.CONFIRMED),
    ]);

    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);

    // La clave queda libre: un reintento posterior vuelve a pedir.
    const ok = vi.fn(() => Promise.resolve(txFixture()));
    await cache.through('tx:abc', ok, TTL.CONFIRMED);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe('BUG-004 — TTL por tipo de dato', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('una tx confirmada no expira nunca (es inmutable)', async () => {
    const cache = new TtlLruCache();
    const loader = vi.fn(() => Promise.resolve(txFixture()));

    await cache.through('tx:abc', loader, TTL.CONFIRMED);
    vi.advanceTimersByTime(10 * 365 * 24 * 60 * 60 * 1000); // 10 años

    await cache.through('tx:abc', loader, TTL.CONFIRMED);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('una tx sin confirmar expira a los 30 s', async () => {
    const cache = new TtlLruCache();
    const loader = vi.fn(() => Promise.resolve(txFixture({ blockHeight: null })));

    await cache.through('tx:pending', loader, TTL.UNCONFIRMED);

    vi.advanceTimersByTime(29_999);
    await cache.through('tx:pending', loader, TTL.UNCONFIRMED);
    expect(loader).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2);
    await cache.through('tx:pending', loader, TTL.UNCONFIRMED);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('una dirección expira a los 30 s (su saldo cambia)', async () => {
    const cache = new TtlLruCache();
    const loader = vi.fn(() => Promise.resolve({ balance: 1n }));

    await cache.through('addr:bc1q', loader, TTL.ADDRESS);
    vi.advanceTimersByTime(30_001);
    await cache.through('addr:bc1q', loader, TTL.ADDRESS);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('get() de una entrada expirada devuelve undefined y la descarta', async () => {
    const cache = new TtlLruCache();
    await cache.through('addr:x', () => Promise.resolve({ v: 1 }), TTL.ADDRESS);

    expect(cache.get('addr:x')).toBeDefined();

    vi.advanceTimersByTime(30_001);

    expect(cache.get('addr:x')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});

describe('BUG-004 — límite LRU', () => {
  it('al superar 500 entradas expulsa la menos recientemente usada', async () => {
    const cache = new TtlLruCache({ maxEntries: 500 });

    for (let i = 0; i < 500; i++) {
      await cache.through(`tx:${String(i)}`, () => Promise.resolve({ i }), TTL.CONFIRMED);
    }
    expect(cache.size).toBe(500);

    // Se usa la 0: deja de ser la menos reciente. La 1 pasa a serlo.
    expect(cache.get('tx:0')).toBeDefined();

    await cache.through('tx:500', () => Promise.resolve({ i: 500 }), TTL.CONFIRMED);

    expect(cache.size).toBe(500);
    expect(cache.peek('tx:1')).toBeUndefined();
    expect(cache.peek('tx:0')).toBeDefined();
    expect(cache.peek('tx:500')).toBeDefined();
  });

  it('el límite por defecto es 500 (docs/05 §4)', () => {
    expect(new TtlLruCache().maxEntries).toBe(500);
  });

  it('escribir una clave existente la refresca sin duplicar entrada', async () => {
    const cache = new TtlLruCache({ maxEntries: 2 });

    await cache.through('a', () => Promise.resolve({ v: 1 }), TTL.CONFIRMED);
    await cache.through('b', () => Promise.resolve({ v: 2 }), TTL.CONFIRMED);
    cache.set('a', { v: 99 }, TTL.CONFIRMED);

    expect(cache.size).toBe(2);
    expect(cache.get('a')).toEqual({ v: 99 });
  });

  it('memoria acotada: 10.000 escrituras no crecen más allá del límite', async () => {
    const cache = new TtlLruCache({ maxEntries: 500 });

    for (let i = 0; i < 10_000; i++) {
      await cache.through(`tx:${String(i)}`, () => Promise.resolve({ i }), TTL.CONFIRMED);
    }

    expect(cache.size).toBe(500);
  });

  it('clear() vacía la caché', async () => {
    const cache = new TtlLruCache();
    await cache.through('a', () => Promise.resolve({ v: 1 }), TTL.CONFIRMED);

    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.peek('a')).toBeUndefined();
  });
});
