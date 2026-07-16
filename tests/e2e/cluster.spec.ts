/**
 * Clustering de direcciones en la app real (RF-19).
 *
 * Los vectores de CIOH (y sobre todo el de la CoinJoin) los prueba
 * `tests/unit/analysis/clustering.spec.ts`. Aquí: que la tecla agrupa, que el
 * motor pinta la caja, que se puede nombrar y que se puede deshacer.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockApi, ROOT_TXID } from './helpers/mock-api';
import { skipTour, useLocale } from './helpers/setup';

async function openGraph(page: Page): Promise<void> {
  await mockApi(page);
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
  await page.waitForFunction(() => window.excabit !== undefined);
  await page.fill('#search', ROOT_TXID);
  await page.click('#searchBtn');
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(window.excabit!.store.getState().graph.nodes).length),
    )
    .toBe(5);
}

/** Los clusters según el store. */
const clusters = (page: Page): Promise<{ id: string; label?: string; children: number }[]> =>
  page.evaluate(() => {
    const nodes = Object.values(window.excabit!.store.getState().graph.nodes);

    return nodes
      .filter((node) => node.kind === 'cluster')
      .map((node) => ({
        id: node.id,
        ...(node.label === undefined ? {} : { label: node.label }),
        children: nodes.filter((child) => child.parent === node.id).length,
      }));
  });

test('RF-19: agrupa las direcciones que firman juntas', async ({ page }) => {
  await openGraph(page);
  expect(await clusters(page)).toEqual([]);

  await page.keyboard.press('g');

  const found = await clusters(page);
  expect(found).toHaveLength(1);
  // La tx de prueba tiene dos entradas con dirección conocida: CIOH las une.
  expect(found[0]?.children).toBe(2);
});

test('RF-19: el cluster es un compound node de verdad en el motor', async ({ page }) => {
  await openGraph(page);
  await page.keyboard.press('g');

  const inCytoscape = await page.evaluate(() => {
    const cy = window.excabit!.adapter.cy;
    const cluster = cy.nodes('[kind = "cluster"]').first();

    return { exists: cluster.length > 0, children: cluster.children().length };
  });

  // Si fuera un nodo suelto pintado como caja, no abarcaría a nadie.
  expect(inCytoscape.exists).toBe(true);
  expect(inCytoscape.children).toBe(2);
});

test('RF-19: dice cuántos monederos ha encontrado, en singular cuando es uno', async ({ page }) => {
  await openGraph(page);

  await page.keyboard.press('g');

  await expect(page.locator('#toasts')).toContainText(/1 monedero detectado/);
  await expect(page.locator('#toasts')).not.toContainText(/1 monederos/);
});

test('RF-19: el cluster se puede nombrar, como cualquier otro nodo', async ({ page }) => {
  await openGraph(page);
  await page.keyboard.press('g');

  const id = (await clusters(page))[0]?.id;
  await page.evaluate((clusterId) => {
    window.excabit!.setLabel(clusterId!, 'Exchange Kraken');
  }, id);

  expect((await clusters(page))[0]?.label).toBe('Exchange Kraken');
});

test('RF-19: agrupar dos veces no duplica el cluster', async ({ page }) => {
  await openGraph(page);
  await page.keyboard.press('g');
  await page.evaluate(
    (clusterId) => {
      window.excabit!.setLabel(clusterId!, 'Mi nombre');
    },
    (await clusters(page))[0]?.id,
  );

  // Se deselecciona: si no, la segunda `g` desharía el cluster seleccionado.
  await page.evaluate(() => {
    window.excabit!.clearSelection();
  });
  await page.keyboard.press('g');

  const found = await clusters(page);
  expect(found).toHaveLength(1);
  // Y el nombre que puso el usuario sigue ahí: recalcular la hipótesis no la
  // cambia, así que rehacer el cluster solo serviría para perder el nombre.
  expect(found[0]?.label).toBe('Mi nombre');
});

test('RF-19: deshacer la agrupación devuelve las direcciones', async ({ page }) => {
  await openGraph(page);
  await page.keyboard.press('g');

  const before = await page.evaluate(
    () => Object.keys(window.excabit!.store.getState().graph.nodes).length,
  );
  const id = (await clusters(page))[0]?.id;

  await page.evaluate((clusterId) => {
    window.excabit!.store.dispatch({
      type: 'test:select',
      apply: (s) => ({ ...s, selection: [clusterId!] }),
    });
  }, id);
  await page.keyboard.press('g');

  expect(await clusters(page)).toEqual([]);
  await expect(page.locator('#toasts')).toContainText(/Agrupación deshecha/);

  // Las direcciones se quedan: agrupar es una hipótesis, no un cambio de datos.
  const after = await page.evaluate(
    () => Object.keys(window.excabit!.store.getState().graph.nodes).length,
  );
  expect(after).toBe(before - 1);
});

test('RF-19: Ctrl+Z deshace la agrupación', async ({ page }) => {
  await openGraph(page);
  await page.keyboard.press('g');
  expect(await clusters(page)).toHaveLength(1);

  await page.keyboard.press('Control+z');

  expect(await clusters(page)).toEqual([]);
  // Y las direcciones quedan libres, no huérfanas de un padre que ya no existe.
  const orphans = await page.evaluate(() =>
    Object.values(window.excabit!.store.getState().graph.nodes).filter(
      (node) => node.parent !== undefined,
    ),
  );
  expect(orphans).toEqual([]);
});

test('sin nada que agrupar, explica por qué en vez de callarse', async ({ page }) => {
  await mockApi(page);
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
  await page.waitForFunction(() => window.excabit !== undefined);

  await page.keyboard.press('g');

  await expect(page.locator('#toasts')).toContainText(/No hay direcciones que agrupar/);
});
