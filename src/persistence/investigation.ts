/**
 * Guardar y cargar una investigación (RF-21, docs/05 §3).
 *
 * ## Por qué cargar devuelve un resultado en vez de lanzar
 *
 * El legacy volcaba cualquier JSON que p5 marcara como `application/json`
 * directamente a sus globales: un fichero con campos de menos no fallaba al
 * cargarse, fallaba **después**, en un `draw()` cualquiera, con el usuario
 * delante y sin forma de saber qué pasó (BUG-019). Aquí un fichero inválido se
 * rechaza en la frontera con un error que dice qué campo está mal, y el estado
 * anterior no se toca. Devolver un `LoadResult` en vez de lanzar hace que quien
 * llama no pueda ignorarlo sin querer.
 *
 * ## Qué se guarda y qué no
 *
 * El fichero es **autocontenido**: lleva las txs completas, no solo sus ids. Es
 * más grande, pero abrir una investigación de hace un año no puede depender de
 * que mempool.space siga en pie ni de que responda — el legacy publicado se
 * quedó inservible el día que su clave caducó, y esa lección es de este mismo
 * proyecto (docs/08, Fase 0). Una investigación guardada es un documento, no un
 * puntero.
 *
 * La **selección** no se guarda: es del momento, no de la investigación.
 * Restaurar lo que estaba marcado al cerrar sería restaurar un accidente.
 */
import { z } from 'zod';
import type { Graph, GraphNode } from '../core/graph-model';
import { edgeId } from '../core/graph-model';
import { initialInvestigation, type InvestigationState } from '../core/commands';
import type { Network, NormalizedTx, Txid } from '../core/types';
import { isLegacyFile, migrateLegacy } from './legacy';

export const SCHEMA_VERSION = 2;

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface InvestigationMeta {
  network: Network;
  rootTxid?: Txid;
  createdAt?: string;
  updatedAt?: string;
  viewport?: Viewport;
}

export interface LoadedInvestigation {
  state: InvestigationState;
  rootTxid: Txid | undefined;
  viewport: Viewport | undefined;
  createdAt: string;
  updatedAt: string;
}

/**
 * Por qué se rechazó, en datos y no en prosa.
 *
 * `persistence/` no puede importar `i18n/` (docs/05 §2) y hace bien: un error
 * tipado lo traduce la UI al idioma del usuario, mientras que una cadena en
 * español dentro del dominio solo sirve para un idioma y para ninguna prueba.
 */
export type LoadError =
  | { kind: 'not-json' }
  | { kind: 'unknown-schema-version'; found: unknown }
  | { kind: 'invalid'; issues: string[] };

export type LoadResult =
  | { ok: true; investigation: LoadedInvestigation; warnings: string[] }
  | { ok: false; error: LoadError };

/* ------------------------------------------------------------------ *
 * Schema del fichero (v2)
 * ------------------------------------------------------------------ */

const TXID_RE = /^[0-9a-f]{64}$/;

/**
 * Un entero en base 10 dentro de un string.
 *
 * JSON no tiene enteros grandes: `JSON.stringify` de un bigint lanza y
 * `JSON.parse` de un número largo pierde precisión en silencio, que es peor. Los
 * satoshis viajan como texto y se validan como texto — si aceptáramos `number`
 * aquí, el fichero sería el eslabón que rompe la promesa de bigint del dominio.
 */
const satoshis = z
  .string()
  .regex(/^-?\d+$/, 'debe ser un entero en base 10 dentro de un string')
  .transform((value) => BigInt(value));

const txidSchema = z.string().regex(TXID_RE, 'txid inválido: se esperan 64 hex en minúsculas');

const addressTypeSchema = z.enum(['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr', 'unknown']);

const vinSchema = z.object({
  txid: txidSchema.nullable(),
  vout: z.number().int().nullable(),
  value: satoshis,
  address: z.string().optional(),
  scriptType: addressTypeSchema,
  sequence: z.number().int(),
  isCoinbase: z.boolean(),
});

const voutSchema = z.object({
  n: z.number().int(),
  value: satoshis,
  address: z.string().optional(),
  scriptType: addressTypeSchema,
  spent: z.boolean().optional(),
  spentBy: txidSchema.optional(),
});

const txSchema = z.object({
  txid: txidSchema,
  version: z.number().int(),
  locktime: z.number().int(),
  blockHeight: z.number().int().nullable(),
  blockTime: z.number().int().nullable(),
  fee: satoshis,
  size: z.number().int(),
  weight: z.number().int(),
  vin: z.array(vinSchema),
  vout: z.array(voutSchema),
});

const nodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['tx', 'address', 'cluster']),
  x: z.number(),
  y: z.number(),
  label: z.string().optional(),
  color: z.string().optional(),
  note: z.string().optional(),
  parent: z.string().optional(),
  address: z.string().optional(),
  pinned: z.boolean().optional(),
  placed: z.boolean().optional(),
  tx: txSchema.optional(),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.enum(['input', 'output']),
  value: satoshis,
  isUtxo: z.boolean().optional(),
});

const fileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  network: z.enum(['mainnet', 'testnet', 'signet']),
  createdAt: z.string(),
  updatedAt: z.string(),
  rootTxid: txidSchema.optional(),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  viewport: z.object({ zoom: z.number(), panX: z.number(), panY: z.number() }).optional(),
});

/* ------------------------------------------------------------------ *
 * Guardar
 * ------------------------------------------------------------------ */

const txToJson = (tx: NormalizedTx): unknown => ({
  txid: tx.txid,
  version: tx.version,
  locktime: tx.locktime,
  blockHeight: tx.blockHeight,
  blockTime: tx.blockTime,
  fee: tx.fee.toString(),
  size: tx.size,
  weight: tx.weight,
  vin: tx.vin.map((vin) => ({ ...vin, value: vin.value.toString() })),
  vout: tx.vout.map((vout) => ({ ...vout, value: vout.value.toString() })),
});

const nodeToJson = (node: GraphNode): unknown => ({
  id: node.id,
  kind: node.kind,
  x: node.x,
  y: node.y,
  ...(node.label === undefined ? {} : { label: node.label }),
  ...(node.color === undefined ? {} : { color: node.color }),
  ...(node.note === undefined ? {} : { note: node.note }),
  ...(node.parent === undefined ? {} : { parent: node.parent }),
  ...(node.address === undefined ? {} : { address: node.address }),
  ...(node.pinned === undefined ? {} : { pinned: node.pinned }),
  ...(node.placed === undefined ? {} : { placed: node.placed }),
  ...(node.tx === undefined ? {} : { tx: txToJson(node.tx) }),
});

/**
 * Serializa a texto JSON, con sangría.
 *
 * Legible a propósito: el fichero es el formato de intercambio de la app y
 * alguien acabará abriéndolo para entender un bug o para leerlo con otra
 * herramienta. Los bytes de más los comprime cualquier cosa; el rato perdido
 * mirando una línea de 2 MB no lo recupera nadie.
 */
export function saveInvestigation(state: InvestigationState, meta: InvestigationMeta): string {
  const now = new Date().toISOString();

  const file = {
    schemaVersion: SCHEMA_VERSION,
    network: meta.network,
    createdAt: meta.createdAt ?? now,
    updatedAt: meta.updatedAt ?? now,
    ...(meta.rootTxid === undefined ? {} : { rootTxid: meta.rootTxid }),
    nodes: Object.values(state.graph.nodes).map(nodeToJson),
    edges: Object.values(state.graph.edges).map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      value: edge.value.toString(),
      ...(edge.isUtxo === undefined ? {} : { isUtxo: edge.isUtxo }),
    })),
    ...(meta.viewport === undefined ? {} : { viewport: meta.viewport }),
  };

  return JSON.stringify(file, null, 2);
}

/* ------------------------------------------------------------------ *
 * Cargar
 * ------------------------------------------------------------------ */

/** `["nodes", 0, "x"] → "nodes.0.x"`: la ruta del campo que falla. */
const issuesOf = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.join('.');

    return path === '' ? issue.message : `${path}: ${issue.message}`;
  });

/**
 * Comprueba que el grafo se sostiene: toda arista une nodos que existen.
 *
 * El schema valida cada pieza por separado; esto valida el conjunto. Una arista
 * que apunta a un nodo que no está es exactamente el estado corrupto de
 * BUG-019: carga «bien» y revienta al dibujar. Vale más rechazarlo aquí.
 */
function referentialIssues(
  nodes: { id: string }[],
  edges: { id: string; from: string; to: string }[],
): string[] {
  const ids = new Set(nodes.map((node) => node.id));
  const issues: string[] = [];

  for (const edge of edges) {
    if (!ids.has(edge.from))
      issues.push(`edges.${edge.id}: 'from' apunta a un nodo inexistente (${edge.from})`);
    if (!ids.has(edge.to))
      issues.push(`edges.${edge.id}: 'to' apunta a un nodo inexistente (${edge.to})`);
  }

  return issues;
}

/**
 * Carga un fichero: v2 o del legacy, por la misma puerta.
 *
 * El usuario no tiene por qué saber con qué versión de la app guardó aquello.
 * Abre su fichero y funciona; si algo se quedó por el camino, los `warnings` lo
 * dicen (RF-21).
 */
export function loadInvestigation(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { kind: 'not-json' } };
  }

  // El legacy no tiene `schemaVersion` (nunca lo tuvo): se reconoce por su forma.
  if (isLegacyFile(raw)) return migrateLegacy(raw);

  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;

  if (version !== undefined && version !== SCHEMA_VERSION) {
    return { ok: false, error: { kind: 'unknown-schema-version', found: version } };
  }

  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: { kind: 'invalid', issues: issuesOf(parsed.error) } };
  }

  const file = parsed.data;
  const dangling = referentialIssues(file.nodes, file.edges);
  if (dangling.length > 0) {
    return { ok: false, error: { kind: 'invalid', issues: dangling } };
  }

  return { ok: true, investigation: toState(file), warnings: [] };
}

type ParsedFile = z.infer<typeof fileSchema>;
type ParsedTx = z.infer<typeof txSchema>;

/** Ídem que `toState`: las claves opcionales se omiten, no se ponen a `undefined`. */
function toTx(tx: ParsedTx): NormalizedTx {
  return {
    txid: tx.txid,
    version: tx.version,
    locktime: tx.locktime,
    blockHeight: tx.blockHeight,
    blockTime: tx.blockTime,
    fee: tx.fee,
    size: tx.size,
    weight: tx.weight,
    vin: tx.vin.map((vin) => ({
      txid: vin.txid,
      vout: vin.vout,
      value: vin.value,
      scriptType: vin.scriptType,
      sequence: vin.sequence,
      isCoinbase: vin.isCoinbase,
      ...(vin.address === undefined ? {} : { address: vin.address }),
    })),
    vout: tx.vout.map((vout) => ({
      n: vout.n,
      value: vout.value,
      scriptType: vout.scriptType,
      ...(vout.address === undefined ? {} : { address: vout.address }),
      ...(vout.spent === undefined ? {} : { spent: vout.spent }),
      ...(vout.spentBy === undefined ? {} : { spentBy: vout.spentBy }),
    })),
  };
}

/**
 * Del fichero al modelo, campo a campo.
 *
 * Sin `as GraphNode`: el cast compilaría, pero con `exactOptionalPropertyTypes`
 * una clave presente con valor `undefined` NO es lo mismo que una clave ausente,
 * y zod produce lo primero mientras el modelo espera lo segundo. Casteando, el
 * `toEqual` del round-trip fallaría por una diferencia invisible a simple vista.
 */
function toState(file: ParsedFile): LoadedInvestigation {
  const graph: Graph = { nodes: {}, edges: {} };

  for (const node of file.nodes) {
    graph.nodes[node.id] = {
      id: node.id,
      kind: node.kind,
      x: node.x,
      y: node.y,
      ...(node.label === undefined ? {} : { label: node.label }),
      ...(node.color === undefined ? {} : { color: node.color }),
      ...(node.note === undefined ? {} : { note: node.note }),
      ...(node.parent === undefined ? {} : { parent: node.parent }),
      ...(node.address === undefined ? {} : { address: node.address }),
      ...(node.pinned === undefined ? {} : { pinned: node.pinned }),
      ...(node.placed === undefined ? {} : { placed: node.placed }),
      ...(node.tx === undefined ? {} : { tx: toTx(node.tx) }),
    };
  }

  for (const edge of file.edges) {
    graph.edges[edge.id] = {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      value: edge.value,
      ...(edge.isUtxo === undefined ? {} : { isUtxo: edge.isUtxo }),
    };
  }

  return {
    state: { ...initialInvestigation(), network: file.network, graph, selection: [] },
    rootTxid: file.rootTxid,
    viewport: file.viewport,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

/** Reexporta para el migrador, que construye ids igual que el resto de la app. */
export { edgeId };
