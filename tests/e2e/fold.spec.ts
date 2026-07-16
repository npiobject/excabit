/**
 * Plegar detalles en la app real (RF-36.3, RF-36.4).
 *
 * Qué es plegable lo prueba `tests/unit/analysis/folding.spec.ts`. Aquí: que la
 * tecla lo pliega, que el resumen dice cuántos hay, que se abre al pulsarlo y
 * que **el grafo cabe** — que es de lo que va todo esto.
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

/** Lo que se ve de verdad: Cytoscape no dibuja lo que tiene `display: none`. */
const visible = (page: Page): Promise<number> =>
  page.evaluate(
    () => window.excabit!.adapter.cy.nodes().filter((n) => n.style('display') !== 'none').length,
  );

const summaries = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    window
      .excabit!.adapter.cy.nodes('[kind = "foldSummary"]')
      .map((n) => String(n.data('display'))),
  );

test('RF-36.4: la tecla pliega y deja menos nodos a la vista', async ({ page }) => {
  await openGraph(page);
  const antes = await visible(page);

  await page.keyboard.press('p');

  expect(await visible(page)).toBeLessThan(antes);
});

test('RF-36.4: queda un resumen que dice cuántos hay: plegar no es esconder', async ({ page }) => {
  await openGraph(page);

  await page.keyboard.press('p');

  // Sin esto, las direcciones no estarían plegadas: estarían desaparecidas.
  const marks = await summaries(page);
  expect(marks.length).toBeGreaterThan(0);
  expect(marks.join(' ')).toMatch(/^\+\d/);
  await expect(page.locator('#statusFold')).toContainText(/plegados/);
});

test('RF-36.4: un click en el resumen abre lo suyo, sin salir del modo', async ({ page }) => {
  await openGraph(page);
  await page.keyboard.press('p');
  const plegado = await visible(page);

  await page.evaluate(() => {
    window.excabit!.adapter.cy.nodes('[kind = "foldSummary"]').first().emit('tap');
  });

  await expect.poll(() => visible(page)).toBeGreaterThan(plegado);
});

test('RF-36.4: la misma tecla lo devuelve todo', async ({ page }) => {
  await openGraph(page);
  const antes = await visible(page);
  await page.keyboard.press('p');
  expect(await visible(page)).toBeLessThan(antes);

  await page.keyboard.press('p');

  expect(await visible(page)).toBe(antes);
  expect(await summaries(page)).toEqual([]);
  await expect(page.locator('#statusFold')).toHaveText('');
});

test('RF-36: plegar NO toca los datos — no hay nada que deshacer', async ({ page }) => {
  await openGraph(page);
  const before = await page.evaluate(() =>
    JSON.stringify(window.excabit!.store.getState().graph, (_k, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );

  await page.keyboard.press('p');

  const after = await page.evaluate(() =>
    JSON.stringify(window.excabit!.store.getState().graph, (_k, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );

  // Es una forma de mirar: el contador de nodos del store no se mueve.
  expect(after).toBe(before);
  await expect(page.locator('#statusCounts')).toContainText('5 nodos');
});

test('RF-36: lo plegado no ocupa sitio — el grafo cabe mejor', async ({ page }) => {
  await openGraph(page);
  const alto = () =>
    page.evaluate(() =>
      Math.round(window.excabit!.adapter.cy.elements(':visible').boundingBox().h),
    );
  const antes = await alto();

  await page.keyboard.press('p');

  // Si se atenuaran en vez de plegarse, el grafo mediría lo mismo y el `fit`
  // seguiría alejando hasta lo ilegible: de eso va RF-36.
  expect(await alto()).toBeLessThan(antes);
});

test('lo que el usuario etiquetó no se pliega', async ({ page }) => {
  await openGraph(page);
  const id = await page.evaluate(() => {
    const nodes = Object.values(window.excabit!.store.getState().graph.nodes);
    const addr = nodes.find((n) => n.kind === 'address');
    window.excabit!.setLabel(addr!.id, 'No me escondas');

    return addr!.id;
  });

  await page.keyboard.press('p');

  // Si se molestó en nombrarla, le importa.
  const shown = await page.evaluate(
    (nodeId) => window.excabit!.adapter.cy.getElementById(nodeId).style('display') !== 'none',
    id,
  );
  expect(shown).toBe(true);
});

test('sin nada que plegar, lo dice en vez de callarse', async ({ page }) => {
  await mockApi(page);
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
  await page.waitForFunction(() => window.excabit !== undefined);

  await page.keyboard.press('p');

  await expect(page.locator('#toasts')).toContainText(/No hay nada que plegar/i);
});
