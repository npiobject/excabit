/**
 * H-08 `tx-version-locktime` — huella de la wallet (docs/04).
 *
 * `version` (1/2), `locktime` y el uso de RBF son huellas del software que
 * construyó la tx. Combinadas con las txs que gastan sus salidas permiten
 * distinguir pago de cambio; esa correlación necesita el grafo entero, así que
 * en v1 esta heurística **solo informa** y nunca emite veredicto.
 *
 * **BUG-009**: el legacy listaba `versionesDeTxs` entre las heurísticas de la
 * UI, pero era un stub que medía longitudes y devolvía siempre `false`. El
 * usuario leía un resultado que no evaluaba nada. Aquí el contrato es
 * explícito: `outcome` siempre `not-applicable`, confianza `info`, y lo que
 * aporta va en `details`.
 */
import type { NormalizedTx } from '@/core/types';
import type { HeuristicResult } from '../types';
import { notApplicable } from './shared';

const ID = 'tx-version-locktime';
const CONFIDENCE = 'info';

/**
 * BIP-125: una entrada señala RBF si su `sequence` < 0xfffffffe. Basta con una
 * para que toda la tx sea reemplazable.
 */
const RBF_THRESHOLD = 0xfffffffe;

export function txVersionLocktime(tx: NormalizedTx): HeuristicResult {
  return notApplicable(ID, CONFIDENCE, {
    version: tx.version,
    locktime: tx.locktime,
    usesLocktime: tx.locktime !== 0,
    signalsRbf: tx.vin.some((vin) => vin.sequence < RBF_THRESHOLD),
  });
}
