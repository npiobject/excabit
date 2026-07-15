import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mock-api';
import { skipTour, useLocale } from './helpers/setup';

/**
 * Command palette (RF-26, docs/09 §27).
 *
 * Es la tercera vía de acceso a toda acción y lo que hace la app descubrible
 * sin memorizar nada: el legacy escondía funciones tras teclas mantenidas
 * (`d+click`, `alt+click`) que no había forma de adivinar.
 */

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
});

test('Ctrl+K abre la palette', async ({ page }) => {
  await page.keyboard.press('Control+k');

  await expect(page.locator('#paletteBox')).toBeVisible();
  await expect(page.locator('#paletteInput')).toBeFocused();
});

test('el botón ⌘K también la abre (RF-26: ratón y teclado)', async ({ page }) => {
  await page.click('#paletteBtn');

  await expect(page.locator('#paletteBox')).toBeVisible();
});

test('lista las acciones y filtra al escribir', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const items = page.locator('#paletteList li[role="option"]');
  const total = await items.count();
  expect(total).toBeGreaterThan(8);

  await page.fill('#paletteInput', 'desh');

  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Deshacer');
});

test('el filtro ignora acentos y mayúsculas', async ({ page }) => {
  await page.keyboard.press('Control+k');

  await page.fill('#paletteInput', 'ETIQ');

  await expect(page.locator('#paletteList li[role="option"]')).toHaveCount(1);
});

test('sin resultados lo dice, no se queda en blanco', async ({ page }) => {
  await page.keyboard.press('Control+k');

  await page.fill('#paletteInput', 'xyzxyz');

  await expect(page.locator('#paletteList')).toContainText('Sin resultados');
});

test('Enter ejecuta la acción seleccionada', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.fill('#paletteInput', 'atajo');
  await page.keyboard.press('Enter');

  // La palette se cierra y se abre lo que se pidió.
  await expect(page.locator('#paletteBox')).toBeHidden();
  await expect(page.locator('#shortcutsBox')).toBeVisible();
});

test('las flechas mueven la selección', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const items = page.locator('#paletteList li[role="option"]');

  await expect(items.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');

  await expect(items.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(items.first()).toHaveAttribute('aria-selected', 'false');
});

test('Esc cierra la palette', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');

  await expect(page.locator('#paletteBox')).toBeHidden();
});

test('al cerrar devuelve el foco a quien la abrió (bug detectado en el mock)', async ({ page }) => {
  // docs/09 §27: el mock de la Fase 0 dejaba el foco en la nada al cerrar, y
  // quien navega por teclado se perdía. Es el motivo de que este test exista.
  await page.focus('#paletteBtn');
  await page.click('#paletteBtn');
  await expect(page.locator('#paletteInput')).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(page.locator('#paletteBtn')).toBeFocused();
});

test('un click fuera la cierra', async ({ page }) => {
  await page.keyboard.press('Control+k');

  await page.locator('#paletteOverlay').click({ position: { x: 10, y: 10 } });

  await expect(page.locator('#paletteBox')).toBeHidden();
});

test('la palette no se lista a sí misma', async ({ page }) => {
  await page.keyboard.press('Control+k');

  // Buscar «paleta» dentro de la paleta no lleva a ningún sitio.
  await expect(page.locator('#paletteList')).not.toContainText('Paleta de comandos');
});

test('cada acción muestra su atajo: se aprende usándola (RF-27)', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.fill('#paletteInput', 'desh');

  await expect(page.locator('#paletteList li kbd').first()).toHaveText('Ctrl+Z');
});
