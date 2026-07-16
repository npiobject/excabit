/**
 * Enlace permanente (RF-24.1..24.5, docs/03).
 *
 * ## Por qué viajan los txids y no el grafo
 *
 * La redacción original de RF-24 decía «codifica la investigación en la URL (si
 * cabe)». Medido en la app real, no cabe casi nunca: la tx de ejemplo son 24.123
 * caracteres de JSON — 5.132 ya comprimidos y en base64url — y la dirección de
 * 170 nodos, 33.523. Un enlace con el grafo dentro no funcionaría **ni para el
 * ejemplo de la propia app**.
 *
 * Pero el grafo está determinado por las txs que se cargaron: con la lista de
 * txids se rehace entero. Los txids son azar y no hay compresión que valga, pero
 * 32 bytes por tx es otra escala — una investigación de 6 txs son unos cientos de
 * caracteres, no 33.523.
 *
 * Tampoco viaja el viewport, y no por ahorrar bytes: la pantalla de quien recibe
 * el enlace no es la de quien lo manda. Un zoom y un pan copiados de un monitor
 * de 2.560 px enseñan otra cosa en un portátil, o no enseñan nada. Se ajusta a la
 * ventana de quien mira y, si no cabe legible, se pliega (RF-36.5). Las
 * posiciones de los nodos tampoco viajan: el layout es determinista.
 *
 * ## El precio, dicho aquí y en la UI
 *
 * Reproducir exige que el proveedor responda. **El enlace no sustituye al
 * fichero**: el fichero es autocontenido a propósito (RF-21) porque el legacy se
 * quedó inservible el día que su clave caducó. El enlace es para compartir ahora;
 * el fichero, para guardar. Callarse esto sería vender un archivo que no lo es.
 *
 * ## Y esto llega de fuera
 *
 * Un enlace es entrada de otra persona, y encima llega pinchando. Se valida en la
 * frontera igual que el fichero (BUG-019) y decodificar devuelve un resultado en
 * vez de lanzar: quien llama no puede ignorarlo sin querer.
 */
import { z } from 'zod';
import type { Graph } from '../core/graph-model';
import type { Network, Txid } from '../core/types';

export const PERMALINK_VERSION = 1;

/**
 * Por encima de esto se avisa y se ofrece el fichero (RF-24.4).
 *
 * El límite es de la realidad, no del navegador: el fragmento no llega al
 * servidor, así que no hay límite de servidor que respetar. Pero los enlaces se
 * pegan en chats y gestores de tickets que truncan sin avisar, y un enlace
 * cortado no falla: abre **otra cosa**. 8.000 caracteres son más de ~120 txs, y a
 * esa escala el fichero es la respuesta correcta de todos modos.
 */
export const PERMALINK_MAX_LENGTH = 8000;

export interface PermalinkAnnotation {
  id: string;
  label?: string;
  color?: string;
  note?: string;
}

export interface PermalinkPayload {
  version: number;
  network: Network;
  /** Las txs cargadas. Con esto se rehace el grafo entero. */
  txids: Txid[];
  rootTxid?: Txid;
  annotations: PermalinkAnnotation[];
}

export type PermalinkError =
  | { kind: 'unreadable' }
  | { kind: 'unknown-version'; found: unknown }
  | { kind: 'invalid'; issues: string[] };

export type PermalinkResult =
  { ok: true; payload: PermalinkPayload } | { ok: false; error: PermalinkError };

/* ------------------------------------------------------------------ *
 * Del grafo al enlace
 * ------------------------------------------------------------------ */

export interface PermalinkMeta {
  network: Network;
  rootTxid?: Txid;
}

/**
 * Saca de un grafo lo que hace falta para rehacerlo.
 *
 * Solo cuentan los nodos de tx **con datos**: un nodo de tx vacío es una vecina
 * anunciada que nadie llegó a traer, y pedirla daría un grafo distinto del que se
 * compartió. El enlace es una foto, no una consulta viva.
 */
export function permalinkOf(graph: Graph, meta: PermalinkMeta): PermalinkPayload {
  const nodes = Object.values(graph.nodes);

  const annotations = nodes.flatMap((node) => {
    if (node.label === undefined && node.color === undefined && node.note === undefined) return [];

    return [
      {
        id: node.id,
        ...(node.label === undefined ? {} : { label: node.label }),
        ...(node.color === undefined ? {} : { color: node.color }),
        ...(node.note === undefined ? {} : { note: node.note }),
      },
    ];
  });

  return {
    version: PERMALINK_VERSION,
    network: meta.network,
    txids: nodes.flatMap((node) => (node.tx === undefined ? [] : [node.tx.txid])),
    ...(meta.rootTxid === undefined ? {} : { rootTxid: meta.rootTxid }),
    annotations,
  };
}

/* ------------------------------------------------------------------ *
 * Codificar y decodificar
 * ------------------------------------------------------------------ */

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  // Sin `+`, `/` ni `=`: en un fragmento se reescriben por el camino, y un enlace
  // que se reescribe deja de abrir lo que decía.
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return bytes;
};

// `Uint8Array<ArrayBuffer>` y no `Uint8Array` a secas: el genérico admite también
// `SharedArrayBuffer`, que no es un `BufferSource` válido para el stream.
async function through(
  stream: CompressionStream | DecompressionStream,
  data: Uint8Array<ArrayBuffer>,
) {
  const writer = stream.writable.getWriter();

  /*
   * El lado de escritura se marca como atendido aquí a propósito.
   *
   * Con un enlace corrupto —que es el caso normal, no el raro: llega de fuera—
   * fallan los dos lados del stream. Si el de escritura se deja suelto, su
   * rechazo no lo espera nadie: en Node lo caza el runner como «unhandled error»
   * y en el navegador es un `unhandledrejection` en la consola del usuario, por
   * un enlace mal pegado. El que cuenta es el de lectura, que es el que sube.
   */
  const written = writer
    .write(data)
    .then(() => writer.close())
    .catch(() => undefined);

  const bytes = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  await written;

  return bytes;
}

/** JSON → deflate → base64url. Devuelve solo el valor: la URL la monta la UI. */
export async function encodePermalink(payload: PermalinkPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const packed = await through(
    new CompressionStream('deflate-raw'),
    new TextEncoder().encode(json),
  );

  return toBase64Url(packed);
}

const TXID_RE = /^[0-9a-f]{64}$/;
const txidSchema = z.string().regex(TXID_RE, 'txid inválido: se esperan 64 hex en minúsculas');

const annotationSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  color: z.string().optional(),
  note: z.string().optional(),
});

const payloadSchema = z.object({
  version: z.literal(PERMALINK_VERSION),
  network: z.enum(['mainnet', 'testnet', 'signet']),
  txids: z.array(txidSchema).min(1, 'un enlace sin txids no reproduce ninguna investigación'),
  rootTxid: txidSchema.optional(),
  annotations: z.array(annotationSchema),
});

const issuesOf = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.join('.');

    return path === '' ? issue.message : `${path}: ${issue.message}`;
  });

/**
 * base64url → inflate → JSON → validado.
 *
 * Todo lo que pueda salir mal antes de tener un objeto —base64 corrupto, deflate
 * que no lo es, JSON roto— es lo mismo desde fuera: el enlace no se puede leer.
 * Distinguirlo en el mensaje no ayudaría a nadie a arreglarlo; se dice y ya.
 */
export async function decodePermalink(text: string): Promise<PermalinkResult> {
  let raw: unknown;

  try {
    const bytes = fromBase64Url(text);
    const json = await through(new DecompressionStream('deflate-raw'), bytes);
    raw = JSON.parse(new TextDecoder().decode(json));
  } catch {
    return { ok: false, error: { kind: 'unreadable' } };
  }

  // La versión se mira antes que nada: es la diferencia entre «no sé abrir esto»
  // y abrirlo mal y fallar después, con el usuario delante (BUG-019).
  const version = (raw as { version?: unknown } | null)?.version;
  if (version !== PERMALINK_VERSION) {
    return { ok: false, error: { kind: 'unknown-version', found: version } };
  }

  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: { kind: 'invalid', issues: issuesOf(parsed.error) } };

  const value = parsed.data;

  // Campo a campo y sin `as`: con `exactOptionalPropertyTypes`, una clave presente
  // con `undefined` no es una clave ausente, y zod produce lo primero. Casteando,
  // la ida y vuelta fallaría por una diferencia que no se ve leyendo.
  return {
    ok: true,
    payload: {
      version: value.version,
      network: value.network,
      txids: value.txids,
      ...(value.rootTxid === undefined ? {} : { rootTxid: value.rootTxid }),
      annotations: value.annotations.map((a) => ({
        id: a.id,
        ...(a.label === undefined ? {} : { label: a.label }),
        ...(a.color === undefined ? {} : { color: a.color }),
        ...(a.note === undefined ? {} : { note: a.note }),
      })),
    },
  };
}
