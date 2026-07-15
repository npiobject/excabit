/**
 * H-01 `change-largest-output` — salida de monto mayor (docs/04).
 *
 * En un pago 1-entrada/2-salidas con todas las direcciones del mismo tipo, si
 * una salida es mucho mayor que la otra, la mayor suele ser el cambio: el
 * pagador gastó un UTXO grande, pagó poco y se devolvió el resto.
 *
 * Es la heurística más débil del catálogo (confianza **low**): un pago grande
 * con cambio pequeño la engaña por completo.
 *
 * Legacy: `salidaMontoMayor`, afectada por BUG-006 (comparaba resultados de dos
 * clasificadores de dirección incompatibles) y por un bucle que validaba
 * `lengInputs` cuando ya se había filtrado a un único input.
 */
import type { NormalizedTx } from '@/core/types';
import type { HeuristicResult } from '../types';
import { allSameType, hasKnownAddresses, typesOfInputs, typesOfOutputs } from '../address-type';
import { detected, insufficientData, maxOf, minOf, notApplicable, outputValues } from './shared';

const ID = 'change-largest-output';
const CONFIDENCE = 'low';

/** La salida menor debe ser < 10 % de la mayor. */
const RATIO_DIVISOR = 10n;

export function changeLargestOutput(tx: NormalizedTx): HeuristicResult {
  if (tx.vin.length !== 1 || tx.vout.length !== 2) return notApplicable(ID, CONFIDENCE);

  // Sin todas las direcciones no se puede afirmar que compartan tipo.
  if (!hasKnownAddresses(tx)) return insufficientData(ID, CONFIDENCE);

  if (!allSameType([...typesOfInputs(tx), ...typesOfOutputs(tx)])) {
    return notApplicable(ID, CONFIDENCE);
  }

  const values = outputValues(tx);
  const min = minOf(values);
  const max = maxOf(values);

  // min < max * 0.1, en aritmética entera para no perder precisión.
  if (min * RATIO_DIVISOR >= max) return notApplicable(ID, CONFIDENCE);

  return detected(ID, CONFIDENCE, { changeIndex: values.indexOf(max) });
}
