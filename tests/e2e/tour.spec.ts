import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mock-api';
import { skipTour, useLocale } from './helpers/setup';

/**
 * Tour de primer uso (RF-32, docs/09 §27).
 *
 * Sustituye a los 13 vídeos mp4 de ayuda del legacy (F-03). Este es el único
 * spec que NO llama a `skipTour`: su trabajo es comprobar que aparece.
 */

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await useLocale(page, 'es');
});

test('RF-32: aparece en el primer arranque', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#tourBox')).toBeVisible();
  await expect(page.locator('#tourBox')).toContainText('Busca una transacción');
});

test('RF-32: NO reaparece en la siguiente visita', async ({ page }) => {
  await page.goto('/');
  await page.click('#tourSkip');
  await expect(page.locator('#tourBox')).toBeHidden();

  await page.reload();

  // Una ayuda que vuelve cada vez es un estorbo, no una ayuda.
  await expect(page.locator('#tourBox')).toBeHidden();
});

test('RF-32: recorre los 5 pasos y termina', async ({ page }) => {
  await page.goto('/');

  for (let i = 0; i < 4; i++) {
    await expect(page.locator('#tourDots i.on')).toHaveCount(1);
    await page.click('#tourNext');
  }

  // El último paso invita a empezar, no a "seguir".
  await expect(page.locator('#tourNext')).toHaveText('Empezar');
  await page.click('#tourNext');

  await expect(page.locator('#tourBox')).toBeHidden();
});

test('se puede volver atrás', async ({ page }) => {
  await page.goto('/');
  await page.click('#tourNext');
  await expect(page.locator('#tourBox')).toContainText('Expande el grafo');

  await page.click('#tourBack');

  await expect(page.locator('#tourBox')).toContainText('Busca una transacción');
});

test('el primer paso no ofrece «Atrás»: no hay dónde volver', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#tourBack')).toHaveCount(0);
});

test('Esc lo cierra y lo da por visto', async ({ page }) => {
  await page.goto('/');
  // Se espera a que aparezca antes de cerrarlo. Desde la Fase 5 el tour sale
  // después de mirar si hay un autosave que restaurar (RF-22), así que ya no
  // está en el DOM al terminar de cargar la página: sin esta espera, el Esc
  // llegaría antes que el tour y lo cerraría… nada.
  await expect(page.locator('#tourBox')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.locator('#tourBox')).toBeHidden();

  await page.reload();
  await expect(page.locator('#tourBox')).toBeHidden();
});

test('saltado el tour, la app queda usable de inmediato', async ({ page }) => {
  await page.goto('/');
  await page.click('#tourSkip');

  await page.click('#exampleBtn');

  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(window.excabit!.store.getState().graph.nodes).length),
    )
    .toBe(5);
});

test('con el tour ya visto, no molesta', async ({ page }) => {
  await skipTour(page);
  await page.goto('/');

  await expect(page.locator('#tourBox')).toBeHidden();
});
