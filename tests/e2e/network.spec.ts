/**
 * Selector de red (RF-04).
 *
 * Una investigación es de **una sola red**. Los txids de mainnet y testnet no
 * tienen nada que ver entre sí: un grafo con las dos no significa nada y,
 * guardado, afirma algo falso — el fichero lleva una red, así que las txs de la
 * otra quedan etiquetadas con la que no es.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { skipTour, useLocale } from './helpers/setup';

const MAINNET_TX = '85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2';
const TESTNET_TX = 'a'.repeat(64);

const derive = (txid: string, suffix: string): string =>
  (txid.slice(0, 64 - suffix.length - 1) + '0' + suffix).slice(0, 64);

const fakeTx = (txid: string) => ({
  txid,
  version: 1,
  locktime: 0,
  size: 258,
  weight: 1032,
  fee: 10_000,
  status: { confirmed: true, block_height: 300_000, block_time: 1_399_703_554 },
  vin: [
    {
      txid: derive(txid, 'a1'),
      vout: 0,
      prevout: {
        scriptpubkey: '',
        scriptpubkey_type: 'p2pkh',
        scriptpubkey_address: `in${txid.slice(0, 6)}`,
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
      scriptpubkey_address: `out${txid.slice(0, 6)}`,
      value: 50_000,
    },
  ],
});

/** Devuelve las rutas pedidas: así se ve a qué red se le habla de verdad. */
async function mockAll(page: Page): Promise<{ paths: () => string[] }> {
  const paths: string[] = [];

  await page.route(/mempool\.space/, async (route) => {
    const url = route.request().url();
    paths.push(new URL(url).pathname);

    if (url.includes('outspends')) {
      await route.fulfill({ json: [{ spent: false }] });

      return;
    }

    const txid = /\/tx\/([0-9a-f]{64})$/.exec(url)?.[1];
    await route.fulfill({ json: txid === undefined ? [] : fakeTx(txid) });
  });

  return { paths: () => paths };
}

async function open(page: Page): Promise<void> {
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
  await page.waitForFunction(() => window.excabit !== undefined);
}

const nodeCount = (page: Page): Promise<number> =>
  page.evaluate(() => Object.keys(window.excabit!.store.getState().graph.nodes).length);

const storeNetwork = (page: Page): Promise<string> =>
  page.evaluate(() => window.excabit!.store.getState().network);

async function searchTx(page: Page, txid: string): Promise<void> {
  await page.fill('#search', txid);
  await page.click('#searchBtn');
  await expect.poll(() => nodeCount(page)).toBeGreaterThan(0);
}

test('RF-04: con el grafo vacío, cambiar de red no pregunta', async ({ page }) => {
  await mockAll(page);
  await open(page);

  await page.selectOption('#network', 'testnet');

  // No hay nada que perder: preguntar sería un trámite.
  await expect(page.locator('#confirmOverlay')).toHaveCount(0);
  await expect(page.locator('#statusNetwork')).toHaveText('testnet');
  expect(await storeNetwork(page)).toBe('testnet');
});

test('RF-04: la red vive en el ESTADO, no solo en la barra', async ({ page }) => {
  await mockAll(page);
  await open(page);

  await page.selectOption('#network', 'signet');

  // El bug era justo este: la barra decía «testnet» y el estado seguía en
  // mainnet, así que el fichero guardaba una red que no era la de los datos.
  expect(await storeNetwork(page)).toBe('signet');
});

test('RF-04: con una investigación abierta, avisa antes de vaciarla', async ({ page }) => {
  await mockAll(page);
  await open(page);
  await searchTx(page, MAINNET_TX);
  const before = await nodeCount(page);

  await page.selectOption('#network', 'testnet');

  await expect(page.locator('#confirmOverlay')).toBeVisible();
  await expect(page.locator('#confirmOverlay')).toContainText(/vaciará/i);
  // Mientras se decide, no se ha tocado nada.
  expect(await nodeCount(page)).toBe(before);
  expect(await storeNetwork(page)).toBe('mainnet');
});

test('RF-04: cancelar deja la red y el grafo como estaban', async ({ page }) => {
  await mockAll(page);
  await open(page);
  await searchTx(page, MAINNET_TX);
  const before = await nodeCount(page);

  await page.selectOption('#network', 'testnet');
  await page.click('#confirmCancel');

  expect(await storeNetwork(page)).toBe('mainnet');
  expect(await nodeCount(page)).toBe(before);
  // Y el desplegable vuelve a lo que hay de verdad: si se quedara en «testnet»
  // diría una red que no es la activa.
  await expect(page.locator('#network')).toHaveValue('mainnet');
  await expect(page.locator('#statusNetwork')).toHaveText('mainnet');
});

test('RF-04: Esc equivale a cancelar — lo que no destruye nada', async ({ page }) => {
  await mockAll(page);
  await open(page);
  await searchTx(page, MAINNET_TX);

  await page.selectOption('#network', 'testnet');
  await page.keyboard.press('Escape');

  expect(await storeNetwork(page)).toBe('mainnet');
  await expect(page.locator('#network')).toHaveValue('mainnet');
});

test('RF-04: confirmar vacía el grafo y cambia de red', async ({ page }) => {
  await mockAll(page);
  await open(page);
  await searchTx(page, MAINNET_TX);

  await page.selectOption('#network', 'testnet');
  await page.click('#confirmOk');

  expect(await nodeCount(page)).toBe(0);
  expect(await storeNetwork(page)).toBe('testnet');
  await expect(page.locator('#empty')).toBeVisible();
});

test('RF-04: el grafo NUNCA mezcla txs de dos redes', async ({ page }) => {
  // El bug, tal cual: 3 nodos de mainnet + 3 de testnet en el mismo grafo, y el
  // fichero los guardaba todos como testnet.
  const mock = await mockAll(page);
  await open(page);
  await searchTx(page, MAINNET_TX);

  await page.selectOption('#network', 'testnet');
  await page.click('#confirmOk');
  await searchTx(page, TESTNET_TX);

  // Solo lo de testnet: lo de mainnet se fue con el cambio.
  const ids = await page.evaluate(() => Object.keys(window.excabit!.store.getState().graph.nodes));
  expect(ids.some((id) => id.includes(MAINNET_TX))).toBe(false);
  expect(ids.some((id) => id.includes(TESTNET_TX))).toBe(true);

  // Y se le pidió a la red correcta.
  expect(mock.paths().some((path) => path.startsWith('/testnet/api/tx/'))).toBe(true);
});

test('RF-04: al cambiar de red se puede guardar antes de perder el grafo', async ({ page }) => {
  await mockAll(page);
  await open(page);
  await searchTx(page, MAINNET_TX);

  await page.selectOption('#network', 'testnet');

  const wait = page.waitForEvent('download');
  await page.click('#confirmExtra');
  const saved = JSON.parse(readFileSync(await (await wait).path(), 'utf8')) as {
    network: string;
    nodes: unknown[];
  };

  // Se guarda lo que hay: mainnet, con sus nodos.
  expect(saved.network).toBe('mainnet');
  expect(saved.nodes.length).toBeGreaterThan(0);
  // El diálogo sigue abierto: guardar no era la respuesta a la pregunta.
  await expect(page.locator('#confirmOverlay')).toBeVisible();
});

test('RF-04: un fichero de testnet se abre EN testnet', async ({ page }) => {
  const mock = await mockAll(page);
  await open(page);

  // Se fabrica una investigación de testnet y se guarda.
  await page.selectOption('#network', 'testnet');
  await searchTx(page, TESTNET_TX);
  const wait = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const path = await (await wait).path();

  // Sesión nueva en mainnet.
  await page.goto('/');
  await page.waitForFunction(() => window.excabit !== undefined);
  if ((await page.locator('#restoreOverlay').count()) > 0) await page.click('#restoreDiscard');
  expect(await storeNetwork(page)).toBe('mainnet');

  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles(path);

  // La red viene DENTRO del fichero: el usuario no la elige al abrir.
  await expect.poll(() => storeNetwork(page)).toBe('testnet');
  await expect(page.locator('#network')).toHaveValue('testnet');
  await expect(page.locator('#statusNetwork')).toHaveText('testnet');

  // Y lo que de verdad importa: los datos se le piden a testnet, no a mainnet.
  const before = mock.paths().length;
  await page.fill('#search', 'b'.repeat(64));
  await page.click('#searchBtn');
  await expect
    .poll(
      () =>
        mock
          .paths()
          .slice(before)
          .filter((p) => p.includes('/tx/')).length,
    )
    .toBeGreaterThan(0);

  const asked = mock
    .paths()
    .slice(before)
    .filter((path) => path.includes('/tx/'));
  expect(asked.every((path) => path.startsWith('/testnet/api/'))).toBe(true);
});
