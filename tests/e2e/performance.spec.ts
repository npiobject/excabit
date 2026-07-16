import { test, expect, type Page } from '@playwright/test';
import { mockApi, ROOT_TXID } from './helpers/mock-api';
import { skipTour, useLocale } from './helpers/setup';

/**
 * RNF-01: 60 fps de pan con 300 nodos.
 *
 * El umbral es **laxo a propósito**: un CI comparte CPU con otros trabajos y
 * medir fps ahí da falsos rojos. Lo que este test protege es el orden de
 * magnitud — si alguien reintroduce un recálculo por frame como el `draw()` del
 * legacy (que redibujaba todo el grafo en cada vuelta), esto se cae con
 * estrépito, que es justo para lo que sirve.
 */

/**
 * Presupuesto por frame. 60 fps son 16,7 ms; se deja margen ×4 para el CI.
 *
 * **Ojo con esta cifra: está capada por vsync.** Medir con `requestAnimationFrame`
 * mide el intervalo ENTRE frames, y el compositor no entrega frames más rápido
 * que el refresco de la pantalla. A 60 Hz el suelo es 16,7 ms: por debajo de eso
 * no se puede bajar aunque el trabajo sobre. Un resultado de 16,7 ms clavados no
 * significa "justo en el límite", significa "el trabajo cabe y sobra".
 */
const FRAME_BUDGET_MS = 64;

/**
 * Umbral estricto de RNF-01 (60 fps), solo en local (docs/07 §72).
 *
 * En CI la cifra mide la carga del runner, no la app, y daría rojos falsos.
 * 18,5 ms tolera un ~10 % de frames perdidos sobre el suelo de vsync (16,7);
 * el objetivo real es no perder ninguno. Lo que protege esto en CI es el test
 * estructural de abajo, que no depende del reloj.
 */
const FRAME_BUDGET_STRICT_MS = 18.5;
const PAN_STEPS = 30;
const NODE_TARGET = 300;
/** Tandas que se miden (más una de calentamiento que se descarta). */
const MEASURE_RUNS = 5;

/** Deja la app con 300 nodos y 300 aristas, como llegarían al expandir. */
async function seedGraph(page: Page): Promise<void> {
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

  // Se inyectan por el store, que es el camino real de los datos.
  await page.evaluate((target) => {
    const app = window.excabit!;
    app.store.dispatch({
      type: 'test:seed',
      apply: (state) => {
        const nodes = { ...state.graph.nodes };
        const edges = { ...state.graph.edges };
        const rootId = app.rootId!;

        for (let i = 0; i < target; i++) {
          const id = `addr:perf-${String(i)}`;
          nodes[id] = {
            id,
            kind: 'address',
            x: (i % 20) * 60,
            y: Math.floor(i / 20) * 60,
            address: `perf-${String(i)}`,
          };
          edges[`${rootId}->${id}`] = {
            id: `${rootId}->${id}`,
            from: rootId,
            to: id,
            kind: 'output',
            value: 1000n,
          };
        }

        return { ...state, graph: { nodes, edges } };
      },
    });
  }, NODE_TARGET);

  const total = await page.evaluate(
    () => Object.keys(window.excabit!.store.getState().graph.nodes).length,
  );
  expect(total).toBeGreaterThanOrEqual(NODE_TARGET);
}

test('RNF-01: pan fluido con 300 nodos', async ({ page }) => {
  await seedGraph(page);

  /*
   * Mediana de varias tandas, no una sola medida.
   *
   * Una tanda suelta recoge cualquier hipo de la máquina (un GC, el antivirus,
   * otro test que acaba de soltar la CPU) y lo presenta como si fuera coste de
   * la app. La mediana descarta el outlier sin maquillar una lentitud real: si
   * la app fuera lenta, TODAS las tandas lo serían y la mediana también.
   * La primera tanda se tira: es la que paga el JIT.
   */
  const msPerFrame = await page.evaluate(
    async ({ steps, repeats }) => {
      const { cy } = window.excabit!.adapter;
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

      const runs: number[] = [];
      for (let run = 0; run <= repeats; run++) {
        await nextFrame();
        const start = performance.now();
        for (let i = 0; i < steps; i++) {
          cy.panBy({ x: 6, y: 3 });
          await nextFrame();
        }
        const elapsed = (performance.now() - start) / steps;
        if (run > 0) runs.push(elapsed);
      }

      runs.sort((a, b) => a - b);

      return runs[Math.floor(runs.length / 2)]!;
    },
    { steps: PAN_STEPS, repeats: MEASURE_RUNS },
  );

  expect(msPerFrame).toBeLessThan(FRAME_BUDGET_MS);

  // Estricto en local: en CI la cifra mide el runner, no la app (docs/07 §72).
  if (process.env['CI'] === undefined) {
    expect(msPerFrame).toBeLessThan(FRAME_BUDGET_STRICT_MS);
  }
});

/**
 * RNF-01, la causa raíz — **este es el test que vale en CI**: no mide tiempo, así
 * que no depende de la máquina ni del vsync.
 *
 * Un pan mueve la vista, no el grafo: las miniaturas están donde estaban. Lo
 * único que cambia es el rectángulo del viewport. Si el minimapa vuelve a
 * dibujar sus 300 nodos y 300 aristas en cada frame de pan está haciendo un
 * trabajo cuyo resultado ya tenía — y ese trabajo (~2,1 ms/frame, medido) es lo
 * que hundía RNF-01 de 60 a ~53 fps. El motor del grafo nunca fue el problema.
 */
test('RNF-01: el pan no redibuja el grafo del minimapa, solo el viewport', async ({ page }) => {
  await seedGraph(page);

  const before = await page.evaluate(() => ({ ...window.excabitMinimap!.stats }));

  await page.evaluate(async (steps) => {
    const { cy } = window.excabit!.adapter;
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (let i = 0; i < steps; i++) {
      cy.panBy({ x: 6, y: 3 });
      await nextFrame();
    }
    await nextFrame();
  }, PAN_STEPS);

  const afterPan = await page.evaluate(() => ({ ...window.excabitMinimap!.stats }));

  // El viewport sí se repinta (si no, el recuadro se quedaría atrás).
  expect(afterPan.viewportRepaints).toBeGreaterThan(before.viewportRepaints);
  // El grafo no: nada se ha movido.
  expect(afterPan.graphRepaints).toBe(before.graphRepaints);

  // Pero mover un nodo SÍ debe redibujarlo: el caché no puede quedarse viejo.
  await page.evaluate(async () => {
    const { cy } = window.excabit!.adapter;
    cy.nodes().first().position({ x: 999, y: 999 });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  const afterMove = await page.evaluate(() => ({ ...window.excabitMinimap!.stats }));
  expect(afterMove.graphRepaints).toBeGreaterThan(afterPan.graphRepaints);
});
