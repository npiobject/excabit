/**
 * Enlace permanente (RF-24.1..24.4).
 *
 * Un enlace es **entrada de otra persona**: es aún menos de fiar que un fichero,
 * porque llega pinchando. Así que se valida en la frontera igual que el fichero
 * (BUG-019), y decodificar devuelve un resultado en vez de lanzar.
 */
import { describe, it, expect } from 'vitest';
import {
  decodePermalink,
  encodePermalink,
  permalinkOf,
  PERMALINK_VERSION,
  type PermalinkPayload,
} from '@/persistence/permalink';
import { addTxToGraph, addressNodeId, emptyGraph, txNodeId } from '@/core/graph-model';
import { txFixture } from '@tests/helpers/tx-fixture';

const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);

const payload = (over: Partial<PermalinkPayload> = {}): PermalinkPayload => ({
  version: PERMALINK_VERSION,
  network: 'mainnet',
  txids: [TXID_A],
  annotations: [],
  ...over,
});

describe('ida y vuelta', () => {
  it('lo que se codifica es lo que se decodifica', async () => {
    const original = payload({
      txids: [TXID_A, TXID_B],
      rootTxid: TXID_A,
      annotations: [{ id: 'addr:x', label: 'Mi monedero', color: '#f7931a', note: 'sospechosa' }],
    });

    const result = await decodePermalink(await encodePermalink(original));

    expect(result).toEqual({ ok: true, payload: original });
  });

  it('el enlace es texto de URL: nada que haya que escapar', async () => {
    // base64url, no base64: `+`, `/` y `=` en un fragmento son una fuente de
    // sorpresas — se reescriben por el camino y el enlace deja de abrir.
    const encoded = await encodePermalink(
      payload({ annotations: [{ id: 'a', note: 'ñ ü + / = ?' }] }),
    );

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('sobrevive a los acentos y a los emoji: la nota la escribe una persona', async () => {
    const original = payload({ annotations: [{ id: 'a', label: 'Cañí 🕵', note: 'año 2022' }] });

    const result = await decodePermalink(await encodePermalink(original));

    expect(result).toEqual({ ok: true, payload: original });
  });
});

describe('lo que llega de fuera', () => {
  it('un fragmento que no es base64 se rechaza, no revienta', async () => {
    expect(await decodePermalink('esto no es un enlace!!')).toEqual({
      ok: false,
      error: { kind: 'unreadable' },
    });
  });

  it('base64 válido que no comprime nada tampoco revienta', async () => {
    expect(await decodePermalink('aGVsbG8')).toEqual({ ok: false, error: { kind: 'unreadable' } });
  });

  it('una versión que no conocemos se dice, no se adivina', async () => {
    // Mismo trato que el fichero: es la diferencia entre «no puedo abrir esto» y
    // abrirlo mal y fallar después, con el usuario delante (BUG-019).
    const raw = await encodePermalink({ ...payload(), version: 99 });

    expect(await decodePermalink(raw)).toEqual({
      ok: false,
      error: { kind: 'unknown-version', found: 99 },
    });
  });

  it('un txid inventado se rechaza con el campo que falla', async () => {
    const result = await decodePermalink(
      await encodePermalink(payload({ txids: ['no-es-un-txid'] })),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('debía fallar');
    expect(result.error.kind).toBe('invalid');
    if (result.error.kind !== 'invalid') throw new Error('debía ser invalid');
    expect(result.error.issues.join(' ')).toMatch(/txids/);
  });

  it('sin txids no hay investigación que reproducir', async () => {
    const result = await decodePermalink(await encodePermalink(payload({ txids: [] })));

    expect(result.ok).toBe(false);
  });
});

describe('del grafo al enlace (RF-24.1)', () => {
  const tx = (txid: string) =>
    txFixture({
      txid,
      vin: [
        {
          txid: 'f'.repeat(64),
          vout: 0,
          value: 1000n,
          address: 'in1',
          scriptType: 'p2wpkh' as const,
          sequence: 0xffffffff,
          isCoinbase: false,
        },
      ],
      vout: [{ n: 0, value: 900n, address: 'out1', scriptType: 'p2wpkh' as const }],
    });

  it('viajan los txids, no las txs: de eso iba todo', () => {
    // Medido: el grafo entero de la tx de ejemplo son 5.132 caracteres en la URL;
    // sus txids, unas decenas.
    const graph = addTxToGraph(emptyGraph(), tx(TXID_A));

    const result = permalinkOf(graph, { network: 'mainnet', rootTxid: TXID_A });

    expect(result.txids).toEqual([TXID_A]);
    expect(JSON.stringify(result)).not.toContain('vout');
  });

  it('viajan las anotaciones: son lo que el usuario ha puesto de su parte', () => {
    const base = addTxToGraph(emptyGraph(), tx(TXID_A));
    const id = addressNodeId('in1');
    const graph = {
      ...base,
      nodes: { ...base.nodes, [id]: { ...base.nodes[id]!, label: 'Mi monedero', note: 'ojo' } },
    };

    const result = permalinkOf(graph, { network: 'mainnet' });

    expect(result.annotations).toEqual([{ id, label: 'Mi monedero', note: 'ojo' }]);
  });

  it('un nodo sin nada que decir no ocupa sitio en el enlace', () => {
    const graph = addTxToGraph(emptyGraph(), tx(TXID_A));

    expect(permalinkOf(graph, { network: 'mainnet' }).annotations).toEqual([]);
  });

  it('ni las posiciones ni el viewport viajan', () => {
    // Las posiciones porque el layout es determinista y las rehace igual. El
    // viewport porque la pantalla de quien recibe no es la de quien manda: un
    // zoom copiado de un monitor de 2.560 px no enseña lo mismo en un portátil.
    // Al abrirlo se ajusta a la ventana de quien mira, y se pliega si no cabe.
    const graph = addTxToGraph(emptyGraph(), tx(TXID_A));

    const json = JSON.stringify(permalinkOf(graph, { network: 'mainnet' }));

    expect(json).not.toContain('"x"');
    expect(json).not.toContain('viewport');
  });

  it('un grafo vacío da un enlace sin txids: no hay nada que compartir', () => {
    expect(permalinkOf(emptyGraph(), { network: 'mainnet' }).txids).toEqual([]);
  });

  it('el nodo de una tx sin datos no cuenta como tx cargada', () => {
    // Los nodos de tx que son solo un hueco (una vecina anunciada pero no traída)
    // no se pueden reproducir: pedirlos daría un grafo distinto al compartido.
    const graph = {
      nodes: { [txNodeId(TXID_B)]: { id: txNodeId(TXID_B), kind: 'tx' as const, x: 0, y: 0 } },
      edges: {},
    };

    expect(permalinkOf(graph, { network: 'mainnet' }).txids).toEqual([]);
  });
});

describe('el tamaño, que es de lo que iba (RF-24.4)', () => {
  it('una investigación normal cabe de sobra', async () => {
    const txids = Array.from({ length: 6 }, (_, i) => String(i).repeat(64).slice(0, 64));

    const encoded = await encodePermalink(payload({ txids }));

    // Medido en la app real: 6 txs es la dirección de 170 nodos.
    expect(encoded.length).toBeLessThan(1000);
  });
});
