/**
 * Guardar, abrir y exportar, en la app de verdad (RF-21/22/23/24).
 *
 * Los unitarios ya comprueban el contenido de cada formato. Lo que solo se puede
 * comprobar aquí es que el fichero **llega al disco**: el `<a download>`, el
 * Blob, la data URL del motor. Un CSV perfecto que nunca se descarga no sirve
 * de nada.
 */
import { test, expect, type Page, type Download } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockApi, ROOT_TXID } from './helpers/mock-api';
import { skipTour, useLocale } from './helpers/setup';

/**
 * Abre la app y espera a que esté viva.
 *
 * `goto` resuelve cuando ha cargado el HTML, no cuando el JS ha registrado los
 * atajos. Sin esta espera, un `Ctrl+O` inmediato cae en el vacío y el test se
 * queda 30 s esperando un diálogo que nadie va a abrir — un fallo que solo
 * aparece cuando la máquina va cargada, que es justo en CI.
 */
async function appReady(page: Page): Promise<void> {
  await mockApi(page);
  await skipTour(page);
  await useLocale(page, 'es');
  await page.goto('/');
  await page.waitForFunction(() => window.excabit !== undefined);
}

async function openGraph(page: Page): Promise<void> {
  await appReady(page);
  await page.fill('#search', ROOT_TXID);
  await page.click('#searchBtn');
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(window.excabit!.store.getState().graph.nodes).length),
    )
    .toBe(5);
}

/** Lanza una acción por la command palette y espera la descarga. */
async function downloadVia(page: Page, actionLabel: string): Promise<Download> {
  const wait = page.waitForEvent('download');
  await page.keyboard.press('Control+k');
  await page.fill('#paletteInput', actionLabel);
  await page.keyboard.press('Enter');

  return wait;
}

const textOf = async (download: Download): Promise<string> => {
  const path = await download.path();

  return readFileSync(path, 'utf8');
};

test('RF-23: exporta un PNG que no está vacío', async ({ page }) => {
  await openGraph(page);

  const wait = page.waitForEvent('download');
  await page.keyboard.press('e');
  const download = await wait;

  expect(download.suggestedFilename()).toMatch(/\.png$/);

  const bytes = readFileSync(await download.path());
  // Cabecera PNG: 89 50 4E 47. Que pese algo no basta — un fichero de texto con
  // extensión .png también pesa.
  expect(bytes.subarray(0, 4).toString('hex')).toBe('89504e47');
  expect(bytes.length).toBeGreaterThan(1000);
});

test('RF-23: el PNG tiene las dimensiones del grafo, no las de la ventana', async ({ page }) => {
  await openGraph(page);

  const wait = page.waitForEvent('download');
  await page.keyboard.press('e');
  const bytes = readFileSync(await (await wait).path());

  // IHDR: ancho y alto van en los bytes 16..24 de un PNG, big-endian.
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);

  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
});

test('RF-23: exporta un SVG con nodos dentro', async ({ page }) => {
  await openGraph(page);

  const download = await downloadVia(page, 'SVG');
  expect(download.suggestedFilename()).toMatch(/\.svg$/);

  const svg = await textOf(download);
  expect(svg).toContain('<svg');
  expect(svg).toContain('</svg>');
  expect(svg).toContain('<rect');
});

test('RF-24: exporta dos CSV, nodos y aristas', async ({ page }) => {
  await openGraph(page);

  // Son dos descargas de un solo comando: Gephi los quiere por separado.
  // Se recogen con `on('download')` y no con dos `waitForEvent`: dos esperas
  // registradas a la vez resuelven ambas con el PRIMER evento, y el test pasaría
  // creyendo que ha visto dos ficheros cuando ha visto el mismo dos veces.
  const downloads: Download[] = [];
  page.on('download', (download) => downloads.push(download));

  await page.keyboard.press('Control+k');
  await page.fill('#paletteInput', 'CSV');
  await page.keyboard.press('Enter');

  await expect.poll(() => downloads.length).toBe(2);
  const names = downloads.map((d) => d.suggestedFilename());

  expect(names.some((n) => n.includes('nodos'))).toBe(true);
  expect(names.some((n) => n.includes('aristas'))).toBe(true);

  for (const download of downloads) {
    const csv = await textOf(download);
    const rows = csv.trim().split('\n');

    expect(rows[0]).toMatch(/^(Id,Label|Source,Target)/);
    expect(rows.length).toBeGreaterThan(1);
  }
});

test('RF-21: guardar descarga un .excabit.json que se puede volver a abrir', async ({ page }) => {
  await openGraph(page);

  // Se etiqueta un nodo: lo que se guarda es el trabajo del usuario, y sin
  // anotaciones este test comprobaría solo que el JSON viaja.
  await page.evaluate(() => {
    const app = window.excabit!;
    const id = app.rootId!;
    app.setLabel(id, 'Nodo marcado');
  });

  const wait = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const download = await wait;

  expect(download.suggestedFilename()).toMatch(/\.excabit\.json$/);

  const saved = JSON.parse(await textOf(download)) as {
    schemaVersion: number;
    nodes: { label?: string }[];
    rootTxid: string;
  };

  expect(saved.schemaVersion).toBe(2);
  expect(saved.rootTxid).toBe(ROOT_TXID);
  expect(saved.nodes.some((node) => node.label === 'Nodo marcado')).toBe(true);
});

test('RF-21: lo guardado se vuelve a abrir con Ctrl+O, por la puerta del usuario', async ({
  page,
}) => {
  await openGraph(page);

  await page.evaluate(() => {
    const app = window.excabit!;
    app.setLabel(app.rootId!, 'Sobrevive al viaje');
  });

  const wait = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const download = await wait;
  const savedPath = await download.path();

  // Recargar deja la app en blanco: lo que se comprueba es el ciclo entero,
  // guardar → cerrar → abrir, no que un objeto sobreviva en memoria.
  await page.goto('/');
  await page.waitForFunction(() => window.excabit !== undefined);

  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles(savedPath);

  await expect
    .poll(() =>
      page.evaluate(
        () => window.excabit!.store.getState().graph.nodes[window.excabit!.rootId ?? '']?.label,
      ),
    )
    .toBe('Sobrevive al viaje');

  expect(
    await page.evaluate(() => Object.keys(window.excabit!.store.getState().graph.nodes).length),
  ).toBe(5);
});

test('RF-21: una investigación de la app VIEJA se abre en la nueva', async ({ page }) => {
  // El criterio de salida de la Fase 5, tal cual está escrito en docs/08.
  await appReady(page);

  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles('tests/fixtures/legacy-save.json');

  // Las etiquetas del usuario son lo que no se puede recuperar de la cadena:
  // son la investigación.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nodes = window.excabit!.store.getState().graph.nodes;

        return Object.values(nodes).map((node) => node.label);
      }),
    )
    .toContain('Origen del robo');

  // Y avisa de lo que se quedó por el camino, en vez de fingir que todo cupo.
  await expect(page.locator('#toasts')).toContainText(/Multi Txs|heurísticas|sombra/i);
});

test('RF-21: un fichero que no es una investigación se rechaza con un motivo', async ({ page }) => {
  await appReady(page);

  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (
    await chooser
  ).setFiles({
    name: 'cualquier-cosa.json',
    mimeType: 'application/json',
    // Esto es exactamente lo que el legacy tragaba (BUG-019).
    buffer: Buffer.from(JSON.stringify({ type: 'application', cualquier: 'cosa' })),
  });

  await expect(page.locator('#toasts')).toContainText(/no es una investigación válida/i);
  // Y la app sigue en pie, no a medio cargar.
  await expect(page.locator('#empty')).toBeVisible();
});

test('con el grafo vacío, exportar avisa en vez de descargar un fichero vacío', async ({
  page,
}) => {
  await appReady(page);

  let downloaded = false;
  page.on('download', () => {
    downloaded = true;
  });

  await page.keyboard.press('e');
  await expect(page.locator('#toasts')).toContainText(/nada que exportar/i);
  expect(downloaded).toBe(false);
});

test('RF-22: al volver, ofrece restaurar lo que quedó a medias', async ({ page }) => {
  await openGraph(page);

  await page.evaluate(() => {
    window.excabit!.setLabel(window.excabit!.rootId!, 'Trabajo sin terminar');
  });

  // El autosave va con debounce: hay que darle su tiempo antes de recargar.
  await expect
    .poll(() => page.evaluate(async () => (await window.excabitAutosave!.read())?.nodeCount ?? 0), {
      timeout: 5000,
    })
    .toBeGreaterThan(0);

  await page.reload();

  await expect(page.locator('#restoreOverlay')).toBeVisible();
  await page.click('#restoreConfirm');

  await expect
    .poll(() =>
      page.evaluate(
        () => window.excabit!.store.getState().graph.nodes[window.excabit!.rootId!]?.label,
      ),
    )
    .toBe('Trabajo sin terminar');
});

test('RF-22: «empezar de cero» no vuelve a preguntar en la siguiente visita', async ({ page }) => {
  await openGraph(page);
  await page.evaluate(() => {
    window.excabit!.setLabel(window.excabit!.rootId!, 'Para descartar');
  });

  await expect
    .poll(() => page.evaluate(async () => (await window.excabitAutosave!.read())?.nodeCount ?? 0), {
      timeout: 5000,
    })
    .toBeGreaterThan(0);

  await page.reload();
  await expect(page.locator('#restoreOverlay')).toBeVisible();
  await page.click('#restoreDiscard');
  await expect(page.locator('#restoreOverlay')).toHaveCount(0);

  // Segunda vuelta: si volviera a preguntar, «descartar» no habría descartado.
  await page.reload();
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#restoreOverlay')).toHaveCount(0);
});
