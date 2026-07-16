/**
 * Buscar una dirección y paginar sus transacciones (RF-02, RF-31).
 *
 * Es el sustituto del «Multi Tx» del legacy (BUG-016), que se quedó a medias
 * —solo `console.log`— precisamente porque intentaba resolver de una vez lo que
 * aquí se resuelve por páginas.
 *
 * El mock sirve una dirección con **5.000 transacciones**, como pide docs/09: es
 * el caso que distingue «pagina» de «se lo traga todo».
 */
import { test, expect, type Page } from '@playwright/test';
import { skipTour, useLocale } from './helpers/setup';

/** Dirección real de los fixtures: la reutilizada de `85e72c08`. */
const ADDRESS = '122BNoyhmuUt9G9mdEm3mN4nb73c1UgNKt';

/**
 * Los dos tamaños de página de Esplora, comprobados contra mempool.space.
 *
 * **No son el mismo**, y el mock de este fichero servía 25 en las dos — la cifra
 * que habíamos supuesto. Por eso estos tests pasaban mientras una dirección de
 * 687 txs cargaba 50 en producción y afirmaba que ya no había más. Un mock que
 * miente da tests que mienten.
 */
const FIRST_PAGE = 50;
const CHAIN_PAGE = 25;
const TOTAL = 5000;

/** Una tx sintética, distinta en cada índice. */
const txAt = (index: number) => ({
  txid: index.toString(16).padStart(64, '0'),
  version: 1,
  locktime: 0,
  size: 226,
  weight: 904,
  fee: 1000,
  status: { confirmed: true, block_height: 800_000 - index, block_time: 1_690_000_000 - index },
  vin: [
    {
      txid: (index + 100_000).toString(16).padStart(64, '0'),
      vout: 0,
      prevout: {
        scriptpubkey: '',
        scriptpubkey_type: 'p2pkh',
        scriptpubkey_address: ADDRESS,
        value: 50_000,
      },
      is_coinbase: false,
      sequence: 4_294_967_295,
    },
  ],
  vout: [
    {
      scriptpubkey: '',
      scriptpubkey_type: 'p2pkh',
      scriptpubkey_address: `dest${String(index)}`,
      value: 49_000,
    },
  ],
});

/**
 * Sirve 5.000 txs paginadas como Esplora: 25 por página, y la siguiente se pide
 * con el txid de la última vista.
 */
async function mockBigAddress(page: Page): Promise<{ requests: () => number }> {
  let requests = 0;

  await page.route(/\/api\/address\/[^/]+\/txs(\/chain\/[0-9a-f]{64})?$/, async (route) => {
    requests++;
    const url = route.request().url();
    const cursor = /\/chain\/([0-9a-f]{64})$/.exec(url)?.[1];
    const from = cursor === undefined ? 0 : parseInt(cursor, 16) + 1;
    // Como Esplora de verdad: 50 la primera, 25 las siguientes.
    const size = cursor === undefined ? FIRST_PAGE : CHAIN_PAGE;
    const items = Array.from({ length: Math.min(size, TOTAL - from) }, (_, i) => txAt(from + i));

    await route.fulfill({ json: items });
  });

  await page.route(/\/api\/tx\/[0-9a-f]{64}\/outspends$/, (route) => route.fulfill({ json: [] }));

  return { requests: () => requests };
}

async function open(page: Page): Promise<void> {
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
  await page.waitForFunction(() => window.excabit !== undefined);
}

const txCount = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      Object.values(window.excabit!.store.getState().graph.nodes).filter(
        (node) => node.kind === 'tx',
      ).length,
  );

test('RF-02: buscar una dirección carga sus transacciones', async ({ page }) => {
  await mockBigAddress(page);
  await open(page);

  await page.fill('#search', ADDRESS);
  await page.click('#searchBtn');

  await expect.poll(() => txCount(page)).toBeGreaterThan(0);
  // Y la dirección buscada está en el grafo, no solo sus txs.
  expect(
    await page.evaluate(
      (addr) => window.excabit!.store.getState().graph.nodes[`addr:${addr}`] !== undefined,
      ADDRESS,
    ),
  ).toBe(true);
});

test('RF-31: una dirección con 5.000 txs trae 50, no 5.000', async ({ page }) => {
  const mock = await mockBigAddress(page);
  await open(page);

  await page.fill('#search', ADDRESS);
  await page.click('#searchBtn');

  await expect.poll(() => txCount(page)).toBe(FIRST_PAGE);
  // Una sola petición: traerlas todas serían 100. El «Multi Tx» del legacy
  // murió intentando esto (BUG-016).
  expect(mock.requests()).toBe(1);
});

test('RF-31: ofrece paginar, y al aceptar trae 25 más', async ({ page }) => {
  await mockBigAddress(page);
  await open(page);

  await page.fill('#search', ADDRESS);
  await page.click('#searchBtn');
  await expect.poll(() => txCount(page)).toBe(FIRST_PAGE);

  // «Se ofrece paginar» (RF-31), literalmente: un botón que lo dice.
  await expect(page.locator('#toasts')).toContainText(/Hay más/);
  await page.click('.toastAction');

  await expect.poll(() => txCount(page)).toBe(FIRST_PAGE + CHAIN_PAGE);
});

test('RF-31: la oferta se repite mientras queden', async ({ page }) => {
  await mockBigAddress(page);
  await open(page);

  await page.fill('#search', ADDRESS);
  await page.click('#searchBtn');
  await expect.poll(() => txCount(page)).toBe(FIRST_PAGE);

  for (let i = 1; i <= 3; i++) {
    await page.locator('.toastAction').first().click();
    await expect.poll(() => txCount(page)).toBe(FIRST_PAGE + CHAIN_PAGE * i);
  }
});

test('RF-31: la oferta no caduca mientras la lees', async ({ page }) => {
  // Un toast de 6 s que se lleva la única forma de seguir cargando sería una
  // trampa: la oferta espera al usuario.
  await mockBigAddress(page);
  await open(page);

  await page.fill('#search', ADDRESS);
  await page.click('#searchBtn');
  await expect(page.locator('.toastAction')).toBeVisible();

  await page.waitForTimeout(7000);

  await expect(page.locator('.toastAction')).toBeVisible();
});

test('RF-31: la UI no se congela mientras carga', async ({ page }) => {
  await mockBigAddress(page);
  await open(page);

  await page.fill('#search', ADDRESS);
  await page.click('#searchBtn');
  await expect.poll(() => txCount(page)).toBe(FIRST_PAGE);

  // El grafo responde a la vez que se pagina: se pide otra página y, sin
  // esperarla, se usa la app. Si el hilo estuviera bloqueado, esto no correría.
  await page.locator('.toastAction').first().click();
  const zoomed = await page.evaluate(() => {
    const before = window.excabit!.adapter.cy.zoom();
    window.excabit!.adapter.cy.zoom(before * 1.5);

    return window.excabit!.adapter.cy.zoom() !== before;
  });

  expect(zoomed).toBe(true);
  await expect.poll(() => txCount(page)).toBe(FIRST_PAGE + CHAIN_PAGE);
});

test('una dirección inválida se rechaza inline, como un txid inválido (RF-01)', async ({
  page,
}) => {
  await mockBigAddress(page);
  await open(page);

  await page.fill('#search', 'bc1qesto-no-es-una-direccion');
  await page.click('#searchBtn');

  await expect(page.locator('#searchError')).toBeVisible();
  // El mensaje ya no puede decir solo «txid»: la caja admite las dos cosas.
  await expect(page.locator('#searchError')).toContainText(/dirección/i);
  await expect(page.locator('#search')).toHaveAttribute('aria-invalid', 'true');
});
