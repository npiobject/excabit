/**
 * H-07 `address-reuse` — reutilización de direcciones (docs/04).
 *
 * Si una dirección de entrada reaparece como salida, esa salida es el cambio
 * con certeza casi total: nadie se paga a sí mismo por casualidad. Es la única
 * heurística de confianza **high** basada en la forma de la tx.
 *
 * A diferencia del legacy (`reutilizaDirecciones`, limitado a 1-entrada y
 * 2-salidas), se evalúan todas las combinaciones entrada × salida.
 */
import type { NormalizedTx } from '@/core/types';
import type { HeuristicResult } from '../types';
import { detected, insufficientData, notApplicable } from './shared';

const ID = 'address-reuse';
const CONFIDENCE = 'high';

export function addressReuse(tx: NormalizedTx): HeuristicResult {
  const inputAddresses = new Set(
    tx.vin.map((vin) => vin.address).filter((address) => address !== undefined),
  );

  // Sin ninguna dirección de entrada no hay nada que comparar.
  if (inputAddresses.size === 0) return insufficientData(ID, CONFIDENCE);

  const reusedIndices = tx.vout
    .filter((vout) => vout.address !== undefined && inputAddresses.has(vout.address))
    .map((vout) => vout.n);

  const first = reusedIndices[0];
  if (first === undefined) return notApplicable(ID, CONFIDENCE);

  return detected(ID, CONFIDENCE, { changeIndex: first, reusedIndices });
}
