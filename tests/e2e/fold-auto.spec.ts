/**
 * Plegado automático (RF-36).
 *
 * Plegar ya funcionaba con la tecla `P`; el problema era que había que saberla.
 * Con un grafo de 170 nodos lo primero que se ve es una maraña al 37 % de zoom,
 * y eso **no tiene arreglo por layout**: separar lo bastante para que nada se
 * pise da un grafo de 6.720 px, que cabe aún peor. O se pisan o no caben: es
 * geometría. Así que la app pliega sola cuando hace falta.
 *
 * Lo que se pliega y lo que no lo prueba `tests/unit/analysis/folding.spec.ts`;
 * la mecánica de la tecla, `fold.spec.ts`. Aquí solo: cuándo se dispara solo,
 * cuándo no, y que preguntar «¿cabe?» no mueva la vista de nadie.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockApi, ROOT_TXID } from './helpers/mock-api';
import { skipTour, useLocale } from './helpers/setup';

/** El mismo umbral que `main.ts`: por debajo, el texto de las txs no se pinta. */
const AUTO_FOLD_ZOOM = 0.55;

/** Un abanico que no cabe: 20 entradas y 20 salidas dan 41 nodos. */
const WIDE_FAN = 20;

async function openGraph(page: Page, fan?: number): Promise<void> {
  await mockApi(page, fan === undefined ? {} : { fan });
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
    .toBeGreaterThan(1);
}

const visible = (page: Page): Promise<number> =>
  page.evaluate(
    () => window.excabit!.adapter.cy.nodes().filter((n) => n.style('display') !== 'none').length,
  );

/**
 * Espera a que el minimapa haya repintado.
 *
 * Se dibuja en `requestAnimationFrame` (RNF-01: como mucho un repintado por
 * frame), así que justo después de plegar la imagen todavía es la de antes. Dos
 * frames: en el primero corre el dibujo ya encolado, en el segundo ya está.
 */
const settleMinimap = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );

/** Cuántos nodos entraron en el último repintado del minimapa. */
const drawnNodes = (page: Page): Promise<number> =>
  page.evaluate(() => window.excabitMinimap!.stats.drawnNodes);

/**
 * Cuánto hay pintado en el minimapa, en píxeles que no son fondo.
 *
 * Es un canvas: no hay nodos que contar ni DOM que interrogar, así que se mira
 * lo mismo que mira el usuario. El fondo se toma de la esquina, que es margen.
 */
const minimapInk = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#minimapBody canvas');
    const context = canvas?.getContext('2d');
    if (canvas == null || context == null) throw new Error('No hay minimapa que mirar');

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const bg = [data[0], data[1], data[2]];
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== bg[0] || data[i + 1] !== bg[1] || data[i + 2] !== bg[2]) ink++;
    }

    return ink;
  });

test('fitZoom() dice el mismo zoom al que fit() deja el grafo', async ({ page }) => {
  // `fitZoom()` reproduce la cuenta de `fit()` para poder preguntar sin mover la
  // vista. Dos cuentas que deben coincidir son dos cuentas que pueden separarse:
  // este test es lo único que lo impide.
  await openGraph(page, WIDE_FAN);

  const [predicho, real] = await page.evaluate(() => {
    const adapter = window.excabit!.adapter;
    adapter.cy.zoom(3); // Lejos de donde va a acabar: si coincide, no es de rebote.
    const antes = adapter.fitZoom();
    adapter.fit();

    return [antes, adapter.cy.zoom()];
  });

  expect(predicho).toBeCloseTo(real, 5);
});

test('fitZoom() no mueve la vista: preguntar no es actuar', async ({ page }) => {
  // De esto depende que `expand` siga comportándose como siempre.
  await openGraph(page, WIDE_FAN);

  const movida = await page.evaluate(() => {
    const cy = window.excabit!.adapter.cy;
    cy.zoom(2);
    cy.pan({ x: 123, y: 456 });
    const antes = { zoom: cy.zoom(), pan: { ...cy.pan() } };

    window.excabit!.adapter.fitZoom();

    const despues = { zoom: cy.zoom(), pan: { ...cy.pan() } };

    return (
      antes.zoom !== despues.zoom || antes.pan.x !== despues.pan.x || antes.pan.y !== despues.pan.y
    );
  });

  expect(movida).toBe(false);
});

test('RF-36: un grafo que no cabe legible se pliega solo, y lo dice', async ({ page }) => {
  await openGraph(page, WIDE_FAN);

  // Sin plegar, esto quedaría por debajo del umbral de lectura.
  await expect.poll(() => visible(page)).toBeLessThan(1 + WIDE_FAN * 2);
  await expect(page.locator('#statusFold')).toContainText(/plegados/);
  // Callarse sería esconder: el usuario ve menos nodos de los que pidió.
  await expect(page.locator('#toasts')).toContainText(/no cabía en pantalla/i);
});

test('RF-36: tras plegarse solo, el grafo ya cabe legible', async ({ page }) => {
  // Es la razón de ser de todo esto: no «hay menos nodos», sino «ahora se lee».
  await openGraph(page, WIDE_FAN);

  await expect
    .poll(() => page.evaluate(() => window.excabit!.adapter.fitZoom()))
    .toBeGreaterThanOrEqual(AUTO_FOLD_ZOOM);
});

test('RF-36: un grafo que cabe NO se pliega solo', async ({ page }) => {
  // El grafo de 5 nodos se lee perfectamente. Plegarlo sería quitarle al usuario
  // información que cabía en la pantalla, a cambio de nada.
  await openGraph(page);

  expect(await visible(page)).toBe(5);
  await expect(page.locator('#statusFold')).toHaveText('');
});

test('RF-13 + RF-36: el minimapa enseña lo plegado, no el grafo entero', async ({ page }) => {
  /*
   * El minimapa dibujaba `cy.nodes()` a secas: plegado enseñaba los 41 nodos
   * mientras la pantalla enseñaba 9 — contradecía al grafo justo cuando la app
   * acababa de decir «ya cabe». Y no era solo estético: `boundingBox()` ya
   * excluía lo plegado, así que lo escondido se proyectaba contra unos límites
   * que no lo contenían y salía desperdigado.
   *
   * Se cazó mirando la app con una dirección real de 170 nodos. Los tests
   * estaban en verde: ninguno miraba el minimapa con el grafo plegado.
   */
  await openGraph(page, WIDE_FAN);
  await expect(page.locator('#statusFold')).toContainText(/plegados/);
  await settleMinimap(page);

  // El invariante, sin rodeos: lo que dibuja == lo que se ve.
  expect(await drawnNodes(page)).toBe(await visible(page));
  const plegado = await minimapInk(page);

  await page.keyboard.press('p');
  await settleMinimap(page);

  // Y sigue valiendo al desplegar: no es que dibuje poco, es que dibuja lo suyo.
  expect(await drawnNodes(page)).toBe(await visible(page));
  // Y se nota en el canvas: medido en la app real con la dirección de 170 nodos,
  // 1.752 px plegado frente a 2.879 desplegado.
  expect(await minimapInk(page)).toBeGreaterThan(plegado);
});

test('RF-36: quien despliega a mano no vuelve a encontrárselo plegado', async ({ page }) => {
  await openGraph(page, WIDE_FAN);
  await expect(page.locator('#statusFold')).toContainText(/plegados/);

  await page.keyboard.press('p'); // «Lo quiero ver entero».
  const entero = await visible(page);

  // Y ahora se le trae más grafo: el momento en que la app volvería a plegar.
  await page.evaluate(() => {
    const tx = Object.values(window.excabit!.store.getState().graph.nodes).find(
      (n) => n.kind === 'tx',
    );
    window.excabit!.adapter.cy.getElementById(tx!.id).select();
    // Sin esto, el `Enter` de expandir se lo comería el botón de buscar, que es
    // quien tiene el foco desde que se abrió el grafo.
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.keyboard.press('Enter');
  await expect.poll(() => visible(page)).toBeGreaterThan(entero);

  // Ya dijo lo que quería. Insistir sería discutir con el usuario.
  await expect(page.locator('#statusFold')).toHaveText('');
});
