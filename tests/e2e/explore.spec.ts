import { test, expect, type Page } from '@playwright/test';
import { mockApi, mockApiDown, ROOT_TXID } from './helpers/mock-api';

/** Lee el MODELO, no los píxeles: es lo único que prueba BUG-013 de verdad. */
const nodeCount = (page: Page) =>
  page.evaluate(() => Object.keys(window.excabit!.store.getState().graph.nodes).length);

const positionOf = (page: Page, id: string) =>
  page.evaluate((nodeId) => {
    const node = window.excabit!.store.getState().graph.nodes[nodeId];
    return node === undefined ? null : { x: node.x, y: node.y };
  }, id);

async function searchRoot(page: Page): Promise<void> {
  await page.fill('#search', ROOT_TXID);
  await page.click('#searchBtn');
  await expect.poll(() => nodeCount(page)).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
});

test('RF-01: buscar un txid carga el grafo', async ({ page }) => {
  await searchRoot(page);

  // 1 tx + 4 direcciones.
  expect(await nodeCount(page)).toBe(5);
  await expect(page.locator('#error')).toBeHidden();
});

test('RF-03: el botón de ejemplo carga sin teclear nada', async ({ page }) => {
  await page.click('#exampleBtn');

  await expect.poll(() => nodeCount(page)).toBe(5);
  await expect(page.locator('#search')).toHaveValue(ROOT_TXID);
});

test('RF-01: un txid inválido da error inline, sin popup', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', () => (dialogs += 1));

  await page.fill('#search', 'esto-no-es-un-txid');
  await page.click('#searchBtn');

  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toContainText('64 caracteres');
  // BUG-003: el legacy hacía alert() desde la capa de red.
  expect(dialogs).toBe(0);
  expect(await nodeCount(page)).toBe(0);
});

test('RF-29 / BUG-003: si la red se cae, hay error visible y ningún alert', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', () => (dialogs += 1));
  await mockApiDown(page);

  await page.fill('#search', ROOT_TXID);
  await page.click('#searchBtn');

  await expect(page.locator('#error')).toBeVisible();
  expect(dialogs).toBe(0);
});

test('RF-05: la raíz queda al centro, entradas a la izquierda y salidas a la derecha', async ({
  page,
}) => {
  await searchRoot(page);

  const layout = await page.evaluate(() => {
    const { graph } = window.excabit!.store.getState();
    const root = graph.nodes[window.excabit!.rootId!]!;
    const addresses = Object.values(graph.nodes).filter((n) => n.kind === 'address');
    const inputs = Object.values(graph.edges).filter((e) => e.kind === 'input');

    return {
      rootX: root.x,
      inputs: inputs.map((e) => graph.nodes[e.from]!.x),
      outputs: Object.values(graph.edges)
        .filter((e) => e.kind === 'output')
        .map((e) => graph.nodes[e.to]!.x),
      total: addresses.length,
    };
  });

  expect(layout.total).toBe(4);
  for (const x of layout.inputs) expect(x).toBeLessThan(layout.rootX);
  for (const x of layout.outputs) expect(x).toBeGreaterThan(layout.rootX);
});

test('RF-06: doble click expande la tx y no duplica al repetirlo', async ({ page }) => {
  await searchRoot(page);
  const before = await nodeCount(page);

  await page.evaluate(() => window.excabit!.expand(window.excabit!.rootId!));
  await expect.poll(() => nodeCount(page)).toBeGreaterThan(before);
  const expanded = await nodeCount(page);

  // Idempotente: expandir otra vez no añade nada.
  await page.evaluate(() => window.excabit!.expand(window.excabit!.rootId!));
  await expect.poll(() => nodeCount(page)).toBe(expanded);
});

test('RF-06: las txs vecinas se colocan en su sitio, no apiladas sobre la raíz', async ({
  page,
}) => {
  await searchRoot(page);

  await page.evaluate(() => window.excabit!.expand(window.excabit!.rootId!));
  await expect.poll(() => nodeCount(page), { timeout: 20_000 }).toBeGreaterThan(5);

  // Contar nodos no basta: pueden estar todos encima del mismo punto y el
  // usuario vería un solo nodo. Lo que importa es que ocupen sitios distintos.
  const overlaps = await page.evaluate(() => {
    const nodes = Object.values(window.excabit!.store.getState().graph.nodes);
    const seen = new Map<string, number>();
    for (const node of nodes) {
      const key = `${String(Math.round(node.x))},${String(Math.round(node.y))}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    return [...seen.values()].filter((count) => count > 1).length;
  });

  expect(overlaps).toBe(0);
});

test('RF-06: expandir no mueve los nodos que ya estaban colocados', async ({ page }) => {
  await searchRoot(page);
  const rootId = (await page.evaluate(() => window.excabit!.rootId))!;
  const before = await positionOf(page, rootId);

  await page.evaluate(() => window.excabit!.expand(window.excabit!.rootId!));
  await expect.poll(() => nodeCount(page), { timeout: 20_000 }).toBeGreaterThan(5);

  expect(await positionOf(page, rootId)).toEqual(before);
});

test('RF-07 + RF-28: mover un nodo y Ctrl+Z revierte los DATOS, no una imagen', async ({
  page,
}) => {
  await searchRoot(page);
  const rootId = (await page.evaluate(() => window.excabit!.rootId))!;
  const before = await positionOf(page, rootId);

  // Se reproduce el final de un drag: Cytoscape emite `dragfree` al soltar, que
  // es lo que el adapter traduce a comando.
  await page.evaluate((id) => {
    const node = window.excabit!.adapter.cy.getElementById(id);
    node.position({ x: 777, y: 555 });
    node.emit('dragfree');
  }, rootId);

  await expect.poll(() => positionOf(page, rootId)).toEqual({ x: 777, y: 555 });

  await page.locator('#graph').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');

  // BUG-013: el legacy repintaba la imagen previa pero dejaba los datos
  // movidos, así que el siguiente frame resucitaba la posición "deshecha".
  await expect.poll(() => positionOf(page, rootId)).toEqual(before);
});

test('RF-28: redo rehace lo deshecho', async ({ page }) => {
  await searchRoot(page);
  const rootId = (await page.evaluate(() => window.excabit!.rootId))!;

  await page.evaluate((id) => {
    const node = window.excabit!.adapter.cy.getElementById(id);
    node.position({ x: 300, y: 300 });
    node.emit('dragfree');
  }, rootId);

  await page.locator('#graph').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');

  await expect.poll(() => positionOf(page, rootId)).toEqual({ x: 300, y: 300 });
});
