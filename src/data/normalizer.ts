/**
 * Frontera entre la API del proveedor y el dominio (docs/05 §4).
 *
 * Todo lo que llega de la red pasa por aquí: el resto de la app no conoce el
 * formato de Esplora. Es lo que permite que ADR-002 sea revisable sin tocar
 * nada fuera de `data/`.
 *
 * Todas las funciones son puras: no mutan la respuesta del provider ni la tx
 * que reciben (BUG-011 nació de heurísticas que mutaban estado compartido).
 */
import type { AddressType, NormalizedTx, OutspendStatus, Vin, Vout } from '@/core/types';
import type {
  EsploraOutspend,
  EsploraScriptType,
  EsploraTx,
  EsploraVout,
} from './providers/esplora-types';

/**
 * Tipos de script de Esplora → enum del dominio.
 *
 * BUG-010: el legacy deducía el tipo por la longitud de la dirección y
 * confundía taproot (bc1p, 62 chars) con p2wsh (bc1q, 62 chars). Aquí el
 * proveedor ya nos dice el tipo del script: no hay nada que adivinar.
 */
const SCRIPT_TYPE_MAP: Record<string, AddressType> = {
  p2pkh: 'p2pkh',
  p2sh: 'p2sh',
  v0_p2wpkh: 'p2wpkh',
  v0_p2wsh: 'p2wsh',
  v1_p2tr: 'p2tr',
};

/** Lo que no sabemos nombrar es 'unknown' — nunca una excepción ni un valor a medias. */
function toAddressType(scriptType: EsploraScriptType): AddressType {
  return SCRIPT_TYPE_MAP[scriptType] ?? 'unknown';
}

function normalizeVout(raw: EsploraVout, n: number): Vout {
  const address = raw.scriptpubkey_address;

  return {
    n,
    value: BigInt(raw.value),
    scriptType: toAddressType(raw.scriptpubkey_type),
    // `exactOptionalPropertyTypes`: la clave se omite, no se pone a undefined.
    ...(address === undefined ? {} : { address }),
  };
}

function normalizeVin(raw: EsploraTx['vin'][number]): Vin {
  // La coinbase no gasta nada: sus campos txid/vout son relleno (ceros y
  // 0xffffffff). Modelarlos como null evita que el grafo intente expandir una
  // tx previa que no existe (el legacy lo intentaba: BUG-016).
  if (raw.is_coinbase) {
    return { txid: null, vout: null, value: 0n, sequence: raw.sequence, isCoinbase: true };
  }

  const address = raw.prevout?.scriptpubkey_address;

  return {
    txid: raw.txid,
    vout: raw.vout,
    value: BigInt(raw.prevout?.value ?? 0),
    sequence: raw.sequence,
    isCoinbase: false,
    ...(address === undefined ? {} : { address }),
  };
}

/** Respuesta cruda de `GET /api/tx/:txid` → tx del dominio. */
export function normalizeTx(raw: EsploraTx): NormalizedTx {
  const confirmed = raw.status.confirmed;

  return {
    txid: raw.txid,
    version: raw.version,
    locktime: raw.locktime,
    blockHeight: confirmed ? (raw.status.block_height ?? null) : null,
    blockTime: confirmed ? (raw.status.block_time ?? null) : null,
    fee: BigInt(raw.fee),
    size: raw.size,
    weight: raw.weight,
    vin: raw.vin.map(normalizeVin),
    vout: raw.vout.map((out, n) => normalizeVout(out, n)),
  };
}

/** Respuesta cruda de `GET /api/tx/:txid/outspends` → estado del dominio. */
export function normalizeOutspends(raw: EsploraOutspend[]): OutspendStatus[] {
  return raw.map((entry) =>
    entry.spent ? { spent: true, txid: entry.txid, vin: entry.vin } : { spent: false },
  );
}

/**
 * Devuelve una tx nueva con `vout.spent`/`spentBy` resueltos (RF-05: marcar
 * los UTXO). Un `vout` sin dato correspondiente conserva `spent: undefined`:
 * "no consultado" y "no gastado" son cosas distintas y el grafo las pinta
 * distinto.
 */
export function applyOutspends(tx: NormalizedTx, spends: readonly OutspendStatus[]): NormalizedTx {
  return {
    ...tx,
    vout: tx.vout.map((out, n) => {
      const spend = spends[n];
      if (spend === undefined) return { ...out };
      if (!spend.spent) return { ...out, spent: false };

      return { ...out, spent: true, spentBy: spend.txid };
    }),
  };
}
