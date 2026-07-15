import { describe, it, expect } from 'vitest';
import {
  commonInputOwnership,
  looksLikeCoinJoin,
} from '@/analysis/heuristics/h09-common-input-ownership';
import { txWith } from '@tests/helpers/tx-builder';

describe('H-09 common-input-ownership', () => {
  it('V1: tx con 3 inputs normales → detected, cluster {A, B, C}', () => {
    const result = commonInputOwnership(
      txWith({
        ins: [{ address: 'A' }, { address: 'B' }, { address: 'C' }],
        outs: [{ value: 500_000n }, { value: 123_456n }],
      }),
    );

    expect(result.outcome).toBe('detected');
    expect(result.details?.['cluster']).toEqual(['A', 'B', 'C']);
  });

  it('V2: 5 salidas idénticas de 0.1 BTC (CoinJoin) → not-applicable', () => {
    const result = commonInputOwnership(
      txWith({
        ins: [
          { address: 'A' },
          { address: 'B' },
          { address: 'C' },
          { address: 'D' },
          { address: 'E' },
        ],
        outs: Array.from({ length: 5 }, () => ({ value: 10_000_000n })),
      }),
    );

    expect(result.outcome).toBe('not-applicable');
    expect(result.details?.['reason']).toBe('coinjoin-like');
  });

  it('su confianza es high cuando aplica', () => {
    const result = commonInputOwnership(
      txWith({ ins: [{ address: 'A' }, { address: 'B' }], outs: [{ value: 123_456n }] }),
    );

    expect(result.confidence).toBe('high');
    expect(result.id).toBe('common-input-ownership');
  });

  it('una sola dirección de entrada → not-applicable (agruparla consigo misma no revela nada)', () => {
    const result = commonInputOwnership(
      txWith({ ins: [{ address: 'A' }], outs: [{ value: 123_456n }] }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('varias entradas de la MISMA dirección → not-applicable: el cluster ya era uno', () => {
    // Caso de la tx real 85e72c…: dos entradas, misma dirección. CIOH no une
    // nada que no estuviera unido.
    const result = commonInputOwnership(
      txWith({
        ins: [{ address: 'A' }, { address: 'A' }],
        outs: [{ value: 123_456n }, { value: 654_321n }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('el cluster no repite direcciones', () => {
    const result = commonInputOwnership(
      txWith({
        ins: [{ address: 'A' }, { address: 'B' }, { address: 'A' }],
        outs: [{ value: 123_456n }],
      }),
    );

    expect(result.details?.['cluster']).toEqual(['A', 'B']);
  });

  it('sin direcciones de entrada → insufficient-data', () => {
    const result = commonInputOwnership(
      txWith({ ins: [{ address: null }, { address: null }], outs: [{ value: 1n }] }),
    );

    expect(result.outcome).toBe('insufficient-data');
  });

  it('coinbase → not-applicable (no gasta entradas de nadie)', () => {
    const tx = txWith({ ins: [{ address: null }], outs: [{ value: 123_456n }] });
    const coinbaseTx = { ...tx, vin: [{ ...tx.vin[0]!, isCoinbase: true }] };

    expect(commonInputOwnership(coinbaseTx).outcome).toBe('not-applicable');
  });

  it('es pura: no muta la tx de entrada', () => {
    const tx = txWith({ ins: [{ address: 'A' }, { address: 'B' }], outs: [{ value: 123_456n }] });
    const before = structuredClone(tx);

    commonInputOwnership(tx);

    expect(tx).toEqual(before);
  });
});

describe('looksLikeCoinJoin', () => {
  it('5 entradas y 5 salidas iguales → sí (patrón Whirlpool)', () => {
    const tx = txWith({
      ins: Array.from({ length: 5 }, (_, i) => ({ address: `in-${String(i)}` })),
      outs: Array.from({ length: 5 }, () => ({ value: 1_000_000n })),
    });

    expect(looksLikeCoinJoin(tx)).toBe(true);
  });

  it('un pago por lotes (1 entrada, muchas salidas iguales) NO es CoinJoin', () => {
    // Sin varias entradas no hay nada que mezclar: es un exchange pagando a
    // muchos clientes. Confundirlo apagaría CIOH donde sí es válida.
    const tx = txWith({
      ins: [{ address: 'A' }],
      outs: Array.from({ length: 6 }, () => ({ value: 30_000n })),
    });

    expect(looksLikeCoinJoin(tx)).toBe(false);
  });

  it('2 salidas iguales no bastan: es demasiado común', () => {
    const tx = txWith({
      ins: [{ address: 'A' }, { address: 'B' }],
      outs: [{ value: 50_000n }, { value: 50_000n }],
    });

    expect(looksLikeCoinJoin(tx)).toBe(false);
  });

  it('3 salidas iguales con varias entradas → sí', () => {
    const tx = txWith({
      ins: [{ address: 'A' }, { address: 'B' }],
      outs: [{ value: 50_000n }, { value: 50_000n }, { value: 50_000n }, { value: 7n }],
    });

    expect(looksLikeCoinJoin(tx)).toBe(true);
  });

  it('una tx normal con importes dispares → no', () => {
    expect(looksLikeCoinJoin(txWith({ outs: [{ value: 123_456n }, { value: 654_321n }] }))).toBe(
      false,
    );
  });
});
