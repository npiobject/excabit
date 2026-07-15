import { test, expect } from '@playwright/test';
import { mockApi, ROOT_TXID } from './helpers/mock-api';
import { skipTour, useLocale } from './helpers/setup';

/** Panel lateral: Detalles, Heurísticas e Investigación (RF-15/16, docs/09 §27). */

const selectRoot = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.evaluate(() => {
    window.excabit!.adapter.cy.getElementById(window.excabit!.rootId!).select();
  });
};

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

test('sin selección, el panel invita a seleccionar en vez de quedarse vacío', async ({ page }) => {
  await expect(page.locator('#paneDetails')).toContainText('Selecciona un nodo');
});

test('RF-15: al seleccionar una tx, Detalles muestra sus datos', async ({ page }) => {
  await selectRoot(page);

  const details = page.locator('#paneDetails');
  await expect(details).toContainText('confirmada');
  await expect(details).toContainText('300.000');
  await expect(details).toContainText('sats');
  await expect(details).toContainText('sat/vB');
  await expect(details.locator('.hash')).toContainText(ROOT_TXID);
});

test('RF-15: el txid se copia al hacer click', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await selectRoot(page);

  await page.locator('#paneDetails .hash').click();

  await expect(page.locator('#paneDetails .hash')).toContainText('Copiado');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(ROOT_TXID);
});

test('RF-15: enlaza a mempool.space con el txid correcto', async ({ page }) => {
  await selectRoot(page);

  await expect(page.locator('#paneDetails a.link')).toHaveAttribute(
    'href',
    `https://mempool.space/tx/${ROOT_TXID}`,
  );
});

test('las pestañas cambian de panel', async ({ page }) => {
  await page.click('#tabHeuristics');

  await expect(page.locator('#paneHeuristics')).toBeVisible();
  await expect(page.locator('#paneDetails')).toBeHidden();
  await expect(page.locator('#tabHeuristics')).toHaveAttribute('aria-selected', 'true');
});

test('las pestañas se recorren con las flechas (patrón ARIA)', async ({ page }) => {
  await page.focus('#tabDetails');
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('#tabHeuristics')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tabHeuristics')).toBeFocused();
});

test('RF-16: Heurísticas muestra el score y cada heurística con su explicación', async ({
  page,
}) => {
  await selectRoot(page);
  await page.click('#tabHeuristics');

  await expect(page.locator('#scoreBox')).toBeVisible();
  await expect(page.locator('#scoreValue')).toHaveText('60');
  // Las 9 del catálogo, no solo las detectadas: enseñar por qué NO aplica una
  // heurística también es enseñar.
  await expect(page.locator('.heuristic')).toHaveCount(9);
  // RF-16 pide explicación pedagógica, no un veredicto suelto.
  await expect(page.locator('.heuristic p').first()).not.toBeEmpty();
});

test('RF-16: lo detectado va primero y ordenado por confianza', async ({ page }) => {
  await selectRoot(page);
  await page.click('#tabHeuristics');

  // Se comprueba el INVARIANTE de orden, no qué heurística concreta salta:
  // eso depende de la tx y aquí la red está mockeada. Cuando dos heurísticas se
  // contradicen, la de más confianza debe leerse primero, en vez de fingir un
  // consenso que no existe (docs/00 §3).
  const first = page.locator('.heuristic').first();
  await expect(first).toHaveClass(/detected/);
  await expect(first).toContainText('confianza alta');

  const classes = await page
    .locator('.heuristic')
    .evaluateAll((items: HTMLElement[]) => items.map((item) => item.className));

  const detected = classes.filter((name) => name.includes('detected')).length;
  // Todas las detectadas ocupan las primeras posiciones: ninguna aparece
  // después de una que no aplica.
  expect(classes.slice(0, detected).every((name) => name.includes('detected'))).toBe(true);
  expect(detected).toBeGreaterThan(0);
});

test('RF-16: el badge del score usa el color del umbral (60 → ámbar)', async ({ page }) => {
  await selectRoot(page);
  await page.click('#tabHeuristics');

  await expect(page.locator('#scoreBox')).toHaveClass(/amber/);
});

test('el panel se colapsa y se despliega con el botón', async ({ page }) => {
  await page.click('#panelToggle');
  await expect(page.locator('#panel')).toHaveClass(/collapsed/);
  await expect(page.locator('#panelToggle')).toHaveAttribute('aria-expanded', 'false');

  await page.click('#panelToggle');
  await expect(page.locator('#panel')).not.toHaveClass(/collapsed/);
});

test('el panel se colapsa con la tecla ] (RF-26: tres vías)', async ({ page }) => {
  await page.locator('#graph').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press(']');

  await expect(page.locator('#panel')).toHaveClass(/collapsed/);
});

test('el panel se colapsa desde la palette (RF-26: tres vías)', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.fill('#paletteInput', 'panel');
  await page.keyboard.press('Enter');

  await expect(page.locator('#panel')).toHaveClass(/collapsed/);
});
