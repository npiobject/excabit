/**
 * H-02 `unnecessary-input` — entrada innecesaria (docs/04).
 *
 * Con 2 entradas, si existe una salida menor que la entrada más pequeña,
 * entonces esa entrada sobraba para pagar esa salida: con una sola habría
 * bastado. Que la wallet juntase ambas sugiere que el pago es la salida menor
 * y el resto es cambio.
 *
 * **BUG-007** (el bug más caro del legacy): `entradaInnecesaria` hacía
 * `this.inputs[i].addresses[0].value` — leía `.value` de un **string** (la
 * dirección), lo que da `undefined`. Como `undefined < satsOutMin` es siempre
 * `false`, la guarda no cortaba nunca y la heurística devolvía `true` en casos
 * donde no aplicaba. Falsos positivos durante años.
 */
import type { NormalizedTx } from '@/core/types';
import type { HeuristicResult } from '../types';
import { allSameType, hasKnownAddresses, typesOfInputs, typesOfOutputs } from '../address-type';
import {
  detected,
  inputValues,
  insufficientData,
  minOf,
  notApplicable,
  outputValues,
} from './shared';

const ID = 'unnecessary-input';
const CONFIDENCE = 'medium';

const REQUIRED_INPUTS = 2;
const MIN_OUTPUTS = 2;

export function unnecessaryInput(tx: NormalizedTx): HeuristicResult {
  if (tx.vin.length !== REQUIRED_INPUTS || tx.vout.length < MIN_OUTPUTS) {
    return notApplicable(ID, CONFIDENCE);
  }

  if (!hasKnownAddresses(tx)) return insufficientData(ID, CONFIDENCE);

  if (!allSameType([...typesOfInputs(tx), ...typesOfOutputs(tx)])) {
    return notApplicable(ID, CONFIDENCE);
  }

  // Se comparan VALORES de las entradas (vin[i].value), que es justo lo que el
  // legacy no hacía.
  const smallestInput = minOf(inputValues(tx));
  const outputs = outputValues(tx);
  const smallestOutput = minOf(outputs);

  if (smallestOutput >= smallestInput) return notApplicable(ID, CONFIDENCE);

  return detected(ID, CONFIDENCE, { paymentIndex: outputs.indexOf(smallestOutput) });
}
