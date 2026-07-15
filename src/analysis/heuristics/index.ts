/**
 * Catálogo de heurísticas (docs/04).
 *
 * Añadir una heurística = escribir su módulo y sumarla a esta lista. El score
 * y la UI la recogen solas.
 */
import type { Heuristic } from '../types';
import { changeLargestOutput } from './h01-change-largest-output';
import { unnecessaryInput } from './h02-unnecessary-input';
import { scriptTypeMismatch } from './h03-script-type-mismatch';
import { taprootPayment } from './h04-taproot-payment';
import { formatChange } from './h05-format-change';
import { roundAmount } from './h06-round-amount';
import { addressReuse } from './h07-address-reuse';
import { txVersionLocktime } from './h08-tx-version-locktime';
import { commonInputOwnership } from './h09-common-input-ownership';

export const HEURISTICS: readonly Heuristic[] = [
  changeLargestOutput,
  unnecessaryInput,
  scriptTypeMismatch,
  taprootPayment,
  formatChange,
  roundAmount,
  addressReuse,
  txVersionLocktime,
  commonInputOwnership,
];

export {
  changeLargestOutput,
  unnecessaryInput,
  scriptTypeMismatch,
  taprootPayment,
  formatChange,
  roundAmount,
  addressReuse,
  txVersionLocktime,
  commonInputOwnership,
};
