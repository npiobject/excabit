/**
 * Export de datos (CSV) y vectorial (SVG) — RF-23/24.
 *
 * Se generan **de los datos**, no del lienzo: `persistence/` no conoce Cytoscape
 * ni el DOM (docs/05 §2). Sale a cuenta más allá de la regla — el SVG así es
 * limpio y editable en Inkscape o Illustrator, mientras que el que escupe un
 * motor de grafos suele ser un volcado del canvas con capas inservibles.
 *
 * El PNG es la excepción y por eso no está aquí: es una foto de lo que se ve, y
 * lo que se ve lo sabe el motor. Vive en `graph/cy-adapter.ts`.
 */
import type { Graph, GraphNode } from '../core/graph-model';

/**
 * Los colores con los que pintar el SVG.
 *
 * Se inyectan en vez de importarse: `persistence/` no puede depender de
 * `graph/styles.ts` (docs/05 §2), y copiar aquí los cinco colores del tema sería
 * peor que la regla — el día que alguien cambie un token, el SVG exportado
 * seguiría con los colores viejos y nadie se enteraría hasta verlo. Mismo motivo
 * por el que el score se inyecta en el `cy-adapter`.
 */
export interface SvgTheme {
  background: string;
  edge: string;
  text: string;
  /** Relleno de un nodo de transacción. */
  tx: string;
  /** Relleno de un nodo de dirección. */
  address: string;
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/**
 * Caracteres con los que Excel, LibreOffice y Sheets deciden que una celda es
 * una fórmula.
 *
 * Las etiquetas las escribe una persona, y una investigación se comparte: quien
 * te la pasa puede poner `=HYPERLINK(...)` en el nombre de un nodo y esperar a
 * que la abras. El apóstrofo delante es la marca universal de «esto es texto» y
 * las hojas de cálculo no lo muestran.
 */
const FORMULA_STARTERS = ['=', '+', '-', '@', '\t', '\r'];

function neutralizeFormula(value: string): string {
  const first = value[0];

  return first !== undefined && FORMULA_STARTERS.includes(first) ? `'${value}` : value;
}

/** RFC 4180: comillas dobles duplicadas, y entre comillas si hay coma/comilla/salto. */
function csvCell(value: string | number | undefined): string {
  if (value === undefined) return '';

  const text = neutralizeFormula(String(value));
  if (!/[",\n\r]/.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
}

const csvRow = (cells: (string | number | undefined)[]): string => cells.map(csvCell).join(',');

/**
 * Nodos, con las cabeceras que Gephi espera.
 *
 * `Id` y `Label` no son un capricho: Gephi importa por nombre de columna y, si
 * no coinciden, hay que mapearlas a mano en un diálogo. Cuesta cero acertar.
 */
export function toNodesCsv(graph: Graph): string {
  const header = csvRow(['Id', 'Label', 'Kind', 'Address', 'Txid', 'X', 'Y', 'Color', 'Note']);

  const lines = Object.values(graph.nodes).map((node) =>
    csvRow([
      node.id,
      node.label ?? '',
      node.kind,
      node.address ?? '',
      node.tx?.txid ?? '',
      node.x,
      node.y,
      node.color ?? '',
      node.note ?? '',
    ]),
  );

  return [header, ...lines].join('\n');
}

/** Aristas. `Weight` en satoshis enteros: es el peso natural de este grafo. */
export function toEdgesCsv(graph: Graph): string {
  const header = csvRow(['Source', 'Target', 'Type', 'Kind', 'Weight', 'IsUtxo']);

  const lines = Object.values(graph.edges).map((edge) =>
    csvRow([
      edge.from,
      edge.to,
      'Directed',
      edge.kind,
      // `toString()` y no `Number`: un importe grande en notación científica
      // convertiría la hoja en una fuente de datos falsos.
      edge.value.toString(),
      edge.isUtxo === true ? 'true' : '',
    ]),
  );

  return [header, ...lines].join('\n');
}

/* ------------------------------------------------------------------ *
 * SVG
 * ------------------------------------------------------------------ */

const NODE_WIDTH = 180;
const NODE_HEIGHT = 90;
const ADDRESS_SIZE = 40;
const PADDING = 60;

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const sizeOf = (node: GraphNode): { w: number; h: number } =>
  node.kind === 'tx' ? { w: NODE_WIDTH, h: NODE_HEIGHT } : { w: ADDRESS_SIZE, h: ADDRESS_SIZE };

/** Etiqueta corta: en el SVG no cabe un txid entero y nadie lo lee del tirón. */
function labelOf(node: GraphNode): string {
  if (node.label !== undefined && node.label !== '') return node.label;
  if (node.kind === 'tx' && node.tx !== undefined) return `${node.tx.txid.slice(0, 8)}…`;
  if (node.address !== undefined) return `${node.address.slice(0, 8)}…`;

  return node.id.slice(0, 12);
}

/**
 * El grafo como SVG.
 *
 * Las dimensiones salen del propio grafo: un lienzo fijo recortaría las
 * investigaciones grandes, que son justo las que interesa exportar.
 */
export function toSvg(graph: Graph, theme: SvgTheme): string {
  const nodes = Object.values(graph.nodes);

  const bounds = nodes.reduce(
    (box, node) => {
      const { w, h } = sizeOf(node);

      return {
        minX: Math.min(box.minX, node.x - w / 2),
        minY: Math.min(box.minY, node.y - h / 2),
        maxX: Math.max(box.maxX, node.x + w / 2),
        maxY: Math.max(box.maxY, node.y + h / 2),
      };
    },
    { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  );

  const width = Math.max(1, Math.round(bounds.maxX - bounds.minX + PADDING * 2));
  const height = Math.max(1, Math.round(bounds.maxY - bounds.minY + PADDING * 2));
  const originX = bounds.minX - PADDING;
  const originY = bounds.minY - PADDING;

  const at = (node: GraphNode): { x: number; y: number } => ({
    x: node.x - originX,
    y: node.y - originY,
  });

  const edges = Object.values(graph.edges)
    .map((edge) => {
      const from = graph.nodes[edge.from];
      const to = graph.nodes[edge.to];
      if (from === undefined || to === undefined) return '';

      const a = at(from);
      const b = at(to);

      return `  <line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${theme.edge}" stroke-width="2" />`;
    })
    .filter((line) => line !== '')
    .join('\n');

  const shapes = nodes
    .map((node) => {
      const { x, y } = at(node);
      const { w, h } = sizeOf(node);
      const fill = node.color ?? (node.kind === 'tx' ? theme.tx : theme.address);
      const radius = node.kind === 'tx' ? 8 : ADDRESS_SIZE / 2;

      return [
        `  <rect x="${(x - w / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${String(w)}" height="${String(h)}" rx="${String(radius)}" fill="${escapeXml(fill)}" stroke="${theme.edge}" />`,
        `  <text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" fill="${theme.text}" font-family="ui-monospace, monospace" font-size="12" text-anchor="middle">${escapeXml(labelOf(node))}</text>`,
      ].join('\n');
    })
    .join('\n');

  // El fondo va explícito: un SVG transparente pegado en un documento oscuro se
  // ve negro sobre negro, y quien exporta quiere enseñarlo, no depurarlo.
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">`,
    `  <rect width="${String(width)}" height="${String(height)}" fill="${theme.background}" />`,
    edges,
    shapes,
    '</svg>',
  ]
    .filter((part) => part !== '')
    .join('\n');
}
