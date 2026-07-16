/**
 * Seguir el flujo de fondos en la app real (RF-18).
 *
 * La aritmética del haircut ya la prueba `tests/unit/analysis/taint.spec.ts`.
 * Aquí se comprueba lo otro: que la tecla lo enciende, que el grafo lo enseña y
 * que se puede volver atrás.
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

/** Cuántos nodos están marcados y cuántos apagados, según el motor. */
const classes = (page: Page): Promise<{ tainted: number; dimmed: number }> =>
  page.evaluate(() => ({
    tainted: window.excabit!.adapter.cy.nodes('.tainted').length,
    dimmed: window.excabit!.adapter.cy.nodes('.dimmed').length,
  }));

/** Selecciona una dirección de entrada: tiene por dónde seguir el dinero. */
async function selectInputAddress(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.excabit!.store.getState();
    const edge = Object.values(state.graph.edges).find((e) => e.kind === 'input');
    window.excabit!.store.dispatch({
      type: 'test:select',
      apply: (s) => ({ ...s, selection: [edge!.from] }),
    });
  });
}

test('RF-18: seguir los fondos resalta el camino y apaga el resto', async ({ page }) => {
  await openGraph(page);
  await selectInputAddress(page);

  expect(await classes(page)).toEqual({ tainted: 0, dimmed: 0 });

  await page.keyboard.press('f');

  const after = await classes(page);
  expect(after.tainted).toBeGreaterThan(0);
  // Resaltar un camino es apagar lo que no lo es: si todo quedara encendido, no
  // se resaltaría nada.
  expect(after.dimmed).toBeGreaterThan(0);
});

test('RF-18: enseña la suma acumulada y los saltos', async ({ page }) => {
  await openGraph(page);
  await selectInputAddress(page);

  await page.keyboard.press('f');

  // Es lo que RF-18 pide literalmente: cuánto llega y en cuántos saltos.
  await expect(page.locator('#statusMessage')).toContainText(/Rastro:/);
  await expect(page.locator('#statusMessage')).toContainText(/BTC/);
  await expect(page.locator('#statusMessage')).toContainText(/salto/);
  // Con un solo salto pone «1 salto», no «1 saltos» (RF-30).
  await expect(page.locator('#statusMessage')).not.toContainText(/1 saltos/);
  // Y en español los decimales llevan coma, no punto.
  await expect(page.locator('#statusMessage')).toContainText(/0,\d+ BTC/);
});

test('RF-18: la misma tecla lo quita — es un modo de ver, no un cambio', async ({ page }) => {
  await openGraph(page);
  await selectInputAddress(page);

  await page.keyboard.press('f');
  expect((await classes(page)).tainted).toBeGreaterThan(0);

  await page.keyboard.press('f');

  expect(await classes(page)).toEqual({ tainted: 0, dimmed: 0 });
  await expect(page.locator('#statusMessage')).toHaveText('');
});

test('RF-18: seguir fondos NO toca el modelo (BUG-015 era esto)', async ({ page }) => {
  await openGraph(page);
  await selectInputAddress(page);

  const before = await page.evaluate(() =>
    JSON.stringify(window.excabit!.store.getState().graph, (_k, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );

  await page.keyboard.press('f');

  const after = await page.evaluate(() =>
    JSON.stringify(window.excabit!.store.getState().graph, (_k, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );

  // El rastro es una forma de mirar, no una edición: nada que deshacer.
  expect(after).toBe(before);
});

test('RF-18: cambiar la selección apaga el rastro anterior', async ({ page }) => {
  await openGraph(page);
  await selectInputAddress(page);
  await page.keyboard.press('f');
  expect((await classes(page)).tainted).toBeGreaterThan(0);

  // Un rastro pintado con otra selección en pantalla engañaría más que ayudaría.
  await page.evaluate(() => {
    window.excabit!.store.dispatch({
      type: 'test:select',
      apply: (s) => ({ ...s, selection: [] }),
    });
  });

  expect(await classes(page)).toEqual({ tainted: 0, dimmed: 0 });
});

test('RF-18: un nodo sin salida avisa en vez de pintar nada', async ({ page }) => {
  await openGraph(page);

  // Una dirección de salida sin gastar: el dinero está parado ahí.
  await page.evaluate(() => {
    const state = window.excabit!.store.getState();
    const spent = new Set(Object.values(state.graph.edges).map((e) => e.from));
    const dead = Object.values(state.graph.nodes).find(
      (n) => n.kind === 'address' && !spent.has(n.id),
    );
    window.excabit!.store.dispatch({
      type: 'test:select',
      apply: (s) => ({ ...s, selection: [dead!.id] }),
    });
  });

  await page.keyboard.press('f');

  await expect(page.locator('#toasts')).toContainText(/no lleva a ningún sitio/i);
  expect((await classes(page)).tainted).toBe(0);
});

test('RF-18: sin selección, la tecla no hace nada', async ({ page }) => {
  await openGraph(page);

  await page.keyboard.press('f');

  expect(await classes(page)).toEqual({ tainted: 0, dimmed: 0 });
});
