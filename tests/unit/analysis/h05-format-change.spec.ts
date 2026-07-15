import { describe, it, expect } from 'vitest';
import { formatChange } from '@/analysis/heuristics/h05-format-change';
import { txWith } from '@tests/helpers/tx-builder';

describe('H-05 format-change', () => {
  it('V1: ins p2wpkh, outs [p2wpkh, p2pkh] → detected (pago = p2pkh)', () => {
    const result = formatChange(
      txWith({
        ins: [{ type: 'p2wpkh' }],
        outs: [{ type: 'p2wpkh' }, { type: 'p2pkh' }],
      }),
    );

    expect(result.outcome).toBe('detected');
    expect(result.details?.['paymentIndex']).toBe(1);
  });

  it('V2: ins p2wpkh, outs [p2pkh, p2sh] (dos tipos distintos) → not-applicable', () => {
    const result = formatChange(
      txWith({
        ins: [{ type: 'p2wpkh' }],
        outs: [{ type: 'p2pkh' }, { type: 'p2sh' }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('V3: 1 output → not-applicable', () => {
    const result = formatChange(txWith({ ins: [{ type: 'p2wpkh' }], outs: [{ type: 'p2pkh' }] }));

    expect(result.outcome).toBe('not-applicable');
  });

  it('entradas de tipos distintos → not-applicable', () => {
    const result = formatChange(
      txWith({
        ins: [{ type: 'p2wpkh' }, { type: 'p2pkh' }],
        outs: [{ type: 'p2wpkh' }, { type: 'p2pkh' }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('todas las salidas del tipo de las entradas → not-applicable (nada destaca)', () => {
    const result = formatChange(
      txWith({
        ins: [{ type: 'p2wpkh' }],
        outs: [{ type: 'p2wpkh' }, { type: 'p2wpkh' }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('varias entradas del mismo tipo valen: la precondición es homogeneidad', () => {
    const result = formatChange(
      txWith({
        ins: [{ type: 'p2tr' }, { type: 'p2tr' }, { type: 'p2tr' }],
        outs: [{ type: 'p2tr' }, { type: 'p2tr' }, { type: 'p2wsh' }],
      }),
    );

    expect(result.outcome).toBe('detected');
    expect(result.details?.['paymentIndex']).toBe(2);
  });

  it('su confianza es medium', () => {
    const result = formatChange(txWith());

    expect(result.confidence).toBe('medium');
    expect(result.id).toBe('format-change');
  });

  it('es pura: no muta la tx de entrada', () => {
    const tx = txWith({ ins: [{ type: 'p2wpkh' }], outs: [{ type: 'p2wpkh' }, { type: 'p2pkh' }] });
    const before = structuredClone(tx);

    formatChange(tx);

    expect(tx).toEqual(before);
  });

  it('sin direcciones → insufficient-data', () => {
    const result = formatChange(
      txWith({
        ins: [{ type: 'p2wpkh' }],
        outs: [{ type: 'p2wpkh' }, { type: 'p2pkh', address: null }],
      }),
    );

    expect(result.outcome).toBe('insufficient-data');
  });
});
