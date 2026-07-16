/**
 * Minimapa (RF-13, docs/06 §2).
 *
 * Se entregó en la Fase 4 sin tests propios: los únicos que lo tocaban eran los
 * de RNF-01, y miden fps. Por eso nadie vio que colapsarlo lanzaba una excepción
 * en cada click (ver «colapsarlo no lanza errores»).
 *
 * Lo que se comprueba aquí es que se PINTA, no solo que el elemento existe: un
 * canvas en blanco supera cualquier `toBeVisible()`.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockApi, ROOT_TXID } from './helpers/mock-api';
import { skipTour, useLocale } from './helpers/setup';

async function openGraph(page: Page): Promise<void> {
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
}

/**
 * Colores distintos en el canvas. Uno solo = está en blanco.
 *
 * Devuelve 0 si el canvas aún mide 0: al expandir, la clase CSS se quita antes
 * de que el `ResizeObserver` le dé tamaño, y `getImageData` de un área vacía
 * lanza. Devolver 0 deja que `expect.poll` reintente en vez de romperse.
 */
function distinctColors(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#minimapBody canvas');
    if (canvas === null || canvas.width === 0 || canvas.height === 0) return 0;

    const context = canvas.getContext('2d');
    if (context === null) return 0;

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      colors.add(`${String(data[i])},${String(data[i + 1])},${String(data[i + 2])}`);
    }

    return colors.size;
  });
}

test('RF-13: pinta el grafo, no solo un canvas vacío', async ({ page }) => {
  await openGraph(page);
  await expect.poll(() => distinctColors(page)).toBeGreaterThan(1);
});

test('RF-13: el recuadro del viewport sigue al pan', async ({ page }) => {
  await openGraph(page);

  // Con el grafo entero a la vista el recuadro cae FUERA del minimapa (el
  // viewport abarca más que el grafo) y no se vería moverse. Con zoom, cabe.
  await page.evaluate(() => {
    window.excabit!.adapter.cy.zoom({ level: 2.5, renderedPosition: { x: 700, y: 400 } });
  });

  const pixels = async (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#minimapBody canvas')!;
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      let hash = 0;
      for (let i = 0; i < data.length; i++) hash = (hash * 31 + data[i]!) | 0;

      return hash;
    });

  await expect.poll(pixels).not.toBe(0);
  const before = await pixels();

  await page.evaluate(() => {
    window.excabit!.adapter.cy.panBy({ x: -300, y: 0 });
  });

  await expect.poll(pixels).not.toBe(before);
});

/**
 * Regresión: colapsarlo lanzaba `drawImage: The image argument is a canvas
 * element with a width or height of 0`.
 *
 * Colapsar deja el contenedor a 0 px, y con la capa cacheada de RNF-01 eso
 * significa hacer `drawImage` de un canvas de 0×0 — que no es un no-op, es una
 * excepción. Se veía en la consola, no en la pantalla: el minimapa se colapsaba
 * «bien». Por eso lo cazó conducir la app, y no los 62 E2E que pasaban.
 */
test('RF-13: colapsarlo no lanza errores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await openGraph(page);

  await page.click('#minimapToggle');
  await expect(page.locator('#minimap')).toHaveClass(/collapsed/);
  await page.click('#minimapToggle');
  await expect(page.locator('#minimap')).not.toHaveClass(/collapsed/);

  expect(errors).toEqual([]);
});

test('RF-13: tras colapsar y expandir se vuelve a pintar', async ({ page }) => {
  await openGraph(page);
  await expect.poll(() => distinctColors(page)).toBeGreaterThan(1);

  // Varias veces: un caché mal invalidado aguanta un ciclo y falla al tercero.
  for (let i = 0; i < 3; i++) {
    await page.click('#minimapToggle');
    await expect(page.locator('#minimap')).toHaveClass(/collapsed/);
    await page.click('#minimapToggle');
    await expect(page.locator('#minimap')).not.toHaveClass(/collapsed/);
  }

  await expect.poll(() => distinctColors(page)).toBeGreaterThan(1);
});

test('RF-13: un grafo vacío no lo rompe', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openGraph(page);
  await page.evaluate(() => {
    window.excabit!.adapter.cy.elements().remove();
  });
  await page.waitForTimeout(200);

  expect(errors).toEqual([]);
});

test('RF-13: un click lleva la vista a esa zona', async ({ page }) => {
  await openGraph(page);

  const before = await page.evaluate(() => ({ ...window.excabit!.adapter.cy.pan() }));
  const box = await page.locator('#minimapBody canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.3, box!.y + box!.height * 0.3);

  await expect
    .poll(() => page.evaluate(() => window.excabit!.adapter.cy.pan().x))
    .not.toBe(before.x);
});
