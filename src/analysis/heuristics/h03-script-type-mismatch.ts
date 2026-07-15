/**
 * H-03 `script-type-mismatch` — pago a script distinto (docs/04).
 *
 * Con 1 entrada bech32 v0 y 2 salidas bech32 v0, si una salida es del mismo
 * subtipo que la entrada (p2wpkh↔42 chars, p2wsh↔62) y la otra no, la que
 * coincide con la entrada es probablemente el cambio: la wallet se devuelve
 * el resto al mismo tipo de script que usa.
 *
 * BUG-010: el legacy razonaba sobre la LONGITUD de la dirección (42/62) y ante
 * cualquier otra longitud hacía `console.log` en producción y seguía. Aquí el
 * tipo lo da el proveedor y lo que no encaja se declara `insufficient-data`.
 * Taproot (bc1p, también 62 chars) es asunto de H-04, no de esta.
 */
import type { AddressType, NormalizedTx } from '@/core/types';
import type { HeuristicResult } from '../types';
import { hasKnownAddresses, typesOfInputs, typesOfOutputs } from '../address-type';
import { detected, insufficientData, notApplicable } from './shared';

const ID = 'script-type-mismatch';
const CONFIDENCE = 'medium';

/** Los dos subtipos de bech32 v0 (`bc1q…`). */
const SEGWIT_V0: readonly AddressType[] = ['p2wpkh', 'p2wsh'];

const isSegwitV0 = (type: AddressType): boolean => SEGWIT_V0.includes(type);

export function scriptTypeMismatch(tx: NormalizedTx): HeuristicResult {
  if (tx.vin.length !== 1 || tx.vout.length !== 2) return notApplicable(ID, CONFIDENCE);
  if (!hasKnownAddresses(tx)) return insufficientData(ID, CONFIDENCE);

  const types = [...typesOfInputs(tx), ...typesOfOutputs(tx)];

  // Un tipo que no sabemos leer: no se opina (antes: console.log y adelante).
  if (types.includes('unknown')) return insufficientData(ID, CONFIDENCE);

  // Precondición: todo bech32 v0. Taproot y base58 quedan fuera por diseño.
  if (!types.every(isSegwitV0)) return notApplicable(ID, CONFIDENCE);

  const inputType = types[0];
  const outputTypes = typesOfOutputs(tx);

  // Solo aporta información si las dos salidas difieren entre sí y una empata
  // con la entrada.
  if (outputTypes[0] === outputTypes[1]) return notApplicable(ID, CONFIDENCE);

  const changeIndex = outputTypes.findIndex((type) => type === inputType);
  if (changeIndex === -1) return notApplicable(ID, CONFIDENCE);

  return detected(ID, CONFIDENCE, { changeIndex });
}
