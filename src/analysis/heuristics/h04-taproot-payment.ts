/**
 * H-04 `taproot-payment` — pago usando taproot (docs/04).
 *
 * Si todas las entradas son p2tr y entre las salidas hay exactamente una p2tr
 * (siendo el resto bech32 v0), esa salida taproot es probablemente el cambio:
 * quien paga ya usa taproot, quien cobra todavía no.
 *
 * Legacy: `pagoUsandoTaproot`. Su lógica era correcta y se conserva.
 */
import type { AddressType, NormalizedTx } from '@/core/types';
import type { HeuristicResult } from '../types';
import { hasKnownAddresses, typesOfInputs, typesOfOutputs } from '../address-type';
import { detected, insufficientData, notApplicable } from './shared';

const ID = 'taproot-payment';
const CONFIDENCE = 'medium';

const SEGWIT_V0: readonly AddressType[] = ['p2wpkh', 'p2wsh'];

export function taprootPayment(tx: NormalizedTx): HeuristicResult {
  if (tx.vin.length < 1 || tx.vout.length < 2) return notApplicable(ID, CONFIDENCE);
  if (!hasKnownAddresses(tx)) return insufficientData(ID, CONFIDENCE);

  // Todas las entradas taproot: es la firma del pagador.
  if (!typesOfInputs(tx).every((type) => type === 'p2tr')) return notApplicable(ID, CONFIDENCE);

  const outputTypes = typesOfOutputs(tx);
  const taprootOutputs = outputTypes.filter((type) => type === 'p2tr');
  if (taprootOutputs.length !== 1) return notApplicable(ID, CONFIDENCE);

  // El resto debe ser bech32 v0: si hay otros formatos, el patrón no es este.
  const rest = outputTypes.filter((type) => type !== 'p2tr');
  if (!rest.every((type) => SEGWIT_V0.includes(type))) return notApplicable(ID, CONFIDENCE);

  return detected(ID, CONFIDENCE, { changeIndex: outputTypes.indexOf('p2tr') });
}
