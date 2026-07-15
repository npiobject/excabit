/**
 * H-09 `common-input-ownership` — propiedad común de entradas (docs/04, RF-19).
 *
 * CIOH: para gastar varios UTXO en una tx hay que firmar con todas sus claves,
 * así que presumiblemente son del mismo dueño. Es la base del clustering de
 * direcciones (Meiklejohn et al., *A Fistful of Bitcoins*).
 *
 * La excepción clásica es la CoinJoin, donde varias personas firman una tx
 * conjunta a propósito: ahí CIOH agruparía a desconocidos entre sí. De ahí la
 * precondición de descartar lo que parezca CoinJoin.
 */
import type { AddressId, NormalizedTx } from '@/core/types';
import type { HeuristicResult } from '../types';
import { detected, insufficientData, notApplicable } from './shared';

const ID = 'common-input-ownership';
const CONFIDENCE = 'high';

/**
 * Salidas del mismo importe a partir de las cuales sospechamos de CoinJoin.
 *
 * Calibrado con datos reales: en un muestreo de 300 txs del bloque 724743,
 * ninguna tx normal tenía 3+ salidas de importe idéntico, mientras que las
 * Whirlpool tienen 5. Dos salidas iguales sí ocurre y no significa nada.
 */
const COINJOIN_EQUAL_OUTPUTS = 3;

/** Una CoinJoin necesita varios firmantes: con una entrada no hay mezcla. */
const COINJOIN_MIN_INPUTS = 2;

/**
 * ¿Tiene pinta de CoinJoin?
 *
 * Exige varias entradas ADEMÁS de salidas repetidas: un pago por lotes (un
 * exchange pagando a 30 clientes lo mismo desde un solo UTXO) tiene salidas
 * iguales pero no es una mezcla, y tratarlo como tal apagaría CIOH justo donde
 * es válida.
 */
export function looksLikeCoinJoin(tx: NormalizedTx): boolean {
  if (tx.vin.length < COINJOIN_MIN_INPUTS) return false;

  const countByValue = new Map<bigint, number>();
  for (const vout of tx.vout) {
    countByValue.set(vout.value, (countByValue.get(vout.value) ?? 0) + 1);
  }

  return [...countByValue.values()].some((count) => count >= COINJOIN_EQUAL_OUTPUTS);
}

export function commonInputOwnership(tx: NormalizedTx): HeuristicResult {
  // La coinbase no gasta outputs de nadie: no hay propiedad que inferir.
  if (tx.vin.some((vin) => vin.isCoinbase)) return notApplicable(ID, CONFIDENCE);

  const addresses = tx.vin.map((vin) => vin.address).filter((a) => a !== undefined);
  if (addresses.length === 0) return insufficientData(ID, CONFIDENCE);

  if (looksLikeCoinJoin(tx)) return notApplicable(ID, CONFIDENCE, { reason: 'coinjoin-like' });

  const cluster: AddressId[] = [...new Set(addresses)];

  // Un cluster de una sola dirección no une nada que no estuviera unido: el
  // valor de CIOH es enlazar direcciones distintas entre sí.
  if (cluster.length < 2) return notApplicable(ID, CONFIDENCE);

  return detected(ID, CONFIDENCE, { cluster });
}
