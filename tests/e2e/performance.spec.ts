import { test, expect } from '@playwright/test';
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
 * **Medición real (2026-07-15, Windows, chromium headless): ~21,6 ms/frame con
 * 300 nodos y 300 aristas, es decir ~46 fps.** Es fluido, pero NO cumple los
 * 60 fps estrictos de RNF-01. No se ajusta el umbral para fingir que sí: queda
 * anotado en docs/08 como deuda a medir en un navegador con GPU real y, si se
 * confirma, a optimizar en la Fase 4 (candidatos: `hideEdgesOnViewport`,
 * `textureOnViewport`, reducir el estilado por nodo).
 */
const FRAME_BUDGET_MS = 64;
const PAN_STEPS = 30;
const NODE_TARGET = 300;

test('RNF-01: pan fluido con 300 nodos', async ({ page }) => {
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

  // Se inyectan 300 nodos por el store, que es como llegarían al expandir.
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

  // Pan por el viewport y medida del coste medio por frame.
  const msPerFrame = await page.evaluate(async (steps) => {
    const { cy } = window.excabit!.adapter;
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

    await nextFrame();
    const start = performance.now();
    for (let i = 0; i < steps; i++) {
      cy.panBy({ x: 6, y: 3 });
      await nextFrame();
    }

    return (performance.now() - start) / steps;
  }, PAN_STEPS);

  expect(msPerFrame).toBeLessThan(FRAME_BUDGET_MS);
});
