import type { Page } from '@playwright/test';

/**
 * Intercepta la API de mempool.space en los E2E (docs/07 §1).
 *
 * Los E2E no salen a la red: ni dependen de que mempool.space esté vivo, ni le
 * cuelgan una batería de peticiones en cada CI (ADR-002 eligió un servicio
 * público y gratuito; portarse bien es la contrapartida).
 *
 * Las vecinas se generan de forma **determinista** a partir del txid, así que
 * expandir siempre encuentra algo que traer y el test no depende de qué tx real
 * se use.
 */

export const ROOT_TXID = '85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2';

/** Deriva un txid hijo, estable y válido (64 hex). */
const derive = (txid: string, suffix: string): string =>
  (txid.slice(0, 64 - suffix.length - 1) + '0' + suffix).slice(0, 64);

/**
 * Cuántas entradas y salidas tiene cada tx del mock.
 *
 * Por defecto 2, que es el grafo de 5 nodos con el que están escritos casi todos
 * los E2E. Subirlo sirve para probar lo que solo pasa cuando el grafo no cabe
 * (RF-36): con `fan = 2` no hay nada que plegar que se note.
 */
const DEFAULT_FAN = 2;

/*
 * Los importes están escritos para que con `fan = 2` salgan exactamente los de
 * siempre — 60/50 dentro, 70/30 fuera, 10.000 de comisión —, porque hay E2E que
 * los dan por sabidos. Con abanicos mayores la comisión se calcula en vez de
 * quedarse clavada en 10.000: una tx cuyas entradas no cuadran con sus salidas
 * no existe, y no quiero que las heurísticas opinen sobre un imposible.
 */
const inValue = (i: number): number => (i === 1 ? 60_000 : 50_000);
const outValue = (i: number): number => (i === 1 ? 70_000 : 30_000);

function fakeTx(txid: string, fan: number) {
  const address = (seed: string) => `addr${seed}${txid.slice(0, 6)}`;
  const indexes = Array.from({ length: fan }, (_, i) => i + 1);
  const total = (f: (i: number) => number): number => indexes.reduce((sum, i) => sum + f(i), 0);

  return {
    txid,
    version: 1,
    locktime: 0,
    size: 258,
    weight: 1032,
    fee: total(inValue) - total(outValue),
    status: { confirmed: true, block_height: 300000, block_time: 1399703554 },
    vin: indexes.map((i) => ({
      txid: derive(txid, `a${String(i)}`),
      vout: i - 1,
      prevout: {
        scriptpubkey: '',
        scriptpubkey_type: 'p2pkh',
        scriptpubkey_address: address(`in${String(i)}`),
        value: inValue(i),
      },
      is_coinbase: false,
      sequence: 4294967295,
    })),
    vout: indexes.map((i) => ({
      scriptpubkey: '',
      scriptpubkey_type: 'p2pkh',
      scriptpubkey_address: address(`out${String(i)}`),
      value: outValue(i),
    })),
  };
}

const fakeOutspends = (txid: string) => [
  { spent: true, txid: derive(txid, 'b1'), vin: 0 },
  { spent: false },
];

export async function mockApi(page: Page, options: { fan?: number } = {}): Promise<void> {
  const fan = options.fan ?? DEFAULT_FAN;

  await page.route('**/mempool.space/**/outspends', async (route) => {
    const txid = /\/tx\/([0-9a-f]{64})\/outspends/.exec(route.request().url())?.[1] ?? ROOT_TXID;
    await route.fulfill({ json: fakeOutspends(txid) });
  });

  await page.route(/\/api\/tx\/[0-9a-f]{64}$/, async (route) => {
    const txid = /\/tx\/([0-9a-f]{64})$/.exec(route.request().url())?.[1] ?? ROOT_TXID;
    await route.fulfill({ json: fakeTx(txid, fan) });
  });
}

/** Simula que el proveedor se cae, para probar RF-29. */
export async function mockApiDown(page: Page): Promise<void> {
  await page.route('**/mempool.space/**', (route) => route.abort('failed'));
}
