/**
 * Tipos del análisis de privacidad (docs/04).
 *
 * Toda heurística es una función pura `(tx: NormalizedTx) => HeuristicResult`.
 * BUG-011: en el legacy las heurísticas mutaban estado de instancia compartido
 * (`this.inputs`, `this.esOk`), así que dos llamadas entrelazadas se pisaban.
 */
import type { NormalizedTx } from '@/core/types';

export type HeuristicId =
  | 'change-largest-output'
  | 'unnecessary-input'
  | 'script-type-mismatch'
  | 'taproot-payment'
  | 'format-change'
  | 'round-amount'
  | 'address-reuse'
  | 'tx-version-locktime'
  | 'common-input-ownership';

export type Outcome =
  /** El patrón está presente. Es la única salida que penaliza el score. */
  | 'detected'
  /** La tx no cumple las precondiciones, o el patrón no está. */
  | 'not-applicable'
  /** Faltan datos para opinar (p. ej. salidas sin dirección). */
  | 'insufficient-data';

/**
 * Confianza de la heurística, fija por heurística (docs/04).
 *
 * `info` es para las que solo informan y nunca emiten veredicto (H-08): el doc
 * las describe como «confianza n/a», y decirlo explícitamente es más honesto
 * que colarles una confianza baja que el score tendría que aprender a ignorar.
 */
export type Confidence = 'high' | 'medium' | 'low' | 'info';

export interface HeuristicResult {
  id: HeuristicId;
  outcome: Outcome;
  confidence: Confidence;
  details?: Record<string, unknown>;
}

export type Heuristic = (tx: NormalizedTx) => HeuristicResult;
