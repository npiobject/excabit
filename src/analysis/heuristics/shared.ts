/**
 * Piezas comunes a las heurísticas (docs/04).
 *
 * Cada heurística devuelve su resultado con estos constructores para que
 * `id` y `confidence` estén siempre presentes y sean fijos por heurística.
 */
import type { NormalizedTx } from '@/core/types';
import type { Confidence, HeuristicId, HeuristicResult } from '../types';

export function detected(
  id: HeuristicId,
  confidence: Confidence,
  details?: Record<string, unknown>,
): HeuristicResult {
  return { id, outcome: 'detected', confidence, ...(details === undefined ? {} : { details }) };
}

export function notApplicable(
  id: HeuristicId,
  confidence: Confidence,
  details?: Record<string, unknown>,
): HeuristicResult {
  return {
    id,
    outcome: 'not-applicable',
    confidence,
    ...(details === undefined ? {} : { details }),
  };
}

export function insufficientData(id: HeuristicId, confidence: Confidence): HeuristicResult {
  return { id, outcome: 'insufficient-data', confidence };
}

export function minOf(values: readonly bigint[]): bigint {
  return values.reduce((min, value) => (value < min ? value : min));
}

export function maxOf(values: readonly bigint[]): bigint {
  return values.reduce((max, value) => (value > max ? value : max));
}

export const inputValues = (tx: NormalizedTx): bigint[] => tx.vin.map((vin) => vin.value);
export const outputValues = (tx: NormalizedTx): bigint[] => tx.vout.map((vout) => vout.value);
