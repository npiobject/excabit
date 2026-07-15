import { describe, it, expect } from 'vitest';
import { addressReuse } from '@/analysis/heuristics/h07-address-reuse';
import { txWith } from '@tests/helpers/tx-builder';

describe('H-07 address-reuse', () => {
  it('V1: in A, outs [A, B] → detected (change=0)', () => {
    const result = addressReuse(
      txWith({ ins: [{ address: 'A' }], outs: [{ address: 'A' }, { address: 'B' }] }),
    );

    expect(result.outcome).toBe('detected');
    expect(result.details?.['changeIndex']).toBe(0);
  });

  it('V2: ins [A, C], outs [B, C] → detected', () => {
    const result = addressReuse(
      txWith({
        ins: [{ address: 'A' }, { address: 'C' }],
        outs: [{ address: 'B' }, { address: 'C' }],
      }),
    );

    expect(result.outcome).toBe('detected');
    expect(result.details?.['changeIndex']).toBe(1);
  });

  it('V3: sin coincidencias → not-applicable', () => {
    const result = addressReuse(
      txWith({ ins: [{ address: 'A' }], outs: [{ address: 'B' }, { address: 'C' }] }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('se evalúa sobre TODAS las combinaciones, no solo 1-in/2-out (el legacy sí)', () => {
    const result = addressReuse(
      txWith({
        ins: [{ address: 'A' }, { address: 'B' }, { address: 'C' }],
        outs: [{ address: 'X' }, { address: 'Y' }, { address: 'Z' }, { address: 'C' }],
      }),
    );

    expect(result.outcome).toBe('detected');
    expect(result.details?.['changeIndex']).toBe(3);
  });

  it('lista todas las salidas reutilizadas, no solo la primera', () => {
    const result = addressReuse(
      txWith({
        ins: [{ address: 'A' }, { address: 'B' }],
        outs: [{ address: 'A' }, { address: 'X' }, { address: 'B' }],
      }),
    );

    expect(result.details?.['reusedIndices']).toEqual([0, 2]);
    expect(result.details?.['changeIndex']).toBe(0);
  });

  it('su confianza es high: es casi certeza, no una conjetura', () => {
    const result = addressReuse(txWith({ ins: [{ address: 'A' }], outs: [{ address: 'A' }] }));

    expect(result.confidence).toBe('high');
    expect(result.id).toBe('address-reuse');
  });

  it('una salida sin dirección no coincide con nada (no se compara undefined)', () => {
    const result = addressReuse(
      txWith({ ins: [{ address: 'A' }], outs: [{ address: null }, { address: 'B' }] }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('una entrada sin dirección no impide evaluar el resto', () => {
    const result = addressReuse(
      txWith({
        ins: [{ address: null }, { address: 'C' }],
        outs: [{ address: 'B' }, { address: 'C' }],
      }),
    );

    expect(result.outcome).toBe('detected');
  });

  it('ninguna entrada con dirección → insufficient-data', () => {
    const result = addressReuse(
      txWith({ ins: [{ address: null }], outs: [{ address: 'B' }, { address: 'C' }] }),
    );

    expect(result.outcome).toBe('insufficient-data');
  });

  it('es pura: no muta la tx de entrada', () => {
    const tx = txWith({ ins: [{ address: 'A' }], outs: [{ address: 'A' }, { address: 'B' }] });
    const before = structuredClone(tx);

    addressReuse(tx);

    expect(tx).toEqual(before);
  });
});
