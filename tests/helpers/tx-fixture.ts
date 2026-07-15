import type { NormalizedTx } from '@/core/types';

/** Tx de ejemplo del legacy (docs/04 §Fixtures reales). */
export const VALID_TXID = '85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2';

const PREV_TXID_A = '0'.repeat(63) + '1';
const PREV_TXID_B = '0'.repeat(63) + '2';

/**
 * Tx sintética mínima válida: 2 entradas, 2 salidas, importes que cuadran
 * con la comisión. Sirve de base para los vectores de las heurísticas, que
 * solo declaran lo que les importa y heredan el resto.
 */
function baseTx(): NormalizedTx {
  return {
    txid: VALID_TXID,
    version: 1,
    locktime: 0,
    blockHeight: 300000,
    blockTime: 1399703554,
    fee: 10_000n,
    size: 258,
    weight: 1032,
    vin: [
      {
        txid: PREV_TXID_A,
        vout: 0,
        value: 60_000n,
        address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        scriptType: 'p2pkh',
        sequence: 0xffffffff,
        isCoinbase: false,
      },
      {
        txid: PREV_TXID_B,
        vout: 1,
        value: 50_000n,
        address: '1PSSGeFHDnKNxiEyFrD1wcEaHr9hrQDDWc',
        scriptType: 'p2pkh',
        sequence: 0xffffffff,
        isCoinbase: false,
      },
    ],
    vout: [
      {
        n: 0,
        value: 70_000n,
        address: '12higDjoCCNXSA95xZMWUdPvXNmkAduhWv',
        scriptType: 'p2pkh',
      },
      {
        n: 1,
        value: 30_000n,
        address: '1Q2TWHE3GMdB6BZKafqwxXtWAWgFt5Jvm3',
        scriptType: 'p2pkh',
      },
    ],
  };
}

/**
 * Devuelve una `NormalizedTx` sintética con los `overrides` aplicados.
 *
 * Cada llamada clona en profundidad: dos fixtures nunca comparten objetos
 * anidados, así que un test no puede contaminar al siguiente mutando un vin.
 */
export function txFixture(overrides: Partial<NormalizedTx> = {}): NormalizedTx {
  return { ...baseTx(), ...structuredClone(overrides) };
}
