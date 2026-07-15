/**
 * Score de privacidad agregado por tx (docs/04 §Score).
 *
 * `privacyScore = 100 − Σ penalización(heurística detectada)`, con tope
 * inferior en 0. Es un indicador divulgativo, no una medida absoluta: dice
 * "cuántas pistas deja esta tx sobre quién paga a quién", que es justo lo que
 * excabit quiere enseñar.
 */
import type { NormalizedTx } from '@/core/types';
import type { Confidence, HeuristicResult } from './types';
import { HEURISTICS } from './heuristics';

/** Cuánto resta cada heurística detectada, según su confianza (docs/04). */
export const PENALTY: Record<Confidence, number> = {
  high: 25,
  medium: 15,
  low: 8,
  /** Las informativas (H-08) no puntúan: describen, no acusan. */
  info: 0,
};

const MAX_SCORE = 100;
const MIN_SCORE = 0;

/** Umbrales del badge de color (docs/04). */
const GREEN_FROM = 80;
const AMBER_FROM = 40;

export type ScoreBadge = 'green' | 'amber' | 'red';

export interface TxAnalysis {
  results: HeuristicResult[];
  score: number;
  badge: ScoreBadge;
}

/** Solo `detected` penaliza: una heurística que no aplica no es una mancha. */
export function privacyScore(results: readonly HeuristicResult[]): number {
  const penalty = results
    .filter((result) => result.outcome === 'detected')
    .reduce((total, result) => total + PENALTY[result.confidence], 0);

  return Math.max(MIN_SCORE, MAX_SCORE - penalty);
}

export function scoreBadge(score: number): ScoreBadge {
  if (score >= GREEN_FROM) return 'green';
  if (score >= AMBER_FROM) return 'amber';

  return 'red';
}

/** Pasa todas las heurísticas del catálogo y agrega el resultado. */
export function analyzeTx(tx: NormalizedTx): TxAnalysis {
  const results = HEURISTICS.map((heuristic) => heuristic(tx));
  const score = privacyScore(results);

  return { results, score, badge: scoreBadge(score) };
}
