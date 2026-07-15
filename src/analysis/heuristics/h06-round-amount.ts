/**
 * H-06 `round-amount` — pago con número redondo (docs/04).
 *
 * Las personas pagan cantidades redondas; el cambio es lo que sobra y casi
 * nunca lo es. Si exactamente una salida es redonda, esa es probablemente el
 * pago.
 *
 * **BUG-008**: `pagoNumeroRedondo` tenía `if ((A && B) || C && D)` — sin
 * paréntesis en la segunda rama. Con una sola salida y ningún cero, la
 * expresión evaluaba `C && D` de forma no pretendida.
 *
 * El criterio del legacy («N salidas y ≥ N−1 redondas») era demasiado laxo:
 * la v2 exige exactamente una redonda y el resto no (docs/04).
 */
import type { NormalizedTx } from '@/core/types';
import type { HeuristicResult } from '../types';
import { detected, notApplicable, outputValues } from './shared';

const ID = 'round-amount';
const CONFIDENCE = 'low';

/** Ceros finales a partir de los cuales un importe se considera "redondo". */
const MIN_TRAILING_ZEROS = 3;

/**
 * Cuenta ceros decimales finales del importe en satoshis.
 * Se opera sobre `bigint` sin pasar por `Number`: el dominio no pierde precisión.
 */
export function trailingZeros(value: bigint): number {
  if (value === 0n) return 0;

  let zeros = 0;
  let rest = value;
  while (rest % 10n === 0n) {
    zeros += 1;
    rest /= 10n;
  }

  return zeros;
}

const isRound = (value: bigint): boolean => trailingZeros(value) >= MIN_TRAILING_ZEROS;

export function roundAmount(tx: NormalizedTx): HeuristicResult {
  const values = outputValues(tx);
  const roundOnes = values.filter(isRound);

  if (roundOnes.length !== 1) return notApplicable(ID, CONFIDENCE);

  return detected(ID, CONFIDENCE, { paymentIndex: values.findIndex(isRound) });
}
