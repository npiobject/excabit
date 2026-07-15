import { describe, it, expect } from 'vitest';
import { taprootPayment } from '@/analysis/heuristics/h04-taproot-payment';
import { txWith } from '@tests/helpers/tx-builder';

describe('H-04 taproot-payment', () => {
  it('V1: ins todos bc1p, outs [bc1q, bc1q, bc1p] → detected', () => {
    const result = taprootPayment(
      txWith({
        ins: [{ type: 'p2tr' }, { type: 'p2tr' }],
        outs: [{ type: 'p2wpkh' }, { type: 'p2wpkh' }, { type: 'p2tr' }],
      }),
    );

    expect(result.outcome).toBe('detected');
    expect(result.details?.['changeIndex']).toBe(2);
  });

  it('V2: outs [bc1p, bc1p] → not-applicable', () => {
    const result = taprootPayment(
      txWith({
        ins: [{ type: 'p2tr' }],
        outs: [{ type: 'p2tr' }, { type: 'p2tr' }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('V3: ins mezcla bc1p/bc1q → not-applicable', () => {
    const result = taprootPayment(
      txWith({
        ins: [{ type: 'p2tr' }, { type: 'p2wpkh' }],
        outs: [{ type: 'p2wpkh' }, { type: 'p2tr' }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('ninguna salida taproot → not-applicable', () => {
    const result = taprootPayment(
      txWith({
        ins: [{ type: 'p2tr' }],
        outs: [{ type: 'p2wpkh' }, { type: 'p2wpkh' }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('el resto de salidas debe ser bech32 v0: una p2pkh rompe el patrón', () => {
    const result = taprootPayment(
      txWith({
        ins: [{ type: 'p2tr' }],
        outs: [{ type: 'p2pkh' }, { type: 'p2tr' }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('1 sola salida → not-applicable (no hay pago y cambio que distinguir)', () => {
    const result = taprootPayment(txWith({ ins: [{ type: 'p2tr' }], outs: [{ type: 'p2tr' }] }));

    expect(result.outcome).toBe('not-applicable');
  });

  it('su confianza es medium', () => {
    const result = taprootPayment(txWith({ ins: [{ type: 'p2tr' }] }));

    expect(result.confidence).toBe('medium');
    expect(result.id).toBe('taproot-payment');
  });

  it('es pura: no muta la tx de entrada', () => {
    const tx = txWith({
      ins: [{ type: 'p2tr' }],
      outs: [{ type: 'p2wpkh' }, { type: 'p2tr' }],
    });
    const before = structuredClone(tx);

    taprootPayment(tx);

    expect(tx).toEqual(before);
  });

  it('sin direcciones → insufficient-data', () => {
    const result = taprootPayment(
      txWith({
        ins: [{ type: 'p2tr' }],
        outs: [{ type: 'p2wpkh', address: null }, { type: 'p2tr' }],
      }),
    );

    expect(result.outcome).toBe('insufficient-data');
  });
});
