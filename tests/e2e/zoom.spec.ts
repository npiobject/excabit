import { test, expect, type Page } from '@playwright/test';
import { mockApi, ROOT_TXID } from './helpers/mock-api';
import { skipTour, useLocale } from './helpers/setup';

/**
 * Regresión de BUG-015.
 *
 * El legacy reescalaba TODAS las posiciones del modelo con `int()` en cada
 * rueda del ratón, así que cada zoom acumulaba error de redondeo y el layout
 * derivaba: tras un rato de zoom in/out, el grafo ya no estaba donde el usuario
 * lo había dejado. Aquí el zoom es transformación del viewport y el modelo ni
 * se entera.
 */

const modelPositions = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(window.excabit!.store.getState().graph.nodes).map(([id, node]) => [
        id,
        { x: node.x, y: node.y },
      ]),
    ),
  );

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
  await page.fill('#search', ROOT_TXID);
  await page.click('#searchBtn');
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(window.excabit!.store.getState().graph.nodes).length),
    )
    .toBe(5);
});

test('BUG-015: 20 ruedas adelante y atrás dejan el modelo idéntico', async ({ page }) => {
  const before = await modelPositions(page);

  await page.locator('#graph').hover();
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -120);
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 120);

  expect(await modelPositions(page)).toEqual(before);
});

test('BUG-015: el zoom cambia la vista, no los datos', async ({ page }) => {
  const before = await modelPositions(page);

  // Ojo: `cy.zoom(3)` devuelve el propio Core (encadenable) y Playwright no
  // puede serializarlo. Las llaves evitan devolverlo.
  await page.evaluate(() => {
    window.excabit!.adapter.cy.zoom(3);
  });

  expect(await page.evaluate(() => window.excabit!.adapter.cy.zoom())).toBe(3);
  expect(await modelPositions(page)).toEqual(before);
});

test('RF-08: el pan tampoco toca el modelo', async ({ page }) => {
  const before = await modelPositions(page);

  await page.evaluate(() => {
    window.excabit!.adapter.cy.pan({ x: 200, y: 120 });
  });

  expect(await page.evaluate(() => window.excabit!.adapter.cy.pan())).toEqual({ x: 200, y: 120 });
  expect(await modelPositions(page)).toEqual(before);
});

test('RF-08: el zoom tiene topes, no se puede perder el grafo de vista', async ({ page }) => {
  await page.evaluate(() => {
    window.excabit!.adapter.cy.zoom(9999);
  });
  expect(await page.evaluate(() => window.excabit!.adapter.cy.zoom())).toBeLessThanOrEqual(4);

  await page.evaluate(() => {
    window.excabit!.adapter.cy.zoom(0.00001);
  });
  expect(await page.evaluate(() => window.excabit!.adapter.cy.zoom())).toBeGreaterThanOrEqual(0.1);
});
