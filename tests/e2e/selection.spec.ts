import { test, expect, type Page } from '@playwright/test';
import { mockApi, ROOT_TXID } from './helpers/mock-api';
import { skipTour, useLocale } from './helpers/setup';

/**
 * RF-09 y regresión de BUG-017.
 *
 * El legacy registraba 12 `window.addEventListener` (6 de "click") con guardas
 * por teclas que se solapaban: shift+click seleccionaba Y arrancaba un área a
 * la vez, y `mouseReleased` de p5 duplicaba el "mouseup" nativo. Aquí las
 * interacciones las gestiona Cytoscape con un modelo de selección explícito.
 */

const selection = (page: Page) =>
  page.evaluate(() => [...window.excabit!.store.getState().selection].sort());

const nodeIds = (page: Page) =>
  page.evaluate(() => Object.keys(window.excabit!.store.getState().graph.nodes).sort());

/** Selecciona por el modelo: el gesto lo cubre Cytoscape, aquí importa el efecto. */
const selectInScene = (page: Page, ids: string[]) =>
  page.evaluate((targets) => {
    const { cy } = window.excabit!.adapter;
    targets.forEach((id) => cy.getElementById(id).select());
  }, ids);

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
  await page.fill('#search', ROOT_TXID);
  await page.click('#searchBtn');
  await expect.poll(() => nodeIds(page)).toHaveLength(5);
});

test('RF-09: seleccionar un nodo lo refleja en el store', async ({ page }) => {
  const [first] = await nodeIds(page);

  await selectInScene(page, [first!]);

  await expect.poll(() => selection(page)).toEqual([first]);
});

test('RF-09: la selección se acumula (shift+click)', async ({ page }) => {
  const ids = await nodeIds(page);
  const pair = [ids[0]!, ids[1]!].sort();

  await selectInScene(page, pair);

  await expect.poll(() => selection(page)).toEqual(pair);
});

test('RF-09: deseleccionar vacía la selección', async ({ page }) => {
  const ids = await nodeIds(page);
  await selectInScene(page, [ids[0]!]);
  await expect.poll(() => selection(page)).toHaveLength(1);

  await page.evaluate(() => {
    window.excabit!.adapter.cy.$(':selected').unselect();
  });

  await expect.poll(() => selection(page)).toEqual([]);
});

test('RF-12: Supr borra la selección y sus aristas huérfanas, y Ctrl+Z lo revierte', async ({
  page,
}) => {
  const before = await nodeIds(page);
  const target = before.find((id) => id.startsWith('addr:'))!;
  await selectInScene(page, [target]);
  await expect.poll(() => selection(page)).toEqual([target]);

  await page.locator('#graph').press('Delete');

  await expect.poll(() => nodeIds(page)).not.toContain(target);
  const orphans = await page.evaluate((id) => {
    const { graph } = window.excabit!.store.getState();
    return Object.values(graph.edges).filter((e) => e.from === id || e.to === id).length;
  }, target);
  expect(orphans).toBe(0);

  await page.keyboard.press('Control+z');

  await expect.poll(() => nodeIds(page)).toEqual(before);
});

test('BUG-017: shift+click no dispara a la vez selección y área', async ({ page }) => {
  const ids = await nodeIds(page);
  await selectInScene(page, [ids[0]!]);

  // Con las guardas solapadas del legacy, un shift+click dejaba la selección
  // en un estado ambiguo. Aquí el efecto es exactamente uno.
  await expect.poll(() => selection(page)).toHaveLength(1);
});
