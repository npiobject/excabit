import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockApi, ROOT_TXID } from './helpers/mock-api';
import { skipTour, useLocale } from './helpers/setup';

/**
 * Accesibilidad (RNF-05, docs/06 §7, docs/09 §27).
 *
 * Gate: axe-core sin violaciones serias o críticas. Las menores se dejan ver
 * pero no bloquean, para que el gate signifique algo y no se acabe ignorando.
 */

/** El canvas de Cytoscape es un `<canvas>`: axe no tiene nada que analizar ahí. */
const analyze = (page: import('@playwright/test').Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

const serious = (violations: { impact?: string | null | undefined; id: string }[]) =>
  violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
});

test('RNF-05: el estado vacío no tiene violaciones serias', async ({ page }) => {
  const { violations } = await analyze(page);

  expect(serious(violations).map((v) => v.id)).toEqual([]);
});

test('RNF-05: el workspace con un grafo cargado no tiene violaciones serias', async ({ page }) => {
  await page.fill('#search', ROOT_TXID);
  await page.click('#searchBtn');
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(window.excabit!.store.getState().graph.nodes).length),
    )
    .toBe(5);

  const { violations } = await analyze(page);

  expect(serious(violations).map((v) => v.id)).toEqual([]);
});

test('RNF-05: la palette no tiene violaciones serias', async ({ page }) => {
  await page.keyboard.press('Control+k');

  const { violations } = await analyze(page);

  expect(serious(violations).map((v) => v.id)).toEqual([]);
});

test('RNF-05: el overlay de atajos no tiene violaciones serias', async ({ page }) => {
  await page.keyboard.press('?');

  const { violations } = await analyze(page);

  expect(serious(violations).map((v) => v.id)).toEqual([]);
});

test('RNF-05: el tour no tiene violaciones serias', async ({ browser }) => {
  // CONTEXTO nuevo, no solo página: `context.newPage()` comparte localStorage,
  // y el beforeEach ya dejó ahí el tour como visto — la página nueva no lo
  // vería nunca.
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await mockApi(fresh);
  await useLocale(fresh, 'es');
  await fresh.goto('/');
  await expect(fresh.locator('#tourBox')).toBeVisible();

  const { violations } = await new AxeBuilder({ page: fresh })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(serious(violations).map((v) => v.id)).toEqual([]);
  await context.close();
});

test('RNF-05: se puede llegar a la búsqueda solo con el teclado', async ({ page }) => {
  await page.keyboard.press('Tab');

  // Lo primero tabulable es la búsqueda: es la acción principal de la app.
  await expect(page.locator('#search')).toBeFocused();
});

test('RNF-05: el foco es visible en los controles', async ({ page }) => {
  await page.focus('#searchBtn');

  const outline = await page
    .locator('#searchBtn')
    .evaluate((element) => getComputedStyle(element).outlineStyle);

  expect(outline).not.toBe('none');
});

test('RNF-05: la app declara su idioma y cambia con el conmutador', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');

  await page.click('#langBtn');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#searchBtn')).toHaveText('Search');
});

test('RF-30: el idioma elegido sobrevive a una recarga', async ({ browser }) => {
  // Contexto propio: `useLocale` del beforeEach reescribe el idioma en CADA
  // carga, así que con él la recarga nunca podría probar nada.
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await mockApi(fresh);
  await skipTour(fresh);
  await fresh.goto('/');

  await fresh.click('#langBtn');
  await expect(fresh.locator('#searchBtn')).toHaveText('Search');

  await fresh.reload();

  await expect(fresh.locator('#searchBtn')).toHaveText('Search');
  await expect(fresh.locator('html')).toHaveAttribute('lang', 'en');
  await context.close();
});
