import type { AddressType, NormalizedTx, Vin, Vout } from '@/core/types';
import { txFixture } from './tx-fixture';

/**
 * Builder de txs sintéticas para los vectores de heurísticas (docs/04).
 *
 * Los vectores del doc se enuncian como «in A, outs [A, B]» o «ins [500k, 300k],
 * outs [100k, 650k]»; la idea es que el test se lea igual que el vector, sin
 * ruido de campos que a esa heurística no le importan.
 */

export interface InSpec {
  value?: bigint;
  type?: AddressType;
  /** `null` = entrada sin dirección conocida. */
  address?: string | null;
  sequence?: number;
}

export interface OutSpec {
  value?: bigint;
  type?: AddressType;
  /** `null` = salida sin dirección (OP_RETURN, multisig crudo…). */
  address?: string | null;
}

export interface TxSpec {
  ins?: InSpec[];
  outs?: OutSpec[];
  version?: number;
  locktime?: number;
  fee?: bigint;
}

const DEFAULT_VALUE = 100_000n;
const DEFAULT_TYPE: AddressType = 'p2wpkh';

function buildVin(spec: InSpec, index: number): Vin {
  const address = spec.address === undefined ? `in-${String(index)}` : spec.address;

  return {
    txid: index.toString(16).padStart(64, '0'),
    vout: 0,
    value: spec.value ?? DEFAULT_VALUE,
    scriptType: spec.type ?? DEFAULT_TYPE,
    sequence: spec.sequence ?? 0xffffffff,
    isCoinbase: false,
    ...(address === null ? {} : { address }),
  };
}

function buildVout(spec: OutSpec, index: number): Vout {
  const address = spec.address === undefined ? `out-${String(index)}` : spec.address;

  return {
    n: index,
    value: spec.value ?? DEFAULT_VALUE,
    scriptType: spec.type ?? DEFAULT_TYPE,
    ...(address === null ? {} : { address }),
  };
}

/** Construye una `NormalizedTx` a partir de la descripción de un vector. */
export function txWith(spec: TxSpec = {}): NormalizedTx {
  const base: Partial<NormalizedTx> = {
    vin: (spec.ins ?? [{}]).map(buildVin),
    vout: (spec.outs ?? [{}, {}]).map(buildVout),
  };

  if (spec.version !== undefined) base.version = spec.version;
  if (spec.locktime !== undefined) base.locktime = spec.locktime;
  if (spec.fee !== undefined) base.fee = spec.fee;

  return txFixture(base);
}
