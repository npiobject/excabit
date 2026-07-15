/**
 * Tipos del dominio (docs/05-especificacion-tecnica.md §3).
 *
 * Los importes van SIEMPRE en `bigint` de satoshis dentro del dominio; el
 * formateo a BTC vive en la capa UI. Bitcoin cabe en un `number` hoy, pero
 * sumas de valores en un grafo grande no tienen por qué: el dominio no
 * arriesga precisión.
 */

/** 64 caracteres hex. Se valida en la frontera, nunca se asume. */
export type Txid = string;

export type AddressId = string;

export type Network = 'mainnet' | 'testnet' | 'signet';

export type AddressType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr' | 'unknown';

export interface Vin {
  /** Tx de la que proviene el output gastado. `null` en coinbase. */
  txid: Txid | null;
  /** Índice del output gastado. `null` en coinbase. */
  vout: number | null;
  value: bigint;
  address?: AddressId;
  /**
   * Tipo del output que esta entrada gasta, según el proveedor.
   *
   * Lo necesitan H-03/H-04/H-05 ("todas las entradas del mismo tipo"). Viene
   * del provider en vez de deducirse de la dirección porque deducirlo daría
   * `unknown` en testnet/signet y dejaría las heurísticas ciegas ahí (RF-04).
   */
  scriptType: AddressType;
  sequence: number;
  isCoinbase: boolean;
}

export interface Vout {
  n: number;
  value: bigint;
  address?: AddressId;
  scriptType: AddressType;
  /** `undefined` mientras no se hayan consultado los outspends. */
  spent?: boolean;
  /** Tx que gastó este output, si se conoce. */
  spentBy?: Txid;
}

export interface NormalizedTx {
  txid: Txid;
  version: number;
  locktime: number;
  /** `null` = sin confirmar (en mempool). */
  blockHeight: number | null;
  /** Epoch en segundos. `null` = sin confirmar. */
  blockTime: number | null;
  /** Satoshis. En coinbase es 0n. */
  fee: bigint;
  size: number;
  weight: number;
  vin: Vin[];
  vout: Vout[];
}

export interface AddressSummary {
  address: AddressId;
  type: AddressType;
  txCount: number;
  /** Satoshis recibidos y gastados en total (histórico). */
  received: bigint;
  spent: bigint;
  /** Saldo actual = received − spent. */
  balance: bigint;
}

export interface Page<T> {
  items: T[];
  /** Cursor de la siguiente página; `undefined` = no hay más (RF-31). */
  cursor?: string;
}

export type OutspendStatus = { spent: false } | { spent: true; txid: Txid; vin: number };
