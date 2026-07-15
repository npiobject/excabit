/**
 * Validación de las entradas del usuario en la frontera (RF-01, RF-02).
 *
 * Alcance deliberado: validación ESTRUCTURAL (prefijo, longitud, alfabeto).
 * No se verifica el checksum base58/bech32 — exigiría SHA-256 y la tabla de
 * bech32, y su valor aquí es marginal: una dirección con estructura válida y
 * checksum roto la rechaza el provider con un 404 que ya sabemos tratar
 * (ApiError 'not-found'). Si algún día se necesita feedback offline preciso,
 * es el punto natural de extensión.
 *
 * BUG-006: el legacy tenía DOS clasificadores incompatibles, uno que devolvía
 * números (1/2/3) y otro strings ('bc1q'/'bc1p'/0), y comparaba entre sí sus
 * resultados. Aquí hay una única función y un único enum.
 */
import type { AddressType, Txid } from './types';

const TXID_RE = /^[0-9a-f]{64}$/;

/** Base58 de Bitcoin: sin 0, O, I ni l (ambiguos a la vista). */
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** Alfabeto bech32 (BIP-173): sin 1, b, i ni o. */
const BECH32_RE = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;

/** Longitudes reales de una dirección base58 en mainnet. */
const BASE58_MIN_LENGTH = 26;
const BASE58_MAX_LENGTH = 35;

/** bech32: 42 = witness de 20 bytes (p2wpkh); 62 = witness de 32 (p2wsh/p2tr). */
const BECH32_LENGTH_20_BYTES = 42;
const BECH32_LENGTH_32_BYTES = 62;

export type SearchKind = 'txid' | 'address' | 'invalid';

/**
 * Devuelve el txid canónico (trim + minúsculas) o `null` si no es válido.
 * Un txid es un hash de 32 bytes en hex; la caja de búsqueda acepta que venga
 * pegado con espacios o en mayúsculas.
 */
export function normalizeTxid(input: string): Txid | null {
  const candidate = input.trim().toLowerCase();

  return TXID_RE.test(candidate) ? candidate : null;
}

export function isValidTxid(input: string): boolean {
  return normalizeTxid(input) !== null;
}

function classifyBase58(address: string): AddressType {
  if (address.length < BASE58_MIN_LENGTH || address.length > BASE58_MAX_LENGTH) return 'unknown';
  if (!BASE58_RE.test(address)) return 'unknown';

  if (address.startsWith('1')) return 'p2pkh';
  if (address.startsWith('3')) return 'p2sh';

  return 'unknown';
}

function classifyBech32(address: string): AddressType {
  // BIP-173: se admite todo mayúsculas o todo minúsculas, nunca mezclado.
  const isUniformCase = address === address.toLowerCase() || address === address.toUpperCase();
  if (!isUniformCase) return 'unknown';

  const lower = address.toLowerCase();
  if (!lower.startsWith('bc1')) return 'unknown';

  // Tras el separador '1' viene la versión del witness codificada en bech32.
  const data = lower.slice('bc1'.length);
  if (!BECH32_RE.test(data)) return 'unknown';

  const witnessVersion = data[0];

  if (witnessVersion === 'q') {
    // v0: la longitud distingue p2wpkh (20 bytes) de p2wsh (32).
    if (lower.length === BECH32_LENGTH_20_BYTES) return 'p2wpkh';
    if (lower.length === BECH32_LENGTH_32_BYTES) return 'p2wsh';
    return 'unknown';
  }

  // v1 (bech32m): taproot. Misma longitud que p2wsh, de ahí BUG-010: el legacy
  // clasificaba por longitud y confundía bc1p con bech32 v0.
  if (witnessVersion === 'p' && lower.length === BECH32_LENGTH_32_BYTES) return 'p2tr';

  return 'unknown';
}

/**
 * Clasifica una dirección de mainnet. Devuelve siempre un `AddressType`;
 * `'unknown'` es la respuesta para todo lo que no encaje, nunca una excepción.
 */
export function classifyAddress(input: string): AddressType {
  const address = input.trim();
  if (address.length === 0) return 'unknown';

  if (address.toLowerCase().startsWith('bc1')) return classifyBech32(address);

  return classifyBase58(address);
}

/**
 * Decide qué buscó el usuario (RF-02). El orden importa: un txid nunca puede
 * confundirse con una dirección (64 hex no encaja en los alfabetos base58/bech32).
 */
export function detectSearchKind(input: string): SearchKind {
  if (isValidTxid(input)) return 'txid';
  if (classifyAddress(input) !== 'unknown') return 'address';

  return 'invalid';
}
