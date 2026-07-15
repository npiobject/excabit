/**
 * H-05 `format-change` — pago a formato diferente (docs/04).
 *
 * Si todas las entradas comparten tipo y exactamente una salida es de un tipo
 * distinto, esa salida es probablemente el **pago**: la wallet se devuelve el
 * cambio al formato que ella usa, y el destinatario tiene el formato que tiene.
 *
 * Ojo a la asimetría con H-01/H-03/H-04: aquí lo señalado es el pago, no el
 * cambio. Por eso el detalle se llama `paymentIndex`.
 *
 * Legacy: `pagoFormatoDiferente`.
 */
import type { NormalizedTx } from '@/core/types';
import type { HeuristicResult } from '../types';
import { allSameType, hasKnownAddresses, typesOfInputs, typesOfOutputs } from '../address-type';
import { detected, insufficientData, notApplicable } from './shared';

const ID = 'format-change';
const CONFIDENCE = 'medium';

const MIN_OUTPUTS = 2;

export function formatChange(tx: NormalizedTx): HeuristicResult {
  if (tx.vout.length < MIN_OUTPUTS) return notApplicable(ID, CONFIDENCE);
  if (!hasKnownAddresses(tx)) return insufficientData(ID, CONFIDENCE);

  const inputTypes = typesOfInputs(tx);
  if (!allSameType(inputTypes)) return notApplicable(ID, CONFIDENCE);

  const inputType = inputTypes[0];
  const outputTypes = typesOfOutputs(tx);
  const differing = outputTypes.filter((type) => type !== inputType);

  // Exactamente una salida distinta. Si hay varias, ninguna destaca como pago
  // y la heurística no aporta nada.
  if (differing.length !== 1) return notApplicable(ID, CONFIDENCE);

  return detected(ID, CONFIDENCE, {
    paymentIndex: outputTypes.findIndex((type) => type !== inputType),
  });
}
