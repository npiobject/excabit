/**
 * Forma cruda de la API Esplora (mempool.space y cualquier instancia
 * autohospedada — ADR-002). Estos tipos NO salen de `data/`: el resto de la
 * app solo conoce `NormalizedTx`, así que cambiar de proveedor no propaga
 * cambios más allá del normalizer.
 *
 * Los importes llegan como `number` (JSON no tiene enteros grandes); el
 * normalizer los convierte a `bigint` en la frontera.
 */

/** Valores observados en `scriptpubkey_type`. Cualquier otro se trata como desconocido. */
export type EsploraScriptType =
  | 'p2pkh'
  | 'p2sh'
  | 'v0_p2wpkh'
  | 'v0_p2wsh'
  | 'v1_p2tr'
  | 'op_return'
  | 'multisig'
  | 'provably_unspendable'
  | 'unknown'
  | (string & {});

export interface EsploraVout {
  scriptpubkey: string;
  scriptpubkey_asm?: string;
  scriptpubkey_type: EsploraScriptType;
  /** Ausente en salidas sin dirección (OP_RETURN, multisig crudo…). */
  scriptpubkey_address?: string;
  value: number;
}

export interface EsploraVin {
  /** En coinbase viene a ceros; el campo fiable es `is_coinbase`. */
  txid: string;
  /** En coinbase vale 0xffffffff. */
  vout: number;
  /** `null` en coinbase: no gasta ningún output previo. */
  prevout: EsploraVout | null;
  scriptsig?: string;
  witness?: string[];
  is_coinbase: boolean;
  sequence: number;
}

export interface EsploraStatus {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

export interface EsploraTx {
  txid: string;
  version: number;
  locktime: number;
  vin: EsploraVin[];
  vout: EsploraVout[];
  size: number;
  weight: number;
  fee: number;
  status: EsploraStatus;
}

export type EsploraOutspend =
  { spent: false } | { spent: true; txid: string; vin: number; status?: EsploraStatus };

export interface EsploraAddressStats {
  funded_txo_count: number;
  funded_txo_sum: number;
  spent_txo_count: number;
  spent_txo_sum: number;
  tx_count: number;
}

export interface EsploraAddress {
  address: string;
  chain_stats: EsploraAddressStats;
  mempool_stats: EsploraAddressStats;
}
