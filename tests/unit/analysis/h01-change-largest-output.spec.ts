import { describe, it, expect } from 'vitest';
import { changeLargestOutput } from '@/analysis/heuristics/h01-change-largest-output';
import { txWith } from '@tests/helpers/tx-builder';

describe('H-01 change-largest-output', () => {
  it('V1: 1 in p2wpkh, outs [1_000_000, 50_000] p2wpkh → detected, changeIndex=0', () => {
    const result = changeLargestOutput(
      txWith({
        ins: [{ type: 'p2wpkh' }],
        outs: [{ value: 1_000_000n }, { value: 50_000n }],
      }),
    );

    expect(result.outcome).toBe('detected');
    expect(result.details?.['changeIndex']).toBe(0);
  });

  it('V2: outs [1_000_000, 900_000] mismo tipo → not-applicable (ratio)', () => {
    const result = changeLargestOutput(
      txWith({ ins: [{}], outs: [{ value: 1_000_000n }, { value: 900_000n }] }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('V3: 2 inputs → not-applicable', () => {
    const result = changeLargestOutput(
      txWith({ ins: [{}, {}], outs: [{ value: 1_000_000n }, { value: 50_000n }] }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('V4: tipos mezclados (in p2pkh, outs p2wpkh+p2pkh) → not-applicable', () => {
    const result = changeLargestOutput(
      txWith({
        ins: [{ type: 'p2pkh' }],
        outs: [
          { value: 1_000_000n, type: 'p2wpkh' },
          { value: 50_000n, type: 'p2pkh' },
        ],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('V5: un output sin dirección (OP_RETURN) → insufficient-data', () => {
    const result = changeLargestOutput(
      txWith({
        ins: [{}],
        outs: [{ value: 1_000_000n }, { value: 50_000n, address: null }],
      }),
    );

    expect(result.outcome).toBe('insufficient-data');
  });

  it('el cambio es la salida mayor, esté donde esté', () => {
    const result = changeLargestOutput(
      txWith({ ins: [{}], outs: [{ value: 50_000n }, { value: 1_000_000n }] }),
    );

    expect(result.outcome).toBe('detected');
    expect(result.details?.['changeIndex']).toBe(1);
  });

  it('el umbral es estricto: min exactamente al 10% de max → not-applicable', () => {
    const result = changeLargestOutput(
      txWith({ ins: [{}], outs: [{ value: 1_000_000n }, { value: 100_000n }] }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('3 outputs → not-applicable (la heurística asume pago+cambio)', () => {
    const result = changeLargestOutput(
      txWith({ ins: [{}], outs: [{ value: 1_000_000n }, { value: 10_000n }, { value: 10_000n }] }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('su confianza es low: es la heurística más débil', () => {
    expect(changeLargestOutput(txWith()).confidence).toBe('low');
    expect(changeLargestOutput(txWith()).id).toBe('change-largest-output');
  });

  it('es pura: no muta la tx de entrada', () => {
    const tx = txWith({ ins: [{}], outs: [{ value: 1_000_000n }, { value: 50_000n }] });
    const before = structuredClone(tx);

    changeLargestOutput(tx);

    expect(tx).toEqual(before);
  });

  it('sin direcciones → insufficient-data', () => {
    const result = changeLargestOutput(
      txWith({ ins: [{ address: null }], outs: [{ value: 1_000_000n }, { value: 50_000n }] }),
    );

    expect(result.outcome).toBe('insufficient-data');
  });
});
