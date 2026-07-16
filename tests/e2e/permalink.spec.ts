/**
 * Enlace permanente en la app real (RF-24).
 *
 * La codificación la prueba `tests/unit/persistence/permalink.spec.ts`. Aquí lo
 * que solo se puede afirmar con un navegador delante: que el enlace que se copia
 * **abre lo que decía**, que lo que el usuario puso de su parte viaja con él, y
 * que un enlace roto no deja la app muerta.
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
  await expect.poll(() => nodeCount(page)).toBe(5);
}

const nodeCount = (page: Page): Promise<number> =>
  page.evaluate(() => Object.keys(window.excabit!.store.getState().graph.nodes).length);

/** Lanza una accion por la command palette: la via del usuario (RF-26). */
async function runAction(page: Page, label: string): Promise<void> {
  await page.keyboard.press('Control+k');
  await page.fill('#paletteInput', label);
  await page.keyboard.press('Enter');
}

/** Copia el enlace por la via real y lo devuelve. */
async function copyLink(page: Page): Promise<string> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await runAction(page, 'Copiar enlace');
  await expect(page.locator('#toasts')).toContainText(/Enlace copiado/i);

  return page.evaluate(() => navigator.clipboard.readText());
}

test('RF-24.2: el enlace va en el fragmento, que nunca llega al servidor', async ({ page }) => {
  // No es un detalle de formato: una investigación dice qué direcciones te
  // interesan, y esta app existe para no filtrar eso. En la query acabaría en los
  // logs de GitHub Pages y en el `Referer` del primer enlace saliente.
  await openGraph(page);

  const link = await copyLink(page);

  expect(link).toContain('#i=');
  expect(new URL(link).search).toBe('');
});

test('RF-24.1: el enlace reproduce la investigación', async ({ page }) => {
  await openGraph(page);
  const link = await copyLink(page);

  // Otra pestaña, sin nada: lo que le llega a quien lo recibe.
  const fresh = await page.context().newPage();
  await mockApi(fresh);
  await skipTour(fresh);
  await useLocale(fresh, 'es');
  await fresh.goto(link);
  await fresh.waitForFunction(() => window.excabit !== undefined);

  await expect.poll(() => nodeCount(fresh)).toBe(5);
});

test('RF-24.1: lo que el usuario puso de su parte viaja con el enlace', async ({ page }) => {
  await openGraph(page);
  const id = await page.evaluate(() => {
    const addr = Object.values(window.excabit!.store.getState().graph.nodes).find(
      (n) => n.kind === 'address',
    );
    window.excabit!.setLabel(addr!.id, 'Monedero del sospechoso');

    return addr!.id;
  });
  const link = await copyLink(page);

  const fresh = await page.context().newPage();
  await mockApi(fresh);
  await skipTour(fresh);
  await useLocale(fresh, 'es');
  await fresh.goto(link);
  await fresh.waitForFunction(() => window.excabit !== undefined);
  await expect.poll(() => nodeCount(fresh)).toBe(5);

  // Sin las etiquetas, el enlace compartiría el grafo pero no la investigación:
  // el trabajo es lo que alguien puso encima de los datos.
  await expect
    .poll(() =>
      fresh.evaluate((nodeId) => window.excabit!.store.getState().graph.nodes[nodeId]?.label, id),
    )
    .toBe('Monedero del sospechoso');
});

test('RF-24.5: las etiquetas del enlace no son un cambio que deshacer', async ({ page }) => {
  // Vienen con el documento que se acaba de abrir. Un Ctrl+Z que se las quitara
  // estaría deshaciendo algo que el usuario no ha hecho.
  await openGraph(page);
  const id = await page.evaluate(() => {
    const addr = Object.values(window.excabit!.store.getState().graph.nodes).find(
      (n) => n.kind === 'address',
    );
    window.excabit!.setLabel(addr!.id, 'No me deshagas');

    return addr!.id;
  });
  const link = await copyLink(page);

  const fresh = await page.context().newPage();
  await mockApi(fresh);
  await skipTour(fresh);
  await useLocale(fresh, 'es');
  await fresh.goto(link);
  await fresh.waitForFunction(() => window.excabit !== undefined);
  await expect.poll(() => nodeCount(fresh)).toBe(5);

  await fresh.keyboard.press('Control+z');

  expect(
    await fresh.evaluate(
      (nodeId) => window.excabit!.store.getState().graph.nodes[nodeId]?.label,
      id,
    ),
  ).toBe('No me deshagas');
});

test('RF-24.5: un enlace roto se dice, no deja la app muerta', async ({ page }) => {
  await mockApi(page);
  await skipTour(page);
  await useLocale(page, 'es');

  await page.goto('/#i=esto-no-es-un-enlace');
  await page.waitForFunction(() => window.excabit !== undefined);

  await expect(page.locator('#toasts')).toContainText(/no se puede leer/i);
  // Y la app sigue siendo la app: se puede buscar.
  await page.fill('#search', ROOT_TXID);
  await page.click('#searchBtn');
  await expect.poll(() => nodeCount(page)).toBe(5);
});

test('RF-24.5: si el proveedor no responde, se dice cuál era el problema', async ({ page }) => {
  await openGraph(page);
  const link = await copyLink(page);

  // El enlace depende de mempool.space: ése es su precio y hay que verlo caer.
  const fresh = await page.context().newPage();
  await fresh.route('**/mempool.space/**', (route) => route.abort('failed'));
  await skipTour(fresh);
  await useLocale(fresh, 'es');
  await fresh.goto(link);

  // Con margen: el aviso sale a los ~5 s, cuando el cliente termina de reintentar
  // con backoff (RNF-04). No es un fallo seco y no debe serlo.
  await expect(fresh.locator('#toasts')).toContainText(/Ninguna de las transacciones del enlace/i, {
    timeout: 20_000,
  });
});

test('sin nada cargado no hay enlace que copiar', async ({ page }) => {
  await mockApi(page);
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
  await page.waitForFunction(() => window.excabit !== undefined);

  await runAction(page, 'Copiar enlace');

  // Reusa la guarda de exportar: un grafo vacío no se comparte de ninguna forma.
  await expect(page.locator('#toasts')).toContainText(/No hay nada que exportar/i);
});
