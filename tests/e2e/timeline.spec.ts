/**
 * Línea temporal en la app real (RF-35).
 *
 * La aritmética del rango la prueba `tests/unit/analysis/timeline.spec.ts`. Aquí:
 * que la barra sale, que los tiradores filtran, que dice qué esconde y que se
 * combina con el rastro de fondos.
 */
import { test, expect, type Page } from '@playwright/test';
import { skipTour, useLocale } from './helpers/setup';

const ENERO = 1_704_067_200;
const FEBRERO = 1_706_745_600;
const MARZO = 1_709_251_200;

/** Tres txs encadenadas, una por mes: la de enero paga a la de febrero, etc. */
const CHAIN = [
  { txid: 'a'.repeat(64), time: ENERO },
  { txid: 'b'.repeat(64), time: FEBRERO },
  { txid: 'c'.repeat(64), time: MARZO },
];

function fakeTx(txid: string) {
  const found = CHAIN.find((tx) => tx.txid === txid);
  const time = found?.time ?? null;

  return {
    txid,
    version: 1,
    locktime: 0,
    size: 258,
    weight: 1032,
    fee: 10_000,
    status:
      time === null
        ? { confirmed: false }
        : { confirmed: true, block_height: 800_000, block_time: time },
    vin: [
      {
        txid: 'f'.repeat(64),
        vout: 0,
        prevout: {
          scriptpubkey: '',
          scriptpubkey_type: 'p2pkh',
          scriptpubkey_address: `in-${txid.slice(0, 4)}`,
          value: 60_000,
        },
        is_coinbase: false,
        sequence: 4_294_967_295,
      },
    ],
    vout: [
      {
        scriptpubkey: '',
        scriptpubkey_type: 'p2pkh',
        scriptpubkey_address: `out-${txid.slice(0, 4)}`,
        value: 50_000,
      },
    ],
  };
}

async function mockApi(page: Page): Promise<void> {
  await page.route(/mempool\.space/, async (route) => {
    const url = route.request().url();
    if (url.includes('outspends')) {
      await route.fulfill({ json: [{ spent: false }] });

      return;
    }

    const txid = /\/tx\/([0-9a-f]{64})$/.exec(url)?.[1];
    await route.fulfill({ json: txid === undefined ? [] : fakeTx(txid) });
  });
}

/** Carga las tres txs de la cadena (una por mes) en el grafo. */
async function openThree(page: Page): Promise<void> {
  await mockApi(page);
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
  await page.waitForFunction(() => window.excabit !== undefined);

  for (const tx of CHAIN) {
    await page.fill('#search', tx.txid);
    await page.click('#searchBtn');
    await expect
      .poll(() =>
        page.evaluate(
          (id) => window.excabit!.store.getState().graph.nodes[`tx:${id}`] !== undefined,
          tx.txid,
        ),
      )
      .toBe(true);
  }
}

/** Cuántos nodos están atenuados por el rango. */
const outOfRange = (page: Page): Promise<number> =>
  page.evaluate(() => window.excabit!.adapter.cy.nodes('.outOfRange').length);

test('RF-35: la tecla abre la barra con el rango de la investigación', async ({ page }) => {
  await openThree(page);

  await expect(page.locator('#timeline')).toBeHidden();
  await page.keyboard.press('l');

  await expect(page.locator('#timeline')).toBeVisible();
  // La barra abarca de la más antigua a la más reciente.
  await expect(page.locator('#timelineFrom')).toHaveAttribute('min', String(ENERO));
  await expect(page.locator('#timelineTo')).toHaveAttribute('max', String(MARZO));
});

test('RF-35: al abrirla no esconde nada: el rango entero está elegido', async ({ page }) => {
  await openThree(page);

  await page.keyboard.press('l');

  expect(await outOfRange(page)).toBe(0);
});

test('RF-35: mover el tirador atenúa lo que queda fuera', async ({ page }) => {
  await openThree(page);
  await page.keyboard.press('l');

  // Desde marzo: enero y febrero se apagan.
  await page.locator('#timelineFrom').fill(String(MARZO));
  await page.locator('#timelineFrom').dispatchEvent('input');

  await expect.poll(() => outOfRange(page)).toBeGreaterThan(0);

  const visible = await page.evaluate(() =>
    window
      .excabit!.adapter.cy.nodes('[kind = "tx"]')
      .filter((node) => !node.hasClass('outOfRange'))
      .map((node) => node.id()),
  );
  expect(visible).toEqual([`tx:${'c'.repeat(64)}`]);
});

test('RF-35: dice cuántas txs esconde — un filtro mudo es una trampa', async ({ page }) => {
  await openThree(page);
  await page.keyboard.press('l');

  await expect(page.locator('#timelineLabel')).toContainText('3 de 3 txs');

  await page.locator('#timelineFrom').fill(String(MARZO));
  await page.locator('#timelineFrom').dispatchEvent('input');

  await expect(page.locator('#timelineLabel')).toContainText('1 de 3 txs');
});

test('RF-35: filtrar NO toca los datos: no hay nada que deshacer', async ({ page }) => {
  await openThree(page);
  const before = await page.evaluate(() =>
    JSON.stringify(window.excabit!.store.getState().graph, (_k, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );

  await page.keyboard.press('l');
  await page.locator('#timelineFrom').fill(String(MARZO));
  await page.locator('#timelineFrom').dispatchEvent('input');

  const after = await page.evaluate(() =>
    JSON.stringify(window.excabit!.store.getState().graph, (_k, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );

  // Es una forma de mirar, no una edición.
  expect(after).toBe(before);
});

test('RF-35: los tiradores no se cruzan', async ({ page }) => {
  await openThree(page);
  await page.keyboard.press('l');

  // Se empuja el «desde» más allá del «hasta»: sin tope, el rango quedaría del
  // revés y apagaría el grafo entero sin decir por qué.
  await page.locator('#timelineTo').fill(String(FEBRERO));
  await page.locator('#timelineTo').dispatchEvent('input');
  await page.locator('#timelineFrom').fill(String(MARZO));
  await page.locator('#timelineFrom').dispatchEvent('input');

  const range = await page.evaluate(() => ({
    from: Number((document.querySelector('#timelineFrom') as HTMLInputElement).value),
    to: Number((document.querySelector('#timelineTo') as HTMLInputElement).value),
  }));

  expect(range.from).toBeLessThanOrEqual(range.to);
});

test('RF-35: cerrarla lo devuelve todo a la vista', async ({ page }) => {
  await openThree(page);
  await page.keyboard.press('l');
  await page.locator('#timelineFrom').fill(String(MARZO));
  await page.locator('#timelineFrom').dispatchEvent('input');
  await expect.poll(() => outOfRange(page)).toBeGreaterThan(0);

  await page.click('#timelineClose');

  await expect(page.locator('#timeline')).toBeHidden();
  expect(await outOfRange(page)).toBe(0);
});

test('RF-35: la misma tecla la cierra', async ({ page }) => {
  await openThree(page);
  await page.keyboard.press('l');
  await expect(page.locator('#timeline')).toBeVisible();

  await page.keyboard.press('l');

  await expect(page.locator('#timeline')).toBeHidden();
  expect(await outOfRange(page)).toBe(0);
});

test('RF-35: se combina con el rastro de fondos (RF-18)', async ({ page }) => {
  await openThree(page);

  // Rastro desde una entrada, y encima el rango en marzo.
  await page.evaluate(() => {
    const state = window.excabit!.store.getState();
    const edge = Object.values(state.graph.edges).find((e) => e.kind === 'input');
    window.excabit!.store.dispatch({
      type: 'test:select',
      apply: (s) => ({ ...s, selection: [edge!.from] }),
    });
  });
  await page.keyboard.press('f');
  await page.keyboard.press('l');
  await page.locator('#timelineFrom').fill(String(MARZO));
  await page.locator('#timelineFrom').dispatchEvent('input');

  // «El rastro de este dinero, en marzo»: un nodo se ve si pasa LOS DOS filtros.
  // Con una sola clase compartida, apagar uno devolvería lo que el otro esconde.
  const both = await page.evaluate(() => ({
    tainted: window.excabit!.adapter.cy.nodes('.tainted').length,
    outOfRange: window.excabit!.adapter.cy.nodes('.outOfRange').length,
  }));

  expect(both.outOfRange).toBeGreaterThan(0);
  expect(both.tainted).toBeGreaterThan(0);
});

test('sin dos fechas distintas, la barra no sale y lo explica', async ({ page }) => {
  await mockApi(page);
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
  await page.waitForFunction(() => window.excabit !== undefined);

  // Una sola tx: no hay rango que elegir.
  await page.fill('#search', CHAIN[0]!.txid);
  await page.click('#searchBtn');
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(window.excabit!.store.getState().graph.nodes).length),
    )
    .toBeGreaterThan(0);

  await page.keyboard.press('l');

  await expect(page.locator('#timeline')).toBeHidden();
  await expect(page.locator('#toasts')).toContainText(/No hay rango que filtrar/i);
});
