/**
 * Migrador del formato del legacy → schema v2 (RF-21, docs/05 §3).
 *
 * ## Reconocerlo
 *
 * El save del legacy (`old/clases/bchain.js:3640`) guardaba 7 claves y **ninguna
 * decía qué formato era**: no hay versión que mirar. Se reconoce por su forma
 * (`posiTxs` + `posiAddrs` en la raíz). Que v2 lleve `schemaVersion` desde el
 * primer día es la lección aprendida de eso.
 *
 * (El `type == "application"` que comprobaba `getCargaTx` no estaba en el
 * fichero: era el MIME que p5 colgaba del objeto `File`. Comprobar el envoltorio
 * en vez del contenido es media causa de BUG-019.)
 *
 * ## Qué se migra
 *
 * Lo que puso el usuario: la estructura, dónde colocó cada cosa y cómo la anotó.
 * Eso es la investigación y no se puede recuperar de ninguna otra parte.
 *
 * ## Qué NO se migra, y por qué
 *
 * - **`heuristic[8]`**: los resultados que el legacy había calculado. Son los
 *   que BUG-006..009 demostraron **incorrectos** — llevaban años dando
 *   veredictos erróneos sin que nadie lo notara. Migrarlos conservaría el bug con
 *   aspecto de dato. Se recalculan con las heurísticas de la Fase 2, que tienen
 *   sus vectores.
 * - **`mostrarSombra` / `mostrarRayado`**: ajustes de render de p5.
 * - **`anchoTx` / `altoTx` / `radioSatelites`**: tamaños globales del dibujo
 *   viejo. En v2 el tamaño lo decide la hoja de estilos.
 * - **`xCentro` / `yCentro`, `angulo`, `distancia`, `x1..y2`**: derivados que el
 *   legacy cacheaba y mantenía a mano (y de ahí que se le desincronizaran).
 * - **Nodos `Multi Txs: …`**: BUG-016, una función a medio hacer. Su id no es un
 *   txid: no hay nada que traer de la cadena.
 * - **`esUtxo` de `posiTxs`**: estaba comentado en 3 de 5 sitios donde se
 *   escribía (`bchain.js:39,195,221`), así que es `undefined` en la mayoría de
 *   nodos reales. El de `posiAddrs` sí se escribía siempre y ese sí se migra.
 *
 * Y los **datos de cadena**: el legacy solo guardaba `numVin`/`numVout`/`value`/
 * `fees`, con lo que no se puede reconstruir una `NormalizedTx`. No se inventan:
 * los nodos migrados vienen sin `tx` y la app los rellena desde la red. Son
 * datos públicos e inmutables — lo irrecuperable eran las anotaciones.
 */
import type { Graph, GraphEdge, GraphNode } from '../core/graph-model';
import { addressNodeId, edgeId, txNodeId } from '../core/graph-model';
import { initialInvestigation } from '../core/commands';
import type { Txid } from '../core/types';
import type { LoadedInvestigation } from './investigation';

export type MigrateResult =
  | { ok: true; investigation: LoadedInvestigation; warnings: string[] }
  | { ok: false; error: { kind: 'invalid'; issues: string[] } };

const TXID_RE = /^[0-9a-f]{64}$/;

/**
 * Colores del legacy que **no** son una elección del usuario.
 *
 * El legacy tenía dos campos de color por nodo y ninguno significaba lo que
 * parece:
 *
 * - **`color`** (borde) es el estado de SELECCIÓN: `{255,77,77}` mientras está
 *   marcado, `{77,77,77}` cuando no (`exploraGraf.js:790-795`). Nunca se migra:
 *   sería convertir en anotación permanente lo que había marcado por accidente
 *   al pulsar «guardar» — el mismo motivo por el que la selección no se guarda.
 * - **`bgColor`** (relleno) sí es la paleta del usuario… menos dos valores:
 *   `{232,132,32}` es el naranja que el legacy pintaba solo al expandir una tx
 *   (`exploraGraf.js:693`), y `{127,127,127}` es el gris de fábrica, que además
 *   era el botón 7 = «quitar color» (`bchain.js:1585`).
 *
 * La paleta real del usuario son los botones 1..6 de `grabaColorTx()`
 * (`bchain.js:1556-1584`). Las direcciones no tenían paleta: no existe
 * `grabaColorAddr` y su color es siempre el de fábrica.
 */
const NOT_A_CHOICE = [
  { r: 127, g: 127, b: 127 }, // gris de fábrica / botón «quitar color»
  { r: 232, g: 132, b: 32 }, // naranja de «tx expandida»
];

interface LegacyColor {
  r: number;
  g: number;
  b: number;
}

interface LegacyTx {
  idTx?: unknown;
  x?: unknown;
  y?: unknown;
  tagTx?: unknown;
  /** Relleno: la paleta del usuario (ver `NOT_A_CHOICE`). */
  bgColor?: unknown;
  movido?: unknown;
}

interface LegacyAddr {
  idAddr?: unknown;
  io?: unknown;
  idTx1?: unknown;
  idTx2?: unknown;
  tagAddr?: unknown;
  movido?: unknown;
  value?: unknown;
  esUtxo?: unknown;
}

interface LegacyFile {
  posiTxs?: unknown;
  posiAddrs?: unknown;
  anchoTx?: unknown;
  altoTx?: unknown;
  radioSatelites?: unknown;
  mostrarSombra?: unknown;
  mostrarRayado?: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * ¿Es un save del legacy? Por la forma, que es lo único que hay.
 */
export function isLegacyFile(value: unknown): boolean {
  if (!isObject(value)) return false;
  if ('schemaVersion' in value) return false;

  return Array.isArray(value['posiTxs']) && Array.isArray(value['posiAddrs']);
}

const isColor = (value: unknown): value is LegacyColor =>
  isObject(value) &&
  typeof value['r'] === 'number' &&
  typeof value['g'] === 'number' &&
  typeof value['b'] === 'number';

const toHex = (color: LegacyColor): string =>
  `#${[color.r, color.g, color.b]
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/**
 * El relleno de una tx → color v2, solo si lo eligió el usuario.
 *
 * Ver `NOT_A_CHOICE`: el legacy usaba el color para decir cosas suyas (esto está
 * seleccionado, esto está expandido) y solo los botones 1..6 eran del usuario.
 * Migrar los otros convertiría el estado de una sesión en una decisión eterna.
 */
function migrateFill(value: unknown): string | undefined {
  if (!isColor(value)) return undefined;

  const isState = NOT_A_CHOICE.some(
    (color) => color.r === value.r && color.g === value.g && color.b === value.b,
  );

  return isState ? undefined : toHex(value);
}

/** `""` en el legacy significa «sin etiqueta», no «etiqueta vacía». */
const migrateLabel = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const isMultiTx = (id: string): boolean => id.startsWith('Multi');

/** Los importes del legacy eran `number` (o texto): a bigint sin perder enteros. */
function toSats(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.round(value));
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());

  return 0n;
}

export function migrateLegacy(raw: unknown): MigrateResult {
  if (!isObject(raw)) {
    return { ok: false, error: { kind: 'invalid', issues: ['el fichero no es un objeto'] } };
  }

  const file = raw as LegacyFile;
  if (!Array.isArray(file.posiTxs)) {
    return { ok: false, error: { kind: 'invalid', issues: ['posiTxs: se esperaba un array'] } };
  }
  if (!Array.isArray(file.posiAddrs)) {
    return { ok: false, error: { kind: 'invalid', issues: ['posiAddrs: se esperaba un array'] } };
  }

  const issues: string[] = [];
  const warnings: string[] = [];
  const graph: Graph = { nodes: {}, edges: {} };
  const discardedTxIds = new Set<string>();
  let rootTxid: Txid | undefined;
  let multiCount = 0;

  /* ---------- Txs ---------- */

  file.posiTxs.forEach((entry: unknown, index: number) => {
    if (!isObject(entry)) {
      issues.push(`posiTxs.${String(index)}: se esperaba un objeto`);
      return;
    }

    const tx = entry as LegacyTx;
    if (typeof tx.idTx !== 'string' || tx.idTx === '') {
      issues.push(`posiTxs.${String(index)}.idTx: falta o no es texto`);
      return;
    }

    if (isMultiTx(tx.idTx)) {
      multiCount++;
      discardedTxIds.add(tx.idTx);
      return;
    }

    if (!TXID_RE.test(tx.idTx)) {
      issues.push(`posiTxs.${String(index)}.idTx: no es un txid (${tx.idTx})`);
      return;
    }

    // El orden ERA el dato: `getCargaTx` hacía `idTx = posiTxs[0].idTx`. En v2
    // se dice con todas las letras.
    rootTxid ??= tx.idTx;

    const id = txNodeId(tx.idTx);
    const node: GraphNode = {
      id,
      kind: 'tx',
      x: typeof tx.x === 'number' ? tx.x : 0,
      y: typeof tx.y === 'number' ? tx.y : 0,
      placed: true,
    };

    const label = migrateLabel(tx.tagTx);
    if (label !== undefined) node.label = label;

    const color = migrateFill(tx.bgColor);
    if (color !== undefined) node.color = color;

    if (tx.movido === true) node.pinned = true;

    graph.nodes[id] = node;
  });

  /* ---------- Direcciones: eran aristas, pasan a ser nodos ---------- */

  file.posiAddrs.forEach((entry: unknown, index: number) => {
    if (!isObject(entry)) {
      issues.push(`posiAddrs.${String(index)}: se esperaba un objeto`);
      return;
    }

    const addr = entry as LegacyAddr;
    if (typeof addr.idAddr !== 'string' || addr.idAddr === '') {
      issues.push(`posiAddrs.${String(index)}.idAddr: falta o no es texto`);
      return;
    }

    const pivot = typeof addr.idTx1 === 'string' ? addr.idTx1 : '';
    const satellite = typeof addr.idTx2 === 'string' ? addr.idTx2 : '';

    const known = (txid: string): boolean =>
      txid !== '' && !discardedTxIds.has(txid) && graph.nodes[txNodeId(txid)] !== undefined;

    // Sin pivot conocido la arista no cuenta nada: la dirección quedaría
    // colgando de la nada.
    if (!known(pivot)) return;

    const addrId = addressNodeId(addr.idAddr);
    const existing = graph.nodes[addrId];
    const node: GraphNode = existing ?? {
      id: addrId,
      kind: 'address',
      x: 0,
      y: 0,
      address: addr.idAddr,
      placed: true,
    };

    const label = migrateLabel(addr.tagAddr);
    if (label !== undefined) node.label = label;

    // Sin color: el legacy no tenía paleta para direcciones (no existe
    // `grabaColorAddr`), así que el suyo es siempre el de fábrica. Migrarlo
    // pintaría de gris explícito lo que nadie pintó.

    if (addr.movido === true) node.pinned = true;

    graph.nodes[addrId] = node;

    const value = toSats(addr.value);

    /*
     * El sentido del flujo. En el legacy `io` decía si la dirección era entrada
     * o salida del PIVOT (idTx1), y el satélite (idTx2) iba al otro extremo:
     *
     *   io='O':  pivot ──paga──> addr ──gasta──> satélite
     *   io='I':  satélite ──paga──> addr ──gasta──> pivot
     *
     * En v2 una arista tx→addr es 'output' (la tx crea esa salida) y addr→tx es
     * 'input' (la tx la gasta), igual que en `addTxToGraph`: el grafo migrado y
     * el que produce la app son el mismo grafo.
     */
    const link = (from: string, to: string, kind: GraphEdge['kind']): void => {
      const id = edgeId(from, to);
      graph.edges[id] = {
        id,
        from,
        to,
        kind,
        value,
        ...(addr.esUtxo === true ? { isUtxo: true } : {}),
      };
    };

    if (addr.io === 'I') {
      if (known(satellite)) link(txNodeId(satellite), addrId, 'output');
      link(addrId, txNodeId(pivot), 'input');
    } else {
      link(txNodeId(pivot), addrId, 'output');
      // Un satélite sin expandir (idTx2: "") no genera una arista al vacío.
      if (known(satellite)) link(addrId, txNodeId(satellite), 'input');
    }
  });

  if (issues.length > 0) return { ok: false, error: { kind: 'invalid', issues } };

  /* ---------- Avisos: qué se quedó por el camino ---------- */

  if (multiCount > 0) {
    warnings.push(
      `Se han descartado ${String(multiCount)} nodos «Multi Txs»: eran agregados que la app vieja nunca llegó a implementar (BUG-016) y su identificador no es una transacción real.`,
    );
  }
  if (file.mostrarSombra !== undefined || file.mostrarRayado !== undefined) {
    warnings.push(
      'Se han descartado los ajustes de sombra y rayado: eran opciones de dibujo de la app vieja, no parte de la investigación.',
    );
  }
  if (
    file.anchoTx !== undefined ||
    file.altoTx !== undefined ||
    file.radioSatelites !== undefined
  ) {
    warnings.push(
      'Se ha descartado la geometría del dibujo antiguo (anchoTx, altoTx, radioSatelites): ahora el tamaño de los nodos lo decide el tema.',
    );
  }
  if (Object.keys(graph.nodes).length > 0) {
    warnings.push(
      'Las heurísticas guardadas se han descartado y se recalcularán: las de la app vieja daban resultados incorrectos (BUG-006 a BUG-009).',
    );
    warnings.push(
      'Los datos de cada transacción se volverán a descargar: la app vieja no los guardaba enteros. Tus etiquetas, colores y posiciones sí se han conservado.',
    );
  }

  return {
    ok: true,
    investigation: {
      state: { ...initialInvestigation(), network: 'mainnet', graph, selection: [] },
      rootTxid,
      viewport: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    warnings,
  };
}
