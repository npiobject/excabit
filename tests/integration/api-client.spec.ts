import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

import { MempoolProvider } from '@/data/providers/mempool';
import { ApiError } from '@/data/errors';

import canonical from '@tests/fixtures/mempool/tx-85e72c08.json';
import canonicalOutspends from '@tests/fixtures/mempool/outspends-85e72c08.json';

const TXID = '85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2';
const ADDR = '12higDjoCCNXSA95xZMWUdPvXNmkAduhWv';

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

/** Provider sin esperas: el backoff ya tiene su propia suite. */
function makeProvider(options: Partial<ConstructorParameters<typeof MempoolProvider>[0]> = {}) {
  return new MempoolProvider({
    limiter: { requestsPerSecond: 1000, baseDelayMs: 0, random: () => 0 },
    ...options,
  });
}

describe('getTx — camino feliz', () => {
  it('200 → NormalizedTx', async () => {
    server.use(http.get('https://mempool.space/api/tx/:txid', () => HttpResponse.json(canonical)));

    const tx = await makeProvider().getTx(TXID);

    expect(tx.txid).toBe(TXID);
    expect(tx.fee).toBe(10_000n);
    expect(tx.blockHeight).toBe(300000);
    expect(typeof tx.vin[0]?.value).toBe('bigint');
  });

  it('cachea: dos getTx de la misma tx confirmada → una sola petición', async () => {
    const hits = vi.fn();
    server.use(
      http.get('https://mempool.space/api/tx/:txid', () => {
        hits();
        return HttpResponse.json(canonical);
      }),
    );

    const provider = makeProvider();
    await provider.getTx(TXID);
    await provider.getTx(TXID);

    expect(hits).toHaveBeenCalledTimes(1);
  });

  it('rechaza un txid con formato inválido sin tocar la red (RF-01)', async () => {
    // Sin handlers: si saliera a la red, MSW haría fallar el test.
    await expect(makeProvider().getTx('no-es-un-txid')).rejects.toMatchObject({ kind: 'invalid' });
  });
});

describe('política de errores (BUG-003)', () => {
  it('404 → ApiError{kind:"not-found"}', async () => {
    server.use(
      http.get('https://mempool.space/api/tx/:txid', () =>
        HttpResponse.text('Transaction not found', { status: 404 }),
      ),
    );

    const error = await makeProvider()
      .getTx(TXID)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'not-found', status: 404 });
  });

  it('404 no se reintenta', async () => {
    const hits = vi.fn();
    server.use(
      http.get('https://mempool.space/api/tx/:txid', () => {
        hits();
        return HttpResponse.text('not found', { status: 404 });
      }),
    );

    await expect(makeProvider().getTx(TXID)).rejects.toMatchObject({ kind: 'not-found' });
    expect(hits).toHaveBeenCalledTimes(1);
  });

  it('429 → rate-limited y reintenta hasta lograrlo', async () => {
    let calls = 0;
    server.use(
      http.get('https://mempool.space/api/tx/:txid', () => {
        calls += 1;
        if (calls === 1) return HttpResponse.text('Too many requests', { status: 429 });
        return HttpResponse.json(canonical);
      }),
    );

    const tx = await makeProvider().getTx(TXID);

    expect(calls).toBe(2);
    expect(tx.txid).toBe(TXID);
  });

  it('429 persistente → 3 reintentos y error rate-limited', async () => {
    const hits = vi.fn();
    server.use(
      http.get('https://mempool.space/api/tx/:txid', () => {
        hits();
        return HttpResponse.text('Too many requests', { status: 429 });
      }),
    );

    await expect(makeProvider().getTx(TXID)).rejects.toMatchObject({ kind: 'rate-limited' });
    // 1 intento + 3 reintentos.
    expect(hits).toHaveBeenCalledTimes(4);
  });

  it('caída de red → 3 reintentos y ApiError{kind:"network"}', async () => {
    const hits = vi.fn();
    server.use(
      http.get('https://mempool.space/api/tx/:txid', () => {
        hits();
        return HttpResponse.error();
      }),
    );

    await expect(makeProvider().getTx(TXID)).rejects.toMatchObject({ kind: 'network' });
    expect(hits).toHaveBeenCalledTimes(4);
  });

  it('5xx → network y reintenta', async () => {
    let calls = 0;
    server.use(
      http.get('https://mempool.space/api/tx/:txid', () => {
        calls += 1;
        if (calls < 3) return HttpResponse.text('Bad gateway', { status: 502 });
        return HttpResponse.json(canonical);
      }),
    );

    await expect(makeProvider().getTx(TXID)).resolves.toMatchObject({ txid: TXID });
    expect(calls).toBe(3);
  });

  it('BUG-003: nunca llama a alert()', async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    server.use(http.get('https://mempool.space/api/tx/:txid', () => HttpResponse.error()));

    await expect(makeProvider().getTx(TXID)).rejects.toBeInstanceOf(ApiError);

    expect(alertSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('BUG-003: un error nunca se devuelve como si fuera un dato', async () => {
    server.use(
      http.get('https://mempool.space/api/tx/:txid', () =>
        HttpResponse.text('not found', { status: 404 }),
      ),
    );

    // El legacy encadenaba dos .catch(): el error se tragaba y la función
    // resolvía con undefined, que llegaba al modelo como si fuera una tx.
    const result = await makeProvider()
      .getTx(TXID)
      .then(
        (tx) => ({ resolved: true, tx }),
        () => ({ resolved: false, tx: undefined }),
      );

    expect(result.resolved).toBe(false);
  });

  it('un 400 → invalid (no es ni 404 ni límite de ritmo)', async () => {
    server.use(
      http.get('https://mempool.space/api/tx/:txid', () =>
        HttpResponse.text('Bad request', { status: 400 }),
      ),
    );

    await expect(makeProvider().getTx(TXID)).rejects.toMatchObject({
      kind: 'invalid',
      status: 400,
    });
  });

  it('un 503 se trata como límite de ritmo y se reintenta', async () => {
    let calls = 0;
    server.use(
      http.get('https://mempool.space/api/tx/:txid', () => {
        calls += 1;
        if (calls === 1) return HttpResponse.text('Service unavailable', { status: 503 });
        return HttpResponse.json(canonical);
      }),
    );

    await expect(makeProvider().getTx(TXID)).resolves.toBeDefined();
    expect(calls).toBe(2);
  });

  it('respuesta 200 con cuerpo que no es JSON → invalid, no crash', async () => {
    server.use(
      http.get('https://mempool.space/api/tx/:txid', () =>
        HttpResponse.text('<html>oops</html>', { status: 200 }),
      ),
    );

    await expect(makeProvider().getTx(TXID)).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('un fallo no se cachea: el reintento posterior vuelve a pedir', async () => {
    let calls = 0;
    server.use(
      http.get('https://mempool.space/api/tx/:txid', () => {
        calls += 1;
        return calls <= 4
          ? HttpResponse.text('Too many requests', { status: 429 })
          : HttpResponse.json(canonical);
      }),
    );

    const provider = makeProvider();
    await expect(provider.getTx(TXID)).rejects.toMatchObject({ kind: 'rate-limited' });
    await expect(provider.getTx(TXID)).resolves.toMatchObject({ txid: TXID });
  });
});

describe('RF-04 — redes y URL base', () => {
  it('mainnet usa /api/tx/…', async () => {
    server.use(http.get('https://mempool.space/api/tx/:txid', () => HttpResponse.json(canonical)));

    await expect(makeProvider({ network: 'mainnet' }).getTx(TXID)).resolves.toBeDefined();
  });

  it('testnet usa /testnet/api/tx/…', async () => {
    server.use(
      http.get('https://mempool.space/testnet/api/tx/:txid', () => HttpResponse.json(canonical)),
    );

    await expect(makeProvider({ network: 'testnet' }).getTx(TXID)).resolves.toBeDefined();
  });

  it('signet usa /signet/api/tx/…', async () => {
    server.use(
      http.get('https://mempool.space/signet/api/tx/:txid', () => HttpResponse.json(canonical)),
    );

    await expect(makeProvider({ network: 'signet' }).getTx(TXID)).resolves.toBeDefined();
  });

  it('ADR-002: acepta la URL base de una instancia autohospedada', async () => {
    server.use(http.get('https://mi-nodo.local/api/tx/:txid', () => HttpResponse.json(canonical)));

    const provider = makeProvider({ baseUrl: 'https://mi-nodo.local/api' });

    await expect(provider.getTx(TXID)).resolves.toMatchObject({ txid: TXID });
  });

  it('la URL base autohospedada tolera la barra final', async () => {
    server.use(http.get('https://mi-nodo.local/api/tx/:txid', () => HttpResponse.json(canonical)));

    const provider = makeProvider({ baseUrl: 'https://mi-nodo.local/api/' });

    await expect(provider.getTx(TXID)).resolves.toBeDefined();
  });
});

describe('getOutspends', () => {
  it('devuelve el estado de gasto de cada salida', async () => {
    server.use(
      http.get('https://mempool.space/api/tx/:txid/outspends', () =>
        HttpResponse.json(canonicalOutspends),
      ),
    );

    const spends = await makeProvider().getOutspends(TXID);

    expect(spends).toHaveLength(2);
    expect(spends[0]).toMatchObject({ spent: true });
  });
});

describe('getAddress', () => {
  it('agrega chain + mempool y calcula el saldo en bigint', async () => {
    server.use(
      http.get('https://mempool.space/api/address/:addr', () =>
        HttpResponse.json({
          address: ADDR,
          chain_stats: {
            funded_txo_count: 2,
            funded_txo_sum: 100_000,
            spent_txo_count: 1,
            spent_txo_sum: 30_000,
            tx_count: 3,
          },
          mempool_stats: {
            funded_txo_count: 1,
            funded_txo_sum: 5_000,
            spent_txo_count: 0,
            spent_txo_sum: 0,
            tx_count: 1,
          },
        }),
      ),
    );

    const summary = await makeProvider().getAddress(ADDR);

    expect(summary.address).toBe(ADDR);
    expect(summary.type).toBe('p2pkh');
    expect(summary.received).toBe(105_000n);
    expect(summary.spent).toBe(30_000n);
    expect(summary.balance).toBe(75_000n);
    expect(summary.txCount).toBe(4);
  });

  it('rechaza una dirección inválida sin tocar la red (RF-02)', async () => {
    await expect(makeProvider().getAddress('no-es-una-direccion')).rejects.toMatchObject({
      kind: 'invalid',
    });
  });
});

describe('getAddressTxs — paginación (RF-31)', () => {
  const page = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...canonical,
      txid: i.toString(16).padStart(64, '0'),
    }));

  it('primera página: 25 txs y cursor al último txid', async () => {
    server.use(
      http.get('https://mempool.space/api/address/:addr/txs', () => HttpResponse.json(page(25))),
    );

    const result = await makeProvider().getAddressTxs(ADDR);

    expect(result.items).toHaveLength(25);
    expect(result.cursor).toBe(page(25)[24]?.txid);
  });

  it('página incompleta → sin cursor (no hay más)', async () => {
    server.use(
      http.get('https://mempool.space/api/address/:addr/txs', () => HttpResponse.json(page(7))),
    );

    const result = await makeProvider().getAddressTxs(ADDR);

    expect(result.items).toHaveLength(7);
    expect(result.cursor).toBeUndefined();
  });

  it('con cursor pide la página siguiente por /chain/:last_seen', async () => {
    const lastSeen = 'a'.repeat(64);
    const hits = vi.fn();
    server.use(
      http.get('https://mempool.space/api/address/:addr/txs/chain/:lastSeen', ({ params }) => {
        hits(params['lastSeen']);
        return HttpResponse.json(page(3));
      }),
    );

    const result = await makeProvider().getAddressTxs(ADDR, lastSeen);

    expect(hits).toHaveBeenCalledWith(lastSeen);
    expect(result.items).toHaveLength(3);
  });

  it('rechaza una dirección inválida sin tocar la red', async () => {
    await expect(makeProvider().getAddressTxs('no-es-una-direccion')).rejects.toMatchObject({
      kind: 'invalid',
    });
  });

  it('las páginas de una dirección no se cachean como inmutables (su saldo cambia)', async () => {
    const hits = vi.fn();
    server.use(
      http.get('https://mempool.space/api/address/:addr/txs', () => {
        hits();
        return HttpResponse.json(page(3));
      }),
    );

    const provider = makeProvider();
    await provider.getAddressTxs(ADDR);
    await provider.getAddressTxs(ADDR);

    // Dentro del TTL de 30 s se sirve de caché; lo que no puede es cachearse
    // para siempre como una tx confirmada.
    expect(hits).toHaveBeenCalledTimes(1);
  });
});
