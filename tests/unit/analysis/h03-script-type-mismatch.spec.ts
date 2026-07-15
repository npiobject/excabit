import { describe, it, expect } from 'vitest';
import { scriptTypeMismatch } from '@/analysis/heuristics/h03-script-type-mismatch';
import { txWith } from '@tests/helpers/tx-builder';

describe('H-03 script-type-mismatch', () => {
  it('V1: in 62 (p2wsh), outs [62, 42] → detected, change = la de 62', () => {
    const result = scriptTypeMismatch(
      txWith({
        ins: [{ type: 'p2wsh' }],
        outs: [{ type: 'p2wsh' }, { type: 'p2wpkh' }],
      }),
    );

    expect(result.outcome).toBe('detected');
    expect(result.details?.['changeIndex']).toBe(0);
  });

  it('V1 inverso: in 42, outs [62, 42] → detected, change = la de 42', () => {
    const result = scriptTypeMismatch(
      txWith({
        ins: [{ type: 'p2wpkh' }],
        outs: [{ type: 'p2wsh' }, { type: 'p2wpkh' }],
      }),
    );

    expect(result.outcome).toBe('detected');
    expect(result.details?.['changeIndex']).toBe(1);
  });

  it('V2: in 42, outs [42, 42] → not-applicable', () => {
    const result = scriptTypeMismatch(
      txWith({
        ins: [{ type: 'p2wpkh' }],
        outs: [{ type: 'p2wpkh' }, { type: 'p2wpkh' }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('V3: outs con bc1p (taproot) → not-applicable (eso es H-04)', () => {
    const result = scriptTypeMismatch(
      txWith({
        ins: [{ type: 'p2wsh' }],
        outs: [{ type: 'p2wsh' }, { type: 'p2tr' }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('ninguna salida coincide con el tipo del input → not-applicable', () => {
    const result = scriptTypeMismatch(
      txWith({
        ins: [{ type: 'p2wsh' }],
        outs: [{ type: 'p2wpkh' }, { type: 'p2wpkh' }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('BUG-010: un tipo desconocido → insufficient-data, no un console.log', () => {
    // El legacy imprimía por consola en producción cuando la longitud no era
    // 42 ni 62, y seguía adelante como si nada.
    const result = scriptTypeMismatch(
      txWith({
        ins: [{ type: 'p2wsh' }],
        outs: [{ type: 'unknown' }, { type: 'p2wpkh' }],
      }),
    );

    expect(result.outcome).toBe('insufficient-data');
  });

  it('direcciones base58 → not-applicable (la precondición es bech32 v0)', () => {
    const result = scriptTypeMismatch(
      txWith({
        ins: [{ type: 'p2pkh' }],
        outs: [{ type: 'p2pkh' }, { type: 'p2wpkh' }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('2 inputs → not-applicable', () => {
    const result = scriptTypeMismatch(
      txWith({
        ins: [{ type: 'p2wsh' }, { type: 'p2wsh' }],
        outs: [{ type: 'p2wsh' }, { type: 'p2wpkh' }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('su confianza es medium', () => {
    const result = scriptTypeMismatch(txWith({ ins: [{ type: 'p2wsh' }] }));

    expect(result.confidence).toBe('medium');
    expect(result.id).toBe('script-type-mismatch');
  });

  it('es pura: no muta la tx de entrada', () => {
    const tx = txWith({ ins: [{ type: 'p2wsh' }], outs: [{ type: 'p2wsh' }, { type: 'p2wpkh' }] });
    const before = structuredClone(tx);

    scriptTypeMismatch(tx);

    expect(tx).toEqual(before);
  });

  it('sin direcciones → insufficient-data', () => {
    const result = scriptTypeMismatch(
      txWith({
        ins: [{ type: 'p2wsh' }],
        outs: [{ type: 'p2wsh', address: null }, { type: 'p2wpkh' }],
      }),
    );

    expect(result.outcome).toBe('insufficient-data');
  });
});
